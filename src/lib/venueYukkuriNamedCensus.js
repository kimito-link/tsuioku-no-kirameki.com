/**
 * venueYukkuriNamedCensus.js — 「名前ありゆっくり顔」実害確定計器(診断先行アプローチ)。
 *
 * 背景: ユーザー実機報告「名前が表示されているのにアバターがゆっくり顔になっている」。
 *   真因調査(実コード裏取り+再現テスト)の結果、diagnostic-architecture-strengthen-DESIGN.md の
 *   仮説(venueLaneBuckets.js の snapshot:null 固定)は誤りと判明。実際の真因は
 *   isAnonymousStyleNicoUserId(^\d{5,14}$=本登録の数値ID)の桁レンジ境界で、4桁以下・15桁以上の
 *   数値IDだけが「匿名スタイル」と誤判定され、displaySrc が identicon(ゆっくり3キャラ相当の顔)に
 *   フォールバックする。この判定式は「レーンの階段付けはこの判定に依存するため、ここの規則が
 *   動くとUI挙動が丸ごとズレる」と明記された正本(src/domain/user/identity.js)であり、
 *   venue-tile-link-parity-diagnose-DESIGN.md(Patch①)と同じ理由で桁レンジ修正は行わない。
 *
 *   本モジュールは「直す」のではなく「実害の有無・頻度を数える」ことだけが目的(観測のみ)。
 *   掟(venueDomCensus.js と同じ): 数えるだけ・DOM/データを一切触らない。
 *
 * @module venueYukkuriNamedCensus
 */

/** identicon(anonymousIdenticon.js の出力)の data URI 先頭。 */
const IDENTICON_SRC_PREFIX = 'data:image/svg+xml';
/** 本登録の数値ID(このレンジ内だけ displaySrc が実写/CDN合成URLになりうる)。 */
const NUMERIC_UID_RE = /^\d+$/;
const IN_RANGE_NUMERIC_UID_RE = /^\d{5,14}$/;

/**
 * @returns {{ checked: number, yukkuriNamed: number, outOfRangeDigits: number, lastSample: null | { uid: string, name: string, digits: number } }}
 */
export function createVenueYukkuriNamedCensusState() {
  return { checked: 0, yukkuriNamed: 0, outOfRangeDigits: 0, lastSample: null };
}

/**
 * 会場の1タイル(venueSeatEntryToLaneItem の結果)を観測する。呼び出し側は席ループ内で
 * 生成した item をそのまま渡す(新規計算なし)。
 * @param {ReturnType<typeof createVenueYukkuriNamedCensusState>|null|undefined} state
 * @param {{ uid?: unknown, rawName?: unknown, displaySrc?: unknown }} obs
 */
export function observeVenueYukkuriNamedTile(state, obs) {
  if (!state || typeof state !== 'object' || !obs || typeof obs !== 'object') return;
  const uid = String(obs.uid || '').trim();
  const rawName = String(obs.rawName || '').trim();
  const displaySrc = String(obs.displaySrc || '').trim();
  // 名前(参加者本人が投稿した表示名)が無いタイルは対象外(匿名表示名"匿名NNN"がゆっくり顔なのは
  //   仕様どおりで実害ではない=venueSeatEntryToLaneItem の rawName は participant.name そのもの)。
  if (!rawName) return;
  // 数値IDでなければ(a:系・ハッシュ系)本来から匿名系=ゆっくり顔で正常。対象外。
  if (!NUMERIC_UID_RE.test(uid)) return;

  state.checked += 1;
  if (!displaySrc.startsWith(IDENTICON_SRC_PREFIX)) return; // 実写/CDN URL=正常

  state.yukkuriNamed += 1;
  if (!IN_RANGE_NUMERIC_UID_RE.test(uid)) state.outOfRangeDigits += 1;
  state.lastSample = { uid, name: rawName, digits: uid.length };
}

/**
 * 状態速報1行を作る。checked=0(未観測)は⚪(誤報しない)。
 * @param {ReturnType<typeof createVenueYukkuriNamedCensusState>|null|undefined} state
 * @returns {{ line: string, checked: number, yukkuriNamed: number, outOfRangeDigits: number,
 *   lastSample: null | { uid: string, name: string, digits: number } } | null}
 */
export function toVenueYukkuriNamedCensusDiag(state) {
  if (!state || typeof state !== 'object') return null;
  let line;
  if (state.checked <= 0) {
    line = '名前ありゆっくり顔 ⚪ 未観測';
  } else if (state.yukkuriNamed === 0) {
    line = `名前ありゆっくり顔 ✅ 検${state.checked}`;
  } else {
    const s = state.lastSample;
    line =
      `名前ありゆっくり顔 🔴 ${state.yukkuriNamed}件(桁境界${state.outOfRangeDigits}) / 検${state.checked}` +
      (s ? ` / 直近{${s.name} uid${s.digits}桁}` : '');
  }
  return {
    line,
    checked: state.checked,
    yukkuriNamed: state.yukkuriNamed,
    outOfRangeDigits: state.outOfRangeDigits,
    lastSample: state.lastSample ? { ...state.lastSample } : null
  };
}
