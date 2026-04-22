/**
 * 応援グリッド用タイル画像 URL の優先解決（純関数）
 */

/**
 * @param {unknown} url
 * @returns {boolean}
 */
export function isHttpOrHttpsUrl(url) {
  const s = String(url || '').trim();
  return /^https?:\/\//i.test(s);
}

/**
 * ニコニコ公式の未設定ユーザーアイコン（コメント欄等と同系のプレースホルダ画像）。
 * 拡張内の TV SVG より公式表示に揃える用途。
 */
export const NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS =
  'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg';

/**
 * 数字のユーザーIDから、ニコニコで広く使われる usericon CDN の URL を組み立てる。
 * DOM に img が無い行でも ID だけ取れていればタイルに他者アイコンを出せる。
 * 未設定アカウント等では 404 になり得る（ブラウザは既定の壊れ画像表示）。
 *
 * @param {unknown} userId
 * @returns {string} 組み立て不可時は空
 */
export function niconicoDefaultUserIconUrl(userId) {
  const s = String(userId || '').trim();
  if (!/^\d{5,14}$/.test(s)) return '';
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1) return '';
  const bucket = Math.max(1, Math.floor(n / 10000));
  return `https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/${bucket}/${s}.jpg`;
}

/**
 * ニコの usericon CDN らしい https URL か（厳密な検証ではない）
 * @param {unknown} url
 * @returns {boolean}
 */
export function looksLikeNiconicoUserIconHttpUrl(url) {
  const s = String(url || '').trim();
  if (!isHttpOrHttpsUrl(s)) return false;
  return /nicoaccount\/usericon|\/usericon\/|usericon\.nicovideo|\/usericon\/defaults\//i.test(
    s
  );
}

/**
 * 公式の「未設定アイコン」等のプレースホルダ URL。後から拾った個別 usericon で上書きしてよい。
 * @param {unknown} url
 * @returns {boolean}
 */
export function isWeakNiconicoUserIconHttpUrl(url) {
  const s = String(url || '').trim();
  if (!isHttpOrHttpsUrl(s)) return false;
  return /\/usericon\/defaults\//i.test(s);
}

/**
 * enrich 等で付与した「数字IDから式で組み立てた既定 usericon URL」と一致するか。
 * DOM 遅延読み込み後の実 URL で上書きする際の判定に使う。
 *
 * @param {unknown} avatarUrl
 * @param {unknown} userId 数字ID（5〜14桁）
 * @returns {boolean}
 */
export function isNiconicoSyntheticDefaultUserIconUrl(avatarUrl, userId) {
  const url = String(avatarUrl || '').trim();
  const uid = String(userId || '').trim();
  if (!isHttpOrHttpsUrl(url) || !/^\d{5,14}$/.test(uid)) return false;
  const expected = niconicoDefaultUserIconUrl(uid);
  return Boolean(expected && url === expected);
}

/**
 * ニコ生で「公式個別サムネ URL を式で組めない」ユーザー（匿名・ハッシュ・欠損）。
 * 数字 5〜14 桁のみ false（CDN usericon 推定の対象）。
 *
 * @param {unknown} userId
 * @returns {boolean}
 */
export function isAnonymousStyleNicoUserId(userId) {
  const s = String(userId || '').trim();
  if (!s) return true;
  if (/^\d{5,14}$/.test(s)) return false;
  if (/^a:/i.test(s)) return true;
  if (/^[a-zA-Z0-9_-]{10,26}$/.test(s)) return true;
  return true;
}

/**
 * http のサムネが無いとき: 匿名系は TV プレースホルダ、数字IDはニコの式 CDN（公式寄り）、それ以外はキャラ既定。
 *
 * @param {unknown} userId
 * @param {unknown} httpCandidate storyGrowthAvatarSrcCandidate 等（空可）
 * @param {unknown} yukkuriSrc
 * @param {unknown} tvSrc
 * @returns {string}
 */
export function pickSupportGrowthFallbackTileSrc(
  userId,
  httpCandidate,
  yukkuriSrc,
  tvSrc
) {
  if (isHttpOrHttpsUrl(httpCandidate)) {
    return String(httpCandidate).trim();
  }
  const y = String(yukkuriSrc || '').trim();
  const t = String(tvSrc || '').trim();
  if (isAnonymousStyleNicoUserId(userId)) {
    return t || y;
  }
  const syn = niconicoDefaultUserIconUrl(userId);
  if (isHttpOrHttpsUrl(syn)) return syn;
  return y || t;
}

/**
 * http サムネが無い匿名 userId に、Identicon data URL を差し込む（既定 ON、anonymousIdenticonEnabled が false のときだけ抑止）。
 *
 * @param {unknown} userId
 * @param {unknown} httpCandidate
 * @param {unknown} yukkuriSrc
 * @param {unknown} tvSrc
 * @param {{ anonymousIdenticonEnabled?: boolean, anonymousIdenticonDataUrl?: unknown }} [identiconOpts]
 * @returns {string}
 */
