/**
 * 鏡の書き手が複数あるとき、小さい鏡が大きい鏡を上書きしない配線の固定(2026-10-12)。
 * 判定は laneMirrorWriterYield.test.js。書く直前の「読む→確かめる→書く」の挙動は
 * laneMirrorPerLiveGuard.test.js。ここは popup-entry が実際に使っているかを固定する。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const popupSrc = readFileSync(join(here, '..', 'extension', 'popup-entry.js'), 'utf8').replace(/\r\n/g, '\n');

describe('鏡の書き手の衝突回避(配線)', () => {
  const i = popupSrc.indexOf('function publishLaneMirror(input)');
  const body = i < 0 ? '' : popupSrc.slice(i, i + 3800);

  it('publishLaneMirror の本体が取れている(前提)', () => {
    expect(body.length).toBeGreaterThan(800);
  });

  it('書き手IDを鏡に載せている', () => {
    expect(body).toMatch(/nowMs: now,\n\s+writerId: _laneMirrorWriterId\n\s+\}\);/);
  });

  it('配信別の鏡の書き込みに guard(書く直前の確認)を渡している', () => {
    expect(body).toMatch(/\}, _laneMirrorWriteGate, \{\n\s+\/\/[^\n]*\n\s+writerId: _laneMirrorWriterId,\n\s+windowMs: LANE_MIRROR_YIELD_WINDOW_MS,\n\s+get: \(key\) => chrome\.storage\.local\.get\(key\),\n/);
  });

  it('guard は Web Locks で直列化し、無ければ素通し(fail-open)', () => {
    expect(body).toContain("navigator.locks.request(name, fn)");
    expect(body).toMatch(/: fn\(\)\),\n\s+onYield: \(\) => \{ _lanePublishSkipDiag\.yielded \+= 1; \}/);
  });

  it('旧版の onChanged 方式(通知の遅れで間に合わない)に戻っていない', () => {
    expect(popupSrc).not.toContain('createLaneMirrorWriterYield');
    expect(popupSrc).not.toContain('_laneMirrorWriterYield.');
  });
});
