import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extensionForMimeType, type SupportedAudioMimeType } from "./config.js";

export interface AudioStorage {
  put(input: { storageKey: string; data: Buffer }): Promise<void>;
  delete(storageKey: string): Promise<void>;
}

export function defaultAudioStorageRoot(): string {
  return fileURLToPath(new URL("../../../var/uploads/", import.meta.url));
}

export function createAudioStorageKey(input: {
  ownerId: string;
  attemptId: string;
  audioAssetId: string;
  mimeType: SupportedAudioMimeType;
}): string {
  const ownerPartition = createHash("sha256").update(input.ownerId).digest("hex").slice(0, 16);
  return `${ownerPartition}/${input.attemptId}/${input.audioAssetId}.${extensionForMimeType(input.mimeType)}`;
}

export class LocalAudioStorage implements AudioStorage {
  readonly rootDirectory: string;

  constructor(rootDirectory = defaultAudioStorageRoot()) {
    this.rootDirectory = resolve(rootDirectory);
  }

  async put(input: { storageKey: string; data: Buffer }): Promise<void> {
    const target = this.resolveStorageKey(input.storageKey);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.part`;
    try {
      await writeFile(temporary, input.data, { flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async delete(storageKey: string): Promise<void> {
    const target = this.resolveStorageKey(storageKey);
    await rm(target, { force: true });
    await this.removeEmptyParents(dirname(target));
  }

  private resolveStorageKey(storageKey: string): string {
    if (!storageKey || isAbsolute(storageKey) || extname(storageKey) === ".part") {
      throw new Error("Invalid audio storage key.");
    }
    const target = resolve(this.rootDirectory, storageKey);
    const traversal = relative(this.rootDirectory, target);
    if (!traversal || traversal.startsWith("..") || isAbsolute(traversal)) {
      throw new Error("Audio storage key resolves outside the configured root.");
    }
    return target;
  }

  private async removeEmptyParents(startDirectory: string): Promise<void> {
    let current = startDirectory;
    while (current !== this.rootDirectory) {
      try {
        await rm(current, { recursive: false });
      } catch {
        break;
      }
      current = dirname(current);
    }
  }
}
