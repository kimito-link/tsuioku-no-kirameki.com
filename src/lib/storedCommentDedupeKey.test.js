import { describe, it, expect } from 'vitest';
import { storedCommentDedupeKey, DEDUPE_TIME_BUCKET_MS } from './storedCommentDedupeKey.js';

/**
 * ★このテストが守っている実害:
 *   「記録が本家コメを101%上回る」二重計上。
 *   commentNo を持たない行(匿名主体の配信で多い)を読み直すと capturedAt が
 *   振り直されてキーが変わり、同じコメントが2件に増えていた。
 */
describe('storedCommentDedupeKey', () => {
  describe('commentNo があるとき', () => {
    it('commentNo だけでキーが決まる(他が違っても同一)', () => {
      const a = storedCommentDedupeKey({
        commentNo: '123',
        liveId: 'lv1',
        text: 'こんにちは',
        capturedAt: 1000
      });
      const b = storedCommentDedupeKey({
        commentNo: '123',
        liveId: 'lv1',
        text: 'こんにちは',
        capturedAt: 999999
      });
      expect(a).toBe(b);
      expect(a).toBe('no:123');
    });

    it('commentNo が違えば別キー', () => {
      expect(storedCommentDedupeKey({ commentNo: '1' })).not.toBe(
        storedCommentDedupeKey({ commentNo: '2' })
      );
    });
  });

  describe('★commentNo が無いとき(二重計上が起きていた経路)', () => {
    it('capturedAt が読み直しでズレても同じキーになる(これが今回の修正)', () => {
      const base = { liveId: 'lv1', userId: '', text: 'わこつ' };
      // 1回目の読み取り: 保存済みの capturedAt
      const first = storedCommentDedupeKey({ ...base, capturedAt: 1_700_000_000_000 });
      // 2回目の読み取り: capturedAt 無しで届き Date.now() が振られた(3秒後)
      const second = storedCommentDedupeKey({ ...base, capturedAt: 1_700_000_003_000 });
      expect(second).toBe(first);
    });

    it('★旧実装なら別キーになっていたことを示す(退化検知)', () => {
      const base = { liveId: 'lv1', userId: '', text: 'わこつ' };
      const oldKey = (e) => `${e.liveId}|${e.text}|${e.capturedAt}`;
      const a = { ...base, capturedAt: 1_700_000_000_000 };
      const b = { ...base, capturedAt: 1_700_000_003_000 };
      // 旧: 別キー(＝二重計上)
      expect(oldKey(a)).not.toBe(oldKey(b));
      // 新: 同一キー(＝畳み込まれる)
      expect(storedCommentDedupeKey(a)).toBe(storedCommentDedupeKey(b));
    });

    it('別の人が同じ文言を書いたら別キー(畳み込みすぎない)', () => {
      const at = 1_700_000_000_000;
      const a = storedCommentDedupeKey({ liveId: 'lv1', userId: 'u1', text: '888', capturedAt: at });
      const b = storedCommentDedupeKey({ liveId: 'lv1', userId: 'u2', text: '888', capturedAt: at });
      expect(a).not.toBe(b);
    });

    it('別配信なら別キー', () => {
      const at = 1_700_000_000_000;
      expect(
        storedCommentDedupeKey({ liveId: 'lv1', text: '888', capturedAt: at })
      ).not.toBe(storedCommentDedupeKey({ liveId: 'lv2', text: '888', capturedAt: at }));
    });

    it('★時間バケットを跨いだ同一文言は別キー(後日の再発言を消さない)', () => {
      const base = { liveId: 'lv1', userId: 'u1', text: 'おつ' };
      const t0 = 1_700_000_000_000;
      const later = t0 + DEDUPE_TIME_BUCKET_MS * 2;
      expect(storedCommentDedupeKey({ ...base, capturedAt: t0 })).not.toBe(
        storedCommentDedupeKey({ ...base, capturedAt: later })
      );
    });

    it('文言の表記ゆれは正規化して同一視する', () => {
      const at = 1_700_000_000_000;
      const a = storedCommentDedupeKey({ liveId: 'lv1', text: 'おつ', capturedAt: at });
      const b = storedCommentDedupeKey({ liveId: 'lv1', text: '  おつ  ', capturedAt: at });
      expect(a).toBe(b);
    });
  });

  describe('壊れた入力', () => {
    it('null/undefined でも throw しない', () => {
      expect(() => storedCommentDedupeKey(null)).not.toThrow();
      expect(() => storedCommentDedupeKey(undefined)).not.toThrow();
    });

    it('capturedAt が不正でも throw せずキーを返す', () => {
      for (const bad of [null, undefined, NaN, -1, 'abc', {}]) {
        expect(() =>
          storedCommentDedupeKey({ liveId: 'lv1', text: 'a', capturedAt: bad })
        ).not.toThrow();
      }
    });

    it('commentNo が数値文字列でないなら本文経路へ倒す', () => {
      const k = storedCommentDedupeKey({ commentNo: 'abc', liveId: 'lv1', text: 'a' });
      expect(k.startsWith('t:')).toBe(true);
    });
  });
});
