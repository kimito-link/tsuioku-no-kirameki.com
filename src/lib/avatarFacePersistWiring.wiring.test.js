import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 匿名アイコンの「合成した顔」を IndexedDB に残して使い回す配線(v0.1.1680)。
 *   開くたびに同じ顔を canvas.toBlob で作り直すのが、拡張プロセスのメインスレッド時間の大半だった。
 *   配線が切れると、見た目は変わらないまま【黙って毎回作り直す】に戻る=速報にも出ない。ここで固定する。
 */
const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const src = strip(read('src/lib/avatarPartsComposer.js'));

describe('顔の永続キャッシュの配線', () => {
  it('★canvas で作る【前】に永続キャッシュを読む(読めたら canvas を作らず返す)', () => {
    const iife = src.indexOf('const promise = (async () => {');
    const read_ = src.indexOf('faceStore.get(key)', iife);
    const canvas = src.indexOf("document.createElement('canvas')", iife);
    expect(read_).toBeGreaterThan(iife);
    expect(canvas).toBeGreaterThan(read_);
    expect(src.slice(read_, canvas)).toMatch(/return persisted;/);
  });

  it('★作った顔は永続キャッシュへ書く(書き忘れると毎回作り直す)', () => {
    const iife = src.indexOf('const promise = (async () => {');
    const made = src.indexOf('await canvasToImageUrl(canvas)', iife);
    const put = src.indexOf('faceStore.put(key, dataUrl)', made);
    expect(made).toBeGreaterThan(iife);
    expect(put).toBeGreaterThan(made);
  });

  it('★IndexedDB が無い環境(store=null)でも従来どおり作れる(null を許す書き方)', () => {
    expect(src).toMatch(/if \(faceStore\) \{/);
    expect(src).toMatch(/if \(faceStore\) faceStore\.put\(/);
  });

  it('読み込んだ顔はメモリのキャッシュにも入れ、上限(512)を守る(rememberFace)', () => {
    expect(src).toContain('function rememberFace(');
    expect(src).toMatch(/rememberFace\(key, persisted\)/);
    expect(src).toMatch(/rememberFace\(key, dataUrl\)/);
  });
});

describe('開いた瞬間の顔の先読み(v0.1.1691)', () => {
  const popup = read('src/extension/popup-entry.js');
  it('★popup は initPopup の先頭で hydrateRecentAnonymousFaces を(待たずに)呼ぶ', () => {
    expect(popup).toMatch(/import \{[^}]*hydrateRecentAnonymousFaces[^}]*\} from '\.\.\/lib\/avatarPartsComposer\.js';/);
    const f = popup.indexOf('async function initPopup() {');
    expect(f).toBeGreaterThan(-1);
    const head = popup.slice(f, f + 900);
    expect(head).toContain('void hydrateRecentAnonymousFaces();');
    // 最初の描き(paintVersionBadge)より前
    expect(head.indexOf('void hydrateRecentAnonymousFaces();')).toBeLessThan(head.indexOf('paintVersionBadge();'));
  });
  it('★composer の先読みは永続側を読むだけ(getRecent 以外の書き込みを呼ばない)', () => {
    const f = src.indexOf('export async function hydrateRecentAnonymousFaces(');
    const body = src.slice(f, src.indexOf('\n}\n', f));
    expect(body).toContain('store.getRecent(AVATAR_FACE_HYDRATE_COUNT)');
    expect(body).not.toMatch(/\.put\(|\.delete\(|\.clear\(/);
  });
});
