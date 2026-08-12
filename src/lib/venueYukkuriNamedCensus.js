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
 * 2026-07-20 拡張(a:系カウンタ + ①POPへの適用): 数値ID桁境界とは別に、ユーザー実機報告
 *   「ハンドルネーム(カスタム表示名)があるのにゆっくり顔」の再調査で、a:形式(ニコ運営の匿名割当)の
 *   カスタム表示名ユーザーは従来 NUMERIC_UID_RE 判定で対象外(=未観測)だったと判明。桁境界(数値ID)の
 *   「意図的に触らない」方針は変えず、a:系/ハッシュ系の実害だけを別カウンタ(yukkuriNamedAnonymousStyle)
 *   で新たに可視化する。あわせて、従来は会場(venueBar.js)専用配線だった本計器を①POP応援レーン
 *   (renderStoryUserLaneDom.js の fillLaneTier)にも配線する(観測対象を PersonTileItem に一般化)。
 *
 * @module venueYukkuriNamedCensus
 */

/** identicon(anonymousIdenticon.js の出力)の data URI 先頭。 */
const IDENTICON_SRC_PREFIX = 'data:image/svg+xml';
/** 本登録の数値ID(このレンジ内だけ displaySrc が実写/CDN合成URLになりうる)。 */
const NUMERIC_UID_RE = /^\d+$/;
const IN_RANGE_NUMERIC_UID_RE = /^\d{5,14}$/;

/**
 * @returns {{ checked: number, yukkuriNamed: number, outOfRangeDigits: number,
 *   checkedAnonymousStyle: number, yukkuriNamedAnonymousStyle: number,
 *   checkedNoUid: number, yukkuriNamedNoUid: number,
 *   lastSample: null | { uid: string, name: string, digits: number },
 *   lastSampleAnonymousStyle: null | { uid: string, name: string },
 *   lastSampleNoUid: null | { name: string } }}
 */
export function createVenueYukkuriNamedCensusState() {
  return {
    checked: 0,
    yukkuriNamed: 0,
    outOfRangeDigits: 0,
    checkedAnonymousStyle: 0,
    yukkuriNamedAnonymousStyle: 0,
    lastSample: null,
    lastSampleAnonymousStyle: null,
    /*
     * ★v0.1.1358: uid を持たない「名前ありゆっくり顔」(広告主・ゲスト等)。
     *
     * ■ なぜ足すか(2026-08-12 ユーザー実機・指摘「計器が機能してない証拠」)
     *   スクショには広告列に「無職にまっしぐら」「そろおじさん」「ノエル」等、
     *   **名前があるのにゆっくり顔**のタイルが並んでいた。
     *   ところが速報は `名前ありゆっくり顔 ✅ 検18(匿名系検0)` = 実害0 と報告していた。
     *   真因: 数値ID系でも a:系でもない(uid が空の)タイルは `if (!uid) return` で
     *   **checked にすら入らず**、完全に計器の外だった。
     *   ★「0件」は「異常なし」ではなく「測っていない」だった
     *     ([[zero-count-may-mean-unmeasured]] の典型)。
     */
    checkedNoUid: 0,
    yukkuriNamedNoUid: 0,
    lastSampleNoUid: /** @type {null | { name: string }} */ (null)
  };
}

/**
 * 会場の1タイル(venueSeatEntryToLaneItem の結果)、または①POP応援レーンの1タイル
 * (PersonTileItem: uid=entry.userId, rawName=title, displaySrc=displaySrc)を観測する。
 * 呼び出し側はループ内で生成済みの item をそのまま渡す(新規計算なし)。
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
  // 2026-07-20実測(実配信で10件検知→誤検知と判明): rawName が「匿名」で始まる場合、本人の投稿名
  //   ではなく displayUserLabel/anonymousDisplayLabel が合成したフォールバックラベル
  //   (「匿名123」「匿名（a:xxx）」)。これは↑と同じ「仕様どおりで実害ではない」ケースの亜種なので対象外。
  if (rawName.startsWith('匿名')) return;

  if (!NUMERIC_UID_RE.test(uid)) {
    // a:系・ハッシュ系(カスタム表示名を持つ匿名スタイルユーザー)。従来は完全対象外だったが、
    //   「名前はあるのにゆっくり顔」は数値ID系と同じ症状なので別カウンタで観測する(桁境界とは別集計)。
    if (!uid) {
      /*
       * ★v0.1.1358: 旧実装はここで return し、**checked にすら入れていなかった**。
       *   その結果、広告列(広告主名はあるが uid が無い)の「名前ありゆっくり顔」が
       *   ユーザーの画面に並んでいるのに、速報は「✅ 実害0」と報告し続けた。
       *   ★観測しないものは「異常なし」ではない。数えて名指しする。
       */
      state.checkedNoUid += 1;
      if (!displaySrc.startsWith(IDENTICON_SRC_PREFIX)) return; // 実写/CDN URL=正常
      state.yukkuriNamedNoUid += 1;
      state.lastSampleNoUid = { name: rawName };
      return;
    }
    state.checkedAnonymousStyle += 1;
    if (!displaySrc.startsWith(IDENTICON_SRC_PREFIX)) return; // 実写/CDN URL=正常
    state.yukkuriNamedAnonymousStyle += 1;
    state.lastSampleAnonymousStyle = { uid, name: rawName };
    return;
  }

  state.checked += 1;
  if (!displaySrc.startsWith(IDENTICON_SRC_PREFIX)) return; // 実写/CDN URL=正常

  state.yukkuriNamed += 1;
  if (!IN_RANGE_NUMERIC_UID_RE.test(uid)) state.outOfRangeDigits += 1;
  state.lastSample = { uid, name: rawName, digits: uid.length };
}

