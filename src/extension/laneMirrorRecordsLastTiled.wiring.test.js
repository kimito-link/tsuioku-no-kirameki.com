/**
 * laneMirrorRecordsLastTiled.wiring — 鏡経路が実タイル描画後に _storyUserLaneLastTiledLid を
 *   記録する配線を固定する(段5・18→1 の非対称解消)。
 *
 * 背景(v0.1.1536): heavy 経路(popup-entry.js:6478)は paint 後に「描いた lid」を記録するが、
 *   鏡経路(applyLaneMirrorForMainPopupFallback / applyLaneMirrorForPassive)は記録していなかった。
 *   この非対称のため、鏡が18枚描いても縮小ガードが「守る前回描画が無い」と誤認し、直後の heavy
 *   暫定1枚が18→1に上書きしていた(v0.1.1527 で前倒し描画として実害化 → v0.1.1530 で前倒しは撤去、
 *   非対称の根だけが残っていた)。ここでは【両方の鏡経路が記録している】ことをソース走査で固定する。
 *   縮小ガードの真偽ロジック自体は renderStoryUserLaneDom.test.js が全数固定済み。
 *
 * ★恒真回避: 本文が取れなければ throw(空文字で素通しにしない)。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'popup-entry.js'), 'utf8');

/** 関数本体を波括弧対応で切り出す(次の関数まで regex 方式にしない=ネスト } で切れて素通しになる)。 */
function extractFnBody(source, header) {
  const start = source.indexOf(header);
  if (start < 0) throw new Error(`header not found: ${header}`);
  const braceStart = source.indexOf('{', start);
  if (braceStart < 0) throw new Error(`no opening brace after: ${header}`);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  throw new Error(`unbalanced braces for: ${header}`);
}

describe('laneMirrorRecordsLastTiled.wiring（鏡経路の lastTiled 記録）', () => {
  it('heavy 経路は従来どおり _storyUserLaneLastTiledLid を記録している(前提の確認)', () => {
    // 対称性の基準。ここが消えたら鏡側だけ記録する片肺になるので一緒に見張る。
    expect(src).toMatch(/_storyUserLaneLastTiledLid\s*=\s*String\(liveId\b[^;]*\)\.trim\(\)\.toLowerCase\(\);/);
  });

  it('applyLaneMirrorForMainPopupFallback が paint 後に lastTiled を記録する', () => {
    const body = extractFnBody(src, 'async function applyLaneMirrorForMainPopupFallback(');
    expect(body).toMatch(/paintStoryUserLaneDomFilled\(/);
    expect(body).toMatch(/_storyUserLaneLastTiledLid\s*=\s*lid\s*;/);
    // 記録は「実タイルがある時だけ」= countStoryUserLaneDomTiles ガード付き
    expect(body).toMatch(/if\s*\(\s*countStoryUserLaneDomTiles\(els\)\s*>\s*0\s*\)\s*_storyUserLaneLastTiledLid\s*=\s*lid\s*;/);
  });

  it('applyLaneMirrorForPassive が paint 後に lastTiled を記録する', () => {
    const body = extractFnBody(src, 'async function applyLaneMirrorForPassive(');
    expect(body).toMatch(/paintStoryUserLaneDomFilled\(/);
    expect(body).toMatch(/_storyUserLaneLastTiledLid\s*=\s*String\(snap\.liveId\b[^;]*\)\.trim\(\)\.toLowerCase\(\);/);
    expect(body).toMatch(/if\s*\(\s*countStoryUserLaneDomTiles\(els\)\s*>\s*0\s*\)\s*_storyUserLaneLastTiledLid\s*=/);
  });
});
