import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCommentSummary, isCommentSummary, summaryStorageKey } from '../commentSummary.js';

// v0.1.1978: YouTube 系の入口(shim)が、件数だけの軽い控えに答えること・最初の組み立て中はテールを待たせないこと。
const shim = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');

describe('ytNicoShim の件数の控え(nls_csummary_)', () => {
  it('接頭辞は popup が聞くキーと同じ作り方', () => {
    expect(summaryStorageKey('')).toBe('nls_csummary_');
    expect(shim).toContain("const SUMMARY_PREFIX = summaryStorageKey('');");
  });

  it('行数は IndexedDB で数え、popup の型の検査を通る形で返す', () => {
    expect(shim).toContain('const n = await countYtStreamComments(vid);');
    expect(shim).toContain('bag[k] = buildCommentSummary({ liveId: lv, recordedCount: n, recentRows: [] });');
    expect(isCommentSummary(buildCommentSummary({ liveId: 'lv123', recordedCount: 81110, recentRows: [] }), 'lv123')).toBe(true);
  });

  it('探り読みと視聴ページの中では答えない', () => {
    expect(shim).toContain('if (!YT_SHIM_IN_PAGE && k.startsWith(SUMMARY_PREFIX)) {');
    expect(shim).toContain('if (!vid || isProbe) continue;');
  });

  it('テールを待たせないのは、会場以外・最初の組み立て前・件数の控えと一緒に聞かれたときだけ', () => {
    expect(shim).toContain(
      'if (!IS_VENUE_CONTEXT && k.startsWith(TAIL_PREFIX) && !everBuiltLvs.has(lv) && list.includes(`${SUMMARY_PREFIX}${lv}`)) {'
    );
    expect(shim).toContain('if (Array.isArray(arr)) everBuiltLvs.add(lv);');
  });
});
