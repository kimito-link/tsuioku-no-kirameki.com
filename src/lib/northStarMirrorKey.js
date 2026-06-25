/**
 * 北極星レーン鏡(公式値レーン)の storage キー。
 *
 * popup が計算済みの北極星レーン(ギフト貢献度/広告/イベント等)の rows / mirrorHtml を間引いて
 * このキーに publish し、status が読んで純Web版(app/live-view)へ相乗り送信する。
 * laneMirror(KEY_LANE_MIRROR)/ statCardsMirror(KEY_STAT_CARDS_MIRROR)と同じ轍。
 *
 * @module northStarMirrorKey
 */

/** 北極星レーン鏡スナップショットの storage キー(全タブ共有・lv 非込みのグローバルキー)。 */
export const KEY_NORTH_STAR_MIRROR = 'nls_north_star_mirror_v1';
