/**
 * Bounded Least-Recently-Used (LRU) cache with optional byte-budget tracking
 * and automatic eviction callbacks for deterministic resource cleanup.
 */
export interface LRUCacheOptions<K, V> {
  maxEntries: number;
  maxBytes?: number;
  sizeOf?: (value: V, key: K) => number;
  onEvict?: (key: K, value: V) => void;
}

export class LRUCache<K, V> {
  private readonly map = new Map<K, { value: V; bytes: number }>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly sizeOf: (value: V, key: K) => number;
  private readonly onEvict?: (key: K, value: V) => void;
  private totalBytes = 0;

  constructor(options: LRUCacheOptions<K, V>) {
    this.maxEntries = Math.max(1, options.maxEntries);
    this.maxBytes = options.maxBytes ?? Infinity;
    this.sizeOf = options.sizeOf ?? (() => 0);
    this.onEvict = options.onEvict;
  }

  get size(): number {
    return this.map.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // Refresh recency
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    const existing = this.map.get(key);
    if (existing) {
      this.totalBytes -= existing.bytes;
      this.map.delete(key);
      if (existing.value !== value) {
        this.onEvict?.(key, existing.value);
      }
    }

    const bytes = Math.max(0, this.sizeOf(value, key));
    this.map.set(key, { value, bytes });
    this.totalBytes += bytes;
    this.evictIfNeeded();
  }

  delete(key: K): boolean {
    const existing = this.map.get(key);
    if (!existing) return false;
    this.map.delete(key);
    this.totalBytes -= existing.bytes;
    this.onEvict?.(key, existing.value);
    return true;
  }

  deleteWhere(predicate: (key: K, value: V) => boolean): number {
    let removed = 0;
    for (const [k, entry] of Array.from(this.map.entries())) {
      if (predicate(k, entry.value)) {
        this.delete(k);
        removed += 1;
      }
    }
    return removed;
  }

  clear(): void {
    for (const [k, entry] of Array.from(this.map.entries())) {
      this.onEvict?.(k, entry.value);
    }
    this.map.clear();
    this.totalBytes = 0;
  }

  keys(): K[] {
    return Array.from(this.map.keys());
  }

  private evictIfNeeded(): void {
    while (
      this.map.size > this.maxEntries ||
      (this.totalBytes > this.maxBytes && this.map.size > 1)
    ) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey === undefined) break;
      this.delete(oldestKey);
    }
  }
}
