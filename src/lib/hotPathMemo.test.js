import { describe, expect, it } from 'vitest';
import { formatLaneTileStats } from './laneTileStats.js';
import { formatNumberJa } from './htmlText.js';
import {
  anonymousIdenticonDataUrl,
  clearAnonymousIdenticonCacheForTest,
  anonymousIdenticonCacheSizeForTest
} from './anonymousIdenticon.js';
import { isLikelyInternalNdgGiftOrCampaignLabel, pickBetterInterceptNickname } from './giftDisplayNickname.js';

/**
 * v0.1.1605: 描き直しのたびに全員分を計算していた純関数の高速化(実データ入りの CPU プロファイルで上位)。
 * ★すべて【出力が従来と同一】であることが条件。旧実装を参照実装としてテストに残し、ランダム入力で照合する。
 */

// ── 乱数(固定シード・再現可能)
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}

// ── 旧 formatLaneTileStats
function positiveOrNull(n) { const v = Math.floor(Number(n)); return Number.isFinite(v) && v > 0 ? v : null; }
function referenceStats(stats) {
  if (!stats || typeof stats !== 'object') return '';
  const parts = [];
  const g = positiveOrNull(stats.giftPt); const a = positiveOrNull(stats.adPt); const c = positiveOrNull(stats.commentCount);
  if (g != null) parts.push(`🎁${formatNumberJa(g)}`);
  if (a != null) parts.push(`📣${formatNumberJa(a)}`);
  if (c != null) parts.push(`💬${formatNumberJa(c)}`);
  return parts.join(' ');
}

describe('formatLaneTileStats: 出力は旧実装と同一', () => {
  it('★ランダムな stats 2000 通りで一致(負・0・NaN・小数・巨大・文字列・欠け)', () => {
    const r = rng(777);
    const vals = [undefined, null, 0, -3, NaN, Infinity, 0.9, 1, 12.7, 999, 1000, 12757, 1234567, 1e12, '5', 'x', ''];
    const pick = () => vals[Math.floor(r() * vals.length)];
    for (let n = 0; n < 2000; n += 1) {
      const stats = { giftPt: pick(), adPt: pick(), commentCount: pick() };
      expect(formatLaneTileStats(stats)).toBe(referenceStats(stats));
    }
    for (const bad of [null, undefined, 0, 'x', []]) expect(formatLaneTileStats(bad)).toBe(referenceStats(bad));
  });
  it('★同じ値を繰り返し呼んでも同じ文字列(キャッシュ命中でも変わらない)', () => {
    const s = { giftPt: 12757, adPt: 3, commentCount: 40 };
    const first = formatLaneTileStats(s);
    for (let i = 0; i < 50; i += 1) expect(formatLaneTileStats(s)).toBe(first);
    expect(first).toBe('🎁12,757 📣3 💬40');
  });
});

describe('anonymousIdenticonDataUrl: 使い回し', () => {
  it('★使い回した結果は、計算し直した結果と同一', () => {
    clearAnonymousIdenticonCacheForTest();
    const ids = ['a:abc', 'a:xyz', '12345', 'ゲスト'];
    const firsts = ids.map((i) => anonymousIdenticonDataUrl(i, 64));
    const seconds = ids.map((i) => anonymousIdenticonDataUrl(i, 64));
    expect(seconds).toEqual(firsts);
    clearAnonymousIdenticonCacheForTest();
    expect(ids.map((i) => anonymousIdenticonDataUrl(i, 64))).toEqual(firsts);
  });
  it('★大きさが違えば別の結果(キーに大きさを含む)・空は空', () => {
    expect(anonymousIdenticonDataUrl('a:abc', 64)).not.toBe(anonymousIdenticonDataUrl('a:abc', 32));
    expect(anonymousIdenticonDataUrl('', 64)).toBe('');
    expect(anonymousIdenticonDataUrl('  ', 64)).toBe('');
  });
  it('★上限つき: 3000人分を作っても件数は 2000 以下(メモリが無限に増えない)', () => {
    clearAnonymousIdenticonCacheForTest();
    for (let i = 0; i < 3000; i += 1) anonymousIdenticonDataUrl(`a:u${i}`, 64);
    expect(anonymousIdenticonCacheSizeForTest()).toBeLessThanOrEqual(2000);
    expect(anonymousIdenticonCacheSizeForTest()).toBeGreaterThan(1500);
  });
});

describe('ニックネーム判定', () => {
  // 旧 isLikelyInternalNdgGiftOrCampaignLabel の hasNonAscii(配列版)と新(正規表現版)の同値
  it('★非ASCII判定: 配列版と正規表現版が全ての入力で一致(絵文字・サロゲート・全角)', () => {
    const samples = ['', 'abc', 'abc_def', 'あ', '😀', 'a😀', '\u007f', '\u0080', '\uffff', 'ｱ', 'x'.repeat(30), 'nicolive_x'];
    for (const t of samples) {
      const oldV = [...t].some((ch) => (ch.codePointAt(0) ?? 0) > 127);
      expect(/[\u0080-\uFFFF]/.test(t)).toBe(oldV);
    }
  });
  it('★内部ラベルの判定は従来どおり', () => {
    expect(isLikelyInternalNdgGiftOrCampaignLabel('nicolive_audition_lightgreen')).toBe(true);
    expect(isLikelyInternalNdgGiftOrCampaignLabel('aaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
    expect(isLikelyInternalNdgGiftOrCampaignLabel('あaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
    expect(isLikelyInternalNdgGiftOrCampaignLabel('りんく')).toBe(false);
  });
  it('★同じ名前なら必ずその名前を返す(早期リターンは結果を変えない)', () => {
    for (const n of ['りんく', 'nicolive_x', '匿名', ' ゲスト ', 'a'.repeat(30), '（未取得）']) {
      expect(pickBetterInterceptNickname('123', n, n)).toBe(n.trim());
    }
  });
});
