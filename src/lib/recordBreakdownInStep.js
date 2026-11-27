/**
 * v0.1.2242 → v0.1.2256: 「記録」の下の「内訳: 通常 N …」を、記録と【同じ行・同じ重複の決まり】から数える(状態は呼び出し側が1つ持つ)。
 *
 * 症状:
 *   - 0.1.2229: まとめ読み込み中、記録は増えるのに内訳だけが止まる / 同じ配信の途中で内訳が減る。
 *   - 0.1.2242(実機 2026-11-27・ニコ生 lv351893456・過去コメント約2,000件の読み込み):
 *     記録 2,071 → 2,218 と増えるのに「通常 1,707」で2分以上止まり、内訳の合計(2,324)が記録より多かった。
 *
 * 原因(0.1.2242 の実機の保存データで確かめた):
 *   - 記録 = 保存した行の数(チャンク+テール。サマリの recordedCount / 索引の total)。
 *   - 0.1.2242 の内訳 = 横の欄がその時に持っていた表示用の配列を数えた分類 +「通常 = 記録 − 通常以外」+「見えた最大を保つ」。
 *     まとめ読み込みの途中は、記録(サマリ)が先に 2,164 になるのに、手元の配列はまだ数十行で来場がほとんど入っていない。
 *     そのとき「通常 = 2,164 − 19」と大きく出し、最大を保つ決まりで固定した。あとで全件を読むと来場が 653 件あり、
 *     通常 + 来場 が記録を超える = 記録が追いつくまで通常が動けない(止まる)。保存データの本当の内訳は 通常 1,510 / 興味来場 653 / 配信者 1(=2,164)。
 *
 * 直し方(記録の正本と同じものから数える):
 *   - 行の重複の決まりは、記録を保存するときの buildDedupeKey(commentRecord.js・保存の正本)をそのまま使う。
 *     読んだ記録の行(全件・テール・直近)を、このキーで1回だけ数える台帳にする。同じ行を何度読んでも数は増えない。
 *   - 分類は classifyRecordRow(commentRecordBreakdown.js・行ごとの正本)。配信者は表示から外すのと同じ userId の一致。
 *   - 画面の内訳は、いつも【合計 = 記録の数字(単調ゲート後)】。
 *       台帳が記録をほぼ覆っているとき(まだ読んでいない行が少し): 前に出した内訳から、増えた記録の分だけを
 *         まず台帳で分かった通常以外へ、残りを通常へ足す。どの分類も減らず、合計は記録とぴったり同じ。
 *         まだ読んでいない少しの行を通常に入れても、次に読んだときに記録の増えた分で追いつくので、止まるのは数行ぶんまで。
 *       まとめ読み込みの途中(まだ読んでいない行が多い): 分かっている分類はそのまま、残りを通常に入れて合計を記録にそろえる。
 *         この値は固定しない(読み終わったら台帳の正しい分類に直す)。= 0.1.2242 の「大きく出して固定して止まる」を起こさない。
 *   - 同じ行が後から書き足されたとき(配信者の userId が付いた等)は今の分け方に移す。配信者と分かった行は、
 *     userId の無い写し(テール等)が混ざっても配信者のまま(実機 2026-11-27・lv351883073 で「配信者 1」が通常に入ったままだった)。
 *   - 軽い見回り(行を読まない)は、台帳と今の記録の数字だけで同じ計算をする(重い読み込みを足さない)。
 *   - 配信が変わったら(lv が変わったら)台帳をやり直す。一度も行を読んでいない配信では、軽い見回りから内訳を作らない。
 *
 * 全サービス共通: ニコ生も、YouTube・Twitch・Kick・ツイキャス・SHOWROOM・ミクチャ・ABEMA・TikTok 等も
 *   同じ popup-entry.js の setCountDisplay を通る(他サービスは ytNicoShim.js で疑似 lv にして同じ画面を動かす)。
 *
 * @module recordBreakdownInStep
 */

