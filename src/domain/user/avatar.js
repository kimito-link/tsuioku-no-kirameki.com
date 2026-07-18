/**
 * ユーザーのアバター観測信号と表示 URL を 1 箇所で組み立てる純関数。
 *
 * レイヤ: domain/ (pure)
 *
 * 設計方針（lane-architecture-redesign.md §2.2）:
 *
 *   旧設計では 1 つの `avatarUrl` 文字列が「表示に使う URL」と
 *   「tier 判定用の観測信号」を兼ねていた。ニコ生の個人アバターは合成
 *   canonical URL（`usericon/s/<bucket>/<uid>.jpg`）で配信される個体が多く、
 *   URL の形だけでは「本当に個人サムネがあるか」を判別できない。
 *
 *   そこで観測ソースを列挙型として扱い、Set<kind> にしまう。
 *   各 kind は「どの取得経路から URL が得られたか」を示す:
 *
 *     'dom'        … DOM から直接観測
 *     'ndgr-entry' … NDGR intercept の行エントリ
 *     'ndgr-map'   … NDGR intercept の userId→avatar マップ
 *     'stored'     … 永続ストレージから復元
 *     'live-api'   … live-api 応答から取得
 *
 *   link 段は `kinds.size >= 1` で昇格判定（`linkPolicy.js` 根拠 1）。
 *   加えて「合成 canonical ではない personal URL」が 1 つでも存在すれば
 *   `hasNonCanonicalPersonalUrl=true` を返す（`linkPolicy.js` 根拠 2）。
 *
 * このモジュールは `data/` 層に依存しない。呼び出し側が 5 ソースの文字列を
 * 集めてから渡す。取得の責務は `data/acquirers/` に閉じる予定。
 */

import { isAnonymousStyleNicoUserId } from './identity.js';

/**
 * @typedef {'dom'|'ndgr-entry'|'ndgr-map'|'stored'|'live-api'} AvatarObservationKind
 */

/**
 * @typedef {Object} AvatarObservationInput
 * @property {string} userId
 * @property {string} [dom]        DOM 観測の URL
 * @property {string} [ndgrEntry]  NDGR intercept 行の URL
 * @property {string} [ndgrMap]    NDGR userId→avatar map の URL
 * @property {string} [stored]     永続ストレージから復元した URL
 * @property {string} [liveApi]    live-api 応答から取得した URL
 */

/**
 * @typedef {Object} AvatarObservationResult
 * @property {string} displayAvatarUrl
 *   UI の <img src> に入れる URL。観測ソースが 1 つ以上あればその中から最優先、
 *   なければ数値 userId の合成 canonical にフォールバック、匿名は空。
 * @property {Set<AvatarObservationKind>} avatarObservationKinds
 *   URL が得られた観測ソース集合（link 段の昇格判定に使う）。
 * @property {boolean} hasNonCanonicalPersonalUrl
 *   いずれかの観測 URL が「ニコの合成 canonical 形でない」個人 URL か。
 */

const CANONICAL_USERICON_HTTPS_PREFIX =
  'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/';

/**
 * http(s) URL か（trim 後）。
 * @param {unknown} url
 * @returns {boolean}
 */
function isHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || '').trim());
}

/**
 * 数値 userId から公式 usericon CDN の合成 URL を組み立てる。
 * 合成 URL との一致比較にも使う。
 *
 * v0.1.1173(avatar-stability-DESIGN.md §B手順4・見送り): 正本 deriveAvatarUrlFromUid.js
 *   への委譲を試みたが、tests/contract/layer-dependency.test.js の依存方向契約
 *   (shared ← domain ← data ← ui ← extension)により domain/ から lib/ への import は
 *   禁止されておりNG。正本を shared/ 層へ移動する対応は7ファイル+テスト影響の大きい
 *   変更でありMVPスコープ外のため、このファイルの委譲は見送り式のまま維持する
 *   (CI構造ガード usericonUrlGuard.test.js の許可リストにも残置)。
 *
 * @param {string} userId
 * @returns {string}
 */
