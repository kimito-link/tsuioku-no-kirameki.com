/**
 * ニコニ広告(nicoad)「貢献度ランキング」無認証 JSON API の URL 組立 & 正規化（純関数）。
 *
 * 背景・経緯:
 *   北極星レーンの1つ「広告ランキング(ニコニ広告 貢献度上位)」は従来、
 *   `nicoad.nicovideo.jp/live/publish/<lv>` の HTML を scrape して取得していたが、
 *   その DOM には広告主の userId が出ず、配信者名のみ＝アカウントリンク/アバターが
 *   付けられなかった（officialEventDomBundle.js::fetchNicoadContributionRankingFromPublishPage）。
 *
 *   2026-05-23、無認証の公式 JSON API を実機 curl で確証した:
 *
 *     GET https://api.nicoad.nicovideo.jp/v1/contents/live/<lv>/ranking/contribution?limit=N
 *
 *   - 認証不要（cookie / ヘッダ省略でも 200。credentials:'omit'）。SW は予防的に
 *     X-Frontend-Id:6 / X-Frontend-Version:0 を送る（koken と同じ署名・[[reference-koken-contribution-ranking-api]]）。
 *   - レスポンス:
 *       { meta:{status:200},
 *         data:{ contentId, contentType, contentTotalContribution, count,
 *                ranking:[ { userId(int), advertiserName, totalContribution,
 *                            rank, userPageUrl } ] } }
 *     ⚠️ 配列キーは koken の `rankers` ではなく **`ranking`**。取り違えると全件 empty。
 *     記名広告主は userId/userPageUrl が確実に付く（sm9 で実データ確認）。匿名は欠落 or
 *     advertiserName="名無し"。
 *   - CORS の都合上、本文を読めるのは拡張の service-worker（host_permissions
 *     特権 fetch）のみ。よって本モジュールは「URL 組立」と「生 JSON → 既存
 *     adContributionRanking 行への正規化」だけを純粋に担い、fetch 自体は SW が行う。
 *
 *   正規化先は既存スクレイパ(scrapeContributionRankingFromDom)と同じ行形 + `userPageUrl` で、
 *   popup 側の既存描画経路（officialDomRankingRowsToStripRooms(rows, {userKeyKind:'ad'})
 *   → topSupportRankLineModels の数値uidリンク経路）を変更せずに、記名広告主を
 *   公式 user ページリンク + アバター付きで鏡表示できる。
 *
 * 副作用なし、純関数（fetch も storage も触らない）。
 *
 * @see src/lib/officialDomRankingRowsToStripRooms.js - userKeyKind:'ad' の uid リンク化経路
 * @see src/lib/kokenContributionRankingApi.js - 同型の koken 版（設計の手本）
 * @see reference_gift_sender_identity_research_2026-05-23 - メモリ: nicoad API 確証の一次資料
 */

/**
 * content → service-worker の fetch 依頼メッセージ type。
 * service-worker（extension/background.js）は本定数を import できない（手書きの
 * build 成果物）ため、background 側は同じ文字列リテラルを直接使う（要・同期＝契約 test）。
 */
export const NICOAD_CONTRIB_FETCH_MESSAGE_TYPE = 'NLS_NICOAD_CONTRIB_FETCH';

/** ニコ生 liveId（`lv` + 数字）の厳格パターン。任意 URL 注入 / SSRF 面を塞ぐ。 */
const LIVE_ID_RE = /^lv\d{1,15}$/;

/** 既定の取得件数。広告ランキングは上位のみ表示なので 10。SW の URL 自作と同期。 */
export const NICOAD_CONTRIB_DEFAULT_LIMIT = 10;

/**
 * nicoad API 由来の広告ランキングを置く chrome.storage.local キー。
 *
 * scrape/relay 由来の `nls_nicoad_ranking_<lid>` とは**別キー**にする。
 * popup マージで API 由来（userPageUrl 付き）を優先し、scrape をフォールバックに
 * することで、scrape の空配列が API 値を clobber する事故を構造的に排除する。
 *
 * @param {string} liveId
 * @returns {string}
 */
export function nicoadContribStorageKey(liveId) {
  return 'nls_nicoad_api_ranking_' + String(liveId == null ? '' : liveId).trim().toLowerCase();
}

/** {@link nicoadContribStorageKey} の固定 prefix（prune 側の startsWith 判定用）。 */
export const NICOAD_CONTRIB_STORAGE_PREFIX = 'nls_nicoad_api_ranking_';

/**
 * nicoad 公式広告貢献度ランキング API の URL を組み立てる。
 *
 * liveId は厳格に検証する（呼び出し側の SW が任意文字列を fetch して
 * しまわないよう、不正なら null を返す）。
 *
 * @param {string} liveId 例 "lv345479988"
 * @param {{ limit?: number }} [options] limit=取得件数。既定 10、1..100 に clamp。
 * @returns {string|null} 不正 liveId なら null
 */
export function buildNicoadContributionRankingUrl(liveId, options = {}) {
  const lid = String(liveId == null ? '' : liveId).trim();
  if (!LIVE_ID_RE.test(lid)) return null;

  let limit =
    options && Number.isFinite(Number(options.limit))
      ? Number(options.limit)
      : NICOAD_CONTRIB_DEFAULT_LIMIT;
  limit = Math.trunc(limit);
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;

  return (
    'https://api.nicoad.nicovideo.jp/v1/contents/live/' +
    encodeURIComponent(lid) +
    '/ranking/contribution?limit=' +
    limit
  );
}