import { normalizeMonotonicLiveId } from './monotonicCommentCount.js';
import { buildDedupeKey } from './commentRecord.js';
import { classifyRecordRow } from './commentRecordBreakdown.js';

/** 通常以外の分類(足す順番もこの順。数の少ない分類から先に追いつかせる)。 */
const OTHER_KINDS = /** @type {const} */ (['broadcaster', 'followNotice', 'otherSystem', 'interestArrival']);

/**
 * @typedef {{ normal: number, interestArrival: number, followNotice: number, otherSystem: number, broadcaster: number }} KindCounts
 * @typedef {KindCounts & { record: number }} LockedBreakdown
 * @typedef {{
 *   lv: string,
 *   counted: boolean,
 *   hidden: boolean,
 *   broadcasterUid: string,
 *   kindByKey: Map<string, keyof KindCounts>,
 *   lastRows: unknown,
 *   known: KindCounts,
 *   locked: LockedBreakdown
 * }} RecordBreakdownInStepState
 * @typedef {{ rows: readonly unknown[], broadcasterUid?: string }} RecordRowsSeen
 * @typedef {{
 *   total: number,
 *   normal: number,
 *   interestArrival: number,
 *   followNotice: number,
 *   otherSystem: number,
 *   _broadcasterCount?: number
 * }} InStepBreakdown
 */

/** @returns {KindCounts} */
function zeroCounts() {
  return { normal: 0, interestArrival: 0, followNotice: 0, otherSystem: 0, broadcaster: 0 };
}

/** @returns {RecordBreakdownInStepState} */
export function createRecordBreakdownInStepState() {
  return {
    lv: '',
    counted: false,
    hidden: false,
    broadcasterUid: '',
    kindByKey: new Map(),
    lastRows: null,
    known: zeroCounts(),
    locked: { ...zeroCounts(), record: 0 }
  };
}

/**
 * 「まだ読んでいない行が少し」とみなす幅。これ以下なら台帳が記録を覆っている(内訳を固定してよい)。
 * @param {number} record
 */
export function breakdownCoverageSlack(record) {
  return Math.max(30, Math.ceil(record * 0.02));
}

/**
 * @param {RecordBreakdownInStepState} state
 * @param {string} lv
 */
function resetFor(state, lv) {
  Object.assign(state, createRecordBreakdownInStepState(), { lv });
}

/**
 * 読んだ記録の行を台帳へ(保存と同じ重複キーで1回だけ)。
 * @param {RecordBreakdownInStepState} state
 * @param {RecordRowsSeen} seen
 */
function ingestRows(state, seen) {
  const rows = Array.isArray(seen.rows) ? seen.rows : [];
  const bc = String(seen.broadcasterUid ?? '').trim();
  if (bc !== state.broadcasterUid) {
    // 配信者が分かった/変わった: 分類をやり直す(配信者の行を通常から外す)。
    state.broadcasterUid = bc;
    state.kindByKey = new Map();
    state.lastRows = null;
    state.known = zeroCounts();
  }
  if (rows === state.lastRows) return; // 同じ配列(描き直しの使い回し)は数え直さない
  state.lastRows = rows;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = /** @type {any} */ (row);
    if (!String(r.text ?? '').trim()) continue;
    const key = buildDedupeKey(state.lv, r);
    /** @type {keyof KindCounts} */
    const kind = bc && String(r.userId ?? '').trim() === bc ? 'broadcaster' : classifyRecordRow(r);
    const prev = state.kindByKey.get(key);
    if (prev === kind) continue;
    // 同じ行の写し(テール等)に userId が無いだけのときは、配信者のまま(配信者の uid が変わったら台帳ごとやり直す)
    if (prev === 'broadcaster') continue;
    // 同じ行が後から書き足された(配信者の userId が付いた等)ときは、今の分け方に移す(数は1のまま)
    if (prev) state.known[prev] -= 1;
    state.kindByKey.set(key, kind);
    state.known[kind] += 1;
  }
}

