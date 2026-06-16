export interface DedupOptions {
  windowMs: number;
  maxSize?: number;
}

export class DedupTracker {
  private windowMs: number;
  private maxSize: number;
  private seen = new Map<string, number>();

  constructor(opts: DedupOptions) {
    this.windowMs = Math.max(0, opts.windowMs);
    this.maxSize = opts.maxSize ?? 1000;
  }

  isDuplicate(key: string): boolean {
    if (this.windowMs === 0) {
      return false;
    }

    const now = Date.now();
    const last = this.seen.get(key);

    if (last !== undefined && now - last < this.windowMs) {
      return true;
    }

    this.seen.set(key, now);
    this.cleanup(now);
    return false;
  }

  private cleanup(now: number): void {
    if (this.seen.size <= this.maxSize) {
      return;
    }

    for (const [key, time] of this.seen) {
      if (now - time > this.windowMs) {
        this.seen.delete(key);
      }
    }
  }

  clear(): void {
    this.seen.clear();
  }
}
