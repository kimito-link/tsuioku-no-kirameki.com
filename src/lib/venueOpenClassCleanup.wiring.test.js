import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * ★v0.1.1422 配線テスト: `html.nlsb-venue-open` の残骸を必ず掃除するか。
 *
 * ■ ユーザー実機の症状(2026-08-17・「ずっと前から」)
 *   「常に会場モードがONになっている」
 *   「拡張のこん太ボタンを押しても動かない」
 *   「何度もリロードしてやっとサイドボタンを押して引っ張れる」
 *
 * ■ 真因
 *   venueBar.js:2144 の CSS が、このクラスが付いている間ずっと
 *     html.nlsb-venue-open #nls-inline-popup-host {
 *       visibility: hidden !important; pointer-events: none !important; }
 *   ＝①POPは**見えない上にクリックも通らない**。
 *   ところがクラスを消す経路は setOpen(false) の1本しか無く、
 *   会場を開いたまま離脱/再マウント/例外終了すると <html> に残り続けた。
 *   一度残ると次回以降ずっとこの CSS が効いた状態で始まる。
 *
 * ■ この検査が守るもの
 *   「消す側」が2箇所(mount時・pagehide時)あること。
 *   ★片方だけだと、もう片方の経路で残骸が生き延びる。
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const venueBar = readFileSync(join(root, 'src', 'extension', 'venueBar.js'), 'utf8');

/** コメント行を除いた実コードだけを見る(コメントアウトを「実装あり」と誤認しないため)。 */
const codeLines = venueBar
  .split(/\r?\n/)
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');

describe('会場openクラスの残骸掃除', () => {
  it('★CSS 側は変えていない(①POPを隠す規則は仕様として残す)', () => {
    // この規則自体は正しい(会場中は①を畳む)。問題は「消えないこと」だった。
    expect(venueBar).toMatch(/html\.nlsb-venue-open\s+#nls-inline-popup-host/);
  });

  it('★★消す処理が2箇所ある(mount時・pagehide時)', () => {
    const removals = codeLines.match(
      /classList\.remove\(\s*['"]nlsb-venue-open['"]\s*\)/g
    );
    expect(removals, 'nlsb-venue-open を消す実コードが見つからない').not.toBeNull();
    // mount 時と pagehide 時の2本。片方だけだと残骸が生き延びる経路が残る。
    expect(removals.length).toBeGreaterThanOrEqual(2);
  });

  it('★mount の早い段階で掃除している(スタイル適用の直前)', () => {
    /*
     * ★`ensureVenueStyle` は【定義】が先に来るので単純な indexOf 比較は使えない
     *   (最初にこれで書いて実際に赤くなった=検査が私の間違いを止めた)。
     *   mount 本体での【呼び出し】= `\n  ensureVenueStyle();` を基準にする。
     */
    const callAt = codeLines.indexOf('\n  ensureVenueStyle();');
    expect(callAt, 'mount 内の ensureVenueStyle() 呼び出しが見つからない').toBeGreaterThan(-1);
    const before = codeLines.slice(0, callAt);
    expect(
      before,
      'スタイルを当てる前に残骸を落としていない'
    ).toMatch(/classList\.remove\(\s*['"]nlsb-venue-open['"]\s*\)/);
  });

  it('★付ける側は setOpen が握ったまま(会場の挙動を変えていない)', () => {
    expect(codeLines).toMatch(
      /classList\.toggle\(\s*['"]nlsb-venue-open['"]\s*,\s*open\s*\)/
    );
  });
});
