import { describe, it, expect } from 'vitest';
import {
  strongAvatarUrlOrEmpty, buildRememberedAvatarIndex, rememberedAvatarUrlByReverseScan, createRememberedAvatarLookup
} from './rememberedAvatarIndex.js';

const STRONG = (n) => `https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/${n % 100}/${n}.jpg?${n}`;
const WEAK = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg';

/** 決定的な疑似乱数(再現できる) */
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function makeEntries(seed, n, users) {
  const r = rng(seed); const out = [];
  for (let i = 0; i < n; i++) {
    const u = Math.floor(r() * users);
    const kind = r();
    const uid = kind < 0.15 ? `a:anon${u}` : kind < 0.2 ? '' : String(100000 + u);
    const av = kind < 0.3 ? '' : kind < 0.45 ? WEAK : kind < 0.5 ? 'javascript:x' : STRONG(100000 + u + (kind < 0.7 ? 0 : 1000));
    out.push({ userId: uid, avatarUrl: av, text: String(i) });
  }
  return out;
}

describe('rememberedAvatarIndex', () => {
  it('strongAvatarUrlOrEmpty: http(s) かつ弱い既定アイコンでないものだけ', () => {
    expect(strongAvatarUrlOrEmpty(STRONG(1))).toBe(STRONG(1));
    expect(strongAvatarUrlOrEmpty(WEAK)).toBe('');
    expect(strongAvatarUrlOrEmpty('javascript:1')).toBe('');
    expect(strongAvatarUrlOrEmpty('')).toBe('');
    expect(strongAvatarUrlOrEmpty(null)).toBe('');
  });

  it('★同値性: 索引の答えは従来の逆順走査と全 uid で一致する(ランダム 20 試行 × 全 uid)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const entries = makeEntries(seed, 2000, 60);
      const index = buildRememberedAvatarIndex(entries);
      const uids = new Set(entries.map((e) => String(e.userId || '').trim()).filter(Boolean));
      for (const uid of uids) {
        expect(index.get(uid) || '').toBe(rememberedAvatarUrlByReverseScan(entries, uid));
      }
      expect(index.has('')).toBe(false);
    }
  });

  it('後勝ち: 同じ uid で強い URL が2回出たら【後ろ】の方(逆順走査で最初に当たる方)', () => {
    const e = [
      { userId: '7', avatarUrl: STRONG(7) },
      { userId: '7', avatarUrl: WEAK },        // 弱い → 無視
      { userId: '7', avatarUrl: STRONG(77) }
    ];
    expect(buildRememberedAvatarIndex(e).get('7')).toBe(STRONG(77));
    expect(rememberedAvatarUrlByReverseScan(e, '7')).toBe(STRONG(77));
  });

  it('createRememberedAvatarLookup: 同じ配列参照では作り直さず、参照か長さが変わったら作り直す', () => {
    const lk = createRememberedAvatarLookup();
    const a = makeEntries(3, 500, 20);
    const uid = String(a.find((x) => /^\d+$/.test(String(x.userId)) && x.avatarUrl.startsWith('https://s')).userId);
    expect(lk.get(a, uid)).toBe(rememberedAvatarUrlByReverseScan(a, uid));
    for (let i = 0; i < 1000; i++) lk.get(a, uid);
    expect(lk.rebuilds()).toBe(1);                       // 1,000 回引いても再構築は 1 回
    a.push({ userId: uid, avatarUrl: STRONG(999999) });   // 同じ参照で push
    expect(lk.get(a, uid)).toBe(STRONG(999999));          // ★長さの変化で作り直す
    expect(lk.rebuilds()).toBe(2);
    const b = a.slice();                                  // 新しい参照
    expect(lk.get(b, uid)).toBe(STRONG(999999));
    expect(lk.rebuilds()).toBe(3);
    expect(lk.get(null, uid)).toBe('');
    expect(lk.get(b, '')).toBe('');
  });

  it('★毒: 逆順走査が O(N²) になる規模でも索引は 1 パス(実測時間で固定: 21,680×520 を 1 秒未満)', () => {
    const entries = makeEntries(9, 21680, 520);
    const lk = createRememberedAvatarLookup();
    const t = performance.now();
    for (const e of entries) lk.get(entries, String(e.userId || ''));
    expect(performance.now() - t).toBeLessThan(1000);
    expect(lk.rebuilds()).toBe(1);
  });
});
