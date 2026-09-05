// sidepanelVisibilityCatchup.wiring.test.js
// ★「覆いは全部外れているのに中身が出ない」の根治を固定する。
//
// ■ 実機(2026-08-12・v0.1.1363 の状態速報)
//     窓0x0の継続=t=15〜15ms(372msまでに面積確定)  ← 窓は開いている
//     幕(cloak) ✅ t+661ms で解除                    ← 幕も外れている
//     初回シェード t+2730ms まで中身を覆っていた      ← シェードも外れている
//   なのにパネルは暗いまま。同じ速報にこう出ていた:
//     裏タブ / 描画見送り中 / 表示遅延 直近18137ms
//
// ■ 真因
//   popup-entry.js の `_hiddenSkipHeavyPaint` は「裏タブ かつ 描画済み」なら
//   重い paint を見送る(見えないので正しい)。その復帰は visibilitychange の
//   safeRefresh に委ねている。ところがサイドパネルは INLINE_EMBED_WATCH では
//   ない(dock==='sidepanel')ため、catch-up が POLL_INTERVAL_MS(3000ms)の
//   スロットルに落ちていた。
//   ★見えた瞬間に塗り直すべき面が最大3秒待たされ、直前の可視イベントで
//     lastVisibilityRefresh が更新されていれば復帰ごと捨てられる。
//
// ■ 直し: サイドパネルも埋め込みと同じ 400ms にする。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  path.resolve(HERE, '../extension/popup-entry.js'),
  'utf8'
);

describe('★可視復帰の catch-up にサイドパネルを含める', () => {
  it('visGapMs の判定に INLINE_SIDE_PANEL が入っている', () => {
    expect(src).toContain('const visGapMs = INLINE_EMBED_WATCH || INLINE_SIDE_PANEL ? 400 : POLL_INTERVAL_MS;');
  });

  it('★サイドパネルが POLL_INTERVAL_MS(3秒)側に落ちない', () => {
    // 旧実装 `INLINE_EMBED_WATCH ? 400 : POLL_INTERVAL_MS` が復活したら赤。
    expect(src).not.toContain('const visGapMs = INLINE_EMBED_WATCH ? 400 : POLL_INTERVAL_MS;');
  });

  it('可視復帰は visible のときだけ走る(hidden で無駄打ちしない)', () => {
    const i = src.indexOf('const visGapMs =');
    // ★コメントを足すと窓から外れるので広めに取る(整形で赤くならないように)。
    const before = src.slice(Math.max(0, i - 2000), i);
    expect(before).toContain("document.visibilityState !== 'visible'");
  });

  it('復帰時に refresh を蹴る(判定だけで終わらせない)', () => {
    const i = src.indexOf('const visGapMs =');
    const after = src.slice(i, i + 500);
    expect(after).toContain('safeRefresh()');
    expect(after).toContain('visibility_resume');
  });

  /*
   * ★裏タブでの paint 見送り自体は正しい(見えないものを塗らない=軽さの要)。
   *   消してはいけないので、残っていることを固定する。
   */
  it('裏タブでの重い paint 見送りは残す(軽さのための正しい最適化)', () => {
    // ★宣言と【実際の使用】の両方を見る。名前だけ残して使われていない状態を通さない。
    expect(src).toContain('const _hiddenSkipHeavyPaint =');
    expect(src).toMatch(/_perfDeferActive\s*=\s*\([\s\S]{0,120}?\)\s*\|\|\s*_hiddenSkipHeavyPaint;/);
  });

  it('★見送りは「描画済み」のときだけ(未描画の面を空のまま放置しない)', () => {
    const i = src.indexOf('const _hiddenSkipHeavyPaint');
    const line = src.slice(i, i + 200);
    expect(line).toContain('userRoomsAlreadyPainted');
  });
});
