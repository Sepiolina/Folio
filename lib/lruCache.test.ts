import test from 'node:test';
import assert from 'node:assert/strict';
import { LRUCache } from './lruCache';

test('LRUCache enforces maxEntries and evicts least-recently-used key', () => {
  const evicted: string[] = [];
  const cache = new LRUCache<string, string>({
    maxEntries: 2,
    onEvict: (k) => evicted.push(k),
  });

  cache.set('a', '1');
  cache.set('b', '2');
  // Touch 'a' so 'b' becomes LRU
  assert.equal(cache.get('a'), '1');
  cache.set('c', '3');

  assert.equal(cache.has('a'), true);
  assert.equal(cache.has('b'), false);
  assert.equal(cache.has('c'), true);
  assert.deepEqual(evicted, ['b']);
});

test('LRUCache enforces maxBytes budget and updates byte accounting cleanly', () => {
  const cache = new LRUCache<string, Uint8Array>({
    maxEntries: 10,
    maxBytes: 100,
    sizeOf: (v) => v.byteLength,
  });

  cache.set('k1', new Uint8Array(60));
  cache.set('k2', new Uint8Array(60));
  assert.equal(cache.size, 1);
  assert.equal(cache.has('k1'), false);
  assert.equal(cache.bytes, 60);

  cache.deleteWhere((k) => k === 'k2');
  assert.equal(cache.size, 0);
  assert.equal(cache.bytes, 0);
});
