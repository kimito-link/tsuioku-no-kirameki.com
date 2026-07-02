/**
 * 鏡バンドルの storage キー。
 *
 * 5種類の鏡(応援レーン/数字カード/応援者ランキング/北極星/コメント流れ)を「同一 tick の 1 バンドル」
 * として 1 回の chrome.storage.local.set で書くための単一キー。①(popup)が書き、②③が読む。
 * 移行期は旧5キー(KEY_LANE_MIRROR 等)を同じ set に同梱して書くため、読み手は旧キーのままでも
 * 同一 tick 一貫になる(読み手のバンドル対応は後続フェーズ)。laneMirrorKey.js 等と同じ轍。
 *
 * @module mirrorBundleKey
 */

/** 鏡バンドルの storage キー(全タブ共有・lv 非込みのグローバルキー)。 */
export const KEY_MIRROR_BUNDLE = 'nls_mirror_bundle_v1';
