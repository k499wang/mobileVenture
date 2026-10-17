/**
 * Run checkpoints on disk: .agent-runs/<id>/state.json, plus a lock file per run.
 *
 * Two problems this solves:
 *  - Parallel agents save at the same moment. Saves are queued per run and each one writes a
 *    temp file, then renames it over state.json. A rename is atomic, so a crash never leaves a
 *    half-written checkpoint.
 *  - Two processes resume the same run. `lock` creates run.lock exclusively; a lock left behind
 *    by a dead process is detected by its PID and cleared.
 */
import { mkdir, readFile, readdir, rename, writeFile, open, unlink } from 'node:fs/promises';
import path from 'node:path';

// Run IDs become folder names, so only allow safe characters (no `..` or slashes).
export const isRunId = (value) => typeof value === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(value);

export class RunStore {
  constructor(root) {
    this.root = path.resolve(root);
    this.pending = new Map();
  }
  directory(id) {
    if (!isRunId(id)) throw new Error('Invalid run ID.');
    return path.join(this.root, id);
  }
  // Queue this save behind any in-flight save for the same run, then write temp → rename.
  async save(state) {
    const directory = this.directory(state.id);
    // Capture a consistent snapshot before the write is queued by parallel agents.
    const snapshot = JSON.stringify(state, null, 2);
    const previous = this.pending.get(state.id) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        await mkdir(directory, { recursive: true });
        const temporary = path.join(directory, `state.${process.pid}.tmp`);
        await writeFile(temporary, snapshot, { mode: 0o600 });
        await rename(temporary, path.join(directory, 'state.json'));
      });
    this.pending.set(state.id, next);
    try {
      await next;
    } finally {
      if (this.pending.get(state.id) === next) this.pending.delete(state.id);
    }
  }
  async read(id) {
    return JSON.parse(await readFile(path.join(this.directory(id), 'state.json'), 'utf8'));
  }
  async list() {
    await mkdir(this.root, { recursive: true });
    const entries = await readdir(this.root, { withFileTypes: true });
    const runs = await Promise.all(
      entries
        .filter((item) => item.isDirectory() && isRunId(item.name))
        .map(async (item) => {
          try {
            return await this.read(item.name);
          } catch {
            return null;
          }
        }),
    );
    return runs.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  // Exclusive per-run lock. Returns a release function.
  async lock(id) {
    const file = path.join(this.directory(id), 'run.lock');
    await mkdir(this.directory(id), { recursive: true });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const handle = await open(file, 'wx', 0o600);
        await handle.writeFile(String(process.pid));
        await handle.close();
        return async () => {
          await unlink(file).catch(() => {});
        };
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        // Lock exists: if its owner process is still alive, refuse; if it died, clear and retry.
        const pid = Number(await readFile(file, 'utf8'));
        try {
          process.kill(pid, 0);
          throw new Error('This run is already active in another process.');
        } catch (probe) {
          if (probe.code !== 'ESRCH') throw probe;
        }
        await unlink(file);
      }
    }
    throw new Error('Could not acquire run lock.');
  }
}
