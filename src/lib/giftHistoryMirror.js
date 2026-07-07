// @ts-nocheck — 任意の giftHistory VM を JSON-safe 鏡へ間引く動的整形
/**
 * 投げ一覧(giftHistory・koken API)の「鏡」スナップショット純関数
 *   (reference_full_mirror_SYNTHESIS.md B・第2号)。
 *
 * 狙い = ①拡張の「投げ一覧」パネル(北極星 giftHistory レーン)を純Web③にも丸写しする。
 *   ①は buildGiftHistoryNorthStarViewModel(giftHistoryViewModel.js) で rooms(貢献者上位)+
 *   ledgerRows(個別投げ明細)を組み、純lib(renderTopSupportRankStripInto / buildGiftThrowLedgerTableSectionHtml)
 *   で描く。③も同じ純libを呼べるよう、VM から【JSON-safe な最小データ】だけを鏡に取り出す。
 *
 * ★制約(地雷 R-1・full-mirror設計 §0): HTML文字列(ctx.throwsTableHtml)は鏡に載せない。
 *   サーバー(Vercel)を渡る blob に innerHTML 行きの HTML を入れると、サーバー侵害時に XSS になる。
 *   代わりに ledgerRows(データ)を運び、③が buildGiftThrowLedgerTableSectionHtml を自分で呼ぶ
 *   (escape は lib 内で済む=③でも安全)。
 * ★rooms/ledgerRows は既に JSON-safe(文字列/数値のみ・関数なし)。laneMirror.js:33-49 toMirrorRow と同流儀で
 *   必要フィールドだけ verbatim に取り、非列挙/関数を持ち込まない。
 *
 * @typedef {{ userKey: string, nickname: string, count: number, avatarUrl: string }} GiftHistoryRoom
 * @typedef {{ timeLabel: string, itemName: string, points: number, thumbnailUrl: string,
 *   userId: string, senderLabel: string, senderAvatarUrl: string, source: string }} GiftHistoryLedgerRow
 * @typedef {{
 *   liveId: string, capturedAt: number,
 *   rooms: GiftHistoryRoom[], noteText: string, unitSuffix: string, ariaLabel: string,
 *   pointsSumAll: number, pointsSumDisplayed: number, officialProgramGiftPts: number,
 *   ledgerRows: GiftHistoryLedgerRow[], ledgerTotalCount: number, payloadSource: string
 * }} GiftHistoryMirrorSnapshot
 *
 * @module giftHistoryMirror
 */

/** 鏡に載せる上限(①の既定と揃える)。 */
export const GIFT_HISTORY_MIRROR_ROOMS_CAP = 10;
export const GIFT_HISTORY_MIRROR_LEDGER_CAP = 20;

function s(v) {
  return String(v == null ? '' : v).trim();
}
function nonNegInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** VM の1 room → 鏡 room(最小フィールド verbatim)。 */
function toRoom(r) {
  const it = r && typeof r === 'object' ? r : {};
  return {
    userKey: s(it.userKey),
    nickname: s(it.nickname),
    count: nonNegInt(it.count),
    avatarUrl: s(it.avatarUrl)
  };
}

/** VM の1 ledger 行 → 鏡 ledger 行(buildGiftThrowLedgerTableSectionHtml が食う形・JSON-safe)。 */
function toLedgerRow(r) {
  const it = r && typeof r === 'object' ? r : {};
  const points = nonNegInt(it.points);
  if (!points) return null; // pt 無し=台帳に出さない(giftThrowRowFromSubAppHistory と同基準)
  return {
    timeLabel: s(it.timeLabel) || '—',
    itemName: s(it.itemName) || '（名称未取得）',
    points,
    thumbnailUrl: s(it.thumbnailUrl),
    userId: s(it.userId),
    senderLabel: s(it.senderLabel) || s(it.senderName) || '名無し',
    senderAvatarUrl: s(it.senderAvatarUrl),
    source: s(it.source) || s(it.payloadSource) || 'koken-api'
  };
}

/**
 * giftHistory VM(buildGiftHistoryNorthStarViewModel の戻り) → 鏡スナップショット。
 * @param {object|null|undefined} ctx VM(rooms/ledgerRows/pointsSum系/noteText 等を持つ)
 * @param {{ liveId?: string, nowMs?: number, roomsCap?: number, ledgerCap?: number }} [opts]
 * @returns {GiftHistoryMirrorSnapshot|null} rooms も ledger も無ければ null
 */
export function buildGiftHistoryMirrorSnapshot(ctx, opts = {}) {
  const c = ctx && typeof ctx === 'object' ? ctx : null;
  if (!c) return null;
  const liveId = s(opts.liveId).toLowerCase();
  const capturedAt = Number(opts.nowMs) || 0;
  const roomsCap = Math.max(1, Math.floor(Number(opts.roomsCap) || GIFT_HISTORY_MIRROR_ROOMS_CAP));
  const ledgerCap = Math.max(0, Math.floor(Number(opts.ledgerCap) || GIFT_HISTORY_MIRROR_LEDGER_CAP));

  const rooms = (Array.isArray(c.rooms) ? c.rooms : []).slice(0, roomsCap).map(toRoom);
  const ledgerRowsRaw = Array.isArray(c.ledgerRows) ? c.ledgerRows : [];
  const ledgerRows = ledgerRowsRaw.slice(0, ledgerCap).map(toLedgerRow).filter(Boolean);

  if (!rooms.length && !ledgerRows.length) return null;

  return {
    liveId,
    capturedAt,
    rooms,
    noteText: s(c.noteText),
    unitSuffix: s(c.unitSuffix) || 'pt',
    ariaLabel: s(c.ariaLabel),
    pointsSumAll: nonNegInt(c.pointsSumAll),
    pointsSumDisplayed: nonNegInt(c.pointsSumDisplayed),
    officialProgramGiftPts: nonNegInt(c.officialProgramGiftPts),
    ledgerRows,
    ledgerTotalCount: nonNegInt(c.ledgerTotalCount) || ledgerRowsRaw.length,
    payloadSource: s(c.payloadSource) || 'gift-sub-app'
  };
}

/**
 * 鏡スナップショットを null-safe に復元(③paint が使う前のガード)。
 * @param {Partial<GiftHistoryMirrorSnapshot>|null|undefined} snap
 * @returns {GiftHistoryMirrorSnapshot|null}
 */
export function restoreGiftHistoryMirror(snap) {
  const c = snap && typeof snap === 'object' ? snap : null;
  if (!c) return null;
  const rooms = (Array.isArray(c.rooms) ? c.rooms : []).map(toRoom).filter((r) => r.userKey || r.nickname);
  const ledgerRows = (Array.isArray(c.ledgerRows) ? c.ledgerRows : []).map(toLedgerRow).filter(Boolean);
  if (!rooms.length && !ledgerRows.length) return null;
  return {
    liveId: s(c.liveId),
    capturedAt: Number(c.capturedAt) || 0,
    rooms,
    noteText: s(c.noteText),
    unitSuffix: s(c.unitSuffix) || 'pt',
    ariaLabel: s(c.ariaLabel),
    pointsSumAll: nonNegInt(c.pointsSumAll),
    pointsSumDisplayed: nonNegInt(c.pointsSumDisplayed),
    officialProgramGiftPts: nonNegInt(c.officialProgramGiftPts),
    ledgerRows,
    ledgerTotalCount: nonNegInt(c.ledgerTotalCount) || ledgerRows.length,
    payloadSource: s(c.payloadSource) || 'gift-sub-app'
  };
}
