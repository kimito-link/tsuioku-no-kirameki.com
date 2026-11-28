// @vitest-environment happy-dom
// v0.1.2265: 書き出しの画面読み取りは、URL だけでなく画面の枠がいまの動画のときだけ(ミックスで A のコメントを B に付けない)
import { describe, expect, it } from 'vitest';
import { ytPageExportSnapshotReady, ytWatchDomIsFor } from './ytVideoWatchMeta.js';
import { readFileSync } from 'node:fs';

const A = 'AAAAAAAAAAA';
const B = 'BBBBBBBBBBB';

describe('ytPageExportSnapshotReady', () => {
  it('画面の枠が前の動画(A)のとき、B は not-ready(古いコメントを返さない)', () => {
    const doc = document.implementation.createHTMLDocument('');
    const flexy = doc.createElement('ytd-watch-flexy');
    flexy.setAttribute('video-id', A);
    doc.body.appendChild(flexy);
    expect(ytPageExportSnapshotReady(doc, B)).toEqual({ ok: false, reason: 'not-ready' });
    expect(ytWatchDomIsFor(doc, B)).toBe(false);
  });
  it('いまの動画の枠があれば ready', () => {
    const doc = document.implementation.createHTMLDocument('');
    const flexy = doc.createElement('ytd-watch-flexy');
    flexy.setAttribute('video-id', B);
    doc.body.appendChild(flexy);
    expect(ytPageExportSnapshotReady(doc, B)).toEqual({ ok: true });
  });
  it('yt-page-boot は ready でないとき not-ready を返す', () => {
    const src = readFileSync(`${process.cwd()}/src/extension/yt-page-boot.js`, 'utf8');
    expect(src).toContain('ytPageExportSnapshotReady');
    expect(src).toMatch(/sendResponse\(\{ ok: false, reason: ready\.reason \}/);
  });
});