/**
 * 生 JSON が nicoad ランキングレスポンスの概形か（meta.status と data.ranking）。
 *
 * @param {unknown} json
 * @returns {boolean}
 */
export function isLikelyNicoadRankingShape(json) {
  if (!json || typeof json !== 'object') return false;
  const j = /** @type {Record<string, any>} */ (json);
  // meta.status は省略され得るが、在るなら 200 のみ受理
  if (j.meta && typeof j.meta === 'object' && j.meta.status != null) {
    if (Number(j.meta.status) !== 200) return false;
  }
  // ⚠️ koken は rankers、nicoad は ranking。
  return !!(j.data && typeof j.data === 'object' && Array.isArray(j.data.ranking));
}

/**
 * niconico の「ユーザーページ」URL だけ通す（userPageUrl の検疫）。
 * 想定外ホストや javascript: 等を弾く（推測ではなく公式提供値の検疫のみ）。
 * 受理形: https://www.nicovideo.jp/user/<digits>（末尾スラッシュ許容）。
 * userId(int) があるが userPageUrl が欠ける場合は userId から組み立てる。
 * @param {unknown} rawUrl
 * @param {unknown} userId
 * @returns {string} 受理時は正規化 URL、非該当は ''
 */
function resolveNicoUserPageUrl(rawUrl, userId) {
  const s = String(rawUrl == null ? '' : rawUrl).trim();
  if (/^https:\/\//i.test(s)) {
    let u;
    try {
      u = new URL(s);
    } catch {
      u = null;
    }
    if (u && u.hostname.toLowerCase() === 'www.nicovideo.jp') {
      const m = u.pathname.match(/^\/user\/(\d{1,18})\/?$/);
      if (m) return `https://www.nicovideo.jp/user/${m[1]}`;
    }
  }
  // userPageUrl が無くても正の整数 userId があれば組み立てる（公式の規則どおり・user/0 は無い）。
  const uid = String(userId == null ? '' : userId).trim();
  if (/^\d{1,18}$/.test(uid) && Number(uid) > 0) return `https://www.nicovideo.jp/user/${uid}`;
  return '';
}

/**
 * nicoad 公式 API の生 JSON を、既存 popup 描画が読む adContributionRanking 行に
 * 正規化する。
 *
 * 設計上の安全条件（Codex 設計レビュー PASS_WITH_FIXES の受け入れ条件を反映）:
 *   - meta.status!==200 / data.ranking 非配列 → null（呼び出し側は「rows>0 の
 *     ときだけ既存 storage を上書き」するので、null/空は既存値を保全＝fail-soft）。
 *   - 1 件も組み立てられなければ null（空配列でなく null）。
 *   - 匿名行（userId 欠落 or advertiserName "名無し"）は isAnonymous:true、
 *     userPageUrl を付けない＝誤リンク不能（誤リンクより false negative を選ぶ）。
 *   - サーバ提供順を信頼し再ソートしない（同点同 rank をそのまま保持）。
 *   - userPageUrl は正規化してから付与（officialDomRankingRowsToStripRooms は厳格）。
 *
 * @param {unknown} json nicoad API レスポンスの生 JSON（SW が res.json() したもの）
 * @returns {Array<{rank:number, name:string, contribution:number, isAnonymous:boolean, userPageUrl?:string}>|null}
 */
export function normalizeNicoadRankingResponse(json) {
  if (!isLikelyNicoadRankingShape(json)) return null;
  const ranking = /** @type {any[]} */ (
    /** @type {Record<string, any>} */ (json).data.ranking
  );

  /** @type {Array<{rank:number, name:string, contribution:number, isAnonymous:boolean, userPageUrl?:string}>} */
  const rows = [];
  for (let i = 0; i < ranking.length; i++) {
    const r = ranking[i];
    if (!r || typeof r !== 'object') continue;

    let rank = Number(r.rank);
    if (!Number.isFinite(rank) || rank <= 0) rank = i + 1;
    rank = Math.trunc(rank);

    // userId は正の整数のみ記名扱い（0 や空・非数値は無効＝user/0 は存在しない）。
    const hasUserId = /^\d{1,18}$/.test(String(r.userId == null ? '' : r.userId).trim()) &&
      Number(r.userId) > 0;
    let name = String(r.advertiserName == null ? '' : r.advertiserName).trim();
    const isAnonymous = !hasUserId || name === '名無し';
    if (!name) {
      if (isAnonymous) name = '名無し';
      else continue; // 記名なのに名前が無い壊れた行は捨てる
    }

    let contribution = Number(r.totalContribution);
    if (!Number.isFinite(contribution) || contribution < 0) contribution = 0;
    contribution = Math.trunc(contribution);

    // 記名行のみ userPageUrl（公式値 or userId から組立）を採用。匿名は付けない＝誤マージ不能。
    let userPageUrl = '';
    if (!isAnonymous) {
      userPageUrl = resolveNicoUserPageUrl(r.userPageUrl, r.userId);
    }

    rows.push({
      rank,
      name,
      contribution,
      isAnonymous,
      ...(userPageUrl ? { userPageUrl } : {})
    });
  }

  return rows.length > 0 ? rows : null;
}
