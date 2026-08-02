import { createHash } from "node:crypto";
import type { SupportedAudioMimeType } from "./config.js";

export type AudioInspection = {
  mimeType: SupportedAudioMimeType;
  durationMs: number;
  sha256: string;
};

export class AudioInspectionError extends Error {
  constructor(
    readonly reason: "unsupported-format" | "invalid-container" | "duration-unavailable",
    message: string,
  ) {
    super(message);
    this.name = "AudioInspectionError";
  }
}

export function inspectAudio(buffer: Buffer): AudioInspection {
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE") {
    return { mimeType: "audio/wav", durationMs: inspectWavDuration(buffer), sha256 };
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return { mimeType: "audio/webm", durationMs: inspectWebmDuration(buffer), sha256 };
  }
  if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "OggS") {
    return { mimeType: "audio/ogg", durationMs: inspectOggDuration(buffer), sha256 };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    return { mimeType: "audio/mp4", durationMs: inspectMp4Duration(buffer), sha256 };
  }

  throw new AudioInspectionError("unsupported-format", "无法从文件内容识别受支持的音频格式。");
}

function inspectWavDuration(buffer: Buffer): number {
  let offset = 12;
  let byteRate: number | null = null;
  let dataSize: number | null = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > buffer.length) {
      throw new AudioInspectionError("invalid-container", "WAV 数据块长度无效。");
    }
    if (chunkId === "fmt " && chunkSize >= 16) byteRate = buffer.readUInt32LE(dataOffset + 8);
    if (chunkId === "data") dataSize = chunkSize;
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  if (!byteRate || dataSize === null || byteRate <= 0) {
    throw new AudioInspectionError("duration-unavailable", "WAV 缺少计算时长所需的数据。");
  }
  return Math.round((dataSize / byteRate) * 1_000);
}

function inspectOggDuration(buffer: Buffer): number {
  let offset = 0;
  let lastGranule = 0n;
  let preSkip = 0;
  let foundPage = false;

  while (offset + 27 <= buffer.length) {
    if (buffer.toString("ascii", offset, offset + 4) !== "OggS") {
      throw new AudioInspectionError("invalid-container", "Ogg 页面签名无效。");
    }
    const segmentCount = buffer[offset + 26] ?? 0;
    if (offset + 27 + segmentCount > buffer.length) break;
    let payloadSize = 0;
    for (let index = 0; index < segmentCount; index += 1) payloadSize += buffer[offset + 27 + index] ?? 0;
    const payloadOffset = offset + 27 + segmentCount;
    const pageEnd = payloadOffset + payloadSize;
    if (pageEnd > buffer.length) break;
    const granule = buffer.readBigUInt64LE(offset + 6);
    if (granule !== 0xffffffffffffffffn && granule > lastGranule) lastGranule = granule;
    if (buffer.toString("ascii", payloadOffset, payloadOffset + 8) === "OpusHead" && payloadOffset + 12 <= pageEnd) {
      preSkip = buffer.readUInt16LE(payloadOffset + 10);
    }
    foundPage = true;
    offset = pageEnd;
  }

  if (!foundPage || lastGranule <= BigInt(preSkip)) {
    throw new AudioInspectionError("duration-unavailable", "Ogg/Opus 缺少有效的采样时长。");
  }
  return Math.round((Number(lastGranule - BigInt(preSkip)) / 48_000) * 1_000);
}

function inspectMp4Duration(buffer: Buffer): number {
  const marker = buffer.indexOf(Buffer.from("mvhd", "ascii"));
  if (marker < 4 || marker + 24 > buffer.length) {
    throw new AudioInspectionError("duration-unavailable", "MP4 缺少 mvhd 时长信息。");
  }
  const atomSize = buffer.readUInt32BE(marker - 4);
  if (atomSize < 24 || marker - 4 + atomSize > buffer.length) {
    throw new AudioInspectionError("invalid-container", "MP4 mvhd 数据块长度无效。");
  }
  const version = buffer[marker + 4];
  let timescale: number;
  let duration: number;
  if (version === 1) {
    if (marker + 40 > buffer.length) throw new AudioInspectionError("invalid-container", "MP4 mvhd 数据不完整。");
    timescale = buffer.readUInt32BE(marker + 28);
    duration = Number(buffer.readBigUInt64BE(marker + 32));
  } else {
    timescale = buffer.readUInt32BE(marker + 16);
    duration = buffer.readUInt32BE(marker + 20);
  }
  if (!timescale || !Number.isFinite(duration)) {
    throw new AudioInspectionError("duration-unavailable", "MP4 时长信息无效。");
  }
  return Math.round((duration / timescale) * 1_000);
}

