/**
 * chrome.storage.local キー（プレフィックスで衝突回避）
 */

export const KEY_RECORDING = 'nls_recording_enabled';

/**
 * 記録ON時、初回のコメント一覧 deep harvest を遅らせる＋ゆっくりローディングを出す。
 * false のときは従来どおり短い遅延のみ（記録が伸びやすいが一覧が動きやすい）。
 */
export const KEY_DEEP_HARVEST_QUIET_UI = 'nls_deep_harvest_quiet_ui';

/** ポップアップが「アクティブタブが watch 以外」のとき表示用（コンテンツスクリプトが更新） */
export const KEY_LAST_WATCH_URL = 'nls_last_watch_url';

/** 直近の chrome.storage.local 書き込み失敗（クォータ等）。成功時にコンテンツ側で削除する */
export const KEY_STORAGE_WRITE_ERROR = 'nls_storage_write_error';

/** 記録ON時にコメントパネル DOM が見つからない状態の警告（サイト改修の検知用・PII なし） */
export const KEY_COMMENT_PANEL_STATUS = 'nls_comment_panel_status';

/**
 * コメント取り込みの監査ログ（経路・件数のみ、最大件数は commentIngestLog で制限）。
 * 開発監視から JSON コピー・消去可能。
 */
export const KEY_COMMENT_INGEST_LOG = 'nls_comment_ingest_log_v1';

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

/**
 * 匿名・ハッシュ系 userId の応援タイルに、拡張内で一意の Identicon（SVG data URL）を出す。
 * 未設定は既定 ON。明示 false のときだけ OFF（ニコ公式 blank 等の従来フォールバック）。
 */
export const KEY_ANONYMOUS_IDENTICON_ENABLED = 'nls_anonymous_identicon_enabled_v1';

/**
 * 応援ランクストリップで匿名（a:xxxxx / ハッシュ系）ユーザーを折り畳む。
 * true（既定）のとき、数値 userId のユーザーを先に出し、匿名ユーザーは件数上位でも後ろに回す。
 * false のときは従来どおり件数順で純粋に並べる。
 */
export const KEY_FOLD_ANONYMOUS_IN_RANK_STRIP = 'nls_fold_anonymous_in_rank_strip_v1';

/** 応援ビジュアル詳細（ユーザーレーン・グリッド・診断ブロック）を開いているか */
export const KEY_SUPPORT_VISUAL_EXPANDED = 'nls_support_visual_expanded';

/** ポップアップ利用条件（外部アイコン・書き出し等）の同意済みフラグ */
export const KEY_USAGE_TERMS_ACK = 'nls_usage_terms_ack_v1';

/**
 * 将来の PRO / PREMIUM 等のエンタイトルメント（決済連携は別タスク）。
 * 値は `free` | `pro` | `premium` を想定。未設定は free 扱い。
 */
export const KEY_NL_ENTITLEMENT_TIER = 'nls_entitlement_tier_v1';

/** 音声入力: 使用するマイクの deviceId（空は既定） */
export const KEY_VOICE_INPUT_DEVICE = 'nls_voice_input_device';

/** 拡張から投稿したコメント（本文＋時刻）— 応援アイコンをこん太にする照合用 */
export const KEY_SELF_POSTED_RECENTS = 'nls_self_posted_recents';

/** userId 単位の表示名・個人サムネ URL（弱い既定アイコン以外）の永続キャッシュ */
export const KEY_USER_COMMENT_PROFILE_CACHE = 'nls_user_comment_profile_v1';

/**
 * UI の「キャッシュクリア」で chrome.storage.local から削除するキー。
 * 応援コメント記録（nls_comments_*）・ギフト記録・各種設定は含めない。
 */
export const EXTENSION_SOFT_CACHE_STORAGE_KEYS = Object.freeze([
  KEY_USER_COMMENT_PROFILE_CACHE
]);

/** 視聴ページインラインパネルの幅: 視聴ブロック全幅 or 動画幅のみ */
export const KEY_INLINE_PANEL_WIDTH_MODE = 'nls_inline_panel_width_mode';

/**
 * 視聴ページインラインパネルの DOM 位置。
 * `below`＝プレイヤー行の直下（flex 行の「横並び」に挟まない）。`beside`＝従来どおり親の flex 次第で横に付くことがある。
 * `floating`＝ツールバー型ポップアップのように画面右上付近に固定（プレイヤー DOM には挿入しない）。
 * `dock_bottom`＝画面下いっぱいに固定（プレイヤー DOM 非依存・未設定時の既定）。
 */
export const KEY_INLINE_PANEL_PLACEMENT = 'nls_inline_panel_placement';

/**
 * `floating` → `dock_bottom` のワンショット移行済み（再実行で上書きしない）。
 * @see migrateInlinePanelFloatToDock.js
 */
export const KEY_INLINE_PANEL_FLOAT_TO_DOCK_MIGRATED =
  'nls_inline_panel_float_to_dock_migrated';

