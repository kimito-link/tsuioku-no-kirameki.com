import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 出荷ビルド(dist)に「広告メッセージ」ラベルが載っているかの通し検査。
 *
 * ■ なぜ要るか(2026-08-18 に司令塔が実際に誤判定した)
 *   dist は日本語を `\uXXXX` にエスケープする(既知の地雷)。
 *   素の grep はもちろん、**`JSON.stringify` を使った検査も間違い**だった
 *   (JSON.stringify('広告') は生の日本語を返すのであって \uXXXX にはならない)。
 *   その誤った検査のせいで「dist に載っていない」と3秒間だけ誤診した。
 *   ★正しくは【1文字ずつ codePoint を \uXXXX に組み立てて】探す。
 *
 *   ＝ [[dist-japanese-is-uXXXX]] / 「自作デコーダを信じない・生セグメントを目で読む」
 *     の実践。実際に dist の当該箇所を目で読んで
 *     `広告メッセージ` を確認してからこの検査を書いた。
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

/** 日本語を esbuild の出力形式(\uXXXX の連なり)に変換する。 */
function toUnicodeEscapes(s) {
  return [...s]
    .map((c) => '\\u' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'))
    .join('');
}

describe('出荷ビルドに広告メッセージのラベルが載っている', () => {
  it('★エスケープ形式は自分で組み立てる(JSON.stringify では見つからない)', () => {
    // この検査自体が正しいことを固定する(誤った探し方に戻れないように)
    expect(toUnicodeEscapes('広告')).toBe('\\u5E83\\u544A');
    expect(JSON.stringify('広告')).not.toContain('\\u5E83');
  });

  it('★①POP と ④純Web の dist にラベルが在る', () => {
    const needle = toUnicodeEscapes('広告メッセージ');
    expect(read('extension/dist/popup.js')).toContain(needle);
    expect(read('app/dist/live-view.js')).toContain(needle);
  });

  it('★判定関数も載っている(ラベルだけ在って判定が無い、を防ぐ)', () => {
    for (const f of ['extension/dist/popup.js', 'app/dist/live-view.js']) {
      const s = read(f);
      expect(s).toContain('readAdvertiserName');
      expect(s).toContain('AD_MESSAGE_TILE_LABEL_ENABLED');
    }
  });
});
