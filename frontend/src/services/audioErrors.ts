import type { RecorderErrorCode, RecorderErrorInfo } from "../features/recording/types";

const errorCopy: Record<RecorderErrorCode, Omit<RecorderErrorInfo, "code">> = {
  "permission-denied": { message: "未获得麦克风权限，请在浏览器设置中允许后重试。", recoverable: true },
  "no-device": { message: "没有检测到可用的麦克风设备。", recoverable: true },
  "device-busy": { message: "麦克风正被其他程序占用，请关闭占用程序后重试。", recoverable: true },
  unsupported: { message: "当前浏览器不支持网页录音，请更换最新版浏览器。", recoverable: false },
  "recording-interrupted": { message: "录音设备连接已中断，本次不会计入有效练习。", recoverable: true },
  "silent-input": { message: "没有检测到清晰声音，请检查麦克风后重新录音。", recoverable: true },
  "too-short": { message: "录音时间太短，请完成表达后再提交。", recoverable: true },
  "empty-recording": { message: "浏览器没有生成可用的录音数据，请重新录音。", recoverable: true },
  "invalid-state": { message: "当前录音状态不支持此操作。", recoverable: true },
  cancelled: { message: "录音已取消。", recoverable: true },
  unknown: { message: "录音遇到技术问题，本次不会计入有效练习。", recoverable: true },
};

export class AudioRecorderError extends Error {
  readonly code: RecorderErrorCode;
  readonly recoverable: boolean;

  constructor(code: RecorderErrorCode, cause?: unknown) {
    super(errorCopy[code].message, { cause });
    this.name = "AudioRecorderError";
    this.code = code;
    this.recoverable = errorCopy[code].recoverable;
  }

  toInfo(): RecorderErrorInfo {
    return { code: this.code, message: this.message, recoverable: this.recoverable };
  }
}

function errorName(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error && typeof error.name === "string") return error.name;
  return "";
}

export function mapAudioRecorderError(error: unknown): AudioRecorderError {
  if (error instanceof AudioRecorderError) return error;
  switch (errorName(error)) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return new AudioRecorderError("permission-denied", error);
    case "NotFoundError":
    case "DevicesNotFoundError":
      return new AudioRecorderError("no-device", error);
    case "NotReadableError":
    case "TrackStartError":
      return new AudioRecorderError("device-busy", error);
    case "AbortError":
      return new AudioRecorderError("recording-interrupted", error);
    case "NotSupportedError":
      return new AudioRecorderError("unsupported", error);
    case "InvalidStateError":
      return new AudioRecorderError("invalid-state", error);
    default:
      return new AudioRecorderError("unknown", error);
  }
}

export function recorderErrorInfo(code: RecorderErrorCode): RecorderErrorInfo {
  return new AudioRecorderError(code).toInfo();
}