/** @type {'below'} */
export const INLINE_PANEL_PLACEMENT_BELOW = 'below';
/** @type {'beside'} */
export const INLINE_PANEL_PLACEMENT_BESIDE = 'beside';
/** @type {'floating'} */
export const INLINE_PANEL_PLACEMENT_FLOATING = 'floating';
/** @type {'dock_bottom'} */
export const INLINE_PANEL_PLACEMENT_DOCK_BOTTOM = 'dock_bottom';

/** floating 配置時の画面角（ビューポート fixed）。未設定は top_right（従来挙動） */
export const KEY_INLINE_FLOATING_ANCHOR = 'nls_inline_floating_anchor';

/** @type {'top_right'} */
export const INLINE_FLOATING_ANCHOR_TOP_RIGHT = 'top_right';
/** @type {'bottom_left'} */
export const INLINE_FLOATING_ANCHOR_BOTTOM_LEFT = 'bottom_left';

/**
 * パネル内のループアニメ・チラ見せスクロールを止める（画面収録・スクショ向け）。
 * 未設定時は opts.inlineDefault に従う（埋め込みは既定でオン想定）。
 */
export const KEY_CALM_PANEL_MOTION = 'nls_calm_panel_motion';

/**
 * @param {unknown} raw
 * @param {{ inlineDefault?: boolean }} [opts]
 */
export function normalizeCalmPanelMotion(raw, opts = {}) {
  if (raw === true) return true;
  if (raw === false) return false;
  return opts.inlineDefault === true;
}

export const INLINE_PANEL_WIDTH_PLAYER_ROW = 'player_row';
export const INLINE_PANEL_WIDTH_VIDEO = 'video';

/** @param {unknown} raw */
export function normalizeInlinePanelWidthMode(raw) {
  const s = String(raw || '').trim();
  if (s === INLINE_PANEL_WIDTH_VIDEO) return INLINE_PANEL_WIDTH_VIDEO;
  return INLINE_PANEL_WIDTH_PLAYER_ROW;
}

/** @param {unknown} raw */
export function normalizeInlinePanelPlacement(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === INLINE_PANEL_PLACEMENT_BESIDE) return INLINE_PANEL_PLACEMENT_BESIDE;
  if (s === INLINE_PANEL_PLACEMENT_FLOATING) return INLINE_PANEL_PLACEMENT_FLOATING;
  if (s === INLINE_PANEL_PLACEMENT_BELOW) return INLINE_PANEL_PLACEMENT_BELOW;
  if (
    s === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM ||
    s === 'dock' ||
    s === 'bottom_dock'
  ) {
    return INLINE_PANEL_PLACEMENT_DOCK_BOTTOM;
  }
  if (!s) return INLINE_PANEL_PLACEMENT_DOCK_BOTTOM;
  return INLINE_PANEL_PLACEMENT_BELOW;
}

/** @param {unknown} raw */
export function normalizeInlineFloatingAnchor(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === INLINE_FLOATING_ANCHOR_BOTTOM_LEFT) return INLINE_FLOATING_ANCHOR_BOTTOM_LEFT;
  return INLINE_FLOATING_ANCHOR_TOP_RIGHT;
}

/** @param {unknown} raw */
export function isRecordingEnabled(raw) {
  return raw !== false;
}

/** @param {unknown} raw */
export function isDeepHarvestQuietUiEnabled(raw) {
  return raw !== false;
}

/** @param {unknown} raw */
export function isCommentEnterSendEnabled(raw) {
  return raw !== false;
}

/** @param {unknown} raw */
export function normalizeAnonymousIdenticonEnabled(raw) {
  return raw !== false;
}

/** @param {unknown} raw */
export function normalizeFoldAnonymousInRankStrip(raw) {
  return raw !== false;
}

/** @param {unknown} raw */
export function isUsageTermsAcknowledged(raw) {
  return raw === true;
}

/** @param {unknown} raw @returns {'free' | 'pro' | 'premium'} */
export function normalizeEntitlementTier(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'pro' || s === 'premium') return s;
  return 'free';
}

/**
 * マーケ分析 HTML をダウンロードするとき、トップコメンター列の表示名を伏せ、アイコン画像を出さない。
 * 他者への共有・掲載向け（既定 false）。
 */
export const KEY_MARKETING_EXPORT_MASK_LABELS = 'nls_marketing_export_mask_labels_v1';

/** @param {unknown} raw */
export function normalizeMarketingExportMaskLabels(raw) {
  return raw === true;
}

/** 開発監視トレンド（liveId ごと・chrome.storage.local） */
export const KEY_DEV_MONITOR_TREND_PREFIX = 'nls_dm_tr:';

/** @param {string} liveId */
export function devMonitorTrendStorageKey(liveId) {
  return `${KEY_DEV_MONITOR_TREND_PREFIX}${String(liveId || '').trim() || '_'}`;
}

/** @param {string} liveId lv123 */
export function commentsStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_comments_${id}`;
}

/** @param {string} liveId lv123 */
export function giftUsersStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_gift_users_${id}`;
}
