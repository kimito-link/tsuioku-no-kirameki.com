/**
 * chrome.storage.local キー（プレフィックスで衝突回避）
 */

export const KEY_RECORDING = 'nls_recording_enabled';

/** ポップアップが「アクティブタブが watch 以外」のとき表示用（コンテンツスクリプトが更新） */
export const KEY_LAST_WATCH_URL = 'nls_last_watch_url';

/** 直近の chrome.storage.local 書き込み失敗（クォータ等）。成功時にコンテンツ側で削除する */
export const KEY_STORAGE_WRITE_ERROR = 'nls_storage_write_error';

/** 5分ごとの自動バックアップ状態（最終バックアップ時刻など） */
export const KEY_AUTO_BACKUP_STATE = 'nls_auto_backup_state';

/** ポップアップの着せ替えフレーム設定 */
export const KEY_POPUP_FRAME = 'nls_popup_frame';

/** カスタムフレーム色設定 */
export const KEY_POPUP_FRAME_CUSTOM = 'nls_popup_frame_custom';

/** 定期サムネイル自動取得（記録ONとは独立） */
export const KEY_THUMB_AUTO = 'nls_thumb_auto_enabled';

/** サムネ取得間隔（ミリ秒）。0 はオフ扱い */
export const KEY_THUMB_INTERVAL_MS = 'nls_thumb_interval_ms';

/** 音声入力: 認識終了後に自動でコメント送信するか */
export const KEY_VOICE_AUTOSEND = 'nls_voice_autosend';

/** ポップアップコメント欄: Enter のみでも送信するか（ニコ生互換。既定オン） */
export const KEY_COMMENT_ENTER_SEND = 'nls_comment_enter_send';

/** 応援アイコン列（りんくグリッド）を折りたたむか（true で非表示） */
export const KEY_STORY_GROWTH_COLLAPSED = 'nls_story_growth_collapsed';

/** 音声入力: 使用するマイクの deviceId（空は既定） */
export const KEY_VOICE_INPUT_DEVICE = 'nls_voice_input_device';

/** 拡張から投稿したコメント（本文＋時刻）— 応援アイコンをこん太にする照合用 */
export const KEY_SELF_POSTED_RECENTS = 'nls_self_posted_recents';

/** 視聴ページインラインパネルの幅: 視聴ブロック全幅 or 動画幅のみ */
export const KEY_INLINE_PANEL_WIDTH_MODE = 'nls_inline_panel_width_mode';

export const INLINE_PANEL_WIDTH_PLAYER_ROW = 'player_row';
export const INLINE_PANEL_WIDTH_VIDEO = 'video';

/** @param {unknown} raw */
export function normalizeInlinePanelWidthMode(raw) {
  const s = String(raw || '').trim();
  if (s === INLINE_PANEL_WIDTH_VIDEO) return INLINE_PANEL_WIDTH_VIDEO;
  return INLINE_PANEL_WIDTH_PLAYER_ROW;
}

/** @param {unknown} raw */
export function isRecordingEnabled(raw) {
  return raw !== false;
}

/** @param {unknown} raw */
export function isCommentEnterSendEnabled(raw) {
  return raw !== false;
}

/** @param {string} liveId lv123 */
export function commentsStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_comments_${id}`;
}
