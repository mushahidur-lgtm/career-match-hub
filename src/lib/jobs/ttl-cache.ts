/**
 * A small cache in this server instance's memory. A serverless host runs several instances and restarts them,
 * so it saves repeat work but guarantees nothing.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; until: number }>();
  constructor(private readonly max = 200) {}

  get(key: string, now = Date.now()): T | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.until <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T, ttlMs: number, now = Date.now()): void {
    this.entries.delete(key);
    this.entries.set(key, { value, until: now + ttlMs });
    if (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value!);
  }

  clear(): void {
    this.entries.clear();
  }
}
