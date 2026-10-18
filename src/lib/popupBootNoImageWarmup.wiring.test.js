import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * popup の起動時に、ゆっくり画像(PNG 約24枚)を data URL に焼く「先読み」をしない(v0.1.1678)。
 *
 * ■ 経緯(2026-10-18)
 *   サイドパネルを開くたびに popup が起動し、起動処理の末尾で buildYukkuriImageDataUrlMap() を呼んでいた
 *   (マーケ分析の書き出しボタンの即応性向上が目的)。これは 24 枚の PNG を fetch して 1 バイトずつ
 *   String.fromCharCode で連結して base64 にする重い処理で、実機の保存データを写したヘッドレスの
 *   CPU プロファイルで、拡張プロセスの JS 自己時間の上位(arrayBufferToBase64 542ms + fetch 側 186ms / 5回の開閉)と、
 *   文字列の大量生成による GC 圧の一因になっていた。しかも、いまマーケ分析は専用ページ(marketing-export-entry.js)が
 *   自分で作る。書き出しが要るとき(downloadCommentsHtml・レポート組み立て)に作れば足り、開くたびに払う必要は無い。
 *
 * ★書き出しの経路(downloadCommentsHtml)での呼び出しは残す(Promise キャッシュ済み=必要なときだけ1回払う)。
 */
const src = readFileSync(path.join(process.cwd(), 'src/extension/popup-entry.js'), 'utf8').replace(/\r\n/g, '\n');

describe('popup 起動時のゆっくり画像の先読み', () => {
  it('★buildYukkuriImageDataUrlMap() の呼び出しは、書き出し(downloadCommentsHtml)の中の1か所だけ', () => {
    const calls = [...src.matchAll(/buildYukkuriImageDataUrlMap\(\)/g)].map((m) => m.index);
    expect(calls).toHaveLength(1);
    const fnStart = src.indexOf('async function downloadCommentsHtml(');
    expect(fnStart).toBeGreaterThan(-1);
    const nextFn = src.indexOf('\nasync function ', fnStart + 10);
    const nextFn2 = src.indexOf('\nfunction ', fnStart + 10);
    const end = Math.min(...[nextFn, nextFn2].filter((n) => n > 0));
    expect(calls[0]).toBeGreaterThan(fnStart);
    expect(calls[0]).toBeLessThan(end);
  });

  it('★起動処理に「先読み」の呼び出しが残っていない', () => {
    expect(src).not.toMatch(/popup 起動時に画像キャッシュを warm-up/);
  });
});
