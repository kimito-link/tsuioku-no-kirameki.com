import { describe, it, expect } from 'vitest';
import {
  STATUS_READ_POLICY,
  readIntervalMsFor,
  shouldReadNow,
  WRITE_INTERVAL_HUMAN_MS,
  READ_INTERVAL_CAP_MS,
  DEFAULT_SLACK
} from './statusReadPolicy.js';

/**
 * ★status-entry.js のコアread の呼び名(2026-08-19 時点で5本)。
 *   この一覧は「宣言テーブルに載っていない read が何本あるか」を数えるための母数。
 */
const CORE_READ_KEYS = ['lives', 'summaries', 'fastDiagLite', 'popupDiag', 'backfill'];

/**
 * ★未登録のまま残っている read の本数(=借金)。
 *
 * diagChannelRegistry.js は「登録すれば守られる・しなければ何も起きない」
 * オプトインの台帳だったため、2026-08-12 の新設以来【1度も触られず登録1件のまま】
 * ＝形骸化した。同じ運命を避けるため、**未登録の数をここで固定する**。
 *
 * ・増やす = 赤(新しい read を宣言せずに足した)
 * ・減らす = 自由(歓迎)
 * 個別に塞ぐのではなく数で固定する([[fail-open-recurs-under-new-names-2026-08-12]])。
 *
 * ★4本の内訳と、載せない理由(会議 2026-08-19 の結論):
 *   lives        … chrome.tabs.query 経路で storage を触らない=間引く意味がない
 *   summaries    … livesData の土台。古いと全カード/全セルが古くなる
 *   fastDiagLite … 健全度セル・北極星・マインドマップの主入力
 *   backfill     … 取り込み進捗そのもの。ユーザーはこれを見に来ている=絶対に譲らない
 */
const KNOWN_UNPOLICIED = 4;

