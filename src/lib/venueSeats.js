// venueSeats.js
// v0.1.707: ライブ会場モードの「座席モデル」純関数。
//
// 設計正本: memory/reference_venue_mode_meeting.md(全員集合会議 2026-06-13)。
//   SHOWROOM 風の会場感を、ごちゃごちゃさせず整理して出す。会場には「会場参加者」が
//   アバターで並ぶ。⚠️ 無言の視聴者一覧は NDGR で取れない(Codex 指摘)ので、ここで扱うのは
//   「発言した人・ギフトを送った人」= 素性が観測できた参加者だけ。
//
// このファイルは席割りの核ロジックだけ(DOM/storage/chrome.* 非依存・テスト可能・Web/OBS版で共用):
//   - 参加者(発言行)を一意キーでまとめ、最終発言時刻・発言数を集計
//   - 最大 N 席に cap。超過時はスクロールでなく「入れ替え制」(最も古い参加者を降ろす)
//   - 席は安定割り当て(同じ人=同じ席インデックス)→ アバター位置と吹き出し位置が飛ばない
//   - 「直近発言者 > ギフト参加者 > その他」の優先で席を確保する
//
// 軽さの肝: DOM を増やし続けない。席数は固定上限、参加者超過は入れ替えで吸収する。

/** 会場に並べる最大席数(comeviewRows の 50 件 cap に整合)。 */
export const VENUE_MAX_SEATS = 50;

/** 前列(リッチ canvas アバターを割り当てる)席数。残りは軽量アイコン。 */
export const VENUE_FRONT_ROW_SEATS = 20;

/**
 * VIP モードの上限人数(これ以下なら大アイコンで「VIP感」を出す)。
 * ユーザー方針(2026-06-13)「5人で見れてVIP感でるみたいな」。
 */
export const VENUE_VIP_MAX = 5;

/** 通常モードの上限人数(これ超で満員=小サイズぎっしり)。 */
export const VENUE_NORMAL_MAX = 20;

/**
 * アリーナ人数に応じて会場のレイアウトモードを決める純関数。
 * 少人数を埋め草にせず特別感に変える(SHOWROOM にない追憶独自の体験)。
 *
 * @param {number} arenaCount アリーナ席に座る名前付き参加者の数
 * @returns {'empty'|'vip'|'normal'|'packed'}
 *   empty=0人 / vip=1..5(大アイコン) / normal=6..20(中) / packed=21+(小・ぎっしり)
 */
export function resolveVenueLayoutMode(arenaCount) {
  const n = Math.max(0, Math.floor(Number(arenaCount) || 0));
  if (n === 0) return 'empty';
  if (n <= VENUE_VIP_MAX) return 'vip';
  if (n <= VENUE_NORMAL_MAX) return 'normal';
  return 'packed';
}

/**
 * アリーナ席(会場の前に座る参加者)の安定キーを決める純関数。
 *
 * ユーザー方針(2026-06-13)「匿名はアリーナじゃないみたいなのがいい」: SHOWROOM のアリーナ席は
 *   名前のある人が座り、匿名は別枠の観客。だから **名前のある人だけ**にキーを返す。
 *   名前が無い/汎用プレースホルダ(匿名・名無し)はアリーナに座らせず null を返す
 *   (= venueBar 側で「ほか観客 ◯人」に集約する)。
 * キーは userId があれば userId(再接続でも同一人物・同名の別人も区別)、無ければ name。
 *
 * @param {{ userId?: string, name?: string }} row 正規化済み行(normalizeComeviewRow 形)
 * @param {(name: string) => boolean} [isGenericName] 汎用プレースホルダ名判定(comeviewRows から注入)
 * @returns {string|null} アリーナ席のキー、または匿名/無名なら null
 */
export function venueParticipantKey(row, isGenericName) {
  if (!row || typeof row !== 'object') return null;
  const name = String(row.name || '').trim();
  // アリーナ資格は「個人を識別できる名前があること」。名前が無い/汎用名はアリーナに座らない。
  if (!name) return null;
  if (typeof isGenericName === 'function' && isGenericName(name)) return null;
  const uid = String(row.userId || '').trim();
  return uid ? `u:${uid}` : `n:${name}`;
}

