import { describe, it, expect } from 'vitest';
import {
  normalizeAiShareTextForCompare,
  shouldUpdateAiShareText
} from './aiShareTextChanged.js';

/** 実物に近い本文を組み立てる(1行目が生成時刻)。 */
const mk = (iso, body) => `## 君斗りんくの追憶のきらめき 状態速報\n生成: ${iso}\n${body}`;

describe('aiShareTextChanged — 時刻だけの変化で textarea を書き換えない', () => {
  describe('normalizeAiShareTextForCompare', () => {
    it('生成時刻の行を潰す(比較のためだけ・表示は変えない)', () => {
      const a = mk('2026-08-19T06:50:13.416Z', '本文');
      const b = mk('2026-08-19T06:50:15.900Z', '本文');
      expect(normalizeAiShareTextForCompare(a)).toBe(normalizeAiShareTextForCompare(b));
    });

    it('★生成時刻【以外】は潰さない(本当の変化を見落とさない)', () => {
      const a = mk('2026-08-19T06:50:13.416Z', '記録 749 件');
      const b = mk('2026-08-19T06:50:13.416Z', '記録 750 件');
      expect(normalizeAiShareTextForCompare(a)).not.toBe(normalizeAiShareTextForCompare(b));
    });

    it('★行頭から固定する(本文中に「生成:」が出ても巻き込まない)', () => {
      const s = mk('2026-08-19T06:50:13.416Z', 'メモ: 生成: の説明文はそのまま残る');
      expect(normalizeAiShareTextForCompare(s)).toContain('メモ: 生成: の説明文');
    });

    it('文字列でない入力でも落ちない', () => {
      expect(normalizeAiShareTextForCompare(null)).toBe('');
      expect(normalizeAiShareTextForCompare(undefined)).toBe('');
      expect(normalizeAiShareTextForCompare(123)).toBe('123');
    });
  });

  describe('shouldUpdateAiShareText', () => {
    it('★時刻だけ違うなら書き換えない(これが「コピーが取れない」の真因)', () => {
      const cur = mk('2026-08-19T06:50:13.416Z', '本文');
      const next = mk('2026-08-19T06:50:15.900Z', '本文');
      expect(shouldUpdateAiShareText(cur, next)).toBe(false);
    });

    it('中身が変わったら書き換える(鮮度は落とさない)', () => {
      const cur = mk('2026-08-19T06:50:13.416Z', '記録 749 件');
      const next = mk('2026-08-19T06:50:15.900Z', '記録 750 件');
      expect(shouldUpdateAiShareText(cur, next)).toBe(true);
    });

    it('★空 → 中身あり は必ず書く(初回に何も出ないのを防ぐ)', () => {
      expect(shouldUpdateAiShareText('', mk('2026-08-19T06:50:13.416Z', '本文'))).toBe(true);
      // 空のまま(next も空)なら書かない。
      expect(shouldUpdateAiShareText('', '')).toBe(false);
    });

    it('★選択中は【中身が変わっていても】書き換えない(コピー操作を奪わない)', () => {
      const cur = mk('2026-08-19T06:50:13.416Z', '記録 749 件');
      const next = mk('2026-08-19T06:50:15.900Z', '記録 750 件');
      expect(shouldUpdateAiShareText(cur, next)).toBe(true); // 選択していなければ書く
      expect(shouldUpdateAiShareText(cur, next, { selecting: true })).toBe(false);
    });

    it('★選択中でも空なら書く(空を選択していても失うものが無い)', () => {
      expect(shouldUpdateAiShareText('', '本文', { selecting: true })).toBe(true);
    });

    it('selecting が未指定/偽なら従来どおり', () => {
      const cur = mk('2026-08-19T06:50:13.416Z', 'A');
      const next = mk('2026-08-19T06:50:13.416Z', 'B');
      expect(shouldUpdateAiShareText(cur, next, {})).toBe(true);
      expect(shouldUpdateAiShareText(cur, next, { selecting: false })).toBe(true);
      expect(shouldUpdateAiShareText(cur, next, /** @type {any} */ (null))).toBe(true);
    });
  });
});
