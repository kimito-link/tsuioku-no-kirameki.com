// ytGiftToNico.js — YouTube の有料の応援(スーパーチャット・スーパーステッカー・メンバー加入・メンバーシップギフト)を、
// ニコ生版のギフトの記録の形に直す(ytNicoShim の入口の一部)。
//
// ニコ生版はギフトを次のキーから読む。どれも本物の popup-entry.js がそのまま描く:
//   nls_gift_users_<lv>          … ギフトを投げた人(応援レーンのギフト列)
//   nls_gift_events_<lv>         … 1件ずつのギフト(時系列)
//   nls_gift_subapp_history_<lv> … 「この番組へのギフト履歴」
//   nls_gift_history_throws_<lv> … 送り主ごとの回数と合計pt
//   nls_koken_api_contrib_<lv>   … 「ギフト貢献度」(公式ランキングの代わり=YouTube の有料の応援の合計順)
// pt は「円にしたおよその額」。YouTube は通貨がばらばらなので、目安のレートで円にそろえる(順位を比べられるように)。

/** 目安のレート(1単位 → 円)。正確な為替ではない。知らない通貨はそのままの数を使う。 */
const JPY_PER_UNIT = /** @type {Record<string, number>} */ ({
  JPY: 1,
  USD: 150,
  EUR: 165,
  GBP: 195,
  CAD: 110,
  AUD: 100,
  NZD: 90,
  CHF: 175,
  SGD: 115,
  HKD: 19,
  TWD: 4.7,
  KRW: 0.11,
  CNY: 21,
  PHP: 2.6,
  THB: 4.3,
  IDR: 0.0095,
  MYR: 33,
  INR: 1.8,
  BRL: 27,
  MXN: 8,
  // Twitch の Bits・Kick の Kicks は 1 つ = 1 pt(円にしない)。
  //   ★以前は 1 Bit = 1.4・1 Kick = 1.5 にして行ごとに丸めていたため、1 Kick の行が 2 pt になり、
  //     少額が重なるほど合計がずれた(2026-11-08 本物の Kick で 1 Kicks → 2 pt・2 Kicks → 4 pt)。
  //     公式のランキングも Bits/Kicks の数で並ぶので、数のまま数えたほうがそろう。
  //     Twitch・Kick の画面に出るのはそのサービスの応援だけなので、円の額と並べて比べる所は無い。
  BITS: 1,
  KICKS: 1,
  // ふわっちのアイテム。値段はどこにも出ない(2026-11-08 PC 実測)ので個数で数える(1個 = 1)
  WWITEM: 1,
  // SHOWROOM のギフトの pt(gift_list の point × 個数)。数のまま
  SRPT: 1,
  // ミクチャのギフトのコイン(items の price × 個数)。数のまま
  MXCOIN: 1,
  // TikTok のギフトのコイン(diamondCount × 個数)。数のまま
  TTCOIN: 1,
  // ツイキャスのギフトの🍡スコア(ページに出る「+🍡90」の数)。値段は配信の口に出ないので数のまま
  TCSCORE: 1,
});

/**
 * @param {number} amount
 * @param {string} currency
 * @returns {number} 円にしたおよその pt(0 以上の整数)
 */
export function ytAmountToPoints(amount, currency) {
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) return 0;
  const rate = JPY_PER_UNIT[String(currency || '').toUpperCase()] ?? 1;
  return Math.max(0, Math.round(a * rate));
}

const ITEM_NAME = /** @type {Record<string, string>} */ ({
  superchat: 'スーパーチャット',
  sticker: 'スーパーステッカー',
  membership: 'メンバー加入',
  membership_gift: 'メンバーシップギフト',
  yt_gift: 'ギフト',
});

/** Twitch/Kick の記録の名前(サブスク・ギフトサブ・Bits/Kicks)。kind は YouTube と同じ形にそろえてある(twIrcParse.js・kickChatParse.js) */
const PLATFORM_ITEM_NAME = /** @type {Record<string, Record<string, string>>} */ ({
  twitch: { superchat: 'Bits', membership: 'サブスク', membership_gift: 'ギフトサブ' },
  kick: { superchat: 'Kicks', membership: 'サブスク', membership_gift: 'ギフトサブ' },
  whowatch: { superchat: 'アイテム' },
  showroom: { superchat: 'ギフト' },
  mixch: { superchat: 'ギフト' },
  tiktok: { superchat: 'ギフト' },
  twitcasting: { superchat: 'ギフト' },
});
/** 「500 Bits」「500 Kicks」と数で書く通貨 */
const COUNT_CURRENCY = /** @type {Record<string, string>} */ ({ BITS: 'Bits', KICKS: 'Kicks', WWITEM: '個', SRPT: 'pt', MXCOIN: 'コイン', TTCOIN: 'コイン', TCSCORE: 'スコア' });

