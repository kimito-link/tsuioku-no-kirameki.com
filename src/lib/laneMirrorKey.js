// laneMirrorKey.js
// popup の応援レーン(りんく/こん太/広告/たぬ姉の段組み)を「顔=avatar 含めてそっくり」status へ
//   映すための鏡データの storage キー。laneDiagKey.js(人数だけ)とは別キーに分離する=健全度パネルが
//   毎回読む軽量 laneDiag を太らせない(status の軽さ最優先・MEMORY 鉄則)。
//   会場をいじる前に「POP に並ぶべきもの」を正本として診断に映し、会場のズレを後で突合する土台にする。
//
// ★端末内(同一拡張の storage.local)に閉じる=外部送信なし。avatar URL/表示名は記録済みコメント由来で
//   既に端末内にある情報なので方針の精神に反しない。が、最小限(各段 cap・4フィールド)に間引いて書く。

/** 応援レーン鏡データの storage キー(local only)。
 *  ★v0.1.1300 以降も【残す】: 旧キーは reader 互換の保険(rollback 経路)。
 *    新しい書き手・読み手は下の laneMirrorKeyFor(liveId) を使う。 */
export const KEY_LANE_MIRROR = 'nls_lane_mirror_v1';

/**
 * ★v0.1.1300: 配信ごとに鏡キーを分ける。
 *
 * ■ なぜ分けるか(単一グローバルキーの構造的欠陥・実コードで確認済み)
 *   1. 多配信タブでは【最後に書いた配信】が他配信の鏡を上書きする。
 *      laneMirrorContract.js:158 が「別配信の①が最後に書いた鏡を掴みうる」と
 *      明記しており、読み手は liveId 照合で弾くしかない=正しい配信の鏡が
 *      「存在しない」状態になる(会場は fallback へ降格し gift/ad 段が消える)。
 *   2. 合流バッファ(mirrorBundleFlushScheduler)は section 単位で値を保持し、
 *      takeFlushPayload が【全 section を毎回同梱】する。配信が切り替わっても
 *      前の配信の lane が次の flush で再同梱され、新しい値を巻き戻しうる。
 *      キーが配信ごとなら、古い配信への書き戻しは新配信の鏡を汚さない。
 *
 * ■ 命名は既存 storage の慣習に合わせる(`nls_<用途>_<lv>`)。
 *   例: nls_nicoad_api_ranking_lv123 / nls_ctail_lv123
 *
 * @param {unknown} liveId 例 'lv351133862'(大文字小文字は正規化する)
 * @returns {string} 空/不正な liveId のときは空文字(呼び手が書かない判断をする)
 */
export function laneMirrorKeyFor(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return '';
  return `nls_lane_mirror_v2_${lid}`;
}

/**
 * ★v0.1.1300: 実DOM受領証(domSelf)を鏡データ本体から【分離】するキー。
 *
 * ■ なぜ分けるか
 *   domSelf は「①が実際に描いた DOM の要約」= 表示面固有の受領証であって、
 *   配信の共通データではない。会場は別の DOM を持つので、これをデータ本体に
 *   同梱したままだと「同じデータなのに hash が違う」を構造的に作る。
 *   → データ(共通)と受領証(表示面ごと)を分け、contentHash で安全に関連付ける。
 *     比較は `receipt.fingerprintFor === snap.contentHash` のときだけ行う
 *     (この規律は laneMirrorContract.js の domSelf 指紋契約と同じ)。
 *
 * @param {unknown} liveId
 * @returns {string} 空/不正な liveId のときは空文字
 */
export function laneReceiptKeyFor(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return '';
  return `nls_lane_receipt_v1_${lid}`;
}

/** 鏡キー(v2)から liveId を取り出す。鏡キーでなければ空文字。 @param {unknown} key */
export function liveIdFromLaneMirrorKey(key) {
  const k = String(key || '');
  const m = /^nls_lane_mirror_v2_(lv\d{1,15})$/.exec(k);
  return m ? m[1] : '';
}