function synthesizeCanonicalUsericon(userId) {
  const s = String(userId || '').trim();
  if (!/^\d{5,14}$/.test(s)) return '';
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1) return '';
  const bucket = Math.max(1, Math.floor(n / 10000));
  return `${CANONICAL_USERICON_HTTPS_PREFIX}s/${bucket}/${s}.jpg`;
}

/**
 * URL が「ニコ公式の合成 canonical usericon」形か。
 * 合成 URL は link 判定の直接根拠にはしない（URL 形だけで個人か特定できないため）。
 *
 * @param {string} url
 * @returns {boolean}
 */
function isCanonicalUsericonUrl(url) {
  const s = String(url || '').trim();
  if (!isHttpUrl(s)) return false;
  return s.startsWith(CANONICAL_USERICON_HTTPS_PREFIX);
}

/**
 * 表示 URL を 1 つ選ぶ。優先度は「実観測が強い順」:
 *   dom > ndgr-entry > ndgr-map > live-api > stored > canonical fallback
 *
 * @param {AvatarObservationInput} input
 * @returns {string}
 */
function pickDisplayAvatarUrl(input) {
  const ordered = [
    input?.dom,
    input?.ndgrEntry,
    input?.ndgrMap,
    input?.liveApi,
    input?.stored
  ];
  for (const u of ordered) {
    const s = String(u || '').trim();
    if (isHttpUrl(s)) return s;
  }
  // 観測なしは数値 ID の合成 canonical にフォールバック（匿名は空）
  const uid = String(input?.userId || '').trim();
  if (!uid || isAnonymousStyleNicoUserId(uid)) return '';
  return synthesizeCanonicalUsericon(uid);
}

/**
 * 各観測ソースごとに URL の有無を見て kind を立てる。
 * 合成 canonical と一致する場合でも「観測された事実」は保持する。
 *
 * @param {AvatarObservationInput} input
 * @returns {Set<AvatarObservationKind>}
 */
function collectObservationKinds(input) {
  const kinds = new Set();
  if (isHttpUrl(input?.dom)) kinds.add('dom');
  if (isHttpUrl(input?.ndgrEntry)) kinds.add('ndgr-entry');
  if (isHttpUrl(input?.ndgrMap)) kinds.add('ndgr-map');
  if (isHttpUrl(input?.stored)) kinds.add('stored');
  if (isHttpUrl(input?.liveApi)) kinds.add('live-api');
  return kinds;
}

/**
 * 「合成 canonical ではない個人 URL」が観測されているか。
 * 外部 CDN / プロフィール画像などは canonical prefix に一致しないため true になる。
 *
 * @param {AvatarObservationInput} input
 * @returns {boolean}
 */
function hasNonCanonicalPersonalUrl(input) {
  const candidates = [
    input?.dom,
    input?.ndgrEntry,
    input?.ndgrMap,
    input?.stored,
    input?.liveApi
  ];
  for (const u of candidates) {
    const s = String(u || '').trim();
    if (!isHttpUrl(s)) continue;
    if (isCanonicalUsericonUrl(s)) continue;
    return true;
  }
  return false;
}

/**
 * アバター観測信号を 1 回のパスで組み立てる。
 *
 * @param {AvatarObservationInput|null|undefined} input
 * @returns {AvatarObservationResult}
 */
export function resolveAvatarObservation(input) {
  const safe = input || { userId: '' };
  return {
    displayAvatarUrl: pickDisplayAvatarUrl(safe),
    avatarObservationKinds: collectObservationKinds(safe),
    hasNonCanonicalPersonalUrl: hasNonCanonicalPersonalUrl(safe)
  };
}

/**
 * 旧 `avatarObserved` 単一 boolean から観測 kind Set を推定する互換 shim。
 * 置き換え期間中、data 層が新 API に移る前の呼び出し元で使う。
 *
 * 旧仕様では「何で観測したか」は記録していなかったので、便宜上 'dom' とする
 * （tier 判定は kinds.size>=1 しか見ないので kind の具体値は重要でない）。
 *
 * @param {boolean} avatarObserved
 * @returns {Set<AvatarObservationKind>}
 */
export function kindsFromLegacyObservedFlag(avatarObserved) {
  return avatarObserved ? new Set(['dom']) : new Set();
}
