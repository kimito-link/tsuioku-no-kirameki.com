import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkIndexKey, chunkStorageKey } from './commentChunkStore.js';
import { tailStorageKey } from './commentTailBuffer.js';
import { commentsStorageKey } from './storageKeys.js';

/**
 * background.js(手書きクラシック SW・ESM import 不可)が持つチャンク/テールキーの
 * 「ローカル版」が、lib の正本とズレていないかを検知する。
 *
 * ★なぜ要るか(2026-09-04 実測):
 *   background.js:33 が理由を自分で書いている —
 *     「v0.1.509: 追記専用チャンクのキー/読み出しのローカル版。
 *       background は src/lib をバンドルしないため、ミラーする。」
 *   ★ミラーは意図的で正しい(MV3 の SW は ESM import 不可)。問題はミラーであることではなく、
 *   ★【正本と一致し続けているかを誰も見ていなかった】こと。この検査を入れるまで
 *   chunkIndexKeyLocal / chunkStorageKeyLocal / tailStorageKeyLocal を lib と突合する
 *   テストは 0 件だった。
 *
 * ★実際に起きた同型の事故: v0.1.1324(01c6d92d) は「同じ配信でも供給元で文字列が違う鍵」を
 *   作ってしまい、読めた全件を捨てて bail した。★キーがズレると【コメントが読めなくなる】。
 *
 * ★文字列一致だけにしない理由: リテラルを見るだけの検査は「正規化の実装が変わった」
 *   (trim/toLowerCase を落とした・seq の丸めを変えた 等)を素通しする。
 *   ★SW の関数を実際に切り出して【実行し】、正本の戻り値と突き合わせる。
 *
 * 直し方: ズレたら background.js を lib(commentChunkStore.js / commentTailBuffer.js /
 *   storageKeys.js)に合わせる。★lib を SW に合わせない(正本は lib)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backgroundSrc = readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');
const reminder =
  'background.js は ESM import 不可の手書き SW。lib(commentChunkStore.js / commentTailBuffer.js / storageKeys.js)に合わせて直すこと';

const MIRROR_NAMES = Object.freeze([
  'commentsStorageKey',
  'chunkIndexKeyLocal',
  'chunkStorageKeyLocal',
  'tailStorageKeyLocal'
]);

/** background.js から関数宣言を切り出して評価し、実際に呼べる形にする。 */
function loadSwMirrors() {
  let code = '';
  for (const name of MIRROR_NAMES) {
    const re = new RegExp(String.raw`function ${name}\([^)]*\)\s*\{[\s\S]*?\n\}`);
    const m = backgroundSrc.match(re);
    // ★関数ごと消えた/改名された場合もここで落ちる(黙って緑にしない)。
    expect(m, `${name} が background.js に見つからない: ${reminder}`).toBeTruthy();
    code += `${m[0]}\n`;
  }
  return new Function(`${code}return { ${MIRROR_NAMES.join(',')} };`)();
}

describe('background.js のコメントチャンク鍵ミラー(drift 検知)', () => {
  const sw = loadSwMirrors();
  const lv = 'lv123456789';

  it('チャンク索引キーが正本と一致する', () => {
    expect(sw.chunkIndexKeyLocal(lv), reminder).toBe(chunkIndexKey(lv));
  });

  it('チャンク本体キーが正本と一致する(seq の丸めを含む)', () => {
    for (const seq of [0, 1, 7, 42]) {
      expect(sw.chunkStorageKeyLocal(lv, seq), reminder).toBe(chunkStorageKey(lv, seq));
    }
    // ★負値/小数/非数の丸めまで一致していること(片方だけ Math.max/floor を落とすと別キーになる)。
    for (const seq of [-1, 2.9, NaN, undefined]) {
      expect(sw.chunkStorageKeyLocal(lv, seq), reminder).toBe(chunkStorageKey(lv, seq));
    }
  });

  it('テールキーが正本と一致する', () => {
    expect(sw.tailStorageKeyLocal(lv), reminder).toBe(tailStorageKey(lv));
  });

  it('従来 main キーが正本と一致する', () => {
    expect(sw.commentsStorageKey(lv), reminder).toBe(commentsStorageKey(lv));
  });

  // ★正規化(trim/toLowerCase)まで一致していること。ここが割れると
  //   「同じ配信なのに別キー」= v0.1.1324 と同型の事故になる。
  it('liveId の正規化(前後空白・大文字)が正本と一致する', () => {
    for (const raw of [' LV123456789 ', 'Lv123456789', 'lv123456789']) {
      expect(sw.chunkIndexKeyLocal(raw), reminder).toBe(chunkIndexKey(raw));
      expect(sw.tailStorageKeyLocal(raw), reminder).toBe(tailStorageKey(raw));
      expect(sw.commentsStorageKey(raw), reminder).toBe(commentsStorageKey(raw));
      expect(sw.chunkStorageKeyLocal(raw, 3), reminder).toBe(chunkStorageKey(raw, 3));
    }
  });

  // ★接頭辞そのものの固定。lib と SW が【揃って】変わると上の比較は緑のままなので、
  //   実際に storage に載る文字列を1箇所で釘付けにする(移行済みデータが読めなくなるのを防ぐ)。
  it('storage に載る接頭辞が変わっていない(揃って変えても気づける)', () => {
    expect(chunkIndexKey(lv)).toBe('nls_cchunk_index_lv123456789');
    expect(chunkStorageKey(lv, 7)).toBe('nls_cchunk_lv123456789_7');
    expect(tailStorageKey(lv)).toBe('nls_ctail_lv123456789');
    expect(commentsStorageKey(lv)).toBe('nls_comments_lv123456789');
  });
});
