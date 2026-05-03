/**
 * アバター解決の単一エントリポイント（Hoshino-Romi 流 single component）。
 *
 * レイヤ: domain/ (pure)
 *
 * 現状（0.1.95 時点）: 未配線（dead code 状態）
 *   0.1.84 で実装、0.1.85 で `storyGrowthAvatarSrcCandidate` に部分配線したが、
 *   0.1.89 後の watchMeta 回帰の切り分けのため 0.1.90 で revert。その後の
 *   調査で回帰の真因は別経路（0.1.94 で解決した polling 周期と取得時間の
 *   race condition）と判明したため、配線 revert 自体は不要だったことが
 *   判明している。
 *
 *   このファイル本体と 22 ケースのテストは設計の正本として残置。
 *   再配線する際は `docs/plan-avatar-resolver-refactor.md` の 5 phase に沿って
 *   `storyGrowthAvatarSrcCandidate` から再開する。
 *
 * 設計（docs/plan-avatar-resolver-refactor.md / 0.1.84 Phase B）:
 *
 *   0.1.76〜0.1.83 で broadcaster icon 取り違えガードを 7 ファイルに分散
 *   実装してきたが、新しい観測経路を追加するたびにガードを継ぎ足す必要が
 *   あり、設計負債となっていた。
 *
 *   surechigai-lite (`hosino-romi/surechigai-lite-handoff`) の単一 store
 *   パターンを参考に、avatar 解決ロジックを 1 つの純粋関数に集約する。
 *
 *   入力: AvatarObservation[] + BroadcasterContext + ViewerContext
 *   出力: { displayUrl, observedKinds, rejected, hasNonCanonicalPersonalUrl }
 *
 *   全ての書き込み・読み出しはこの 1 関数を通すことで:
 *   - ガードが 1 箇所に集約され、新観測経路追加時もここだけ見れば良い
 *   - 型レベルで「broadcaster icon が viewer uid に紐付く」事故を防げる
 *   - テストが集中（10 ケースの contract test で全パターン担保）
 *
 *   既存の `resolveAvatarObservation` (avatar.js) との関係:
 *   - 当該関数は「観測ソース別 URL」を入力にとる古い API
 *   - 本 resolver は「AvatarObservation オブジェクト配列」を入力にとる新 API
 *   - 内部実装は重複させない（pickDisplayAvatarUrl 等の helper を再利用予定）
 *   - 段階的移行のため両方併存（Phase E で旧 API を deprecated）
 */

import { isAnonymousStyleNicoUserId } from './identity.js';
import {
  isSameAvatarUrl,
  extractNiconicoUserIdFromIconUrl,
  isAvatarUrlForUserId
} from '../../shared/avatar/avatarUrlGuard.js';

/**
 * @typedef {'dom'|'ndgr-entry'|'ndgr-map'|'stored'|'live-api'|'profile-cache'} AvatarObservationKind
 */

/**
 * @typedef {Object} AvatarObservation
 * @property {AvatarObservationKind} kind 観測元
 * @property {string} url 観測した URL（http(s) 必須）
 * @property {number} [observedAt] 観測時刻 ms（同 kind 内で最新を選ぶときに使う）
 */

/**
 * @typedef {Object} BroadcasterContext
 * @property {string} broadcasterUid 配信者 userId（不明時は ''）
 * @property {string} broadcasterIconUrl 配信者アイコン URL（不明時は ''）
 */

/**
 * @typedef {Object} ViewerContext
 * @property {string} viewerUid 視聴者本人の userId（不明時は ''）
 * @property {string} viewerAvatarUrl 視聴者本人のアイコン URL（不明時は ''）
 */

/**
 * @typedef {'broadcaster-impersonation'|'viewer-impersonation'|'invalid-url'|'uid-mismatch'} AvatarRejectReason
 */

/**
 * @typedef {Object} AvatarRejection
 * @property {AvatarObservationKind} kind
 * @property {AvatarRejectReason} reason
 * @property {string} url
 */

/**
 * @typedef {Object} AvatarResolveInput
 * @property {string} userId
 * @property {readonly AvatarObservation[]} observations
 * @property {BroadcasterContext} [broadcaster]
 * @property {ViewerContext} [viewer]
 */

/**
 * @typedef {Object} AvatarResolveResult
 * @property {string} displayUrl                                   UI の <img src> 用
 * @property {ReadonlySet<AvatarObservationKind>} observedKinds    ガード後に有効と認められた観測の kind 集合
 * @property {ReadonlyArray<AvatarRejection>} rejected             ガードでブロックされた観測（debug/metrics 用）
 * @property {boolean} hasNonCanonicalPersonalUrl                  「合成 canonical でない personal URL」が 1 つ以上あったか
 */

const CANONICAL_USERICON_HTTPS_PREFIX =
  'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/';

/** 表示優先順位（実観測が強い順） */
const KIND_PRIORITY = Object.freeze([
  'dom',
  'ndgr-entry',
  'ndgr-map',
  'live-api',
  'stored',
  'profile-cache'
]);

/**
 * 数値 userId から公式 usericon CDN の合成 URL を組み立てる。
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
 * http(s) URL か（trim 後）。
 * @param {unknown} url
 */
function isHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || '').trim());
}

/**
 * 単一観測のガード判定。書き込み時のフィルタにも利用可能。
 *
 * 判定順:
 *   1. URL が http(s) でない → invalid-url
 *   2. 普遍ルール（0.1.83）: URL の uid と userId が不一致 → uid-mismatch
 *   3. broadcaster なりすまし: URL から抽出した uid が broadcasterUid で
 *      かつ userId が broadcasterUid でない → broadcaster-impersonation
 *   4. broadcaster icon URL 完全一致（チャンネル等で uid 抽出不可な場合の補助）
 *      → broadcaster-impersonation
 *   5. viewer なりすまし: viewer avatar と URL 一致で userId が viewer でない
 *      → viewer-impersonation
 *   6. 通過 → safe
 *
 * @param {string} userId
 * @param {AvatarObservation} observation
 * @param {BroadcasterContext} [broadcaster]
 * @param {ViewerContext} [viewer]
 * @returns {{ safe: true } | { safe: false, reason: AvatarRejectReason }}
 */
export function isObservationSafe(userId, observation, broadcaster, viewer) {
  const url = String(observation?.url || '').trim();
  if (!isHttpUrl(url)) return { safe: false, reason: 'invalid-url' };

  const uid = String(userId || '').trim();

  // 普遍ルール（0.1.83）: 数値 niconico uid 同士で URL 内 uid と一致を要求
  if (!isAvatarUrlForUserId(url, uid)) {
    return { safe: false, reason: 'uid-mismatch' };
  }

  const bUid = String(broadcaster?.broadcasterUid || '').trim();
  const bIcon = String(broadcaster?.broadcasterIconUrl || '').trim();

  if (bUid) {
    // broadcaster icon URL 完全一致
    if (bIcon && isSameAvatarUrl(url, bIcon) && uid !== bUid) {
      return { safe: false, reason: 'broadcaster-impersonation' };
    }
    // URL から抽出した uid が broadcaster と一致（サイズバリアント吸収）
    const urlUid = extractNiconicoUserIdFromIconUrl(url);
    if (urlUid && urlUid === bUid && uid !== bUid) {
      return { safe: false, reason: 'broadcaster-impersonation' };
    }
  }

  // viewer なりすまし防止（同型バグの予防）
  const vUid = String(viewer?.viewerUid || '').trim();
  const vAvatar = String(viewer?.viewerAvatarUrl || '').trim();
  if (vUid && vAvatar && isSameAvatarUrl(url, vAvatar) && uid !== vUid) {
    return { safe: false, reason: 'viewer-impersonation' };
  }

  return { safe: true };
}

/**
 * accepted observations から表示 URL を選ぶ（kind 優先順 → 同 kind 内は最新 observedAt）。
 *
 * @param {AvatarObservation[]} accepted
 * @returns {string}
 */
function pickDisplayUrlFromAccepted(accepted) {
  for (const kind of KIND_PRIORITY) {
    const sameKind = accepted.filter((o) => o.kind === kind);
    if (sameKind.length === 0) continue;
    sameKind.sort((a, b) => (b.observedAt || 0) - (a.observedAt || 0));
    return sameKind[0].url;
  }
  return '';
}

/**
 * 全 avatar 解決の単一エントリポイント。
 *
 * @param {AvatarResolveInput|null|undefined} input
 * @returns {AvatarResolveResult}
 */
export function resolveAvatar(input) {
  const userId = String(input?.userId || '').trim();
  const observations = Array.isArray(input?.observations)
    ? input.observations
    : [];
  const broadcaster = input?.broadcaster;
  const viewer = input?.viewer;

  /** @type {AvatarObservation[]} */
  const accepted = [];
  /** @type {AvatarRejection[]} */
  const rejected = [];

  for (const obs of observations) {
    if (!obs || typeof obs !== 'object') continue;
    const verdict = isObservationSafe(userId, obs, broadcaster, viewer);
    if (verdict.safe === false) {
      rejected.push({
        kind: obs.kind,
        reason: verdict.reason,
        url: String(obs.url || '')
      });
    } else {
      accepted.push(obs);
    }
  }

  // 表示 URL 選択
  let displayUrl = pickDisplayUrlFromAccepted(accepted);

  // 観測ゼロのフォールバック: 数値 ID は canonical 合成、匿名は空
  if (!displayUrl && userId && !isAnonymousStyleNicoUserId(userId)) {
    displayUrl = synthesizeCanonicalUsericon(userId);
  }

  // 観測 kind 集合
  /** @type {Set<AvatarObservationKind>} */
  const observedKinds = new Set(accepted.map((o) => o.kind));

  // 「合成 canonical でない personal URL」検出
  const hasNonCanonicalPersonalUrl = accepted.some(
    (o) => !o.url.startsWith(CANONICAL_USERICON_HTTPS_PREFIX)
  );

  return Object.freeze({
    displayUrl,
    observedKinds: /** @type {ReadonlySet<AvatarObservationKind>} */ (observedKinds),
    rejected: Object.freeze(rejected),
    hasNonCanonicalPersonalUrl
  });
}
