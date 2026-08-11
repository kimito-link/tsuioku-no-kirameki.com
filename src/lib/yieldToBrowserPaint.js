/**
 * 【層】L0 判定層(依存ゼロ・chrome.* 非依存)
 * 【この箱に入るもの】「ブラウザに描画の隙を与えて待つ」だけの1関数
 * 【この箱に入らないもの】fetch / storage / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】rAF と setTimeout を競走させる待ちの実装はこのファイルのみ
 *
 * ★なぜ rAF 単独ではだめか(v0.1.1277 で実機確定・この知見が本体)
 *   rAF だけだと【サイドパネルが裏に回った瞬間に凍る】。
 *   Chrome は不可視の文書で rAF を止めるため、待ちが永久に解けず
 *   html_report_build_timeout になった。
 *   → setTimeout(32ms) と競走させ、どちらが先でも必ず進むようにする。
 *
 * ★なぜ切り出したか(2026-08-12・v0.1.1338)
 *   popup-entry.js が max-lines(22,119行)に到達し1行も足せなくなったため。
 *   この関数は【依存ゼロ】＝最も安全に出せる([[extract-by-dependency-count-not-size]])。
 *   挙動は一切変えていない(移設のみ)。
 *
 * @module yieldToBrowserPaint
 */

/** setTimeout 側の待ち(ms)。約2フレーム分＝描画を1回通すのに十分で、体感は増やさない。 */
export const YIELD_PAINT_TIMEOUT_MS = 32;

/**
 * ブラウザに描画の隙を与えて待つ。
 *
 * ★不可視でも必ず解決する(rAF が止まる環境で凍らせない)。
 *
 * @returns {Promise<void>}
 */
export function yieldToBrowserPaint() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(undefined);
    };
    try {
      requestAnimationFrame(() => {
        requestAnimationFrame(finish);
      });
    } catch {
      // rAF が無い環境(テスト等)では setTimeout 側だけで進める
    }
    setTimeout(finish, YIELD_PAINT_TIMEOUT_MS);
  });
}
