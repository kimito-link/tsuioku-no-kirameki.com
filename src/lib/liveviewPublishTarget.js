/**
 * 応援ライブビュー(live-view.html?lv=X)の公開ボタンが、別の配信のデータを送らないための判定(純関数)。
 *
 * ■ なぜ要るか(2026-10-09 調査で確認)
 *   公開ボタンは全配信共通の1キー(KEY_LIVEVIEW_PUBLISH_PAYLOAD)を読んでそのまま POST する。
 *   このキーは status ページが「いま見ている配信」の分を書くので、2配信を記録中だと
 *   live-view.html?lv=B を開いていても、中身は配信A のデータのことがある。
 *   公開URLは閲覧トークン1つ=押した瞬間に【別の配信のデータが外へ出る】。
 *   ページの ?lv= と送るデータの配信が違うときは送らない。
 *
 * ■ 判定できないとき(データ側のどの区画にも配信IDが無い・ページ側の lv が不明)は ok にする=従来どおり。
 *   区画のどれか1つでも別配信を名乗っていれば止める(鏡が空でも topSupporters 等が別配信を持ちうる)。
 *
 * DOM/chrome 非依存=単体テスト可能。
 */

/** @param {unknown} v @returns {string} */
function lid(v) {
  return String(v || '').trim().toLowerCase();
}

/**
 * jsonBlob のうち「配信IDを持つ区画」(status が全配信共通キーから組む区画)。
 *   鏡が全部空でも topSupporters 等が別配信のデータを持ちうる(独立検証の指摘)ので、全区画を見る。
 *   reportPreview/broadcastScoreVm は status 側で scoreLiveId と突合済みの派生なので対象にしない。
 */
const LIVEID_SECTIONS = Object.freeze([
  'northStarMirror',
  'laneMirror',
  'statCardsMirror',
  'topSupporters',
  'commentTimelineMirror',
  'giftHistoryMirror',
  'roomHeatMirror',
  'sessionSummaryMirror'
]);

/**
 * 送ろうとしているデータ(jsonBlob)が名乗っている配信を重複なく集める。
 * @param {unknown} jsonBlob
 * @returns {string[]}
 */
export function publishPayloadLiveIds(jsonBlob) {
  if (!jsonBlob || typeof jsonBlob !== 'object') return [];
  const jb = /** @type {any} */ (jsonBlob);
  /** @type {string[]} */
  const out = [];
  for (const k of LIVEID_SECTIONS) {
    const id = lid(jb[k]?.liveId);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * 送ろうとしているデータ(jsonBlob)の代表の配信。鏡の liveId を 北極星 > レーン > 数字カード の順で取る
 * (live-view-entry.js の sentLiveId と同じ優先順)。無ければ他の区画の最初のもの。
 * @param {unknown} jsonBlob
 * @returns {string} 無ければ ''
 */
export function publishPayloadLiveId(jsonBlob) {
  if (!jsonBlob || typeof jsonBlob !== 'object') return '';
  const jb = /** @type {any} */ (jsonBlob);
  return (
    lid(jb.northStarMirror?.liveId) ||
    lid(jb.laneMirror?.liveId) ||
    lid(jb.statCardsMirror?.liveId) ||
    publishPayloadLiveIds(jb)[0] ||
    ''
  );
}

/**
 * ページの ?lv= と、送るデータの配信が一致するか。データの区画のどれか1つでも別配信なら不一致。
 * @param {unknown} jsonBlob
 * @param {string} pageLiveId live-view.html の ?lv=
 * @returns {{ ok: boolean, payloadLiveId: string, reason: string }}
 */
export function checkPublishTarget(jsonBlob, pageLiveId) {
  const page = lid(pageLiveId);
  const ids = publishPayloadLiveIds(jsonBlob);
  const foreign = page ? ids.find((id) => id !== page) : '';
  if (!foreign) return { ok: true, payloadLiveId: publishPayloadLiveId(jsonBlob), reason: '' };
  return {
    ok: false,
    payloadLiveId: foreign,
    reason:
      `この画面は ${page} ですが、公開しようとしているデータには ${foreign} のものが含まれています。` +
      `別の配信のデータを公開URLへ載せないよう、送信を止めました。` +
      `状態速報ページ(診断)で ${page} を選んでから、もう一度お試しください。`
  };
}
