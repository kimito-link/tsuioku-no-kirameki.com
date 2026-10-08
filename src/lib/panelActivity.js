/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】視聴ページに埋めた popup iframe が「いま見えているか」の判定と、親(content)→iframe の通知の型
 * 【この箱に入らないもの】DOM / chrome.* / タイマー
 * 【書けるstorageキー】なし
 * 【正本宣言】popup が「見えていない間は定期処理を止める」ための判定はこのファイルのみ
 *
 * panelActivity.js — 視聴ページの popup iframe の「見えている/いない」の正本。
 *
 * ■ なぜ要るか(2026-10-08・実機: 視聴ページを開くと拡張プロセスが CPU 100〜140%・メモリ 1.4→4GB に張り付く)
 *   視聴ページの popup は、パネルを閉じていても【display:none の iframe として動き続ける】。
 *   同一タブの iframe の document.hidden は、親ページが前面にある限り false のまま(display:none では変わらない)ので、
 *   既存の「document.hidden なら止める」が効かず、3秒ごとの全体再描画・北極星レーンの読み取り・storage 変化ごとの
 *   再描画が、誰にも見えないまま回り続けていた。
 *   ★対策の形: 親(content)がパネルの表示/非表示を iframe へ伝え、popup の定期処理は全部この判定経由で止める。
 *
 * ■ 守ること
 *   1. 既定は「見えている」(fail-open): 通知が届かない/壊れても、今までどおり動く(表示が止まる事故を作らない)。
 *   2. 見えていない=document.hidden か、親が「隠した」と伝えた時。どちらか一方でも真なら止める。
 *   3. 通知は nonce(iframe src の pn=)と送信元(親ウィンドウ)で検証する(他ページの偽装で止められない)。
 *
 * @module panelActivity
 */

/** 親(content) → popup iframe の通知メッセージ型。 */
export const NLS_PANEL_VISIBILITY_TYPE = 'NLS_PANEL_VISIBILITY';

/**
 * content 側で postMessage する payload。nonce が空なら null(送らない)。
 * @param {unknown} visible
 * @param {string} nonce
 * @returns {{ type: string, visible: boolean, nonce: string }|null}
 */
export function buildPanelVisibilityPayload(visible, nonce) {
  if (!nonce || typeof nonce !== 'string') return null;
  return { type: NLS_PANEL_VISIBILITY_TYPE, visible: visible === true, nonce };
}

/**
 * popup 側の受信検証。型・nonce・送信元(親ウィンドウ)が全部合うときだけ true。
 * @param {{ data?: unknown, source?: unknown }|null|undefined} eventLike
 * @param {string} expectedNonce iframe src の `pn=` から読んだ自分の nonce
 * @param {unknown} parentWin window.parent(送信元の確認用)
 * @returns {boolean}
 */
export function isPanelVisibilityMessageValid(eventLike, expectedNonce, parentWin) {
  if (!expectedNonce || !eventLike || !eventLike.data || typeof eventLike.data !== 'object') return false;
  const d = /** @type {{ type?: unknown, nonce?: unknown, visible?: unknown }} */ (eventLike.data);
  if (d.type !== NLS_PANEL_VISIBILITY_TYPE) return false;
  if (typeof d.nonce !== 'string' || d.nonce !== expectedNonce) return false;
  if (typeof d.visible !== 'boolean') return false;
  if (!parentWin || eventLike.source !== parentWin) return false;
  return true;
}

/**
 * popup 内の「見えているか」の状態。
 * @param {{ isDocHidden?: () => boolean }} [deps]
 */
export function createPanelActivity(deps = {}) {
  const isDocHidden = typeof deps.isDocHidden === 'function' ? deps.isDocHidden : () => false;
  let hostVisible = true; // 既定は見えている(fail-open)
  return {
    /** 止めてよいか(document.hidden か、親が隠したと伝えたとき)。 */
    isHidden() {
      let doc = false;
      try { doc = isDocHidden() === true; } catch { doc = false; }
      return doc || !hostVisible;
    },
    /**
     * 親からの通知を反映する。
     * @param {unknown} visible
     * @returns {{ changed: boolean, resumed: boolean }} resumed=隠れていた状態から見える状態に戻った(=追いつき描画が要る)
     */
    setHostVisible(visible) {
      const next = visible !== false;
      const changed = next !== hostVisible;
      const resumed = changed && next;
      hostVisible = next;
      return { changed, resumed };
    },
    hostVisible() {
      return hostVisible;
    }
  };
}
