import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 受け身popup・通常popup代替読み込みが配信別の応援レーン鏡(v2)を読む配線の固定(2026-10-09)。 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const popup = readFileSync(path.join(root, 'extension/popup-entry.js'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  let d = 0;
  for (let j = src.indexOf('{', src.indexOf(')', i)); j < src.length; j += 1) {
    if (src[j] === '{') d += 1;
    else if (src[j] === '}' && (d -= 1) === 0) return src.slice(i, j + 1);
  }
  return '';
}

describe('popup: 応援レーン鏡は配信別キーを優先して読む', () => {
  const passive = fnBody(popup, 'async function applyLaneMirrorForPassive(');
  const fallback = fnBody(popup, 'async function applyLaneMirrorForMainPopupFallback(');
  it('★前提: 2関数の本体が取れている', () => {
    expect(passive.length).toBeGreaterThan(300);
    expect(fallback.length).toBeGreaterThan(300);
  });
  it('★受け身popup: laneMirrorReadKeys(表示中の配信)で読み、pickLaneMirrorSnap で選ぶ', () => {
    expect(passive).toMatch(/pickLaneMirrorSnap\(await chrome\.storage\.local\.get\(laneMirrorReadKeys\(_surfaceLid\)\), _surfaceLid\)/);
    expect(passive).not.toMatch(/storage\.local\.get\(KEY_LANE_MIRROR\)/);
  });
  it('★通常popupの代替読み込み: 同じ(lid で読む)', () => {
    expect(fallback).toMatch(/pickLaneMirrorSnap\(await chrome\.storage\.local\.get\(laneMirrorReadKeys\(lid\)\), lid\)/);
    expect(fallback).not.toMatch(/storage\.local\.get\(KEY_LANE_MIRROR\)/);
  });
  it('★別配信の鏡を貼らない照合は残っている(共通キーに戻ったときの安全)', () => {
    expect(passive).toMatch(/shouldSkipMirrorForLiveId\(snap\.liveId, currentPassiveSurfaceLiveId\(\)\)/);
    expect(fallback).toMatch(/String\(snap\.liveId \|\| ''\)\.trim\(\)\.toLowerCase\(\) !== lid\) return;/);
  });
  it('★受け身popupは配信別キーの更新通知でも描き直す(共通キーの更新だけに頼らない)', () => {
    expect(popup).toMatch(/changedKeys\.includes\(KEY_LANE_MIRROR\) \|\| changedKeys\.includes\(laneMirrorKeyFor\(currentPassiveSurfaceLiveId\(\)\)\)/);
  });
});