/**
 * 正規化済み発言行の配列(昇順=古い→新しい)から、会場参加者を集計する純関数。
 * 同一参加者はまとめ、最終発言・最新本文・発言数・ギフト有無を持つ。
 *
 * @param {Array<{ userId?: string, name?: string, text?: string, avatar?: string, capturedAt?: number|null, isGift?: boolean }>} rows
 * @param {{ isGenericName?: (name: string) => boolean }} [opts]
 * @returns {Array<{ key: string, name: string, userId: string, avatar: string, lastText: string, lastAt: number, count: number, hasGift: boolean, firstAt: number }>}
 *   参加者配列(初出順=安定。席割りはこの順を尊重しつつ優先度で並べ替える)
 */
export function collectVenueParticipants(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const isGenericName = opts.isGenericName;
  /** @type {Map<string, { key: string, name: string, userId: string, avatar: string, lastText: string, lastAt: number, count: number, hasGift: boolean, firstAt: number, order: number }>} */
  const byKey = new Map();
  let order = 0;
  for (const r of list) {
    const key = venueParticipantKey(r, isGenericName);
    if (!key) continue;
    const at = Number.isFinite(Number(r?.capturedAt)) ? Number(r.capturedAt) : 0;
    const text = String(r?.text ?? '').trim();
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      if (at >= existing.lastAt) {
        existing.lastAt = at;
        if (text) existing.lastText = text;
      }
      if (r?.isGift) existing.hasGift = true;
      const uid = String(r?.userId || '').trim();
      if (uid && !existing.userId) existing.userId = uid;
      const name = String(r?.name || '').trim();
      if (name && !existing.name) existing.name = name;
      const avatar = String(r?.avatar || '').trim();
      if (avatar && !existing.avatar) existing.avatar = avatar;
    } else {
      byKey.set(key, {
        key,
        name: String(r?.name || '').trim(),
        userId: String(r?.userId || '').trim(),
        avatar: String(r?.avatar || '').trim(),
        lastText: text,
        lastAt: at,
        firstAt: at,
        count: 1,
        hasGift: !!r?.isGift,
        order: order++
      });
    }
  }
  const out = Array.from(byKey.values());
  out.sort((a, b) => a.order - b.order);
  return out.map(({ order: _order, ...rest }) => rest);
}

/**
 * 参加者を会場の優先度で並べ、最大 maxSeats 件に絞る純関数(入れ替え制)。
 * 優先度: ①ギフト参加者を優先 ②最終発言が新しい順。超過分は「降ろす」(=会場から外す)。
 * これにより活発な人・ギフトをくれた人が会場に残り、静かになった人から入れ替わる。
 *
 * @param {ReturnType<typeof collectVenueParticipants>} participants
 * @param {number} [maxSeats]
 * @returns {ReturnType<typeof collectVenueParticipants>} 会場に残る参加者(優先度順・最大 maxSeats)
 */
export function rankVenueParticipants(participants, maxSeats = VENUE_MAX_SEATS) {
  const list = Array.isArray(participants) ? participants.slice() : [];
  const cap = Number.isFinite(maxSeats) && maxSeats > 0 ? Math.floor(maxSeats) : VENUE_MAX_SEATS;
  list.sort((a, b) => {
    if (!!b.hasGift !== !!a.hasGift) return b.hasGift ? 1 : -1;
    if (b.lastAt !== a.lastAt) return b.lastAt - a.lastAt;
    return b.count - a.count;
  });
  return list.slice(0, cap);
}

/**
 * 席の安定割り当て。前回の席割り(key→seatIndex)を尊重し、会場に残る参加者には
 * 既存の席をそのまま使わせ、新しく入った参加者には空いた席を埋めさせる純関数。
 * これで「同じ人=同じ席」が保たれ、アバターと吹き出しの位置がフレーム毎に飛ばない。
 *
 * @param {ReturnType<typeof rankVenueParticipants>} ranked 会場に残る参加者(rankVenueParticipants 出力)
 * @param {Map<string, number>|Record<string, number>} [prevSeatByKey] 前回の key→seatIndex
 * @param {number} [maxSeats]
 * @returns {{ seats: Array<{ seatIndex: number, participant: ReturnType<typeof collectVenueParticipants>[number] }>, seatByKey: Map<string, number> }}
 *   seats=席インデックス昇順の確定割り当て / seatByKey=今回の key→seatIndex(次回入力に渡す)
 */
