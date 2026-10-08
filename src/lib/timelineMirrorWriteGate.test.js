import { describe, it, expect } from 'vitest';
import { decideTimelineMirrorWrite, TIMELINE_MIRROR_MIN_INTERVAL_MS } from './timelineMirrorWriteGate.js';

describe('decideTimelineMirrorWrite', () => {
  it('初回(まだ書いていない)はすぐ書く', () => {
    expect(decideTimelineMirrorWrite({ nowMs: 1_000_000, lastWriteAt: 0 })).toEqual({ write: true, retryInMs: 0 });
  });
  it('★最短間隔より前は書かず、残り時間を返す(末尾の追いつき用)', () => {
    const last = 1_000_000;
    const r = decideTimelineMirrorWrite({ nowMs: last + 3000, lastWriteAt: last });
    expect(r.write).toBe(false);
    expect(r.retryInMs).toBe(TIMELINE_MIRROR_MIN_INTERVAL_MS - 3000);
  });
  it('最短間隔を過ぎたら書く(ちょうどの境界も書く)', () => {
    const last = 1_000_000;
    expect(decideTimelineMirrorWrite({ nowMs: last + TIMELINE_MIRROR_MIN_INTERVAL_MS, lastWriteAt: last }).write).toBe(true);
    expect(decideTimelineMirrorWrite({ nowMs: last + TIMELINE_MIRROR_MIN_INTERVAL_MS - 1, lastWriteAt: last }).write).toBe(false);
  });
  it('★時計が巻き戻ったら書く側に倒す(止まりっぱなしにしない)', () => {
    expect(decideTimelineMirrorWrite({ nowMs: 500, lastWriteAt: 1_000_000 }).write).toBe(true);
  });
  it('壊れた入力は書く側に倒す', () => {
    expect(decideTimelineMirrorWrite({ nowMs: NaN, lastWriteAt: 5 }).write).toBe(true);
    expect(decideTimelineMirrorWrite(/** @type {any} */ (null)).write).toBe(true);
  });
  it('retryInMs は最低1ms(0 で即再実行のループにならない)', () => {
    const r = decideTimelineMirrorWrite({ nowMs: 1_000_000 + TIMELINE_MIRROR_MIN_INTERVAL_MS - 1, lastWriteAt: 1_000_000 });
    expect(r.retryInMs).toBeGreaterThanOrEqual(1);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('配線: content がゲートを通す', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const src = readFileSync(path.join(root, 'extension/content-entry.js'), 'utf8').replace(/\r\n/g, '\n');
  const i = src.indexOf('async function publishCommentTimelineMirrorFromContent');
  const body = src.slice(i, i + 3000);
  it('★書き込みの前に最短間隔の判定を通し、間引いたら再試行タイマーを張る', () => {
    expect(body).toMatch(/decideTimelineMirrorWrite\(\{ nowMs, lastWriteAt: _timelineMirrorWriteAt\.get\(lid\) \|\| 0 \}\)/);
    expect(body).toMatch(/if \(!gate\.write\) \{/);
    expect(body).toMatch(/if \(!_timelineMirrorRetry\.has\(lid\)\) _timelineMirrorRetry\.set\(lid, setTimeout\(\(\) => \{ _timelineMirrorRetry\.delete\(lid\); void publishCommentTimelineMirrorFromContent\(Date\.now\(\)\); \}, gate\.retryInMs\)/);
    // 判定は set の【前】にある(後ろだと間引きにならない)
    expect(body.indexOf('decideTimelineMirrorWrite(')).toBeLessThan(body.indexOf('chrome.storage.local.set'));
  });
  it('★書き込み成功後に時刻を記録する(失敗したら次を妨げない)', () => {
    expect(body).toMatch(/_timelineMirrorWriteAt\.set\(lid, nowMs\);/);
    expect(body.indexOf('chrome.storage.local.set')).toBeLessThan(body.indexOf('_timelineMirrorWriteAt.set'));
  });
});