/**
 * 状態速報1行を作る。checked=0かつcheckedAnonymousStyle=0(未観測)は⚪(誤報しない)。
 * @param {ReturnType<typeof createVenueYukkuriNamedCensusState>|null|undefined} state
 * @returns {{ line: string, checked: number, yukkuriNamed: number, outOfRangeDigits: number,
 *   checkedAnonymousStyle: number, yukkuriNamedAnonymousStyle: number,
 *   checkedNoUid: number, yukkuriNamedNoUid: number,
 *   lastSample: null | { uid: string, name: string, digits: number },
 *   lastSampleAnonymousStyle: null | { uid: string, name: string },
 *   lastSampleNoUid: null | { name: string } } | null}
 */
export function toVenueYukkuriNamedCensusDiag(state) {
  if (!state || typeof state !== 'object') return null;
  // ★v0.1.1358: uid無し(広告主・ゲスト)も観測対象に含める。含めないと
  //   「画面には名前ありゆっくり顔が並んでいるのに ✅ 実害0」が再発する。
  const checkedNoUid = Number(state.checkedNoUid) || 0;
  const yukkuriNamedNoUid = Number(state.yukkuriNamedNoUid) || 0;
  const checkedAny = state.checked > 0 || state.checkedAnonymousStyle > 0 || checkedNoUid > 0;
  const harmAny =
    state.yukkuriNamed > 0 || state.yukkuriNamedAnonymousStyle > 0 || yukkuriNamedNoUid > 0;
  let line;
  if (!checkedAny) {
    line = '名前ありゆっくり顔 ⚪ 未観測';
  } else if (!harmAny) {
    line = `名前ありゆっくり顔 ✅ 検${state.checked}(匿名系検${state.checkedAnonymousStyle}/ID無検${checkedNoUid})`;
  } else {
    const s = state.lastSample;
    const sa = state.lastSampleAnonymousStyle;
    const sn = state.lastSampleNoUid;
    line =
      `名前ありゆっくり顔 🔴 ${state.yukkuriNamed}件(桁境界${state.outOfRangeDigits})` +
      ` 匿名系${state.yukkuriNamedAnonymousStyle}件` +
      // ★ID無し(広告主等)は原因が別(公式ランキング由来でuidが取れない)なので分けて出す。
      ` ID無${yukkuriNamedNoUid}件` +
      ` / 検${state.checked}(匿名系検${state.checkedAnonymousStyle}/ID無検${checkedNoUid})` +
      (s ? ` / 直近{${s.name} uid${s.digits}桁}` : '') +
      (sa ? ` / 直近匿名系{${sa.name} uid=${sa.uid}}` : '') +
      (sn ? ` / 直近ID無{${sn.name}}` : '');
  }
  return {
    line,
    checked: state.checked,
    yukkuriNamed: state.yukkuriNamed,
    outOfRangeDigits: state.outOfRangeDigits,
    checkedAnonymousStyle: state.checkedAnonymousStyle,
    yukkuriNamedAnonymousStyle: state.yukkuriNamedAnonymousStyle,
    checkedNoUid,
    yukkuriNamedNoUid,
    lastSample: state.lastSample ? { ...state.lastSample } : null,
    lastSampleAnonymousStyle: state.lastSampleAnonymousStyle ? { ...state.lastSampleAnonymousStyle } : null,
    lastSampleNoUid: state.lastSampleNoUid ? { ...state.lastSampleNoUid } : null
  };
}
