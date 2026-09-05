/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】「パネルを覆っている当人」の判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】「何が黒く覆っているか」の判定はこのファイルのみ
 *
 * panelCoverCulprit.js — ★サイドパネルを覆っている【当人を名指しする】。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ なぜ要るか(2026-08-21)
 *   ユーザーは何度も報告していた:
 *     「引っ張った瞬間くろくなる」「スリープでも黒い」★「サイドパネル全部」
 *   私はそのたびに**コードを読んで当てにいき、2回とも外した**:
 *     v0.1.1452 「32msは仕様として受け入れる」→ 外れ
 *     v0.1.1457 「下敷きが幅変更に追従しない」→ 外れ
 *   ★**推測をやめて、計器に名指しさせる**ためのモジュール。
 *
 * ■ ★既存計器の限界(これが直せなかった構造的な理由)
 *   `sidepanel-entry.js` の `probeCenterPainter` は
 *   **外側(sidepanel.html)の中央**を見る。しかし中央にあるのは常に `iframe`。
 *   ＝★**iframe の【中】で何が覆っているかは永久に分からない**。
 *   速報に「中央の塗り主=iframe」としか出ないのはこのため。
 *   → 判定を **iframe の内側(popup.html)でも使える純関数**として切り出す。
 *
 * ■ 判定の考え方
 *   画面中央の要素から祖先へ辿り、**最初に「不透明で暗い色」を塗っている要素**を犯人とする。
 *   ★どこにも塗り主が居ない場合も **bad**。
 *     全部透明だと UA の下地が出て、これも黒く見える
 *     ([[the-curtain-i-added-was-the-black-2026-08-19]] と同じ型)。
 *   ★測れないときは **na**。「異常なし」と言わない
 *     ([[unobserved-must-not-hide-the-cell-2026-08-15]])。
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * これより暗い(輝度がこれ未満)なら「暗い」とみなす。0〜255。
 * ★#0a0e14(実在する暗色スキンの地)は輝度約13、#fffaf2 は約251。
 *   間を広く取り、クリーム系を誤って犯人にしない値にする。
 */
export const PANEL_COVER_DARK_LUMA = 90;

/**
 * これ以上の不透明度なら「下を隠している」とみなす。
 * ★実在する演出の幕 rgba(20,12,28,0.78) を拾い、
 *   薄い色味付け rgba(...,0.12) は拾わない値。
 */
export const PANEL_COVER_OPAQUE_ALPHA = 0.5;

/**
 * @typedef {{ tag?: unknown, bgColor?: unknown }} CoverLayer
 */

/**
 * @typedef {object} PanelCoverVerdict
 * @property {'ok'|'bad'|'na'} level
 * @property {string|null} culprit 覆っている当人(見つからなければ null)
 * @property {string} reason 人が読む理由
 * @property {string} line 速報に出す1行
 */

/**
 * `rgb()` / `rgba()` を解析する。読めなければ null。
 * @param {unknown} raw
 * @returns {{ r:number, g:number, b:number, a:number }|null}
 */
function parseColor(raw) {
  if (typeof raw !== 'string') return null;
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/i.exec(raw);
  if (!m) return null;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  const a = m[4] === undefined ? 1 : Number(m[4]);
  if (![r, g, b, a].every(Number.isFinite)) return null;
  return { r, g, b, a };
}

/**
 * 知覚輝度(0=真っ黒 / 255=真っ白)。
 * @param {{ r:number, g:number, b:number }} c
 * @returns {number}
 */
function luma(c) {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/**
 * ★パネルを覆っている当人を名指しする純関数。
 *
 * @param {ReadonlyArray<CoverLayer>|null|undefined} chain
 *   画面中央の要素から祖先方向へ並んだ層(手前が先頭)。
 *   各層は `{ tag, bgColor }`。採取は呼び出し側(DOM を触るのはあちら)。
 * @returns {PanelCoverVerdict}
 */
export function judgePanelCover(chain) {
  if (!Array.isArray(chain) || chain.length === 0) {
    return {
      level: 'na',
      culprit: null,
      reason: '層を採取できていません(未レイアウト or 測定失敗)。',
      line: 'パネルの覆い: ⚪未計測'
    };
  }

  /** 何かが不透明に塗っているか(暗くなくてもよい)。 */
  let painted = false;

  for (const layer of chain) {
    const c = parseColor(layer && layer.bgColor);
    if (!c) continue;
    if (c.a < PANEL_COVER_OPAQUE_ALPHA) continue; // 透けている=下が見える
    const tag = String((layer && layer.tag) || '(名前なし)');
    if (luma(c) < PANEL_COVER_DARK_LUMA) {
      // ★最初に見つけた「暗くて不透明」な層が、いま見えている黒。
      return {
        level: 'bad',
        culprit: tag,
        reason: `${tag} が暗い色(${String(layer.bgColor)})で覆っています。`,
        line: `パネルの覆い: 🔴${tag} が暗く覆っています(${String(layer.bgColor)})`
      };
    }
    painted = true;
    break; // 不透明な層に当たったら、その先は見えない
  }

  if (!painted) {
    /*
     * ★全部透明＝地の色を塗る人が誰も居ない。
     *   UA の下地(OSがダークなら暗色)が出るので、これも「黒」になる。
     *   v0.1.1285 の「中身は見えるのに地の色を塗らない＝真っ黒」と同じ型。
     */
    return {
      level: 'bad',
      culprit: null,
      reason: '★どの層も不透明に塗っていません＝地の色を塗る人が居ませんでした。',
      line: 'パネルの覆い: 🔴塗る人が居ません(全層が透明＝下地が出ます)'
    };
  }

  return {
    level: 'ok',
    culprit: null,
    reason: '明るい色で塗られています。',
    line: 'パネルの覆い: ✅正常'
  };
}