export function assignVenueSeats(ranked, prevSeatByKey, maxSeats = VENUE_MAX_SEATS) {
  const list = Array.isArray(ranked) ? ranked : [];
  const cap = Number.isFinite(maxSeats) && maxSeats > 0 ? Math.floor(maxSeats) : VENUE_MAX_SEATS;
  const prev =
    prevSeatByKey instanceof Map
      ? prevSeatByKey
      : new Map(Object.entries(prevSeatByKey || {}).map(([k, v]) => [k, Number(v)]));

  /** @type {Map<string, number>} */
  const seatByKey = new Map();
  const usedSeats = new Set();

  // 1) 会場に残る参加者のうち、前回の席を持っている人はその席を維持する。
  for (const p of list) {
    const prevSeat = prev.get(p.key);
    if (
      Number.isInteger(prevSeat) &&
      prevSeat >= 0 &&
      prevSeat < cap &&
      !usedSeats.has(prevSeat)
    ) {
      seatByKey.set(p.key, prevSeat);
      usedSeats.add(prevSeat);
    }
  }
  // 2) 席未確定の参加者に、空いている最小席を割り当てる(降りた人の席を埋める=入れ替え)。
  let nextFree = 0;
  for (const p of list) {
    if (seatByKey.has(p.key)) continue;
    while (nextFree < cap && usedSeats.has(nextFree)) nextFree += 1;
    if (nextFree >= cap) break;
    seatByKey.set(p.key, nextFree);
    usedSeats.add(nextFree);
    nextFree += 1;
  }

  /** @type {Array<{ seatIndex: number, participant: ReturnType<typeof collectVenueParticipants>[number] }>} */
  const seats = [];
  for (const p of list) {
    const seatIndex = seatByKey.get(p.key);
    if (seatIndex == null) continue;
    seats.push({ seatIndex, participant: p });
  }
  seats.sort((a, b) => a.seatIndex - b.seatIndex);
  return { seats, seatByKey };
}

/**
 * アリーナに座らない匿名(名前なし/汎用名)の概算人数を数える純関数。
 * userId があれば userId 単位でユニークに数え(同じ匿名IDの連投は1人)、userId が無い行は
 * 識別不能なので「最大1人ぶん」だけ加える(無名連投を全部別人として水増ししない)。
 *
 * @param {Array<Record<string, unknown>>} rows 正規化済み発言行
 * @param {(name: string) => boolean} [isGenericName]
 * @returns {number}
 */
export function countAnonymousParticipants(rows, isGenericName) {
  const list = Array.isArray(rows) ? rows : [];
  /** @type {Set<string>} */
  const anonUids = new Set();
  let hasUidlessAnon = false;
  for (const r of list) {
    if (venueParticipantKey(r, isGenericName)) continue; // アリーナ資格者はここで除外
    const uid = String(r?.userId || '').trim();
    if (uid) anonUids.add(uid);
    else hasUidlessAnon = true;
  }
  return anonUids.size + (hasUidlessAnon ? 1 : 0);
}

/**
 * 発言行配列から会場の席割りまでを一気に行う高水準純関数(エントリ実装が呼ぶ)。
 *
 * @param {Array<Record<string, unknown>>} rows 正規化済み発言行(昇順)
 * @param {{
 *   prevSeatByKey?: Map<string, number>|Record<string, number>,
 *   maxSeats?: number,
 *   frontRowSeats?: number,
 *   isGenericName?: (name: string) => boolean
 * }} [opts]
 * @returns {{
 *   seats: Array<{ seatIndex: number, isFrontRow: boolean, participant: ReturnType<typeof collectVenueParticipants>[number] }>,
 *   seatByKey: Map<string, number>,
 *   participantCount: number,
 *   anonymousCount: number,
 *   layoutMode: 'empty'|'vip'|'normal'|'packed'
 * }}
 */
export function buildVenueSeating(rows, opts = {}) {
  const maxSeats = Number.isFinite(opts.maxSeats) ? opts.maxSeats : VENUE_MAX_SEATS;
  const frontRow = Number.isFinite(opts.frontRowSeats) ? opts.frontRowSeats : VENUE_FRONT_ROW_SEATS;
  const participants = collectVenueParticipants(rows, { isGenericName: opts.isGenericName });
  const ranked = rankVenueParticipants(participants, maxSeats);
  const { seats, seatByKey } = assignVenueSeats(ranked, opts.prevSeatByKey, maxSeats);
  return {
    seats: seats.map((s) => ({ ...s, isFrontRow: s.seatIndex < frontRow })),
    seatByKey,
    participantCount: participants.length,
    anonymousCount: countAnonymousParticipants(rows, opts.isGenericName),
    layoutMode: resolveVenueLayoutMode(participants.length)
  };
}
