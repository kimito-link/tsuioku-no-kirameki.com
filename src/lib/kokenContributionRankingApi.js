/**
 * koken 公式「ギフト貢献度ランキング」無認証 JSON API の URL 組立 & 正規化（純関数）。
 *
 * 背景・経緯:
 *   核心（視聴中に画面で見る「1位フロア熱狂 さん 5,105 …」公式貢献度ランキングの
 *   popup 鏡）は長らく未達だった。真因は、当該ランキングが watch ページ本体
 *   (live.nicovideo.jp, content script と同一 origin) の DOM には構造的に存在せず、
 *   別ドメインの SPA `koken.nicovideo.jp/supporter/...` 側にあり、かつその iframe が
 *   多くの配信で mount されない（rescue-link 配信者等）こと。
 *
 *   2026-05-19、koken SPA 本番バンドルの逆解析＋実 HTTP＋独立 WebFetch の 3 経路
 *   一致で、SPA がバックエンドで叩く無認証の公式 JSON API を確証した:
 *
 *     GET https://api.koken.nicovideo.jp/v1/userperspective/contents/gift/live/<lv>/ranking?rank=20
 *
 *   - 認証不要（cookie / X-Frontend-Id / 全ヘッダ省略でも 200。credentials:'omit'）。
 *   - `gift` と `nicoad`(広告) は URL パスの contributionType で構造分離。本経路は
 *     selector を一切使わないので、過去の「同型 DOM 広告混入事故(lv350481542)」
 *     class は原理的に発生しない。
 *   - レスポンス:
 *       { meta:{status:200},
 *         data:{ rankers:[ { rank, supporterId?, supporterName,
 *                            supporterThumbnailUrl, contribution, userPageUrl? } ] } }
 *     匿名行は supporterId / userPageUrl を欠き supporterName が "名無し"。
 *     不正 liveId / 配信なしは 200 + rankers:[]（「データ無し」と区別不可）。
 *   - CORS の都合上、本文を読めるのは拡張の service-worker（host_permissions
 *     特権 fetch）のみ。content/popup の直 fetch は CORS で本文取得不可。よって
 *     本モジュールは「URL 組立」と「生 JSON → 既存 ContributionRankerRow[] への
 *     正規化」だけを純粋に担い、fetch 自体は呼び出し側（SW）が行う。
 *
 *   正規化先は既存スクレイパ `scrapeContributionRankingFromDom`
 *   (officialEventBannerDom.js) と同一の ContributionRankerRow[] とし、popup 側の
 *   既存描画経路（resolveOfficialContributionRankingRows →
 *   refreshNorthStarContributionRankingLaneAsync）を一切変更せずに鏡表示できる。
 *
 * 副作用なし、純関数（fetch も storage も触らない）。
 *
 * @see src/lib/officialEventBannerDom.js - ContributionRankerRow (行スキーマの正本)
 * @see reference_koken_contribution_ranking_api - メモリ: API 確証の一次資料
 */

/**
 * @typedef {import('./officialEventBannerDom.js').ContributionRankerRow} ContributionRankerRow
 */

/**
 * content → service-worker の fetch 依頼メッセージ type。
 * service-worker（extension/background.js）は本定数を import できない（手書きの
 * build 成果物）ため、background 側は同じ文字列リテラルを直接使う（要・同期）。
 */
export const KOKEN_CONTRIB_FETCH_MESSAGE_TYPE = 'NLS_KOKEN_CONTRIB_FETCH';

/** ニコ生 liveId（`lv` + 数字）の厳格パターン。任意 URL 注入 / SSRF 面を塞ぐ。 */
const LIVE_ID_RE = /^lv\d{1,15}$/;

/**
 * koken API 由来の貢献度ランキングを置く chrome.storage.local キー。
 *
 * content（書込）/ popup（読込 fallback）/ content の stale prune の 3 箇所が
 * このキーで合意する必要があるため、ドリフト防止に単一の純関数に集約する
 * （既存 relay の `nls_iframe_official_dom_<lid>` とは別キー＝relay seam に
 * 一切触れず clobber 不能。banner-only relay が空配列を書いてフリッカする
 * 事故 class を構造的に排除する）。
 *
 * @param {string} liveId
 * @returns {string}
 */
export function kokenContribStorageKey(liveId) {
  return 'nls_koken_api_contrib_' + String(liveId == null ? '' : liveId).trim().toLowerCase();
}

/** {@link kokenContribStorageKey} の固定 prefix（prune 側の startsWith 判定用）。 */
export const KOKEN_CONTRIB_STORAGE_PREFIX = 'nls_koken_api_contrib_';

/**
 * koken 公式ギフト貢献度ランキング API の URL を組み立てる。
 *
 * liveId は厳格に検証する（呼び出し側の SW が任意文字列を fetch して
 * しまわないよう、不正なら null を返して呼び出し側で握りつぶす）。
 *
 * @param {string} liveId 例 "lv350522273"
 * @param {{ rank?: number }} [options] rank=取得件数。既定 20、1..100 に clamp。
 * @returns {string|null} 不正 liveId なら null
 */
