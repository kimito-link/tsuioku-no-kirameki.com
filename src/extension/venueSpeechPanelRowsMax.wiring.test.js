import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { USER_SPEECH_ROWS_MAX } from '../lib/comeviewUserDetailLink.js';

/**
 * 発言パネルの上限件数が 2 箇所(venueBar.js の数値リテラル・comeview-entry.js が使う
 * USER_SPEECH_ROWS_MAX)で食い違わないことの配線ガード(手書き 2 箇所を機械で束ねる)。
 *
 * ★venueBar.js は数値リテラルのまま(venueHoverCard.wiring.test.js が `= \d+` を要求)。
 *   その値が USER_SPEECH_ROWS_MAX と一致することをここで断言する。
 * 設計正本: docs/handoff/live-comment-body-DESIGN.md 機能A(A7)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

describe('発言パネル上限件数の配線(食い違い=CI赤)', () => {
  it('venueBar.js の VENUE_SPEECH_PANEL_MAX リテラルが USER_SPEECH_ROWS_MAX と一致する', () => {
    const src = read('src/extension/venueBar.js');
    const m = src.match(/VENUE_SPEECH_PANEL_MAX\s*=\s*(\d+)/);
    expect(m).toBeTruthy();
    expect(Number(m?.[1])).toBe(USER_SPEECH_ROWS_MAX);
  });

  it('comeview-entry.js が USER_SPEECH_ROWS_MAX を extractUserCommentRows に渡している', () => {
    const src = read('src/extension/comeview-entry.js');
    // import 済みであること。
    expect(src).toMatch(/USER_SPEECH_ROWS_MAX/);
    // 生の 200 リテラルで呼んでいないこと(上限の一本化が外れていない)。
    expect(src).toMatch(/extractUserCommentRows\([^)]*USER_SPEECH_ROWS_MAX\s*\)/);
  });

  it('USER_SPEECH_ROWS_MAX は 1000', () => {
    expect(USER_SPEECH_ROWS_MAX).toBe(1000);
  });
});