describe('statusReadPolicy — 読む頻度を「書き手の更新間隔」から導く', () => {
  describe('★形骸化しない仕掛け(オプトイン台帳の二の舞を避ける)', () => {
    it('★未登録の read の本数が増えていない(減らすのは自由)', () => {
      const unpolicied = CORE_READ_KEYS.filter((k) => !STATUS_READ_POLICY[k]);
      expect(
        unpolicied.length,
        `宣言せずに read を足した疑い: ${unpolicied.join(', ')}`
      ).toBeLessThanOrEqual(KNOWN_UNPOLICIED);
    });

    it('★宣言済みのキーは必ず「誰が書くか」と「なぜその間隔か」を持つ', () => {
      // 根拠が残らない宣言は、過去3回の引っ越しと同じく後から追えなくなる。
      for (const [key, entry] of Object.entries(STATUS_READ_POLICY)) {
        expect(String(entry.writtenBy || ''), `${key}: writtenBy が空`).not.toBe('');
        expect(String(entry.why || ''), `${key}: why が空`).not.toBe('');
      }
    });

    it('★backfill(取り込み進捗)は絶対に宣言しない=毎回読む', () => {
      // 会議の結論: ユーザーは進捗を見に来ている。ここを間引くと
      // 「一番見たいときに一番遅い」になる。
      expect(STATUS_READ_POLICY.backfill).toBeUndefined();
      expect(readIntervalMsFor('backfill')).toBe(0);
      expect(shouldReadNow('backfill', { lastReadAt: Date.now(), now: Date.now() })).toBe(true);
    });

    it('★画面の土台(summaries/fastDiagLite)も宣言しない=毎回読む', () => {
      expect(STATUS_READ_POLICY.summaries).toBeUndefined();
      expect(STATUS_READ_POLICY.fastDiagLite).toBeUndefined();
      expect(readIntervalMsFor('summaries')).toBe(0);
      expect(readIntervalMsFor('fastDiagLite')).toBe(0);
    });
  });

  describe('readIntervalMsFor — 書き手の間隔から読む間隔を出す', () => {
    it('未登録は 0(=毎回読む・fail-open)', () => {
      expect(readIntervalMsFor('summaries')).toBe(0);
      expect(readIntervalMsFor('存在しないキー')).toBe(0);
      expect(readIntervalMsFor('')).toBe(0);
      expect(readIntervalMsFor(undefined)).toBe(0);
    });

    it('popupDiag は上限(12秒)まで空ける(書き手=人の操作なので)', () => {
      expect(readIntervalMsFor('popupDiag')).toBe(READ_INTERVAL_CAP_MS);
    });

    it('★上限を超えない(書き手がどれだけ遅くても12秒までしか空けない)', () => {
      // 人の操作間隔(60秒)×slack1.0 = 60000 だが、上限で 12000 に丸められる。
      expect(WRITE_INTERVAL_HUMAN_MS * DEFAULT_SLACK).toBeGreaterThan(READ_INTERVAL_CAP_MS);
      expect(readIntervalMsFor('popupDiag')).toBeLessThanOrEqual(READ_INTERVAL_CAP_MS);
    });

    it('★上限は鮮度判定の窓(backfillBottleneck の15秒)より短い', () => {
      // 12秒間引き + 15秒窓 = 実効マージン3秒。ここを超えると
      // 「走行中なのに計器が沈黙」の誤判定を自分で作ってしまう。
      expect(READ_INTERVAL_CAP_MS).toBeLessThan(15_000);
    });
  });

  describe('shouldReadNow — 実際に読むか、前回値(peek)で済ますか', () => {
    it('★一度も読んでいなければ必ず読む(未読を「古い」と混同しない)', () => {
      expect(shouldReadNow('popupDiag', { lastReadAt: 0, now: 1_000_000 })).toBe(true);
      expect(shouldReadNow('popupDiag', { now: 1_000_000 })).toBe(true);
      expect(shouldReadNow('popupDiag', { lastReadAt: NaN, now: 1_000_000 })).toBe(true);
      expect(shouldReadNow('popupDiag', { lastReadAt: -5, now: 1_000_000 })).toBe(true);
    });

    it('間隔未満なら読まない(前回値を使う)', () => {
      const t = 1_000_000;
      expect(shouldReadNow('popupDiag', { lastReadAt: t, now: t + 1 })).toBe(false);
      expect(shouldReadNow('popupDiag', { lastReadAt: t, now: t + 11_999 })).toBe(false);
    });

    it('間隔ちょうど・超過なら読む(境界を含む)', () => {
      const t = 1_000_000;
      expect(shouldReadNow('popupDiag', { lastReadAt: t, now: t + 12_000 })).toBe(true);
      expect(shouldReadNow('popupDiag', { lastReadAt: t, now: t + 12_001 })).toBe(true);
    });

    it('★未登録キーは何度呼んでも必ず読む(現状の挙動と同じ)', () => {
      const t = 1_000_000;
      for (const k of ['summaries', 'fastDiagLite', 'backfill', 'lives']) {
        expect(shouldReadNow(k, { lastReadAt: t, now: t + 1 }), k).toBe(true);
      }
    });

    it('★時刻が読めないときは読む(安全側に倒す)', () => {
      expect(shouldReadNow('popupDiag', { lastReadAt: 1, now: NaN })).toBe(true);
      expect(shouldReadNow('popupDiag', /** @type {any} */ (null))).toBe(true);
    });

    it('★時計が巻き戻っても暴走しない(now < lastReadAt)', () => {
      // 壁時計は巻き戻りうる。負の経過で「読む」に倒れても実害は無い(1回多く読むだけ)が、
      // 例外や無限ループにならないことを固定する。
      expect(shouldReadNow('popupDiag', { lastReadAt: 2_000_000, now: 1_000_000 })).toBe(false);
    });
  });

  describe('宣言テーブルの健全性', () => {
    it('凍結されている(実行時に書き換えられない)', () => {
      expect(Object.isFrozen(STATUS_READ_POLICY)).toBe(true);
    });

    it('★全エントリの writeIntervalMs が正の有限値(0/NaN で毎回読むに静かに反転しない)', () => {
      for (const [key, entry] of Object.entries(STATUS_READ_POLICY)) {
        expect(Number.isFinite(entry.writeIntervalMs), `${key}`).toBe(true);
        expect(entry.writeIntervalMs, `${key}`).toBeGreaterThan(0);
      }
    });
  });
});
