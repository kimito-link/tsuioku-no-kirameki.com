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

/** 会場に並べる最大席数(comeviewRows の 50 件 cap に整合・下端バー時代の既定)。 */
export const VENUE_MAX_SEATS = 50;

/**
 * 全画面会場モードのアリーナ最大席数(PR3)。全員は論理席だが DOM 化/描画はこの上限まで。
 * 会議確定「全員に論理席・表示は ~150 席」。超過は入れ替え制で吸収する。
 */
export const VENUE_FULLSCREEN_MAX_SEATS = 150;

/** 前列(リッチ canvas アバターを割り当てる)席数。残りは軽量アイコン。 */
export const VENUE_FRONT_ROW_SEATS = 20;

/**
 * VIP モードの上限人数(これ以下なら特大アイコンで「VIP感」を出す)。
 * ユーザー方針(2026-06-13)「5人で見れてVIP感」「人数が少ない時は大きさ・配置を変えて」。
 * 少人数ほど大きく見せて会場のスカスカを防ぐため 8 人まで VIP(特大)扱い。
 */
export const VENUE_VIP_MAX = 8;

/** 通常モードの上限人数(これ超で満員=小サイズぎっしり)。少人数を大きく見せるため 30 まで通常(大)。 */
export const VENUE_NORMAL_MAX = 30;

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
 * @param {Set<string>|null} [_promoteUserIds] (互換のため残置・現在は未使用)
 *   2026-06-14 方針変更で「userId があれば promote 有無に関わらずアリーナ」に。引数は呼び出し
 *   側互換のため残す(位置引数)。
 * @returns {string|null} アリーナ席のキー、または匿名/無名なら null
 */
export function venueParticipantKey(row, isGenericName, _promoteUserIds) {
  if (!row || typeof row !== 'object') return null;
  const uid = String(row.userId || '').trim();
  // ユーザー方針(2026-06-14)「匿名もいれたほうが満員感が出る」: 
  // 匿名(184)でも userId があればアリーナに座れるようにする。
  // promoteUserIds に限らず userId があればキーを返す。
  if (uid) {
    return `u:${uid}`;
  }
  const name = String(row.name || '').trim();
  // 通常のアリーナ資格は「個人を識別できる名前があること」。名前が無い/汎用名はアリーナに座らない。
  if (!name) return null;
  if (typeof isGenericName === 'function' && isGenericName(name)) return null;
  return uid ? `u:${uid}` : `n:${name}`;
}

/**
 * 正規化済み発言行の配列(昇順=古い→新しい)から、会場参加者を集計する純関数。
 * 同一参加者はまとめ、最終発言・最新本文・発言数・ギフト有無を持つ。
 *
 * @param {Array<{ userId?: string, name?: string, text?: string, avatar?: string, capturedAt?: number|null, isGift?: boolean }>} rows
 * @param {{ isGenericName?: (name: string) => boolean, promoteUserIds?: Set<string>|null }} [opts]
 * @returns {Array<{ key: string, name: string, userId: string, avatar: string, lastText: string, lastAt: number, count: number, hasGift: boolean, firstAt: number }>}
 *   参加者配列(初出順=安定。席割りはこの順を尊重しつつ優先度で並べ替える)
 */