export function pickSupportGrowthTileWithOptionalIdenticon(
  userId,
  httpCandidate,
  yukkuriSrc,
  tvSrc,
  identiconOpts
) {
  if (isHttpOrHttpsUrl(httpCandidate)) {
    return String(httpCandidate).trim();
  }
  const uid = String(userId || '').trim();
  if (
    identiconOpts?.anonymousIdenticonEnabled !== false &&
    uid &&
    isAnonymousStyleNicoUserId(uid)
  ) {
    const data = String(identiconOpts.anonymousIdenticonDataUrl || '').trim();
    if (data) return data;
  }
  return pickSupportGrowthFallbackTileSrc(
    userId,
    httpCandidate,
    yukkuriSrc,
    tvSrc
  );
}

/**
 * @param {{
 *   entryAvatarUrl?: string|null,
 *   userId?: string|null,
 *   isOwnPosted?: boolean,
 *   viewerAvatarUrl?: string|null,
 *   defaultSrc: string
 * }} p
 * @returns {string}
 */
export function resolveSupportGrowthTileSrc(p) {
  const def = String(p.defaultSrc || '');
  if (isHttpOrHttpsUrl(p.entryAvatarUrl)) {
    return String(p.entryAvatarUrl).trim();
  }
  const derived = niconicoDefaultUserIconUrl(p.userId);
  if (isHttpOrHttpsUrl(derived)) {
    return derived;
  }
  if (p.isOwnPosted && isHttpOrHttpsUrl(p.viewerAvatarUrl)) {
    return String(p.viewerAvatarUrl).trim();
  }
  return def;
}

/**
 * 識別ユーザーレーン用: https サムネがあれば表示に使い、無ければ拡張内既定タイル。
 * @param {unknown} httpCandidate storyGrowthAvatarSrcCandidate 等の戻り（http(s) のみ）
 * @param {unknown} defaultTileSrc 例: STORY_GRID_DEFAULT_TILE_IMG
 * @returns {string}
 */
export function pickUserLaneDisplayTileSrc(httpCandidate, defaultTileSrc) {
  if (isHttpOrHttpsUrl(httpCandidate)) return String(httpCandidate).trim();
  return String(defaultTileSrc || '').trim();
}

/**
 * 表示タイルが既定に揃っても衝突しないユーザーレーン用の重複排除キー。
 * @param {{ userId?: unknown, avatarHttpCandidate?: unknown, stableId?: unknown }} p
 * @returns {string} 空ならレーンに載せない
 */
export function userLaneDedupeKey(p) {
  const u = String(p?.userId || '').trim();
  if (u) return `u:${u}`;
  if (isHttpOrHttpsUrl(p?.avatarHttpCandidate)) {
    return `t:${String(p.avatarHttpCandidate).trim()}`;
  }
  const s = String(p?.stableId || '').trim();
  if (s) return `s:${s}`;
  return '';
}

/**
 * 識別ユーザーレーンの並び替え用。大きいほど「個別サムネに近い」（式だけの既定 usericon や弱プレースホルダより優先）。
 *
 * @param {unknown} userId
 * @param {unknown} httpCandidate storyGrowthAvatarSrcCandidate 相当（https または空）
 * @returns {0|1|2}
 */
export function userLaneResolvedThumbScore(userId, httpCandidate) {
  const c = String(httpCandidate || '').trim();
  if (!isHttpOrHttpsUrl(c)) return 0;
  if (isWeakNiconicoUserIconHttpUrl(c)) return 0;
  const u = String(userId || '').trim();
  if (/^\d{5,14}$/.test(u) && isNiconicoSyntheticDefaultUserIconUrl(c, u)) return 1;
  return 2;
}

/**
 * enrich / マージで複数ソースの avatar URL を比較するときの強さ（大きいほど個人サムネに近い）。
 * @param {unknown} userId 数字 userId（合成既定 URL 判定用）
 * @param {unknown} url
 * @returns {0|1|2} 0=無効、1=弱/合成既定、2=個人サムネ相当
 */
export function commentEnrichmentAvatarScore(userId, url) {
  const c = String(url || '').trim();
  if (!isHttpOrHttpsUrl(c)) return 0;
  if (isWeakNiconicoUserIconHttpUrl(c)) return 1;
  const u = String(userId || '').trim();
  if (/^\d{5,14}$/.test(u) && isNiconicoSyntheticDefaultUserIconUrl(c, u)) return 1;
  return 2;
}

/**
 * 優先リスト順に候補を見て、最も強いサムネ URL を1つ選ぶ。同点なら先に渡した候補を残す（intercept 優先など）。
 *
 * @param {unknown} userId
 * @param {unknown[]} orderedCandidates 優先度の高い順（空要素は無視）
 * @returns {string}
 */
export function pickStrongestAvatarUrlForUser(userId, orderedCandidates) {
  const u = String(userId || '').trim();
  let best = '';
  let bestSc = 0;
  if (!Array.isArray(orderedCandidates)) return '';
  for (const raw of orderedCandidates) {
    const c = String(raw || '').trim();
    if (!c) continue;
    const sc = commentEnrichmentAvatarScore(u, c);
    if (sc > bestSc) {
      bestSc = sc;
      best = c;
    }
  }
  return best;
}
