/**
 * watch タブ(content script)側: コメビュが開いた port へ、新着コメントを storage を待たずに流す(P5b・2026-10-29)。
 *
 * - コメビュが port を開いていなければ何もしない(費用ゼロ)。
 * - 流すのは読み上げのためだけ。記録・表示は今までどおり storage 経由。
 * - port の失敗は記録に影響させない(握りつぶして、その port を捨てる)。
 *
 * 判定(行の選び方・メッセージの形)は src/lib/comeviewLivePush.js。
 */
import {
  COMEVIEW_LIVE_PORT_NAME,
  COMEVIEW_LIVE_ROWS_TYPE,
  pickComeviewPushRows
} from '../lib/comeviewLivePush.js';

/** @type {Set<chrome.runtime.Port>} */
const _ports = new Set();
let _wired = false;

/** 最初の新着で1回だけ張る(コメビュは繋がらなければ少し後に繋ぎ直すので、起動直後に間に合わなくてよい)。 */
export function wireComeviewLivePushHost() {
  if (_wired) return;
  _wired = true;
  try {
    chrome.runtime.onConnect.addListener((port) => {
      if (!port || port.name !== COMEVIEW_LIVE_PORT_NAME) return;
      _ports.add(port);
      port.onDisconnect.addListener(() => {
        _ports.delete(port);
      });
    });
  } catch {
    /* no-op: 拡張の文脈が無い(リロード後の古いタブ)ときは storage 経由だけで動く */
  }
}

/**
 * 保存待ちに入れた新着を、繋がっているコメビュへ流す。
 * @param {string} liveId
 * @param {ReadonlyArray<Record<string, unknown>>} rows
 */
export function pushLiveCommentsToComeview(liveId, rows) {
  wireComeviewLivePushHost();
  if (!_ports.size || !liveId) return;
  const picked = pickComeviewPushRows(rows);
  if (!picked.length) return;
  const msg = { type: COMEVIEW_LIVE_ROWS_TYPE, liveId, rows: picked };
  for (const port of [..._ports]) {
    try {
      port.postMessage(msg);
    } catch {
      _ports.delete(port);
    }
  }
}
