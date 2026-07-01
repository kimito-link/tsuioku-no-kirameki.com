// venueSeats.js
// v0.1.707: ライブ会場モードの「座席モデル」純関数。
//
// ───────────────────────────────────────────────────────────────────────────
// 【会場の席に座る人=アクティブユーザー・2026-06-17 確定】
//   席に座るのは【アクティブユーザー】= コメント/ギフト/広告(貢献)でアクションし、素性(userId)が
//   観測できた人。匿名(a:xxx・184)か数値IDかは無関係=アクションした人は全員、会場の主役。
//   席資格の唯一の正本は venueParticipantKey(下記)。userId があれば匿名でも座る。
//
//   ⚠️【来場者数(PV)とは別物】ニコ生公式の「来場 N人」は PV 的な延べアクセス(同じ人の入り直し・
//      無言の通りすがり込み)で userId が取れない=席には出せない。来場者数は席ではなく背景群衆
//      Canvas の密度で表現する(venueBar 側・別レイヤー)。「会場参加者 N人」(席)と「来場 N人」(PV)を
//      取り違えないこと。無言視聴者一覧は NDGR で取れない(Codex 指摘)のが原理的制約。
// ───────────────────────────────────────────────────────────────────────────
//
// 設計正本: memory/reference_venue_mode_meeting.md(全員集合会議 2026-06-13) + council/person-tile-unify-SYNTHESIS.md(2026-06-17)
//   + docs/person-tile-architecture.md(人物タイル経路の正本マインドマップ・用語/データフロー/方針変遷)。
//   SHOWROOM 風の会場感を、ごちゃごちゃさせず整理して出す。
//
// このファイルは席割りの核ロジックだけ(DOM/storage/chrome.* 非依存・テスト可能・Web/OBS版で共用):
//   - 参加者(アクション行)を一意キー(venueParticipantKey)でまとめ、最終発言時刻・発言数・ギフト数を集計
//   - 最大 N 席に cap。超過時はスクロールでなく「入れ替え制」(最も古い参加者を降ろす)
//   - 席は安定割り当て(同じ人=同じ席インデックス)→ アバター位置と吹き出し位置が飛ばない
//   - 「直近アクション > ギフト参加者 > その他」の優先で席を確保する(匿名も同じ土俵)
//
// 軽さの肝: DOM を増やし続けない。席数は固定上限、参加者超過は入れ替えで吸収する。

/** 会場に並べる最大席数(comeviewRows の 50 件 cap に整合・下端バー時代の既定)。 */
export const VENUE_MAX_SEATS = 50;

/**
 * 全画面会場モードのアリーナ最大席数。全員は論理席だが DOM 化/描画はこの上限まで。
 * 2026-06-22 会場「全員500人」(council/venue-all-faces-500・会議3体一致+司令塔裏取り):
 *   ユーザー確定「とにかく全員・サムネ優先・500人並べば理想・SHOWROOM感」。旧 150 では
 *   482人配信で~96人しか顔が出ず残りは点描逃げ。500 に上げ、段数(buildVenueTiers maxRows)・
 *   DOM プール(venueBar)・縦スクロール(overflow-y)と整合させて全員を顔付きに。超過は入れ替え制で吸収。
 *   ★resolveDynamicArenaCap は潰さず引数で max を上げる(テスト/高さ計算を壊さない漸進)。
 */
export const VENUE_FULLSCREEN_MAX_SEATS = 500;

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
 * ───────────────────────────────────────────────────────────────────────────
 * 【正本ルール・2026-06-17 確定】= この関数が「誰が会場の席に座れるか」の唯一の正本。
 *   会場の席に座れるのは【アクティブユーザー】= コメント/ギフト/広告(貢献)のいずれかで
 *   アクションし、素性(userId)が観測できた人。匿名(a:xxx・184)か数値IDかは一切無関係。
 *   → userId があれば【匿名でも必ず】席キー `u:${uid}` を返す(下記実装の通り)。
 *   popup の応援アイコン列(renderStoryUserLane)に出る人と、会場の席の顔ぶれを一致させる。
 *
 * 【席に座れない=null を返すのは1ケースだけ】userId も無く、個人を識別できる name も無い
 *   (または汎用プレースホルダ名)行。userId が取れていない行は「誰か」を固定できないため。
 *   ※ 来場者数(ニコ生公式「来場 N人」)は PV 的な延べアクセスで無言の通りすがり込み=userId が
 *      取れず、ここには来ない。来場者数は席ではなく背景群衆 Canvas の密度で表現する(別レイヤー)。
 *
 * 【方針の変遷・⚠️ 古い理解で誤らないため明記】
 *   - 2026-06-13 旧方針「匿名はアリーナじゃない=名前のある人だけ席・匿名は観客に集約」← 【撤回済み】
 *   - 2026-06-14 「匿名も userId があれば席に座らせる(満員感)」で上の旧方針を撤回
 *   - 2026-06-17 「アクティブユーザー(アクションした人)は匿名/非匿名問わず全員着席」で確定
 *   旧方針(2026-06-13)を前提にしたコメントは全て無効。本 JSDoc が現行の正本。
 * ───────────────────────────────────────────────────────────────────────────
 *
 * キーは userId があれば `u:${userId}`(再接続でも同一人物・同名の別人も区別)、無ければ `n:${name}`。
 *
 * @param {{ userId?: string, name?: string }} row 正規化済み行(normalizeComeviewRow 形)
 * @param {(name: string) => boolean} [isGenericName] 汎用プレースホルダ名判定(comeviewRows から注入)
 * @param {Set<string>|null} [_promoteUserIds] (互換のため残置・現在は未使用)
 *   2026-06-14 以降「userId があれば promote 有無に関わらず着席」なので promote 判定は不要。
 *   引数は呼び出し側の位置引数互換のため残す。
 * @returns {string|null} 席キー(`u:${uid}` か `n:${name}`)、または userId も識別名も無い行は null
 */
