/**
 * Sidecar storage for data that must not touch skill directories: human
 * trigger annotations and the previous scan's content hashes.
 */
import { atomicWriteFile, ensureDir, readJsonSafe } from './fs-utils.js';
import { annotationsFilePath, stateFilePath } from './paths.js';
import type { AnnotationsFile, ScanState } from './types.js';

export class SidecarStore {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  private get annotationsPath(): string {
    return annotationsFilePath(this.dir);
  }

  private get statePath(): string {
    return stateFilePath(this.dir);
  }

  async loadAnnotations(): Promise<AnnotationsFile> {
    const raw = await readJsonSafe<AnnotationsFile>(this.annotationsPath);
    if (!raw || typeof raw !== 'object') return {};
    return raw;
  }

  async saveAnnotations(annotations: AnnotationsFile): Promise<void> {
    await ensureDir(this.dir);
    await atomicWriteFile(this.annotationsPath, `${JSON.stringify(annotations, null, 2)}\n`);
  }

  async loadState(): Promise<ScanState> {
    const raw = await readJsonSafe<ScanState>(this.statePath);
    if (!raw || typeof raw !== 'object' || typeof raw.hashes !== 'object' || raw.hashes === null) {
      return { hashes: {} };
    }
    return { hashes: raw.hashes };
  }

  async saveState(state: ScanState): Promise<void> {
    await ensureDir(this.dir);
    await atomicWriteFile(this.statePath, `${JSON.stringify(state, null, 2)}\n`);
  }
}
