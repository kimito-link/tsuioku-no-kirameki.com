import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildVenueSeatsDiagSnapshot } from './venueSeatsDiag.js';
import { buildAiShareFullText } from './aiShareFullText.js';
import {
  createVenueMirrorIntakeState,
  observeVenueMirrorChange,
  formatVenueMirrorIntakeLine
} from './venueMirrorIntakeDiag.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const venueBar = readFileSync(join(root, 'src/extension/venueBar.js'), 'utf8');

/**
 * ★通し検査(測る→積む→運ぶ→出る)。
 *   部品が全部緑でも受け渡しが1箇所切れれば計器は無言で消える
 *   ([[verify-output-appears-before-shipping-2026-08-09]]・v0.1.1295 で実際にやらかした)。
 */
describe('会場の鏡うけとり計器の通し', () => {
  describe('(1) 測る: venueBar が onChanged で観測している', () => {
    it('★import している', () => {
      expect(venueBar).toMatch(
        /import\s*\{[\s\S]{0,200}?formatVenueMirrorIntakeLine[\s\S]{0,200}?\}\s*from\s*'\.\.\/lib\/venueMirrorIntakeDiag\.js'/
      );
    });

    it('★onChanged で observeVenueMirrorChange を呼んでいる(期待キーと実キーを渡す)', () => {
      const m = venueBar.match(/observeVenueMirrorChange\(_venueMirrorIntake,\s*\{([\s\S]*?)\}\);/);
      expect(m, '呼び出しが読めること').toBeTruthy();
      expect(m[1]).toMatch(/changedKeys:/);
      expect(m[1]).toMatch(/expectedKey:/);
      expect(m[1]).toMatch(/matched:/);
    });

    it('★出力は概要ブロックの外にある(配信が無いときも出る)', () => {
      // ★会場が同期していないときほど診断が消える、という逆立ちを防ぐ。
      const share = readFileSync(join(root, 'src/lib/aiShareFullText.js'), 'utf8');
      const idxIntake = share.indexOf('mirrorIntakeLine');
      const idxOverview = share.indexOf('if (overviewText) {');
      expect(idxIntake).toBeGreaterThan(0);
      expect(idxOverview).toBeGreaterThan(0);
      expect(idxIntake, 'mirrorIntakeLine は if (overviewText) より前で出す').toBeLessThan(idxOverview);
    });

    it('★関所の結果も観測している(却下理由つき)', () => {
      expect(venueBar).toMatch(/observeVenueMirrorAccept\(_venueMirrorIntake,\s*\{/);
      // 却下理由を捨てずに渡していること(「捨てられた」だけでは次の一手が決まらない)。
      expect(venueBar).toMatch(/_laneMirrorSanitizeIssues/);
    });
  });

  describe('(2)(3) 積む・運ぶ: seatsDiag に載せて publish している', () => {
    it('★seatsDiagObs に mirrorIntakeLine を載せている', () => {
      expect(venueBar).toMatch(
        /mirrorIntakeLine:\s*formatVenueMirrorIntakeLine\(_venueMirrorIntake,\s*Date\.now\(\)\)/
      );
    });

    it('★buildVenueSeatsDiagSnapshot が mirrorIntakeLine を通す(落とさない)', () => {
      const snap = buildVenueSeatsDiagSnapshot(
        { enabled: true, liveId: 'lv1', mirrorIntakeLine: 'テスト行' },
        1000
      );
      expect(snap.mirrorIntakeLine).toBe('テスト行');
    });

    it('未指定なら空文字(未知の値を通さない)', () => {
      const snap = buildVenueSeatsDiagSnapshot({ enabled: true, liveId: 'lv1' }, 1000);
      expect(snap.mirrorIntakeLine).toBe('');
    });
  });

  describe('(4) 出る: 状態速報の本文に現れる', () => {
    it('★mirrorIntakeLine があれば本文に出る', () => {
      const text = buildAiShareFullText({
        overviewText: '',
        livesData: [],
        venueSeatsDiag: { mirrorIntakeLine: '会場の鏡うけとり: 通知5回 / キー一致0・不一致3' }
      });
      expect(text).toContain('会場の鏡うけとり');
      expect(text).toContain('不一致3');
    });

    it('★空なら本文に1行も出ない(普段を汚さない)', () => {
      const text = buildAiShareFullText({
        overviewText: '',
        livesData: [],
        venueSeatsDiag: { mirrorIntakeLine: '' }
      });
      expect(text).not.toContain('会場の鏡うけとり');
    });

    it('★venueSeatsDiag 自体が無くても壊れない', () => {
      const text = buildAiShareFullText({ overviewText: '', livesData: [], venueSeatsDiag: null });
      expect(typeof text).toBe('string');
    });
  });

  describe('(5) 実データで通す: liveId 不一致が本文まで名指しされる', () => {
    it('★キー不一致のシナリオが本文で読める形になる', () => {
      const s = createVenueMirrorIntakeState();
      observeVenueMirrorChange(s, {
        changedKeys: ['nls_lane_mirror_v2_lv999'],
        expectedKey: 'nls_lane_mirror_v2_lv111',
        matched: false
      });
      const line = formatVenueMirrorIntakeLine(s, 5000);
      const snap = buildVenueSeatsDiagSnapshot(
        { enabled: true, liveId: 'lv111', mirrorIntakeLine: line },
        5000
      );
      const text = buildAiShareFullText({
        overviewText: '',
        livesData: [],
        venueSeatsDiag: snap
      });
      expect(text).toContain('liveId が食い違って');
      expect(text).toContain('nls_lane_mirror_v2_lv999');
    });
  });
});