function readEbmlVint(buffer: Buffer, offset: number): { value: number; length: number } | null {
  const first = buffer[offset];
  if (first === undefined || first === 0) return null;
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > buffer.length) return null;
  let value = first & (mask - 1);
  for (let index = 1; index < length; index += 1) value = value * 256 + (buffer[offset + index] ?? 0);
  return { value, length };
}

function findEbmlNumber(buffer: Buffer, id: readonly number[], kind: "uint" | "float"): number | null {
  const marker = Buffer.from(id);
  let offset = buffer.indexOf(marker);
  while (offset >= 0) {
    const size = readEbmlVint(buffer, offset + marker.length);
    if (size && size.value > 0 && size.value <= 8) {
      const valueOffset = offset + marker.length + size.length;
      if (valueOffset + size.value <= buffer.length) {
        if (kind === "float" && size.value === 4) return buffer.readFloatBE(valueOffset);
        if (kind === "float" && size.value === 8) return buffer.readDoubleBE(valueOffset);
        if (kind === "uint") {
          let value = 0;
          for (let index = 0; index < size.value; index += 1) value = value * 256 + (buffer[valueOffset + index] ?? 0);
          return value;
        }
      }
    }
    offset = buffer.indexOf(marker, offset + 1);
  }
  return null;
}

function inspectWebmDuration(buffer: Buffer): number {
  const timecodeScale = findEbmlNumber(buffer, [0x2a, 0xd7, 0xb1], "uint") ?? 1_000_000;
  const duration = findEbmlNumber(buffer, [0x44, 0x89], "float");
  if (duration !== null && duration > 0 && Number.isFinite(duration)) {
    return Math.round((duration * timecodeScale) / 1_000_000);
  }

  // MediaRecorder WebM blobs frequently omit Segment.Info.Duration. In that
  // case the final cluster/block timecode is the closest container-derived
  // duration and remains independent of client metadata.
  const clusterMarker = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
  let clusterOffset = buffer.indexOf(clusterMarker);
  let maxTimecode = 0;
  while (clusterOffset >= 0) {
    const nextCluster = buffer.indexOf(clusterMarker, clusterOffset + clusterMarker.length);
    const clusterEnd = nextCluster >= 0 ? nextCluster : buffer.length;
    const clusterSize = readEbmlVint(buffer, clusterOffset + clusterMarker.length);
    const contentOffset = clusterOffset + clusterMarker.length + (clusterSize?.length ?? 1);
    if (contentOffset < clusterEnd) {
      const cluster = buffer.subarray(contentOffset, clusterEnd);
      const baseTimecode = findEbmlNumber(cluster, [0xe7], "uint") ?? 0;
      maxTimecode = Math.max(maxTimecode, baseTimecode + findLastBlockTimecode(cluster));
    }
    clusterOffset = nextCluster;
  }
  if (maxTimecode <= 0) {
    throw new AudioInspectionError("duration-unavailable", "WebM 缺少可用的 Duration 或块时间码。");
  }
  return Math.round((maxTimecode * timecodeScale) / 1_000_000);
}

function findLastBlockTimecode(cluster: Buffer): number {
  let maxRelativeTimecode = 0;
  for (const marker of [0xa3, 0xa1]) {
    let offset = cluster.indexOf(marker);
    while (offset >= 0) {
      const size = readEbmlVint(cluster, offset + 1);
      if (size) {
        const blockOffset = offset + 1 + size.length;
        const trackNumber = readEbmlVint(cluster, blockOffset);
        const timecodeOffset = blockOffset + (trackNumber?.length ?? 0);
        const blockEnd = blockOffset + size.value;
        if (trackNumber && timecodeOffset + 2 <= blockEnd && blockEnd <= cluster.length) {
          maxRelativeTimecode = Math.max(maxRelativeTimecode, cluster.readInt16BE(timecodeOffset));
        }
      }
      offset = cluster.indexOf(marker, offset + 1);
    }
  }
  return maxRelativeTimecode;
}