export function venueParticipantKey(row, isGenericName, _promoteUserIds) {
  if (!row || typeof row !== 'object') return null;
  const uid = String(row.userId || '').trim();
  // 【正本】userId があれば匿名(184)でも必ず席に座らせる。アクティブユーザー=アクションした人は
  //   匿名/非匿名問わず会場の主役(2026-06-17 確定)。promote 有無は問わない。
  if (uid) {
    return `u:${uid}`;
  }
  // userId が無い行は name で救済を試みる。個人を識別できる名前があれば席に座らせる。
  //   名前も無い/汎用名(匿名・名無し)は「誰か」を固定できないので席に座らせず null。
  const name = String(row.name || '').trim();
  if (!name) return null;
  if (typeof isGenericName === 'function' && isGenericName(name)) return null;
  return `n:${name}`;
}

/**
 * 正規化済み発言行の配列(昇順=古い→新しい)から、会場参加者を集計する純関数。
 * 同一参加者はまとめ、最終発言・最新本文・発言数・ギフト有無を持つ。
 *
 * @param {Array<{ userId?: string, name?: string, text?: string, avatar?: string, capturedAt?: number|null, isGift?: boolean, preCount?: number, preHasGift?: boolean, preGiftCount?: number }>} rows
 * @param {{ isGenericName?: (name: string) => boolean, promoteUserIds?: Set<string>|null }} [opts]
 * @returns {Array<{ key: string, name: string, userId: string, avatar: string, lastText: string, lastAt: number, count: number, hasGift: boolean, giftCount: number, firstAt: number }>}
 *   参加者配列(初出順=安定。席割りはこの順を尊重しつつ優先度で並べ替える)
 */
