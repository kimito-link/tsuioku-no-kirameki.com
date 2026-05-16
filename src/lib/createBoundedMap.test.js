import { describe, it, expect } from 'vitest';
import { createBoundedMap } from './createBoundedMap.js';

describe('createBoundedMap', () => {
  it('FIFO policy evicts the oldest inserted key when cap is exceeded', () => {
    const map = createBoundedMap(2, 'fifo-test');

    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3);

    expect([...map.keys()]).toEqual(['b', 'c']);
    expect(map.get('a')).toBeUndefined();
  });

  it('FIFO update keeps the original insertion order', () => {
    const map = createBoundedMap(2, 'fifo-update');

    map.set('a', 1);
    map.set('b', 2);
    map.set('a', 10);
    map.set('c', 3);

    expect([...map.entries()]).toEqual([
      ['b', 2],
      ['c', 3]
    ]);
  });

  it('LRU policy keeps recently read keys', () => {
    const map = createBoundedMap(2, 'lru-test', { policy: 'lru' });

    map.set('a', 1);
    map.set('b', 2);
    expect(map.get('a')).toBe(1);
    map.set('c', 3);

    expect([...map.keys()]).toEqual(['a', 'c']);
    expect(map.get('b')).toBeUndefined();
  });

  it('LRU policy treats updating an existing key as recent use', () => {
    const map = createBoundedMap(2, 'lru-update', { mode: 'lru' });

    map.set('a', 1);
    map.set('b', 2);
    map.set('a', 10);
    map.set('c', 3);

    expect([...map.entries()]).toEqual([
      ['a', 10],
      ['c', 3]
    ]);
  });

  it('exposes Map behavior for clear and delete', () => {
    const map = createBoundedMap(2, 'map-api');

    map.set('a', 1);
    map.set('b', 2);
    expect(map.delete('a')).toBe(true);
    expect(map.size).toBe(1);
    map.clear();
    expect(map.size).toBe(0);
  });

  it('rejects invalid caps with the map name in the error', () => {
    expect(() => createBoundedMap(0, 'nicknameResolve')).toThrow(/nicknameResolve/);
  });
});