export function buildKokenContributionRankingUrl(liveId, options = {}) {
  const lid = String(liveId == null ? '' : liveId).trim();
  if (!LIVE_ID_RE.test(lid)) return null;

  let rank = options && Number.isFinite(Number(options.rank)) ? Number(options.rank) : 20;
  rank = Math.trunc(rank);
  if (rank < 1) rank = 1;
  if (rank > 100) rank = 100;

  return (
    'https://api.koken.nicovideo.jp/v1/userperspective/contents/gift/live/' +
    encodeURIComponent(lid) +
    '/ranking?rank=' +
    rank
  );
}

/**
 * 生 JSON が koken ランキングレスポンスの概形か（meta.status と data.rankers）。
 *
 * @param {unknown} json
 * @returns {boolean}
 */
export function isLikelyKokenRankingShape(json) {
  if (!json || typeof json !== 'object') return false;
  const j = /** @type {Record<string, any>} */ (json);
  // meta.status は省略され得るが、在るなら 200 のみ受理
  if (j.meta && typeof j.meta === 'object' && j.meta.status != null) {
    if (Number(j.meta.status) !== 200) return false;
  }
  return !!(j.data && typeof j.data === 'object' && Array.isArray(j.data.rankers));
}

/**
 * http(s) URL だけ通す（thumbnail）。それ以外は空に倒す。
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeHttpUrl(value) {
  const s = String(value == null ? '' : value).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

/**
 * v0.1.316: niconico の「ユーザーページ」URL だけ通す。
 * 公式 API が返す userPageUrl をそのままリンク化に使うが、想定外ホストや
 * javascript: 等を弾く（推測ではなく公式提供値の検疫のみ）。
 * 受理形: https://www.nicovideo.jp/user/<digits>（クエリ/末尾スラッシュ許容）。
 * @param {unknown} value
 * @returns {string} 受理時は正規化 URL、非該当は ''
 */
function sanitizeNicoUserPageUrl(value) {
  const s = String(value == null ? '' : value).trim();
  if (!/^https:\/\//i.test(s)) return '';
  let u;
  try {
    u = new URL(s);
  } catch {
    return '';
  }
  if (u.hostname.toLowerCase() !== 'www.nicovideo.jp') return '';
  const m = u.pathname.match(/^\/user\/(\d{1,18})\/?$/);
  if (!m) return '';
  return `https://www.nicovideo.jp/user/${m[1]}`;
}

/**
 * koken 公式 API の生 JSON を、既存 popup 描画が読む ContributionRankerRow[] に
 * 正規化する。
 *
 * 設計上の安全条件:
 *   - meta.status!==200 / data.rankers 非配列 → null（呼び出し側は「rows>0 の
 *     ときだけ既存 storage を上書き」するので、null/空は既存値を保全＝fail-soft）。
 *   - 1 件も組み立てられなければ null（空配列でなく null。スクレイパと同じ規約）。
 *   - 匿名行（supporterId 欠落 or supporterName "名無し"）は isAnonymous:true、
 *     名前が空なら "名無し" に倒す（既存 UI officialDomRankingRowsToStripRooms の
 *     `userKeyKind:'contrib'` 経路で匿名キーが衝突しないようにする）。
 *   - サーバ提供順を信頼し再ソートしない（同点同 rank をそのまま保持）。
 *
 * @param {unknown} json koken API レスポンスの生 JSON（SW が res.json() したもの）
 * @returns {ContributionRankerRow[]|null}
 */
export function normalizeKokenRankingResponse(json) {
  if (!isLikelyKokenRankingShape(json)) return null;
  const rankers = /** @type {any[]} */ (
    /** @type {Record<string, any>} */ (json).data.rankers
  );

  /** @type {ContributionRankerRow[]} */
  const rows = [];
  for (let i = 0; i < rankers.length; i++) {
    const r = rankers[i];
    if (!r || typeof r !== 'object') continue;

    let rank = Number(r.rank);
    if (!Number.isFinite(rank) || rank <= 0) rank = i + 1;
    rank = Math.trunc(rank);

    const hasSupporterId =
      r.supporterId != null && String(r.supporterId).trim() !== '';
    let name = String(r.supporterName == null ? '' : r.supporterName).trim();
    const isAnonymous = !hasSupporterId || name === '名無し';
    if (!name) {
      if (isAnonymous) name = '名無し';
      else continue; // 記名なのに名前が無い壊れた行は捨てる
    }

    let contribution = Number(r.contribution);
    if (!Number.isFinite(contribution) || contribution < 0) contribution = 0;
    contribution = Math.trunc(contribution);

    // v0.1.316: 記名行は公式 API の userPageUrl（無ければ supporterId から組み立て）を
    // そのまま採用。匿名行（supporterId/userPageUrl 欠落）は付けない＝推測ゼロ・誤マージ不能。
    let userPageUrl = '';
    if (!isAnonymous) {
      const officialUrl = sanitizeNicoUserPageUrl(r.userPageUrl);
      if (officialUrl) {
        userPageUrl = officialUrl;
      } else if (/^\d{1,18}$/.test(String(r.supporterId).trim())) {
        userPageUrl = `https://www.nicovideo.jp/user/${String(r.supporterId).trim()}`;
      }
    }

    rows.push({
      rank,
      name,
      contribution,
      isAnonymous,
      thumbnailUrl: sanitizeHttpUrl(r.supporterThumbnailUrl),
      ...(userPageUrl ? { userPageUrl } : {})
    });
  }

  return rows.length > 0 ? rows : null;
}
