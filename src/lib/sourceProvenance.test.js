/**
 * sourceProvenance.test.js — 「経路の劣化」を壊れる前に検出できるか。
 *
 * ★この計器の目的は「値が取れたか」ではなく
 *   **どの経路で取れたか / 前より悪くなっていないか** を見ること。
 *   ニコ生が DOM を変えると、まず経路が embedded-data → dom-text へ落ちる。
 *   症状(サムネが白い等)が出る前にここで鳴らす。
 */
import { describe, it, expect } from 'vitest';
import {
  createProvenanceState,
  noteSource,
  snapshotProvenance,
  judgeSourceProvenance,
  normalizeSource,
  toStorable,
  fromStorable,
  SOURCE_ROBUSTNESS,
  FRAGILE_FROM
} from './sourceProvenance.js';
import { STAT_SOURCE } from '../domain/observations/vocabulary.js';

describe('取得経路の記録と劣化検出', () => {
  it('★丈夫さの順序が「壊れにくい順」になっている(この計器の中核)', () => {
    expect(SOURCE_ROBUSTNESS[STAT_SOURCE.OFFICIAL_STATS])
      .toBeLessThan(SOURCE_ROBUSTNESS[STAT_SOURCE.EMBEDDED_DATA]);
    expect(SOURCE_ROBUSTNESS[STAT_SOURCE.EMBEDDED_DATA])
      .toBeLessThan(SOURCE_ROBUSTNESS[STAT_SOURCE.DOM_TEXT]);
    // dom-text だけが「脆い」側
    expect(SOURCE_ROBUSTNESS[STAT_SOURCE.DOM_TEXT]).toBeGreaterThanOrEqual(FRAGILE_FROM);
    expect(SOURCE_ROBUSTNESS[STAT_SOURCE.EMBEDDED_DATA]).toBeLessThan(FRAGILE_FROM);
  });

  describe('★経路の降格を検出する(ニコ生が変えた予兆)', () => {
    it('embedded-data で取れていた値が dom-text に落ちたら bad', () => {
      const s = createProvenanceState();
      // 平常時: JSON から取れている
      noteSource(s, { field: 'viewerCount', source: STAT_SOURCE.EMBEDDED_DATA, at: 1000 });
      expect(judgeSourceProvenance(s).level).toBe('ok');

      // ★ニコ生が構造を変えた: JSON から取れなくなり画面文字にフォールバック
      noteSource(s, { field: 'viewerCount', source: STAT_SOURCE.DOM_TEXT, at: 2000 });

      const v = judgeSourceProvenance(s);
      expect(v.level).toBe('bad');
      expect(v.degraded).toContain('viewerCount');
      // 次の一手が読み取れる文言(掟6)
      expect(v.text).toContain('ニコ生の変更');
    });

    it('★より丈夫な経路で取れるようになったら降格は解消する(直したら緑に戻る)', () => {
      const s = createProvenanceState();
      noteSource(s, { field: 'viewerCount', source: STAT_SOURCE.EMBEDDED_DATA, at: 1000 });
      noteSource(s, { field: 'viewerCount', source: STAT_SOURCE.DOM_TEXT, at: 2000 });
      expect(judgeSourceProvenance(s).level).toBe('bad');

      // 修正して JSON から取れるようになった
      noteSource(s, { field: 'viewerCount', source: STAT_SOURCE.EMBEDDED_DATA, at: 3000 });
      expect(judgeSourceProvenance(s).level).toBe('ok');
    });

    it('★最初から dom-text でしか取れない値は「降格」ではない(掟2: 仕様を異常にしない)', () => {
      const s = createProvenanceState();
      noteSource(s, { field: 'someDomOnlyValue', source: STAT_SOURCE.DOM_TEXT, at: 1000 });
      noteSource(s, { field: 'someDomOnlyValue', source: STAT_SOURCE.DOM_TEXT, at: 2000 });

      const v = judgeSourceProvenance(s);
      // 脆いことは警告するが、bad にはしない
      expect(v.level).toBe('warn');
      expect(v.degraded).toEqual([]);
      expect(v.fragileCount).toBe(1);
    });
  });

  describe('判定の両方向(正常時に警告を居座らせない)', () => {
    it('全部が丈夫な経路なら ok', () => {
      const s = createProvenanceState();
      noteSource(s, { field: 'a', source: STAT_SOURCE.OFFICIAL_STATS, at: 1 });
      noteSource(s, { field: 'b', source: STAT_SOURCE.EMBEDDED_DATA, at: 1 });
      const v = judgeSourceProvenance(s);
      expect(v.level).toBe('ok');
      expect(v.text).toContain('2件');
    });

    it('★観測ゼロは na(「使っていない」と「壊れた」を混ぜない)', () => {
      expect(judgeSourceProvenance(createProvenanceState()).level).toBe('na');
      expect(judgeSourceProvenance(null).level).toBe('na');
    });
  });

  describe('記録の頑丈さ(嘘の記録を作らない)', () => {
    it('★経路が enum 外なら記録しない(出所不明を「取れた」と数えない)', () => {
      const s = createProvenanceState();
      noteSource(s, { field: 'x', source: 'てきとう', at: 1 });
      noteSource(s, { field: 'x', source: null, at: 1 });
      expect(snapshotProvenance(s).total).toBe(0);
    });

    it('field が空なら記録しない', () => {
      const s = createProvenanceState();
      noteSource(s, { field: '', source: STAT_SOURCE.EMBEDDED_DATA, at: 1 });
      noteSource(s, { field: '   ', source: STAT_SOURCE.EMBEDDED_DATA, at: 1 });
      expect(snapshotProvenance(s).total).toBe(0);
    });

    it('壊れた state を渡しても落ちない', () => {
      expect(() => noteSource(null, { field: 'a', source: STAT_SOURCE.EMBEDDED_DATA })).not.toThrow();
      expect(() => noteSource({}, { field: 'a', source: STAT_SOURCE.EMBEDDED_DATA })).not.toThrow();
    });

    it('経路ごとの件数を数える(どこに依存しているかの残高)', () => {
      const s = createProvenanceState();
      noteSource(s, { field: 'a', source: STAT_SOURCE.EMBEDDED_DATA, at: 1 });
      noteSource(s, { field: 'b', source: STAT_SOURCE.DOM_TEXT, at: 1 });
      noteSource(s, { field: 'c', source: STAT_SOURCE.DOM_TEXT, at: 1 });
      const snap = snapshotProvenance(s);
      expect(snap.bySource[STAT_SOURCE.DOM_TEXT]).toBe(2);
      expect(snap.bySource[STAT_SOURCE.EMBEDDED_DATA]).toBe(1);
    });
  });

  describe('★既存コードの表記を受け取れる(語彙を2つ作らない)', () => {
    it("content-entry の 'embedded'/'dom' をそのまま渡せる", () => {
      const s = createProvenanceState();
      // ★content-entry.js は既に viewerCountSource:'ws'|'embedded'|'dom'|'none' を持っている
      noteSource(s, { field: 'viewerCount', source: 'embedded', at: 1000 });
      noteSource(s, { field: 'viewerCount', source: 'dom', at: 2000 });
      const v = judgeSourceProvenance(s);
      expect(v.level).toBe('bad');
      expect(v.degraded).toContain('viewerCount');
    });

    it("★'none' は記録しない(取れなかったのを経路として数えない)", () => {
      const s = createProvenanceState();
      noteSource(s, { field: 'viewerCount', source: 'none', at: 1000 });
      expect(snapshotProvenance(s).total).toBe(0);
    });

    it('normalizeSource は未知の語を null にする', () => {
      expect(normalizeSource('embedded')).toBe(STAT_SOURCE.EMBEDDED_DATA);
      expect(normalizeSource('dom')).toBe(STAT_SOURCE.DOM_TEXT);
      expect(normalizeSource('none')).toBeNull();
      expect(normalizeSource('でたらめ')).toBeNull();
      expect(normalizeSource(undefined)).toBeNull();
    });
  });

  describe('★保存と復元(降格は時間をまたいで起きる)', () => {
    it('保存→復元しても best が保たれる＝降格を判定できる', () => {
      const s = createProvenanceState();
      noteSource(s, { field: 'viewerCount', source: STAT_SOURCE.EMBEDDED_DATA, at: 1000 });

      // ページを閉じて開き直した、を再現
      const restored = fromStorable(toStorable(s));

      // 開き直した後に dom へ落ちた
      noteSource(restored, { field: 'viewerCount', source: STAT_SOURCE.DOM_TEXT, at: 5000 });
      const v = judgeSourceProvenance(restored);
      expect(v.level).toBe('bad');
      expect(v.degraded).toContain('viewerCount');
    });

    it('★保存値が壊れていても嘘の履歴を作らない', () => {
      expect(snapshotProvenance(fromStorable(null)).total).toBe(0);
      expect(snapshotProvenance(fromStorable('でたらめ')).total).toBe(0);
      expect(snapshotProvenance(fromStorable({ a: { best: 'ありえない経路' } })).total).toBe(0);
    });

    it('値そのものは保存しない(個人情報を溜めない)', () => {
      const s = createProvenanceState();
      noteSource(s, { field: 'viewerCount', source: STAT_SOURCE.EMBEDDED_DATA, at: 1000 });
      const stored = toStorable(s);
      const json = JSON.stringify(stored);
      expect(json).not.toContain('value');
      expect(Object.keys(stored.viewerCount).sort()).toEqual(['best', 'current', 'lastAt', 'samples']);
    });
  });

  it('★降格は複数フィールドでも全部名指しする(1件で止めない)', () => {
    const s = createProvenanceState();
    for (const f of ['viewerCount', 'commentCount', 'title', 'thumb']) {
      noteSource(s, { field: f, source: STAT_SOURCE.EMBEDDED_DATA, at: 1 });
      noteSource(s, { field: f, source: STAT_SOURCE.DOM_TEXT, at: 2 });
    }
    const v = judgeSourceProvenance(s);
    expect(v.degraded).toHaveLength(4);
    // 画面には先頭3件+「ほか1件」(長文で崩さない)
    expect(v.text).toContain('ほか1件');
  });
});
