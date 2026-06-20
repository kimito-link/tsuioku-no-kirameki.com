/**
 * 会場モード(comeview)の読み上げ診断 storage キーの正本(producer=comeview / consumer=status で共有)。
 * 別ページ間で同じキーを使うため、リテラル散在を避けてここに集約(aiSharePopupDiagKey.js と同思想)。
 * v0.1.852。
 */
export const KEY_VOICE_DIAG = 'nls_voice_diag_v1';
