import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 匿名の顔の合成を専用 Worker へ移す配線(v0.1.1681)。
 *   Worker の経路が切れると、見た目は変わらないまま【黙ってメインスレッド合成(数秒の詰まり)に戻る】。
 *   フォールバックが消えると、Worker が使えない環境で顔が出なくなる。両方をここで固定する。
 */
const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const composer = strip(read('src/lib/avatarPartsComposer.js'));

describe('顔の Worker 合成の配線', () => {
  it('★順序: 永続キャッシュを読む → Worker に頼む → (だめなら)メインスレッドの canvas で作る', () => {
    const iife = composer.indexOf('const promise = (async () => {');
    const store = composer.indexOf('faceStore.get(key)', iife);
    const worker = composer.indexOf('await composeFaceViaWorker(selected)', iife);
    const canvas = composer.indexOf("document.createElement('canvas')", iife);
    expect(store).toBeGreaterThan(iife);
    expect(worker).toBeGreaterThan(store);
    expect(canvas).toBeGreaterThan(worker);
  });

  it('★Worker で作れたら、メモリと永続キャッシュに入れて返す(canvas は作らない)', () => {
    const w = composer.indexOf('const viaWorker = await composeFaceViaWorker(selected);');
    const canvas = composer.indexOf("document.createElement('canvas')", w);
    const block = composer.slice(w, canvas);
    expect(block).toContain('rememberFace(key, viaWorker)');
    expect(block).toContain('faceStore.put(key, viaWorker)');
    expect(block).toMatch(/return viaWorker;/);
  });

  it('★フォールバックが残っている: Worker 失敗は \'\' を返し、従来のメインスレッド合成(canvasToImageUrl)へ落ちる', () => {
    const fn = composer.indexOf('async function composeFaceViaWorker');
    const body = composer.slice(fn, fn + 900);
    expect(body).toMatch(/catch \{[\s\S]*return '';/);
    expect(composer).toContain('await canvasToImageUrl(canvas)');
  });

  it('★撤回スイッチ(FACE_WORKER_ENABLED)と Worker 有無の判定がある(false で v1680 と同じ挙動)', () => {
    expect(composer).toMatch(/const FACE_WORKER_ENABLED = true;/);
    expect(composer).toMatch(/typeof Worker !== 'function'/);
  });

  it('★Worker の URL は dist/avatar-face-worker.js(拡張ページが chrome.runtime.getURL で起動)', () => {
    expect(composer).toContain("runtime.getURL('dist/avatar-face-worker.js')");
  });

  it('★状態速報で見える: getAvatarComposeStats に worker の状態が載る', () => {
    expect(composer).toMatch(/worker: faceWorkerClient \? faceWorkerClient\.snapshot\(\)/);
    expect(composer).toContain('workerComposed');
    expect(composer).toContain('workerFallback');
  });

  it('★ビルドに Worker のエントリがある(消すと dist が出ず、全部フォールバックになる)', () => {
    const b = read('scripts/build.mjs');
    expect(b).toContain("entryPoints: ['src/extension/avatar-face-worker-entry.js']");
    expect(b).toContain("outfile: 'extension/dist/avatar-face-worker.js'");
    expect(existsSync(path.join(process.cwd(), 'src/extension/avatar-face-worker-entry.js'))).toBe(true);
  });

  it('★Worker は IndexedDB にも chrome.* にも触れない(キャッシュの書き手はメインスレッドだけ)', () => {
    const w = strip(read('src/extension/avatar-face-worker-entry.js'));
    expect(w).not.toMatch(/indexedDB|\bchrome\./);
    expect(w).toContain("error: 'no-offscreencanvas'");
  });

  it('座標の正本は1つ(avatarPartAnchors.js)・composer は再エクスポート・定義を複製しない', () => {
    expect(composer).toContain("from './avatarPartAnchors.js'");
    expect(composer).toMatch(/export \{ AVATAR_PART_ANCHORS \};/);
    expect(composer).not.toMatch(/export const AVATAR_PART_ANCHORS/);
    expect(strip(read('src/lib/avatarFaceRender.js'))).toContain("from './avatarPartAnchors.js'");
  });
});