/**
 * 元の金額を、その通貨の書き方で出す(例: ¥1,000 / $5.00 / €2.00)。pt は円にしたおよその額なので、
 * 外国の通貨では元の金額を並べないと誤解される。
 * @param {number} amount
 * @param {string} currency
 * @returns {string} 金額が無ければ ''
 */
export function ytAmountLabel(amount, currency) {
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) return '';
  const cur = String(currency || '').toUpperCase();
  if (COUNT_CURRENCY[cur]) return `${a.toLocaleString('ja-JP')} ${COUNT_CURRENCY[cur]}`;
  if (/^[A-Z]{3}$/.test(cur)) {
    try {
      return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: cur }).format(a);
    } catch {
      /* 知らない通貨コード */
    }
  }
  return `${a.toLocaleString('ja-JP')}${cur ? ` ${cur}` : ''}`;
}

/** @param {string} kind */
export function isYtPaidKind(kind) {
  return Object.prototype.hasOwnProperty.call(ITEM_NAME, String(kind || ''));
}

/**
 * @param {Array<{
 *   id?: string, userId?: string, nickname?: string, avatarUrl?: string, text?: string,
 *   capturedAt?: number, ytPostedAt?: number, ytKind?: string, ytPlatform?: string, ytGiftName?: string, ytGiftImageUrl?: string, ytAmount?: number, ytCurrency?: string
 * }>} entries ytNicoShim が作ったニコ生形のコメント行
 * @param {string} lv 疑似 lv
 * @param {{ startedAt?: number, now?: number }} [opts]
 */
