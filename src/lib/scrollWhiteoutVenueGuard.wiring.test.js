import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * スクロール白化計器の「会場遮蔽を白化と数えない」ガード(v0.1.1198)。
 *
 * 背景(2026-07-31 の実測で確定): 実配信の白化サンプルが
 *   `hostVisibility:'hidden'` / `hostDisplay:'block'` / 高さ600のまま / culpritRepaint:1
 * だった。これは venueBar の意図した遮蔽の署名そのもの——会場を開くと
 *   `html.nlsb-venue-open #nls-inline-popup-host { visibility: hidden !important }`
 * が当たって host が不可視になる(v0.1.1128 で入った正常動作)。
 *
 * 計測側は `cs.visibility !== 'hidden'` だけで可視判定していたため、
 * 「会場を開くたびに白化1回」が積まれ、本物の白化(再描画で一瞬消える)が埋もれていた。
 *
 * このテストは両側を同時に固定する:
 *   - venueBar 側: 遮蔽CSSが存在し続けること(消えたらガードの前提が崩れる)
 *   - content 側: 計測が venueOpen を見て除外していること(戻したら偽陽性が復活する)
 * 片方だけ変わったときに CI が気づけるようにするのが目的。
 *
 * ★実行時 DOM 不要・純 Node(fs 読み)。content-entry.js / venueBar.js は content script で
 *   vitest から import できないため、ソース文字列スキャンで配線の実在を断言する
 *   (venueLaneParity.wiring.test.js と同型)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

const contentSrc = read('src/extension/content-entry.js');
const venueBarSrc = read('src/extension/venueBar.js');

describe('スクロール白化計器: 会場遮蔽を偽陽性にしない配線', () => {
  it('venueBar が会場open中に host を visibility:hidden で遮蔽している(ガードの前提)', () => {
    // この CSS が無くなったら、計器側の venueOpen 除外は不要になる(=このテストで気づける)。
    expect(venueBarSrc).toMatch(/html\.nlsb-venue-open\s+#nls-inline-popup-host\s*\{/);
    const block = venueBarSrc.slice(venueBarSrc.indexOf('html.nlsb-venue-open #nls-inline-popup-host'));
    expect(block.slice(0, 120)).toMatch(/visibility:\s*hidden/);
  });

  it('白化サンプラが会場open中は host を計測しない(偽陽性の除去)', () => {
    // サンプラ本体(kind:'host' を記録する箇所)の周辺に venueOpen ガードがあること。
    const idx = contentSrc.indexOf("kind: 'host'");
    expect(idx).toBeGreaterThan(0);
    const around = contentSrc.slice(Math.max(0, idx - 1400), idx);
    expect(around).toMatch(/nlsb-venue-open/);
    expect(around).toMatch(/if\s*\(!venueOpen\)/);
  });

  it('会場open中も prevH は更新する(閉じた直後に偽の 0→600 遷移を作らない)', () => {
    // ガードの外(=常に実行される位置)で prevH を更新していること。ここを if の中に入れると
    // 遮蔽中の高さが 0 のまま持ち越され、閉じた直後の最初のサンプルが白化と誤判定される。
    const idx = contentSrc.indexOf('_scrollWhiteoutPrevH.host =');
    expect(idx).toBeGreaterThan(0);
    const before = contentSrc.slice(Math.max(0, idx - 400), idx);
    // 直前に閉じ括弧があり、prevH 更新が if ブロックの外に出ていること。
    expect(before).toMatch(/\}\s*(\/\/[^\n]*\n\s*)*$/);
  });

  it('video 側は会場遮蔽の対象外なのでガードしない(過剰除外の防止)', () => {
    // 会場は host だけを遮蔽する。video まで除外すると本物のプレイヤー白化を見逃す。
    const vIdx = contentSrc.indexOf("kind: 'video'");
    expect(vIdx).toBeGreaterThan(0);
    const vAround = contentSrc.slice(Math.max(0, vIdx - 600), vIdx);
    expect(vAround).not.toMatch(/if\s*\(!venueOpen\)/);
  });
});