export function collectVenueParticipants(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const isGenericName = opts.isGenericName;
  const promoteUserIds = opts.promoteUserIds instanceof Set ? opts.promoteUserIds : null;
  /** @type {Map<string, { key: string, name: string, userId: string, avatar: string, lastText: string, lastAt: number, count: number, hasGift: boolean, giftCount: number, firstAt: number, order: number }>} */
  const byKey = new Map();
  let order = 0;
  for (const r of list) {
    const key = venueParticipantKey(r, isGenericName, promoteUserIds);
    if (!key) continue;
    const at = Number.isFinite(Number(r?.capturedAt)) ? Number(r.capturedAt) : 0;
    const text = String(r?.text ?? '').trim();
    // 集約済み入力(userLane candidate 経由)は出現回数=1でも実発言数を preCount で持つ。
    //   preCount があればそれを「この行が表す発言数」として加算する(生コメント経路は1ずつ)。
    const preCount = Number.isFinite(Number(r?.preCount)) ? Math.max(1, Math.floor(Number(r.preCount))) : 1;
    const preHasGift = r?.preHasGift === true || !!r?.isGift;
    const preGiftCount = Number.isFinite(Number(r?.preGiftCount)) ? Math.max(0, Math.floor(Number(r.preGiftCount))) : 0;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += preCount;
      existing.giftCount += preGiftCount;
      if (at >= existing.lastAt) {
        existing.lastAt = at;
        if (text) existing.lastText = text;
      }
      if (preHasGift) existing.hasGift = true;
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
        count: preCount,
        hasGift: preHasGift,
        giftCount: preGiftCount,
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
 * 数値 userId から niconico アカウントアイコンの URL を導出する純関数。
 * 匿名(数値でない/空)は '' を返す。venueBar の描画と診断(roster)で同じ式を使い、
 * 「席ではサムネが出てるのに診断ではサムネ持ち0」という不整合を防ぐ正本。
 *
 * @param {unknown} userId
 * @returns {string} アイコン URL、または匿名で ''
 */
export function deriveNicoUserIconUrl(userId) {
  const uid = String(userId || '').trim();
  if (!/^\d{2,15}$/.test(uid)) return '';
  return `https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/${Math.floor(Number(uid) / 10000)}/${uid}.jpg`;
}

/**
 * 参加者の「実効サムネ URL」を返す純関数。stored avatar(http)を最優先、無ければ数値 userId
 * から導出したアカウントアイコン。どちらも無ければ ''(=匿名・ゆっくり顔扱い)。
 *
 * @param {{ avatar?: string, userId?: string }} participant
 * @returns {string}
 */
export function resolveVenueEffectiveAvatar(participant) {
  const p = participant && typeof participant === 'object' ? participant : {};
  const stored = String(p.avatar || '').trim();
  if (hasRealThumbnail(stored)) return stored;
  return deriveNicoUserIconUrl(p.userId);
}

/**
 * 参加者が「実効サムネを持つ(顔写真席になれる)」かを返す純関数。
 * stored avatar が http、または数値 userId でアイコン導出できる人=true。
 *
 * @param {{ avatar?: string, userId?: string }} participant
 * @returns {boolean}
 */
export function participantHasEffectiveThumbnail(participant) {
  return hasRealThumbnail(resolveVenueEffectiveAvatar(participant));
}

/**
 * 会場ローカルの「常連・大応援」スコア(0..100)を返す純関数(VIP光らせ判定の素)。
 *
 * 2026-06-14 ユーザー方針(星野アイデア会議2)「VIP常連を光らせる(giftSum + supportCount スコア)」:
 *   応援者パワー診断(supporterPowerScoring.js)はフォロワー/レベル等の重い外部データが要るが、
 *   会場の描画ループはそれを安定して持たない。ここでは **会場が確実に持つ素材だけ**で軽く出す:
 *     - count(その配信での発言数=常連度) を log 正規化(連投で青天井にしない)
 *     - hasGift(ギフトを送った=大応援) を加点
 *     - giftPoints(あれば=ギフト総ポイント) を log 正規化で更に加点(任意・無くても成立)
 *   score = 100 * (0.55*commentNorm + 0.30*giftFlag + 0.15*giftPointsNorm)。
 *   実サムネ有無(.nlsb-seat-vip)とは独立の軸=「顔がある人」でなく「支えてる人」を光らせる。
 *
 * @param {{ count?: number, hasGift?: boolean, giftPoints?: number }} participant
 * @param {{ commentCap?: number, giftPointsCap?: number }} [opts]
 *   commentCap=発言数の正規化上限(既定40・これ以上は頭打ち) / giftPointsCap=ポイント上限(既定5000)
 * @returns {number} 0..100 の常連・応援スコア
 */
export function resolveVenueRegularScore(participant, opts = {}) {
  const p = participant && typeof participant === 'object' ? participant : {};
  const count = Math.max(0, Math.floor(Number(p.count) || 0));
  const giftPoints = Math.max(0, Number(p.giftPoints) || 0);
  const commentCap =
    Number.isFinite(opts.commentCap) && opts.commentCap > 0 ? opts.commentCap : 40;
  const giftPointsCap =
    Number.isFinite(opts.giftPointsCap) && opts.giftPointsCap > 0 ? opts.giftPointsCap : 5000;
  /** @param {number} v */
  const log1p = (v) => Math.log(1 + Math.max(0, v));
  const commentNorm = Math.min(1, log1p(count) / log1p(commentCap));
  const giftFlag = p.hasGift ? 1 : 0;
  const giftPointsNorm = giftPoints > 0 ? Math.min(1, log1p(giftPoints) / log1p(giftPointsCap)) : 0;
  const score = 100 * (0.55 * commentNorm + 0.3 * giftFlag + 0.15 * giftPointsNorm);
  return Math.max(0, Math.min(100, score));
}

/**
 * VIP(常連・大応援)として席を光らせる既定スコア閾値。これ以上で光る。
 * v0.1.734 実機検証で 45 だと 20 コメント以上必要=普通の配信で誰も光らなかった。
 *   30 に下げて「7コメ以上の常連 or ギフトを送った人」が光るように(実機で 0→複数席へ)。
 */
export const VENUE_VIP_REGULAR_SCORE_THRESHOLD = 30;

/** 同時に光らせる VIP 席の既定上限(光りすぎて特別感が薄れるのを防ぐ)。 */
export const VENUE_VIP_REGULAR_MAX = 8;

/**
 * 「光る最低バー」スコア。これ未満は上位でも光らせない(完全に静かな会場で1コメの人が
 * 光る事故を防ぐ)。0 超=発言1回以上 or ギフトで候補になる。発言1回(score~10)は超える。
 */
export const VENUE_VIP_REGULAR_MIN_SCORE = 1;

/**
 * 会場参加者のうち「光らせる VIP(常連・大応援)」のキー集合を返す純関数。
 *
 * 2026-06-15 設計変更(無料LLM会議 deepseek-r1/gpt-oss 一致・実機検証で根治):
 *   旧実装は「絶対閾値(発言7回相当=score>=30)以上」だったが、実際のニコ生では席に座る
 *   名前付きユーザーの発言は1〜5回が大多数で7回以上はほぼ居らず、誰も光らなかった
 *   (heavy commenter の多くは匿名=userId 無しで席にも座れない)。
 *   そこで【相対評価=その配信のスコア上位 max 人】に変更。最低バー(minScore)だけ設け、
 *   それを超える人の中から上位 max 人を光らせる。ギフト送信者は score が高く自然に上位入り。
 *   これで「どんな配信でも常連・応援者の上位が必ず一目で分かる」(光りすぎは max で防ぐ)。
 *
 * @param {ReturnType<typeof collectVenueParticipants>} participants
 * @param {{ max?: number, minScore?: number, commentCap?: number, giftPointsCap?: number, threshold?: number }} [opts]
 *   max=光らせる上限人数(既定8) / minScore=光る最低バー(既定1=発言1回以上 or ギフト)。
 *   threshold は後方互換のため受けるが、指定時は minScore として扱う(絶対閾値運用に戻せる)。
 * @returns {Set<string>} 光らせる参加者の key 集合(相対評価・上位 max 人)
 */
export function selectVenueVipRegularKeys(participants, opts = {}) {
  const max =
    Number.isFinite(opts.max) && opts.max > 0
      ? Math.floor(opts.max)
      : VENUE_VIP_REGULAR_MAX;
  return new Set(rankVenueContributors(participants, opts).slice(0, max).map((s) => s.key));
}

/**
 * 会場参加者を「応援者ランキング」として貢献度スコア降順に並べた配列を返す純関数。
 *
 * selectVenueVipRegularKeys(=金色オーラの候補集合)と【同じスコア・同じ並び順】を使う
 * 単一の正本。順位表示(1位/2位/3位バッジ)と光らせ判定が別々にスコアを持つと drift する
 * (会議 2026-07-01 venue-grid-diag の最重要指摘)ため、両者はここを共有する。
 *
 * @param {ReturnType<typeof collectVenueParticipants>} participants
 * @param {{ minScore?: number, commentCap?: number, giftPointsCap?: number, threshold?: number }} [opts]
 * @returns {Array<{ key: string, score: number, count: number }>} score 降順(deterministic)
 */
export function rankVenueContributors(participants, opts = {}) {
  const list = Array.isArray(participants) ? participants : [];
  // 後方互換: 旧 threshold 指定は最低バーとして扱う(テスト/絶対運用の互換)。
  const minScore =
    Number.isFinite(opts.minScore) && opts.minScore >= 0
      ? opts.minScore
      : Number.isFinite(opts.threshold) && opts.threshold >= 0
        ? opts.threshold
        : VENUE_VIP_REGULAR_MIN_SCORE;
  const scored = [];
  for (const p of list) {
    if (!p || typeof p.key !== 'string' || !p.key) continue;
    const score = resolveVenueRegularScore(p, opts);
    if (score >= minScore && score > 0) {
      scored.push({ key: p.key, score, count: Number(p.count) || 0 });
    }
  }
  // score 降順 → 同点は発言数降順 → key で deterministic に(相対評価)。
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.count !== a.count) return b.count - a.count;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return scored;
}

/** 席に付ける「応援者ランキング」順位バッジの既定上限(上位 topN 位まで=🥇🥈🥉)。 */
export const VENUE_TOP_RANK_MAX = 3;

/** ひな壇上部「応援者トップNバー」に大きく並べる既定人数(密集会場でも上位が一目で分かる)。 */
export const VENUE_TOP_SUPPORTERS_BAR = 8;

/**
 * 会場参加者のうち「応援者ランキング上位 topN 位」を key→順位(1始まり)で返す純関数。
 *
 * 会議 2026-07-01(venue-grid-diag)の結論=独立グリッドバーは冗長なので、まず席タイル本体に
 * 順位バッジを重ねて上位貢献者を可視化する。光らせ演出(selectVenueVipRegularKeys)とは
 * 別軸で、スコア源(rankVenueContributors)だけを共有して drift を避ける。
 *
 * @param {ReturnType<typeof collectVenueParticipants>} participants
 * @param {{ topN?: number, minScore?: number, commentCap?: number, giftPointsCap?: number }} [opts]
 * @returns {Map<string, number>} key → 順位(1..topN)
 */
export function selectVenueTopRankKeys(participants, opts = {}) {
  const topN =
    Number.isFinite(opts.topN) && opts.topN > 0
      ? Math.floor(opts.topN)
      : VENUE_TOP_RANK_MAX;
  const ranked = rankVenueContributors(participants, opts);
  const out = new Map();
  for (let i = 0; i < ranked.length && i < topN; i += 1) {
    out.set(ranked[i].key, i + 1);
  }
  return out;
}

/**
 * 参加者を会場の優先度で並べ、最大 maxSeats 件に絞る純関数。
 *
 * v0.1.790「満席にするのに減る意味がわからない」(会議6体一致+司令塔裏取り):
 *   旧実装は「③最終発言が新しい順」を主軸に slice する単一ソートだったため、満席後に
 *   誰かがしゃべる度に【最も長く黙っている人】がランキングから押し出されて席を失った
 *   (=ユーザーの「時間が経つと減る」)。一度落ちた人は assignVenueSeats の sticky 維持にも
 *   届かない(ランキングで先に消えるため)。
 *
 *   会議の収束=「単一ソートの奪い合い」を「優先度順の充填(Fill & Merge)」へ。固定枠配分は
 *   罠(実機は顔出し~5人=顔出し枠を固定すると空いて無駄・nvidia/openrouter 指摘)なので、
 *   各層を【まだ選ばれていない人だけ】フィルタ→その層の基準でソート→連結し、先頭から cap 取る。
 *   顔出しが少なければ常連が、常連が少なければ新着が自動で席を埋める「流動的満員」になる。
 *
 *   優先度(上の層ほど会場に残りやすい):
 *     ① 既に座っていた人(prevSeatByKey にいる) — 一度入ったら黙っても降ろさない(満席維持の核)
 *     ② 実サムネ持ち(顔出し・稀少) — 発言数多い順で
 *     ③ 発言数が多い人(常連) — 黙っても常連は残る
 *     ④ 最近しゃべった人(今の盛り上げ) — lastAt 降順
 *     ⑤ 残り(匿名のにぎやかし) — lastAt 降順
 *   ギフトは発言数スコアに既に効く(giftCount>0=preHasGift)ため独立の層は設けない。
 *
 * 純関数(Date.now 非依存=lastAt の相対順序だけ使う・テスト可能)。prevSeatByKey 省略時は
 *   ①が空集合になり「サムネ→発言数→最近」の充填に degrade(後方互換)。
 *
 * @param {ReturnType<typeof collectVenueParticipants>} participants
 * @param {number} [maxSeats]
 * @param {Map<string, number>|Record<string, number>|null} [prevSeatByKey]
 *   前回の key→seatIndex。ここに居る人は「既に座っていた人」として最優先で残す(降ろさない)。
 * @returns {ReturnType<typeof collectVenueParticipants>} 会場に残る参加者(優先度順・最大 maxSeats)
 */
export function rankVenueParticipants(participants, maxSeats = VENUE_MAX_SEATS, prevSeatByKey = null) {
  const list = Array.isArray(participants) ? participants.slice() : [];
  const cap = Number.isFinite(maxSeats) && maxSeats > 0 ? Math.floor(maxSeats) : VENUE_MAX_SEATS;

  /** @type {Set<string>} 前回 cap 内に座っていた人の key(=今回も最優先で残す) */
  const seated = new Set();
  if (prevSeatByKey instanceof Map) {
    for (const [k, seat] of prevSeatByKey) {
      const s = Number(seat);
      if (Number.isInteger(s) && s >= 0 && s < cap) seated.add(String(k));
    }
  } else if (prevSeatByKey && typeof prevSeatByKey === 'object') {
    for (const [k, seat] of Object.entries(prevSeatByKey)) {
      const s = Number(seat);
      if (Number.isInteger(s) && s >= 0 && s < cap) seated.add(String(k));
    }
  }

  // 各層の基準(同層内のみで効く・降ろす/残すは層の順序で決まる)。
  /** @typedef {ReturnType<typeof collectVenueParticipants>[number]} VenueParticipant */
  /** @param {VenueParticipant} a @param {VenueParticipant} b */
  const byCountThenRecent = (a, b) => {
    if (b.count !== a.count) return b.count - a.count; // 発言数多い順(常連)
    if (b.lastAt !== a.lastAt) return b.lastAt - a.lastAt; // 同数は最近順
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; // 安定
  };
  /** @param {VenueParticipant} a @param {VenueParticipant} b */
  const byRecentThenCount = (a, b) => {
    if (b.lastAt !== a.lastAt) return b.lastAt - a.lastAt; // 最近しゃべった順
    if (b.count !== a.count) return b.count - a.count;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  };

  const picked = new Set();
  /** @type {ReturnType<typeof collectVenueParticipants>} */
  const out = [];
  /**
   * 層を充填: 未選択かつ pred を満たす人を sorter 順に out へ足す(cap まで)。
   * @param {(p: any) => boolean} pred
   * @param {(a: any, b: any) => number} sorter
   */
  const fill = (pred, sorter) => {
    if (out.length >= cap) return;
    const layer = list
      .filter((p) => p && !picked.has(p.key) && pred(p))
      .sort(sorter);
    for (const p of layer) {
      if (out.length >= cap) break;
      picked.add(p.key);
      out.push(p);
    }
  };

  // ① 既に座っていた人(降ろさない・満席維持の核)。前回の並び感を尊重しつつ常連順で。
  fill((p) => seated.has(p.key), byCountThenRecent);
  // ② 実サムネ持ち(顔出し・稀少)。
  fill((p) => hasRealThumbnail(p.avatar), byCountThenRecent);
  // ③ 発言数が多い人(常連)。黙っていても残る。
  fill((p) => (p.count || 0) >= 2, byCountThenRecent);
  // ④ 最近しゃべった人(今の盛り上げ)。
  fill(() => true, byRecentThenCount);

  return out.slice(0, cap);
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

/** 観客席に「顔つきで」並べる超過アクティブユーザーの最大人数(これ超は人数テキストで補う)。性能上限。 */
export const VENUE_AUDIENCE_FACE_MAX = 120;

/**
 * 「観客席」に顔つきで並べる参加者の userId 一覧を返す純関数。
 *
 * 【観客席の意味・2026-06-17 確定】アクティブユーザー(コメント/ギフト/広告でアクションした人・
 *   匿名/非匿名問わず)は全員アリーナ席が本来の居場所。ここで扱う「観客」は【1画面に表示した席
 *   (visibleSeats)に入りきらなかったアクティブユーザー】= excludeKeys に渡された「実際に画面表示した
 *   席のキー」を除いた残り。1画面の表示席数は画面幅×段数(最大8段)で決まり、論理上限150席とは別に
 *   さらに間引かれることがある(venueBar の resolveVisibleArenaCount/selectStableVisibleMembers)。
 *   ⚠️ ここで言う「観客」は来場者数(PV・無言視聴者)とは無関係。来場者数は背景群衆 Canvas で別途表現。
 *
 * 顔つき表示: userId があれば anonymousIdenticonDataUrl(userId)/アカウントアイコンで顔を出す。
 *   全員(数千)は重いので最大 cap(max)、超過は totalAnonymous の人数テキストで補う。
 *   直近にアクションした順(capturedAt 降順)で cap 内に入れる=最近の人を優先表示。
 *
 * @param {Array<Record<string, unknown>>} rows 正規化済み発言行
 * @param {{ isGenericName?: (name: string) => boolean, max?: number, promoteUserIds?: Set<string>|null, excludeKeys?: Set<string>|null }} [opts]
 * @returns {{ faceUserIds: string[], totalAnonymous: number }}
 *   faceUserIds=顔を出す超過アクティブ userId(最大 max・直近順) / totalAnonymous=観客席の総数(テキスト用)
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
 *   promoteUserIds?: Set<string>|null,
 *   vipRegular?: boolean,
 *   vipRegularThreshold?: number,
 *   vipRegularMax?: number,
 *   vipRegularCommentCap?: number,
 *   vipRegularGiftPointsCap?: number,
 *   topRank?: number,
 *   topSupporters?: number
 * }} [opts]
 * @returns {{
 *   seats: Array<{ seatIndex: number, isFrontRow: boolean, isVipRegular: boolean, venueRank: number, participant: ReturnType<typeof collectVenueParticipants>[number] }>,
 *   topSupporters: Array<{ rank: number, score: number, participant: ReturnType<typeof collectVenueParticipants>[number] }>,
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
  // v0.1.790: prevSeatByKey をランキングにも渡す=「前回座っていた人」を最優先で残し
  //   満席後にしゃべった新規が常連を押し出す入れ替えを止める(=「時間で減る」根治)。
  const ranked = rankVenueParticipants(participants, maxSeats, opts.prevSeatByKey);
  const { seats, seatByKey } = assignVenueSeats(ranked, opts.prevSeatByKey, maxSeats, frontRow);
  // VIP(常連・大応援)光らせ判定は全参加者でスコアリングしてから席へ印を付ける。
  //   vipRegular:false(既定) で無効化可(後方互換)。明示 opts で閾値/上限を上書きできる。
  const vipRegularKeys =
    opts.vipRegular === false
      ? new Set()
      : selectVenueVipRegularKeys(participants, {
          threshold: opts.vipRegularThreshold,
          max: opts.vipRegularMax,
          commentCap: opts.vipRegularCommentCap,
          giftPointsCap: opts.vipRegularGiftPointsCap
        });
  // 応援者ランキング上位 topRank 位に順位(1始まり)を付ける(席タイルの順位バッジ用)。
  //   topRank<=0 で無効化(後方互換=既定は付ける)。スコア源は光らせ判定と共有(drift 回避)。
  const topRankN =
    Number.isFinite(opts.topRank) ? Math.floor(opts.topRank) : VENUE_TOP_RANK_MAX;
  const rankByKey =
    topRankN > 0
      ? selectVenueTopRankKeys(participants, {
          topN: topRankN,
          commentCap: opts.vipRegularCommentCap,
          giftPointsCap: opts.vipRegularGiftPointsCap
        })
      : new Map();
  // 「応援者トップNバー」用に、貢献度スコア降順の participant を topSupporters 件だけ返す。
  //   スコア源は席の順位バッジ(rankByKey)と共有(rankVenueContributors)=drift しない。
  //   topSupporters<=0 で無効(既定は出す)。匿名も含む(会場の「全員主役」を壊さない)。
  const topSupportersN =
    Number.isFinite(opts.topSupporters) ? Math.floor(opts.topSupporters) : VENUE_TOP_SUPPORTERS_BAR;
  /** @type {Array<{ rank: number, score: number, participant: any }>} */
  let topSupporters = [];
  if (topSupportersN > 0) {
    const byKey = new Map(participants.map((p) => [p.key, p]));
    topSupporters = rankVenueContributors(participants, {
      commentCap: opts.vipRegularCommentCap,
      giftPointsCap: opts.vipRegularGiftPointsCap
    })
      .slice(0, topSupportersN)
      .map((r, idx) => ({ rank: idx + 1, participant: byKey.get(r.key), score: r.score }))
      .filter((x) => x.participant);
  }
  return {
    seats: seats.map((s) => ({
      ...s,
      isFrontRow: s.seatIndex < frontRow,
      isVipRegular: vipRegularKeys.has(s.participant.key),
      venueRank: rankByKey.get(s.participant.key) || 0
    })),
    topSupporters,
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
 *   {userId, nickname, avatarUrl, avatarObserved, liveId, commentCount, giftCount, _laneSortAt} 形。
 *   これを collectVenueParticipants が食える {userId, name, avatar, capturedAt, ...} 形へ写す。
 *
 * v0.1.734 VIP常連光らせ修正: candidate は既にユーザー単位で集約済み(1人=1行)なので、この
 *   adapter を通すと collectVenueParticipants の出現回数カウントは全員 count=1 になり、VIP
 *   スコアが閾値に届かず誰も光らなかった。candidate が持つ実発言数(commentCount)/ギフト回数
 *   (giftCount)を preCount/preHasGift/preGiftCount として持たせ、collectVenueParticipants が
 *   出現回数の代わりにこれを使えるようにする(本物の常連度がスコアに乗る)。
 *
 * @param {ReadonlyArray<{userId?: string, nickname?: string, avatarUrl?: string, commentCount?: number, giftCount?: number, _laneSortAt?: number}>} candidates
 * @returns {Array<{userId: string, name: string, avatar: string, text: string, capturedAt: number, preCount?: number, preHasGift?: boolean, preGiftCount?: number}>}
 */
export function venueRowsFromUserLaneCandidates(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  const out = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const userId = String(c.userId || '').trim();
    if (!userId) continue;
    const preCount = Math.max(1, Math.floor(Number(c.commentCount) || 0) || 1);
    const giftCount = Math.max(0, Math.floor(Number(c.giftCount) || 0));
    out.push({
      userId,
      name: String(c.nickname || '').trim(),
      avatar: String(c.avatarUrl || '').trim(),
      // userLane 集計は本文を保持しないので空。会場席は名前/サムネで成立する(吹き出しは別経路)。
      text: '',
      capturedAt: Number.isFinite(Number(c._laneSortAt)) ? Number(c._laneSortAt) : 0,
      // 集約済みの実数(VIP常連光らせのスコア用)。collectVenueParticipants が拾う。
      preCount,
      preHasGift: giftCount > 0,
      preGiftCount: giftCount
    });
  }
  return out;
}

/**
 * 人数連動でひな壇の最奥段スケールを決める純関数(満席感・密度LOD)。
 *
 * 2026-06-14 会議(無料LLM4体・星野ロミ思想): 人数が増えるほど奥の段を小さく密にして
 *   「満員の客席」に見せる。ただし下げすぎると顔が潰れるので 0.50 を下限に段階的に。
 *   ~16人=0.62(従来)・~64人=0.58・~150人=0.54・それ超=0.50。
 *
 * @param {number} total アリーナ席数
 * @returns {number} 最奥段の scale(0.50〜0.62)
 */
export function resolveVenueTierMinScale(total) {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  if (n <= 16) return 0.62;
  if (n <= 64) return 0.58;
  if (n <= 150) return 0.54;
  return 0.5;
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
 * @param {{ minScale?: number, maxPerFrontRow?: number, maxPerRow?: number, maxRows?: number }} [opts]
 *   minScale=最奥段のスケール(既定0.62=ほどよく立体)、maxPerFrontRow=前列の最大人数(既定8)、
 *   maxPerRow=1段に入れる席数の上限(横はみ出し防止・既定 無制限。venueBar が seatsPerRow を渡す)、
 *   maxRows=段数の絶対上限(既定8=後方互換。venueBar が「全員ぶん段」を積むとき大きい値を渡す)
 * @returns {Array<{ rowIndex: number, count: number, scale: number, depth: number }>}
 *   段配列(手前=rowIndex 0)。count=その段の席数、scale=拡大率、depth=0(手前)..1(最奥)
 */
export function buildVenueTiers(seatCount, opts = {}) {
  const n = Math.max(0, Math.floor(Number(seatCount) || 0));
  if (n === 0) return [];
  // 2026-06-14 会議(満席感・密度LOD): minScale 未指定なら人数連動で最奥段を小さくして
  //   奥の客席を密に見せる(手前は読める大きさを保つ)。会議合意 405人規模で奥 ~0.55。
  //   16席まで0.62(従来) → 多いほど 0.50 まで段階的に下げる。明示 minScale があればそれ優先。
  const minScale =
    Number.isFinite(opts.minScale) && opts.minScale > 0 && opts.minScale <= 1
      ? opts.minScale
      : resolveVenueTierMinScale(n);
  const frontMax =
    Number.isFinite(opts.maxPerFrontRow) && opts.maxPerFrontRow > 0
      ? Math.floor(opts.maxPerFrontRow)
      : 8;
  // 2026-06-14 実機修正(v0.1.737): 1行に収まる席数の上限。これを超えて段に席を入れると
  //   横にはみ出して overflow-x:hidden で切れて見えなくなる(=会場が埋まって見えない+
  //   見切れた席に届かない)。venueBar が seatsPerRow から実測値を渡す。未指定なら実質無制限。
  const maxPerRow =
    Number.isFinite(opts.maxPerRow) && opts.maxPerRow > 0
      ? Math.floor(opts.maxPerRow)
      : Infinity;
  // 2026-06-22 会場「全員500人」(council/venue-all-faces-500): 段数の絶対上限。既定8=従来動作
  //   (後方互換)。venueBar が「全員ぶんの段」を作りたいとき大きい値を渡す=8段で間引かず縦に
  //   積んで overflow-y スクロールで全員を顔付きに。奥段は minScale で潰れない範囲でフラット化。
  const maxRows =
    Number.isFinite(opts.maxRows) && opts.maxRows > 0 ? Math.floor(opts.maxRows) : 8;

  // 段数を人数で決める(~frontMax=1段, 倍々に近いペースで増やす)。
  // 2026-06-14 会議(満席感): 大人数で段を増やして奥に客席を広げる。上限 6→8 段。
  let rowCount;
  if (n <= frontMax) rowCount = 1;
  else if (n <= frontMax * 2) rowCount = 2;
  else if (n <= frontMax * 4) rowCount = 3;
  else if (n <= frontMax * 7) rowCount = 4;
  else if (n <= frontMax * 11) rowCount = 5;
  else if (n <= frontMax * 16) rowCount = 6;
  else if (n <= frontMax * 22) rowCount = 7;
  else rowCount = 8;
  // maxRows を 8 より大きく許す場合、既定の段数表(最大8)を超えて「全員ぶんの段」を作れるよう、
  //   maxPerRow が無くても frontMax 基準で段数を伸ばす(8段×frontMax を超える人数は段を足す)。
  if (maxRows > 8 && !Number.isFinite(maxPerRow) && rowCount * frontMax < n) {
    rowCount = Math.min(maxRows, Math.ceil(n / frontMax));
  }

  // maxPerRow がある場合: 全段 × maxPerRow に収まらないと横溢れする。収まるよう段数を増やす。
  //   従来は8段で頭打ち=超過は間引かれる前提だったが、maxRows を上げると全員ぶん段を積める。
  if (Number.isFinite(maxPerRow)) {
    while (rowCount < maxRows && rowCount * maxPerRow < n) rowCount += 1;
  }

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

  // 2026-06-14 実機修正: どの段も maxPerRow を超えないよう、溢れた席を後段へ繰り越す。
  //   後段も満杯なら前段から詰め直す。これで横はみ出し(見切れ)が構造的に出ない。
  if (Number.isFinite(maxPerRow)) {
    for (let r = 0; r < rowCount; r += 1) {
      if (counts[r] <= maxPerRow) continue;
      let overflow = counts[r] - maxPerRow;
      counts[r] = maxPerRow;
      // まず後段の空きへ、足りなければ前段の空きへ。
      for (let t = r + 1; t < rowCount && overflow > 0; t += 1) {
        const room = maxPerRow - counts[t];
        if (room <= 0) continue;
        const move = Math.min(room, overflow);
        counts[t] += move;
        overflow -= move;
      }
      for (let t = 0; t < rowCount && overflow > 0; t += 1) {
        const room = maxPerRow - counts[t];
        if (room <= 0) continue;
        const move = Math.min(room, overflow);
        counts[t] += move;
        overflow -= move;
      }
      // 全段満杯で収まらない分は描画上限超過=ここでは捨てる(visibleSeatCount 側で防がれる想定)。
    }
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