export function collectVenueParticipants(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const isGenericName = opts.isGenericName;
  const promoteUserIds = opts.promoteUserIds instanceof Set ? opts.promoteUserIds : null;
  /** @type {Map<string, { key: string, name: string, userId: string, avatar: string, lastText: string, lastAt: number, count: number, hasGift: boolean, firstAt: number, order: number }>} */
  const byKey = new Map();
  let order = 0;
  for (const r of list) {
    const key = venueParticipantKey(r, isGenericName, promoteUserIds);
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
 * アバター文字列が「実サムネ(http(s) で取得できる本物の顔)」かを判定する純関数。
 * 空文字 / data:(匿名のゆっくり顔フォールバック) / blob: などは実サムネではない。
 *
 * @param {unknown} avatar
 * @returns {boolean}
 */
export function hasRealThumbnail(avatar) {
  return /^https?:\/\//i.test(String(avatar || '').trim());
}

/**
 * 参加者を会場の優先度で並べ、最大 maxSeats 件に絞る純関数(入れ替え制)。
 * 優先度(2026-06-14 ユーザー方針「サムネ持ちを前列に優先」で①を追加):
 *   ①実サムネ持ち(名前+顔)を最優先 → 前列(手前・大きい段)へ。
 *   ②ギフト参加者を優先 ③最終発言が新しい順 ④発言数。超過分は「降ろす」(=会場から外す)。
 * これで実サムネ持ちが手前に集まり、匿名(ゆっくり顔)はアリーナに残しつつ後列へ流れる。
 *
 * @param {ReturnType<typeof collectVenueParticipants>} participants
 * @param {number} [maxSeats]
 * @returns {ReturnType<typeof collectVenueParticipants>} 会場に残る参加者(優先度順・最大 maxSeats)
 */
export function rankVenueParticipants(participants, maxSeats = VENUE_MAX_SEATS) {
  const list = Array.isArray(participants) ? participants.slice() : [];
  const cap = Number.isFinite(maxSeats) && maxSeats > 0 ? Math.floor(maxSeats) : VENUE_MAX_SEATS;
  list.sort((a, b) => {
    const aReal = hasRealThumbnail(a.avatar);
    const bReal = hasRealThumbnail(b.avatar);
    if (aReal !== bReal) return aReal ? -1 : 1;
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
 * 2026-06-14 ユーザー方針「サムネ持ちを前列に優先」:
 *   ranked は既に実サムネ持ちが先頭(rankVenueParticipants)。だが席が sticky だと
 *   先に座った匿名が前列(seatIndex < frontRow)を占有し続け、後から判明した実サムネ持ちが
 *   前列に入れない。そこで **前列席の prev 維持は実サムネ持ちだけに許可**し、匿名(実サムネ
 *   なし)の前列 prev は破棄してステップ2でランク上位の実サムネ持ちに前列を埋めさせる。
 *   匿名はアリーナに残るが(満員感)後列の空席へ流れる。frontRow=0 なら従来挙動(予約なし)。
 *
 * @param {ReturnType<typeof rankVenueParticipants>} ranked 会場に残る参加者(rankVenueParticipants 出力)
 * @param {Map<string, number>|Record<string, number>} [prevSeatByKey] 前回の key→seatIndex
 * @param {number} [maxSeats]
 * @param {number} [frontRow] 前列席数(これ未満の seatIndex は実サムネ持ち専用に予約。0=予約なし)
 * @returns {{ seats: Array<{ seatIndex: number, participant: ReturnType<typeof collectVenueParticipants>[number] }>, seatByKey: Map<string, number> }}
 *   seats=席インデックス昇順の確定割り当て / seatByKey=今回の key→seatIndex(次回入力に渡す)
 */
export function assignVenueSeats(ranked, prevSeatByKey, maxSeats = VENUE_MAX_SEATS, frontRow = 0) {
  const list = Array.isArray(ranked) ? ranked : [];
  const cap = Number.isFinite(maxSeats) && maxSeats > 0 ? Math.floor(maxSeats) : VENUE_MAX_SEATS;
  const front =
    Number.isFinite(frontRow) && frontRow > 0 ? Math.min(Math.floor(frontRow), cap) : 0;
  const prev =
    prevSeatByKey instanceof Map
      ? prevSeatByKey
      : new Map(Object.entries(prevSeatByKey || {}).map(([k, v]) => [k, Number(v)]));

  /** @type {Map<string, number>} */
  const seatByKey = new Map();
  const usedSeats = new Set();

  // 1) 会場に残る参加者のうち、前回の席を持っている人はその席を維持する。
  //    ただし前列席(< front)は実サムネ持ち専用に予約。匿名の前列 prev は維持しない
  //    (= 2) で実サムネ持ちが前列を埋める。匿名は後列へ流れる)。
  for (const p of list) {
    const prevSeat = prev.get(p.key);
    if (
      Number.isInteger(prevSeat) &&
      prevSeat >= 0 &&
      prevSeat < cap &&
      !usedSeats.has(prevSeat)
    ) {
      if (front > 0 && prevSeat < front && !hasRealThumbnail(p.avatar)) {
        continue; // 匿名の前列 prev は破棄(前列は実サムネ持ちのために空ける)
      }
      seatByKey.set(p.key, prevSeat);
      usedSeats.add(prevSeat);
    }
  }
  // 2) 席未確定の参加者に席を割り当てる(降りた人の席を埋める=入れ替え)。
  //    実サムネ持ちは前列の空席を最小から、匿名は前列を飛ばして後列の空席を埋める。
  //    これでランク上位の実サムネ持ちが手前に集まり、匿名はアリーナ後方へ。
  let nextFreeFront = 0;
  let nextFreeBack = front;
  for (const p of list) {
    if (seatByKey.has(p.key)) continue;
    let seat = -1;
    if (front > 0 && hasRealThumbnail(p.avatar)) {
      while (nextFreeFront < front && usedSeats.has(nextFreeFront)) nextFreeFront += 1;
      if (nextFreeFront < front) seat = nextFreeFront;
    }
    if (seat < 0) {
      // 前列が満席 or 匿名 → 後列(>= front)の最小空席へ。front=0 なら全席が「後列」扱い。
      while (nextFreeBack < cap && usedSeats.has(nextFreeBack)) nextFreeBack += 1;
      if (nextFreeBack < cap) seat = nextFreeBack;
    }
    if (seat < 0) break; // 満席
    seatByKey.set(p.key, seat);
    usedSeats.add(seat);
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
 * @param {Set<string>|null} [promoteUserIds] しゃべった匿名(アリーナ昇格)は観客から除外
 * @param {Set<string>|null} [excludeKeys] アリーナに実際に座っている人のキー(観客から除外)
 * @returns {number}
 */
export function countAnonymousParticipants(rows, isGenericName, promoteUserIds, excludeKeys = null) {
  const list = Array.isArray(rows) ? rows : [];
  const promote = promoteUserIds instanceof Set ? promoteUserIds : null;
  /** @type {Set<string>} */
  const anonUids = new Set();
  let hasUidlessAnon = false;
  const exclude = excludeKeys instanceof Set ? excludeKeys : null;
  for (const r of list) {
    const key = venueParticipantKey(r, isGenericName, promote);
    // アリーナに実際に座っている人(excludeKeys)だけを観客から除外する。
    // アリーナからあふれた人は観客席に落ちる。
    if (exclude && key && exclude.has(key)) continue;
    if (!exclude && key) continue; // 互換性のため excludeKeys がない場合は有資格者を全て除外

    const uid = String(r?.userId || '').trim();
    if (uid) anonUids.add(uid);
    else hasUidlessAnon = true;
  }
  return anonUids.size + (hasUidlessAnon ? 1 : 0);
}

/** 観客席に「顔つきで」並べる匿名の最大人数(これ超は人数テキストで補う)。性能上限。 */
export const VENUE_AUDIENCE_FACE_MAX = 120;

/**
 * 観客席にゆっくり顔で並べる匿名参加者の userId 一覧を返す純関数。
 *
 * 仕上げ会議の確定2「匿名も観客席に顔つきで」: アリーナ(名前付き)に座らない匿名でも
 * userId があれば anonymousIdenticonDataUrl(userId) でゆっくり顔を出せる。観客席を顔なし
 * ドットでなく顔つきにする。ただし全員(数千)は重いので最大 cap、超過は人数テキストで補う。
 * 直近にしゃべった順(capturedAt 降順)で cap 内に入れる=最近の人を優先表示。
 *
 * @param {Array<Record<string, unknown>>} rows 正規化済み発言行
 * @param {{ isGenericName?: (name: string) => boolean, max?: number, promoteUserIds?: Set<string>|null, excludeKeys?: Set<string>|null }} [opts]
 * @returns {{ faceUserIds: string[], totalAnonymous: number }}
 *   faceUserIds=顔を出す匿名 userId(最大 max・直近順) / totalAnonymous=匿名総数(テキスト用)
 */
export function collectAudienceFaceUserIds(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const isGenericName = opts.isGenericName;
  const promote = opts.promoteUserIds instanceof Set ? opts.promoteUserIds : null;
  const max =
    Number.isFinite(opts.max) && opts.max > 0
      ? Math.floor(opts.max)
      : VENUE_AUDIENCE_FACE_MAX;
  const excludeKeys = opts.excludeKeys instanceof Set ? opts.excludeKeys : null;
  /** @type {Map<string, number>} userId→最終発言時刻(最新を優先表示) */
  const lastAtByUid = new Map();
  let hasUidlessAnon = false;
  for (const r of list) {
    const key = venueParticipantKey(r, isGenericName, promote);
    // 実際にアリーナに座っている人を観客から除外する(あふれた人は観客席へ)
    if (excludeKeys && key && excludeKeys.has(key)) continue;
    if (!excludeKeys && key) continue; // 互換性フォールバック

    const uid = String(r?.userId || '').trim();
    if (!uid) {
      hasUidlessAnon = true;
      continue;
    }
    const at = Number.isFinite(Number(r?.capturedAt)) ? Number(r.capturedAt) : 0;
    const prev = lastAtByUid.get(uid);
    if (prev == null || at >= prev) lastAtByUid.set(uid, at);
  }
  const totalAnonymous = lastAtByUid.size + (hasUidlessAnon ? 1 : 0);
  const faceUserIds = Array.from(lastAtByUid.entries())
    .sort((a, b) => b[1] - a[1]) // 直近にしゃべった順
    .slice(0, max)
    .map(([uid]) => uid);
  return { faceUserIds, totalAnonymous };
}

/**
 * 発言行配列から会場の席割りまでを一気に行う高水準純関数(エントリ実装が呼ぶ)。
 *
 * @param {Array<Record<string, unknown>>} rows 正規化済み発言行(昇順)
 * @param {{
 *   prevSeatByKey?: Map<string, number>|Record<string, number>,
 *   maxSeats?: number,
 *   frontRowSeats?: number,
 *   isGenericName?: (name: string) => boolean,
 *   promoteUserIds?: Set<string>|null
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
  // promoteUserIds: しゃべった匿名 userId(名前無しでもアリーナに座らせて吹き出させる)。
  const promoteUserIds = opts.promoteUserIds instanceof Set ? opts.promoteUserIds : null;
  const participants = collectVenueParticipants(rows, {
    isGenericName: opts.isGenericName,
    promoteUserIds
  });
  const ranked = rankVenueParticipants(participants, maxSeats);
  const { seats, seatByKey } = assignVenueSeats(ranked, opts.prevSeatByKey, maxSeats, frontRow);
  return {
    seats: seats.map((s) => ({ ...s, isFrontRow: s.seatIndex < frontRow })),
    seatByKey,
    participantCount: participants.length,
    anonymousCount: countAnonymousParticipants(rows, opts.isGenericName, promoteUserIds),
    layoutMode: resolveVenueLayoutMode(participants.length)
  };
}

/**
 * userLaneCandidatesFromStorage の出力(全チャンク集計済み参加者)を、会場席の入力行へ変換する純関数。
 *
 * PR3: 会場モードの入力を「生コメント(ctail・素性薄い)」から「全コメント集計(サムネ/ゆっくり顔
 *   つき・匿名含む全参加者)」へ切り替えるためのアダプタ。userLaneCandidate は
 *   {userId, nickname, avatarUrl, avatarObserved, liveId, _laneSortAt} 形。
 *   これを collectVenueParticipants が食える {userId, name, avatar, capturedAt} 形へ写す。
 *
 * @param {ReadonlyArray<{userId?: string, nickname?: string, avatarUrl?: string, _laneSortAt?: number}>} candidates
 * @returns {Array<{userId: string, name: string, avatar: string, text: string, capturedAt: number}>}
 */
export function venueRowsFromUserLaneCandidates(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  const out = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const userId = String(c.userId || '').trim();
    if (!userId) continue;
    out.push({
      userId,
      name: String(c.nickname || '').trim(),
      avatar: String(c.avatarUrl || '').trim(),
      // userLane 集計は本文を保持しないので空。会場席は名前/サムネで成立する(吹き出しは別経路)。
      text: '',
      capturedAt: Number.isFinite(Number(c._laneSortAt)) ? Number(c._laneSortAt) : 0
    });
  }
  return out;
}

/**
 * ひな壇(スタンド席)の段組みを決める純関数。
 *
 * ユーザー方針(2026-06-13)「ライブ会場の3D感=ひな壇スタンド席・ほどよく立体的」。
 *   客席後方から見た構図で、前列(段0)を手前=大きく、奥の段ほど小さく配置する。
 *   人数に応じて段数が増え、奥の段ほど横に広い(後方の客席が広がる)ので、少人数でも
 *   満員に見える。前回の固定グリッドが20人で破綻した反省=人数で段組みを動的に決める。
 *
 * 立体感は段ごとの scale(手前1.0→奥 minScale)と depth(0..1・CSS が translateZ/Y に使う)で表す。
 * このファイルは数値モデルだけ(CSS/DOM 非依存)。実際の transform は venueBar 側が depth/scale から作る。
 *
 * @param {number} seatCount アリーナに座る参加者数(名前付き)
 * @param {{ minScale?: number, maxPerFrontRow?: number }} [opts]
 *   minScale=最奥段のスケール(既定0.62=ほどよく立体)、maxPerFrontRow=前列の最大人数(既定8)
 * @returns {Array<{ rowIndex: number, count: number, scale: number, depth: number }>}
 *   段配列(手前=rowIndex 0)。count=その段の席数、scale=拡大率、depth=0(手前)..1(最奥)
 */
export function buildVenueTiers(seatCount, opts = {}) {
  const n = Math.max(0, Math.floor(Number(seatCount) || 0));
  if (n === 0) return [];
  const minScale =
    Number.isFinite(opts.minScale) && opts.minScale > 0 && opts.minScale <= 1
      ? opts.minScale
      : 0.62;
  const frontMax =
    Number.isFinite(opts.maxPerFrontRow) && opts.maxPerFrontRow > 0
      ? Math.floor(opts.maxPerFrontRow)
      : 8;

  // 段数を人数で決める(~frontMax=1段, 倍々に近いペースで増やし最大5段)。
  let rowCount;
  if (n <= frontMax) rowCount = 1;
  else if (n <= frontMax * 2) rowCount = 2;
  else if (n <= frontMax * 4) rowCount = 3;
  else if (n <= frontMax * 7) rowCount = 4;
  else if (n <= frontMax * 11) rowCount = 5;
  else rowCount = 6;

  // 各段の「重み」: 奥ほど横に広い(後方客席が広がる)ので段が増えるごとに +25%。
  const weights = [];
  let weightSum = 0;
  for (let r = 0; r < rowCount; r += 1) {
    const w = 1 + r * 0.25;
    weights.push(w);
    weightSum += w;
  }

  // 人数を重みで各段へ配分(端数は手前から詰める)。
  const counts = weights.map((w) => Math.floor((n * w) / weightSum));
  let assigned = counts.reduce((a, b) => a + b, 0);
  let idx = 0;
  while (assigned < n) {
    counts[idx % rowCount] += 1;
    assigned += 1;
    idx += 1;
  }

  const tiers = [];
  for (let r = 0; r < rowCount; r += 1) {
    if (counts[r] <= 0) continue;
    const depth = rowCount === 1 ? 0 : r / (rowCount - 1);
    const scale = 1 - (1 - minScale) * depth;
    tiers.push({ rowIndex: r, count: counts[r], scale, depth });
  }
  return tiers;
}