export function buildYtGiftBags(entries, lv, opts = {}) {
  const now = Number(opts.now) || Date.now();
  const beginSec = Number(opts.startedAt) > 0 ? Math.floor(Number(opts.startedAt) / 1000) : 0;
  const paid = (Array.isArray(entries) ? entries : []).filter((e) => isYtPaidKind(String(e?.ytKind || '')));

  /** @type {any[]} */
  const events = [];
  /** @type {any[]} */
  const history = [];
  /** @type {Map<string, { userId: string, nickname: string, avatarUrl: string, throwCount: number, totalPoints: number, capturedAt: number }>} */
  const byUser = new Map();
  /** @type {Map<string, { itemName: string, count: number, thumbnailUrl: string }>} */
  const byItem = new Map();
  let totalPoints = 0;

  for (const e of paid) {
    const uid = String(e.userId || '').trim();
    const nickname = String(e.nickname || '').trim();
    const kind = String(e.ytKind || '');
    const baseItemName = PLATFORM_ITEM_NAME[String(e.ytPlatform || '')]?.[kind] || ITEM_NAME[kind];
    const amountLabel = ytAmountLabel(Number(e.ytAmount || 0), String(e.ytCurrency || ''));
    // 投げ一覧の「アイテム」に元の金額を添える(例: スーパーチャット $5.00)。種類ごとの合計は元の名前で数える
    // YouTube の新しい「ギフト」(ジュエルのスタンプ)はギフトの名前と絵がある(例: ハイ)。金額は出ないので pt は 0
    // ふわっちのアイテム・SHOWROOM のギフトも名前と絵がある
    const named = kind === 'yt_gift' || /^(?:whowatch|showroom|mixch|twitcasting)$/.test(String(e.ytPlatform || ''));
    const giftName = named ? String(e.ytGiftName || '').trim() : '';
    const giftThumb = named ? String(e.ytGiftImageUrl || '') : '';
    const twGiftCount = Number(e.ytGiftCount || 0);
    const itemName =
      giftName ||
      (COUNT_CURRENCY[String(e.ytCurrency || '').toUpperCase()] && amountLabel
        ? amountLabel // Twitch の Bits・Kick の Kicks は「500 Bits」だけ(「Bits 500 Bits」と重ねない)
        : amountLabel
        ? `${baseItemName} ${amountLabel}`
        : twGiftCount > 1
        ? `${baseItemName} ×${twGiftCount}`
        : baseItemName);
    const point = ytAmountToPoints(Number(e.ytAmount || 0), String(e.ytCurrency || ''));
    const at = Number(e.ytPostedAt) || Number(e.capturedAt) || now;
    const pubSec = Math.floor(at / 1000);
    totalPoints += point;

    events.push({
      userId: uid,
      nickname,
      itemId: '', // ニコ生版は itemId からニコニコのアイテム画像 URL を作る。YouTube の種類名を入れると無い画像を探す
      itemName,
      point,
      message: String(e.text || ''),
      contributionRank: null,
      capturedAt: at,
    });

    const offsetSec = beginSec > 0 ? Math.max(0, pubSec - beginSec) : 0;
    const h = Math.floor(offsetSec / 3600);
    const m = Math.floor((offsetSec % 3600) / 60);
    const s = offsetSec % 60;
    history.push({
      itemName,
      senderName: nickname || '名無し',
      points: point,
      time: beginSec > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : '—',
      sortKey: beginSec > 0 ? offsetSec : pubSec,
      thumbnailUrl: giftThumb,
      senderAvatarUrl: String(e.avatarUrl || ''),
      userId: uid,
      kokenHistoryId: `yt:${String(e.id || '')}`,
      publishedAt: pubSec,
      contribution: point,
      capturedAt: at,
    });

    // 投げ一覧の行と同じ名前(金額つき)でまとめる。ニコ生版はこの名前で pt を足すので、まとめだけの 0pt の行が出ないように。
    const item = byItem.get(itemName) || { itemName, count: 0, thumbnailUrl: giftThumb };
    item.count += 1;
    byItem.set(itemName, item);

    if (!uid) continue;
    const u = byUser.get(uid) || {
      userId: uid,
      nickname: nickname || uid,
      avatarUrl: '',
      throwCount: 0,
      totalPoints: 0,
      capturedAt: at,
    };
    u.throwCount += 1;
    u.totalPoints += point;
    if (at > u.capturedAt) u.capturedAt = at;
    if (e.avatarUrl) u.avatarUrl = String(e.avatarUrl);
    if (nickname) u.nickname = nickname;
    byUser.set(uid, u);
  }

  history.sort((a, b) => b.sortKey - a.sortKey);
  const users = [...byUser.values()];
  const ranked = [...users].sort((a, b) => b.totalPoints - a.totalPoints || b.throwCount - a.throwCount);

  return {
    count: paid.length,
    totalPoints,
    giftUsers: users.map((u) => ({
      userId: u.userId,
      nickname: u.nickname,
      capturedAt: u.capturedAt,
      throwCount: u.throwCount,
    })),
    giftEvents: events,
    subApp: history.length
      ? {
          liveId: lv,
          capturedAt: now,
          source: String(paid.find((e) => e?.ytPlatform)?.ytPlatform || 'youtube'),
          // ツイキャスの有料アイテム(お茶爆など)はスコアが「✨」で数が出ない=0。いちばん高いギフトの送り主が欄から消えないよう、
          //   0 の人も送り主として並べる(カードの「0pt」は shim がギフトの名前に直す・ytZeroPtGiftLabel.js)。2026-11-12 PC 実配信で発見
          keepZeroPointSenders: paid.some((e) => e?.ytPlatform === 'twitcasting'),
          history,
          totalCounts: [...byItem.values()].sort((a, b) => b.count - a.count),
          officialTotalPoint: totalPoints,
          officialRemaining: 0,
        }
      : null,
    throws: users.length
      ? users.map((u) => ({
          userId: u.userId,
          nickname: u.nickname,
          throwCount: u.throwCount,
          totalPoints: u.totalPoints,
          capturedAt: u.capturedAt,
          ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}),
        }))
      : null,
    koken: ranked.length
      ? {
          liveId: lv,
          capturedAt: now,
          lastOk: true,
          lastStatus: 200,
          rows: ranked.map((u, i) => ({
            rank: i + 1,
            name: u.nickname,
            contribution: u.totalPoints,
            isAnonymous: false,
            thumbnailUrl: u.avatarUrl,
            userPageUrl: `https://www.nicovideo.jp/user/${u.userId}`,
          })),
        }
      : null,
  };
}