/** @param {unknown} v */
function recordOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
}

/**
 * @param {KindCounts} c
 * @param {number} total
 * @returns {InStepBreakdown}
 */
function toBreakdown(c, total) {
  /** @type {InStepBreakdown} */
  const out = {
    total,
    normal: c.normal,
    interestArrival: c.interestArrival,
    followNotice: c.followNotice,
    otherSystem: c.otherSystem
  };
  if (c.broadcaster > 0) out._broadcasterCount = c.broadcaster;
  return out;
}

/**
 * 画面に出す内訳を決める。state は in-place で更新する。
 *
 * 戻り値の意味は setCountDisplay の breakdown 引数と同じ:
 *   undefined = 内訳の行に触らない(前の表示のまま) / null = 行を隠す / オブジェクト = その内訳を出す
 *
 * @param {RecordBreakdownInStepState} state
 * @param {unknown} lv 画面が描いている配信(記録の単調ゲートと同じもの)
 * @param {number|null|undefined} recorded 画面に出した記録の数(単調ゲート後)。数字でなければ null
 * @param {RecordRowsSeen | null | undefined} seen
 *   読んだ記録の行(全件の読み直しのとき)。null=隠す・undefined=行を読んでいない(軽い見回り)
 * @param {{ followRecord?: boolean }} [opts] followRecord=true のとき、行を読んでいなくても記録に合わせて内訳を出す
 * @returns {InStepBreakdown|null|undefined}
 */
export function resolveRecordBreakdownInStep(state, lv, recorded, seen, opts = {}) {
  const normLv = normalizeMonotonicLiveId(lv);
  if (!normLv) {
    // 配信が分からないとき: 覚えに触らず、その行だけを数える
    if (!seen || typeof seen !== 'object') return seen === null ? null : undefined;
    const tmp = createRecordBreakdownInStepState();
    tmp.lv = '-';
    return resolveRecordBreakdownInStep(tmp, 'lv0', recorded, seen, opts);
  }
  if (state.lv !== normLv) resetFor(state, normLv);

  if (seen === null) {
    state.hidden = true;
    return null;
  }
  if (seen === undefined) {
    if (!(opts && opts.followRecord === true)) return undefined;
    if (!state.counted || state.hidden) return undefined;
  } else if (seen && typeof seen === 'object' && Array.isArray(seen.rows)) {
    state.counted = true;
    state.hidden = false;
    ingestRows(state, seen);
  } else {
    return undefined;
  }

  const K = state.known;
  const knownTotal = K.normal + K.interestArrival + K.followNotice + K.otherSystem + K.broadcaster;
  const L = state.locked;
  // 記録が数字でないときは、読んだ行の数を記録とみなす。記録は同じ配信で減らない(単調ゲートの後)が、念のため前の値を下回らせない。
  const record = Math.max(recordOrNull(recorded) ?? knownTotal, L.record);
  const unread = record - knownTotal;

  if (unread <= breakdownCoverageSlack(record)) {
    // 台帳が記録を覆っている: 前に出した内訳へ、増えた記録の分だけを足す(どれも減らない・合計=記録)
    let budget = record - L.record;
    /** @type {LockedBreakdown} */
    const next = { ...L, record };
    for (const k of OTHER_KINDS) {
      const add = Math.min(Math.max(0, K[k] - L[k]), budget);
      next[k] = L[k] + add;
      budget -= add;
    }
    next.normal = L.normal + budget;
    state.locked = next;
    return toBreakdown(next, record);
  }

  // まとめ読み込みの途中(まだ読んでいない行が多い): 分かっている分類はそのまま、残りを通常へ。固定しない。
  /** @type {KindCounts} */
  const provisional = zeroCounts();
  let others = 0;
  for (const k of OTHER_KINDS) {
    provisional[k] = Math.max(K[k], L[k]);
    others += provisional[k];
  }
  provisional.normal = Math.max(0, record - others);
  return toBreakdown(provisional, record);
}
