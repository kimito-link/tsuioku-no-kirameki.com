import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTtlCache } from './ttlCache.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('createTtlCache', () => {
  it('set/get で値を保存・取得できる', () => {
    const c = createTtlCache({ ttlMs: 10_000 });
    c.set('key1', 'value1');
    expect(c.get('key1')).toBe('value1');
  });

  it('TTL 経過後は undefined を返す', () => {
    vi.useFakeTimers();
    const c = createTtlCache({ ttlMs: 5000 });
    c.set('key1', 'value1');
    expect(c.get('key1')).toBe('value1');

    vi.advanceTimersByTime(5001);
    expect(c.get('key1')).toBeUndefined();
  });

  it('TTL 経過前は値が残る', () => {
    vi.useFakeTimers();
    const c = createTtlCache({ ttlMs: 5000 });
    c.set('key1', 'value1');

    vi.advanceTimersByTime(4999);
    expect(c.get('key1')).toBe('value1');
  });

  it('has() は TTL を考慮する', () => {
    vi.useFakeTimers();
    const c = createTtlCache({ ttlMs: 1000 });
    c.set('k', 1);
    expect(c.has('k')).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(c.has('k')).toBe(false);
  });

  it('maxSize を超えると古い順に削除', () => {
    const c = createTtlCache({ ttlMs: 60_000, maxSize: 3 });
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    c.set('d', 4);
    expect(c.has('a')).toBe(false);
    expect(c.get('b')).toBe(2);
    expect(c.get('d')).toBe(4);
  });

  it('clear() で全エントリ削除', () => {
    const c = createTtlCache({ ttlMs: 60_000 });
    c.set('a', 1);
    c.set('b', 2);
    c.clear();
    expect(c.size()).toBe(0);
    expect(c.get('a')).toBeUndefined();
  });

  it('size() は有効なエントリ数を返す', () => {
    vi.useFakeTimers();
    const c = createTtlCache({ ttlMs: 1000 });
    c.set('a', 1);
    c.set('b', 2);
    expect(c.size()).toBe(2);
    vi.advanceTimersByTime(1001);
    expect(c.size()).toBe(0);
  });

  it('set で上書き時は TTL がリセットされる', () => {
    vi.useFakeTimers();
    const c = createTtlCache({ ttlMs: 1000 });
    c.set('k', 'old');
    vi.advanceTimersByTime(800);
    c.set('k', 'new');
    vi.advanceTimersByTime(800);
    expect(c.get('k')).toBe('new');
  });

  it('null/undefined も値として保存できる', () => {
    const c = createTtlCache({ ttlMs: 10_000 });
    c.set('n', null);
    c.set('u', undefined);
    expect(c.has('n')).toBe(true);
    expect(c.get('n')).toBeNull();
    expect(c.has('u')).toBe(true);
    expect(c.get('u')).toBeUndefined();
  });

  // v0.1.356 (Bug7): maxSize 超過時、まず期限切れを掃除してから挿入順最古を削る。
  //   従来は期限切れの死んだエントリが残っているのに有効なエントリを優先削除していた。
  it('maxSize 超過時は期限切れエントリを先に落とし、有効エントリを守る', () => {
    vi.useFakeTimers();
    // a だけ短 TTL、b/c は長 TTL。
    const c = createTtlCache({ ttlMs: 60_000, maxSize: 3 });
    const cShort = c; // 同一 cache で TTL を変えられないので、a を期限切れにする手順で検証
    cShort.set('a', 1); // expiresAt = now+60000
    cShort.set('b', 2);
    cShort.set('c', 3);
    // 50s 進める（まだ全部生存）→ a を「期限切れ寸前」にするため、a を上書きせず時間だけ進める。
    vi.advanceTimersByTime(60_001); // a/b/c 全部期限切れにした上で…
    // 新しい有効エントリを 3 つ入れる。
    cShort.set('x', 10);
    cShort.set('y', 20);
    cShort.set('z', 30);
    // ここで size は 3（maxSize 内）。期限切れ a/b/c は get/size で掃除される。
    cShort.set('w', 40); // 4 つ目 → maxSize 超過。期限切れは既に無いので挿入順最古 x が落ちる。
    expect(cShort.get('x')).toBeUndefined(); // 最古の有効エントリが落ちる（期限切れが無い通常時の挙動）
    expect(cShort.get('y')).toBe(20);
    expect(cShort.get('w')).toBe(40);
  });

  it('期限切れが混在する maxSize 超過では、有効エントリより期限切れを優先削除', () => {
    vi.useFakeTimers();
    const c = createTtlCache({ ttlMs: 1000, maxSize: 2 });
    c.set('old', 1); // expiresAt = now+1000
    vi.advanceTimersByTime(1500); // old は期限切れ（store には残っているが dead）
    c.set('live1', 2); // store: {old(dead), live1}
    c.set('live2', 3); // size 3 > maxSize 2 → evictExpired で old を落とす → live1/live2 が残る
    expect(c.get('live1')).toBe(2); // 有効エントリは守られる
    expect(c.get('live2')).toBe(3);
  });
});
