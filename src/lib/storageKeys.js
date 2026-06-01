/**
 * chrome.storage.local キー（プレフィックスで衝突回避）
 */

export const KEY_RECORDING = 'nls_recording_enabled';

/**
 * 記録ON時、初回のコメント一覧 deep harvest を遅らせる＋キャラローディングを出す。
 * false のときは従来どおり短い遅延のみ（記録が伸びやすいが一覧が動きやすい）。
 */
export const KEY_DEEP_HARVEST_QUIET_UI = 'nls_deep_harvest_quiet_ui';

/** ポップアップが「アクティブタブが watch 以外」のとき表示用（コンテンツスクリプトが更新） */
export const KEY_LAST_WATCH_URL = 'nls_last_watch_url';

/** 直近の chrome.storage.local 書き込み失敗（クォータ等）。成功時にコンテンツ側で削除する */
export const KEY_STORAGE_WRITE_ERROR = 'nls_storage_write_error';

/**
 * 記録停止ウォッチドッグの直近スナップショット（自己診断の可視化用・local only）。
 * 「公式コメは増えているのに記録が伸びない」を検知して段階回復したときに content が書く。
 * dev オーバーレイがこれを読んで「書き込み停止検知→自動復旧（理由/回数）」を表示する。
 * 値: `{ at, liveId?, reason, attempt, recorded, official, actions }`。
 */
export const KEY_RECORDING_WATCHDOG = 'nls_recording_watchdog_v1';

/** AI共有・不具合調査用のエラーリング（最大80件・本文はマスク済み・local only） */
export const KEY_DIAGNOSTICS_ERROR_RING_V1 = 'nls_diagnostics_error_ring_v1';

/**
 * 同接推定の較正データ（リングバッファ・最大2000件・local only・PII なし）。
 * 推定算出のたびに throttled で 1 サンプル（A/B/C/D/blend・来場・コメ毎分・経過・
 * 公式同接があれば誤差）を積む。手動視聴と自動巡回(autopatrol)の両方が同じ器へ書く。
 * 後から CSV/JSON でエクスポートし、係数（avgSessionMin / perPersonCommentsPerMin /
 * 倍率）の較正に使う。キャッシュクリアでは消さない（EXTENSION_SOFT_CACHE_STORAGE_KEYS 非対象）。
 * @see src/lib/concurrentCalibrationLog.js
 */
export const KEY_CONCURRENT_CALIBRATION_RING_V1 =
  'nls_concurrent_calibration_ring_v1';

/**
 * 自動巡回（Phase 2b）の ON/OFF トグル。true のとき SW が公開ランキングから
 * 放送中 lv を拾い、背景タブで 1 つずつ短時間開いて較正データを貯める。既定 OFF。
 * popup が書き込み、background.js が storage.onChanged で即時 ON/OFF する。
 * @see extension/background.js（Autopatrol セクション）
 */
export const KEY_AUTOPATROL_ENABLED = 'nls_autopatrol_enabled_v1';

/** 自動巡回のランタイム状態（queue / visited / 現在タブ / 訪問数 / 最終エラー）。SW が書く。 */
export const KEY_AUTOPATROL_STATE = 'nls_autopatrol_state_v1';

/** 記録ON時にコメントパネル DOM が見つからない状態の警告（サイト改修の検知用・PII なし） */
export const KEY_COMMENT_PANEL_STATUS = 'nls_comment_panel_status';

/**
 * コメント取り込みの監査ログ（経路・件数のみ、最大件数は commentIngestLog で制限）。
 * 開発監視から JSON コピー・消去可能。
 */
export const KEY_COMMENT_INGEST_LOG = 'nls_comment_ingest_log_v1';

/** 5分ごとの自動バックアップ状態（最終バックアップ時刻など） */
export const KEY_AUTO_BACKUP_STATE = 'nls_auto_backup_state';

/**
 * v0.1.228: ギフトランキング取得経路（autoOpen / hidden iframe inject /
 * cross-origin iframe relay scrape）をユーザーが明示的に有効化したかを示す
 * グローバル設定。値: true なら有効、未設定または false なら opt-out（default）。
 *
 * 経緯: v0.1.226 / v0.1.227 の実機観測で、配信者ごとに公式 iframe の Vue が
 * 全く render しないケース（rich-view-status placeholder のまま）が多いと判明。
 * 取得試行（autoOpen）の副作用で「お困りの方はこちら」rescue link が広域に
 * 表示されてユーザー体験を損なうため、初期 OFF + 明示 ON 化に切り替える。
 */
export const KEY_GIFT_RANKING_LANE_ENABLED = 'nls_gift_ranking_lane_enabled';

/**
 * 過去ログ一括バックフィル（NDGR backward 巡回）の opt-in フラグ。
 * v0.1.405: 「途中から開いても配信の最初からコメントを取り込む」機能。連続 fetch
 * （cross-origin・throttle つき）を伴うため、初期 OFF + ユーザーが明示的にボタンを
 * 押したときだけ 1 回起動する（ワンショット）。ギフトランキングレーンと同作法。
 */
export const KEY_BACKFILL_ENABLED = 'nls_backfill_enabled';

/**
 * v0.1.418: 過去ログ取り込みの「自動開始」をユーザーが OFF にしたか。
 * 既定（未設定）は自動 ON＝配信を開いて記録 ON なら勝手に過去を取り込む（ユーザー要望
 * 「ボタンなしで勝手に取り込んだ方が楽」2026-05-27）。true を入れたときだけ自動を止め、
 * 従来どおり手動ボタン押下でのみ起動する。安全網（429 backoff・タブ非表示で中断・記録 ON
 * のみ・重複排除）は自動/手動で共通。
 */
export const KEY_BACKFILL_AUTO_DISABLED = 'nls_backfill_auto_disabled';

/**
 * v0.1.410: 過去ログ取り込みの進捗（りんく演出用）。content の publishBackfillProgress が
 * `{ lid, seg, rows, done, ts }` を書き、popup/インラインパネルが onChanged で読んで
 * りんくのセリフ（「○件あつめた！」「全部で○件✨」）・カウントアップ・動きを更新する。
 * data-nls-backfill 属性は親ページ DOM なので別フレームから読めない→storage で橋渡しする。
 */
export const KEY_BACKFILL_PROGRESS = 'nls_backfill_progress_v1';

/**
 * B案: NDGR 過去ログバックフィルを、vpos ヒューリスティックではなく backward /
 * previous ポインタ枯渇で完了判定する決定論エンジンへ切り替えるフラグ。
 * 検証中につき既定 OFF（旧 crawlNdgrBackward）。明示 true のときだけ新エンジンを使う opt-in。
 *   理由: バケット橋渡し（?at 再シードで前区画の ChunkedEntry を取り直す）が未実装で、
 *   1 バケット終端で誤 reached_start する恐れがあるため。橋渡し追加・実機検証後に既定 ON へ。
 */
export const KEY_NDGR_DETERMINISTIC_BACKFILL =
  'nls_ndgr_deterministic_backfill_enabled';

/**
 * v0.1.511: 前方向 NDGR 継続取得（crawlNdgrForward）の opt-in フラグ。
 * 既定 OFF（true 厳密一致でだけ有効）。リーダータブ 1 本が放送中ずっと NDGR の nextAt を
 * long-poll で辿り、page-intercept 傍受/DOM harvest が取りこぼした新着を独立経路で補う。
 * 連続 fetch（cross-origin・throttle つき）を伴うため、実機検証が済むまでは既定 OFF にする。
 */
export const KEY_NDGR_FORWARD_ENABLED = 'nls_ndgr_forward_enabled';

/**
 * v0.1.513: チャンクモード保存の dedupe を「毎フラッシュ全件 read+merge（O(N)）」から
 * インメモリ・インクリメンタル（O(追加分)）へ切り替える opt-in フラグ。
 *
 * 経緯: 4 万件超の巨大放送で、チャンクモードでも persist のたびに全チャンクを read して
 * mergeNewComments（O(N)）していたため、フラッシュごとにメインスレッドが詰まり「記録が
 * 増えない／パネルが裏でローディングのまま」になっていた。content 側で liveId ごとに
 * dedupe 状態（キー集合 + loneDedupe index）をインメモリに 1 回だけ構築し、以後は追加分
 * だけ照合して追記専用チャンクに append する。既定 OFF（true 厳密一致でだけ有効）にして
 * 段階導入し、実機検証後に既定 ON へ昇格する。
 */
export const KEY_INCREMENTAL_DEDUP_ENABLED = 'nls_incremental_dedup_enabled';

/**
 * v0.1.514: コメント本体の保存先を chrome.storage.local（値まるごと structured clone・
 * 約120 writes/min・50MB 超で劣化・多タブで単一ストアを奪い合い）から **IndexedDB**
 * （拡張オリジン・SW が単一書き手・popup が同一オリジンで直接読む）へ移す opt-in フラグ。
 *
 * 経緯（2026-05-31 世界事例リサーチ）: 4万件超×多タブで chrome.storage.local が構造的に
 * 限界に達し、保存と表示が単一ストアを奪い合って read/write が timeout → 「記録が増えない」
 * 「パネルが裏ロード継続/—固定」。IndexedDB は 1 件＝1 レコード追記・index 範囲読み/件数取得
 * （全件 deserialize 不要）・GB 級容量・書き込みレート制限なしで、サムネ（thumbDb.js）実績の
 * 作法。既定 OFF（true 厳密一致でだけ有効）にして段階導入し、実機検証後に既定 ON へ昇格する。
 * @see src/lib/commentDb.js / extension/background.js（NLS_CDB_*）
 */
export const KEY_COMMENT_IDB_ENABLED = 'nls_comment_idb_enabled';

/**
 * feat/multitab-scale-globalcap（2026-05-31）: IDB モードの「単一書き手」を ephemeral な
 * Service Worker（5分で停止し得る・append のたび DB open/close）から **Offscreen Document**
 * （MV3 で唯一の常駐 DOM 文脈・DB を開きっぱなしで保持）へ移す opt-in フラグ。
 *
 * 経緯: SW writer は (1) idle/5分で停止して append 往復が詰まる、(2) 全タブの append が
 * 1本に直列化して 1 タブの巨大バックフィルが他タブを待たせる、という弱点があった。Offscreen は
 * 常駐し DB を保持できるため、append のたびの open/close を避け、途中停止による取りこぼしも防ぐ。
 * ⚠️ Offscreen は chrome.runtime（messaging）と IndexedDB だけが使える（chrome.storage 不可）。
 * そこで summary / auto-backup state の chrome.storage 書きと初回移行は SW 側に残し、Offscreen は
 * IDB 追記＋件数集計＋ popup への BroadcastChannel 通知だけを担う。
 *
 * 既定 OFF（true 厳密一致でだけ有効）。OFF のときは従来どおり SW が IDB を直接書く（v0.1.515 経路）。
 * @see src/extension/offscreen-entry.js / extension/background.js（NLS_OFFSCREEN_CDB_*）
 */
export const KEY_CDB_OFFSCREEN_ENABLED = 'nls_cdb_offscreen_enabled';

/** popup/パネルが Offscreen からの件数 push を受ける BroadcastChannel 名。 */
export const CDB_BROADCAST_CHANNEL = 'nls_cdb_summary_channel_v1';

/**
 * IDB モードの軽量サマリ（件数 + 直近 N 件）を popup 初期描画用に置くキー。
 * SW（書き手）が append のたびに更新し、popup/パネルが onChanged で読む。
 * @param {string} liveId lv123
 */
export function commentDbSummaryKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_cdb_summary_${id}`;
}

/**
 * IDB モードで「既存 chrome.storage.local（main/chunk/tail）→ IDB」初回移行が済んだ印。
 * SW が live ごとに 1 回だけ移行し、これを true にする（再移行で二重投入しない）。
 * @param {string} liveId lv123
 */
export function commentDbMigratedKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_cdb_migrated_${id}`;
}

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

/**
 * 盛り上げパレット（8888 / wwww / 顔文字 等）で最近使った key を先頭に並べるための配列。
 * 上限 5 件想定（cheerPalette.js）。値は preset key の文字列配列。
 * @see src/lib/cheerPalette.js
 */
export const KEY_CHEER_RECENT_V1 = 'nls_cheer_recent_v1';

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

/** 応援タイムライン（コメント＋ギフトの時系列）を開いているか（v0.1.343・既定 false=閉じ） */
export const KEY_SUPPORT_TIMELINE_OPEN = 'nls_support_timeline_open_v1';

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
 * v0.1.533: コメンター（数値 userId）のフォロー/フォロワー数・プレミアム・LV を
 * userId 単位でためる横断キャッシュ（live を跨いで再利用）。レポートで「フォロワー数」を
 * 出すために使う。レート制限回避のため、巡回ごとに上位 N 名だけを数件ずつ取得し、
 * TTL 内（既定 24h）は再取得しない。値:
 *   { [userId]: { followerCount?, followeeCount?, isPremium?, level?, fetchedAt } }
 * 上限件数を超えたら fetchedAt が古いものから捨てる。キャッシュクリア対象。
 */
export const KEY_COMMENTER_FOLLOW_CACHE = 'nls_commenter_follow_v1';

/**
 * UI の「キャッシュクリア」で chrome.storage.local から削除するキー。
 * 応援コメント記録（nls_comments_*）・ギフト記録・各種設定は含めない。
 */
export const EXTENSION_SOFT_CACHE_STORAGE_KEYS = Object.freeze([
  KEY_USER_COMMENT_PROFILE_CACHE,
  KEY_COMMENTER_FOLLOW_CACHE
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

/**
 * 0.1.63 (AS): `below` → `dock_bottom` のワンショット移行済み（再実行で上書きしない）。
 *
 * 経緯: ニコ生の SPA リライト（toi）以降、`renderInlineHostAnchoredToVideo` の
 *   親要素探索（`findFrameInsertAnchorFromVideo`）が「視聴行 + コメント欄 +
 *   バナー一式を含む大きなラッパー」にヒットしてしまい、その直後 = description /
 *   Amazon / 関連配信の直前 にパネルが挿入されてしまう問題が発生。ユーザー証言
 *   「前はちゃんと出ていたが、いつからかページ最下部に出るようになった」の
 *   原因。`below` を選択しているユーザーを `dock_bottom`（fixed bottom 0）に
 *   ワンショットで移行して、まずは player と panel が常に viewport 上で
 *   セットで見える状態に戻す。
 *
 * @see migrateInlinePanelBelowToDock.js
 */
export const KEY_INLINE_PANEL_BELOW_TO_DOCK_MIGRATED =
  'nls_inline_panel_below_to_dock_migrated';

/**
 * インストール時、または拡張更新時に配置キーが未保存なら true。
 * content が初回タブ幅で nls_inline_panel_placement を一度だけ書き込んだら false。
 * @see migrateSuggestInitialInlinePanelPlacement.js / extension/background.js
 */
export const KEY_INSTALL_PANEL_PLACEMENT_PENDING =
  'nls_install_panel_placement_pending_v1';

/**
 * ユーザーが popup の「配置」ラジオで配置を明示選択したら true。
 * 一度立つと、below→dock / suggestInitial 等の移行が以後この値を上書きしない
 * （「横付きにしたのに下に戻る」= 保存が定着せず移行/既定で巻き戻る事象の防止）。
 * popup 保存成功時に nls_inline_panel_placement と同一 set でアトミックに書く。
 * @see inlinePanelPlacementStorage.js / migrateInlinePanelBelowToDock.js /
 *   migrateSuggestInitialInlinePanelPlacement.js / extension/background.js
 */
export const KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT =
  'nls_inline_panel_placement_user_explicit_v1';

/**
 * 視聴ページで extension のインラインパネルを自動表示するかどうか。
 * 既定 false（opt-in）。true を明示保存したときだけ自動で出る。
 *
 * 既定が opt-in な理由：ユーザーは「こん太アイコンを押す前から勝手に拡張が出る」
 * ことを UX 違和と感じた。視聴を邪魔しないために、既定ではツールバーを押したときだけ
 * パネルを前面化する。popup で「視聴ページを開いたらパネルを自動表示する」に
 * チェックを入れると従来互換（自動出現）に戻る。
 */
export const KEY_INLINE_PANEL_AUTOSHOW_ENABLED =
  'nls_inline_panel_autoshow_enabled';

/**
 * プレイヤー行の下／横付きのとき、パネル幅をタブ幅に近づける方針。
 * `off`＝従来どおり（compute の基準幅のみ）。`always`＝常に max(基準, タブ幅ベース)。
 * `once`＝可視タブで below/beside を初めて描画した1回だけ同様に広げ、その後は off 相当（未保存の既定は once）。
 * `once` 適用後は KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE。
 */
export const KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY =
  'nls_inline_panel_viewport_wide_v1';

/** `once` 方針を適用済みなら true（以降は基準幅のみ） */
export const KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE =
  'nls_inline_panel_viewport_wide_once_done_v1';

/** @type {'off'} */
export const INLINE_PANEL_VIEWPORT_WIDE_OFF = 'off';
/** @type {'always'} */
export const INLINE_PANEL_VIEWPORT_WIDE_ALWAYS = 'always';
/** @type {'once'} */
export const INLINE_PANEL_VIEWPORT_WIDE_ONCE = 'once';

/** @param {unknown} raw */
export function normalizeInlinePanelViewportWidePolicy(raw) {
  if (raw === undefined || raw === null) {
    return INLINE_PANEL_VIEWPORT_WIDE_ONCE;
  }
  const s = String(raw).trim().toLowerCase();
  if (s === '') return INLINE_PANEL_VIEWPORT_WIDE_ONCE;
  if (s === INLINE_PANEL_VIEWPORT_WIDE_ALWAYS) return INLINE_PANEL_VIEWPORT_WIDE_ALWAYS;
  if (s === INLINE_PANEL_VIEWPORT_WIDE_ONCE) return INLINE_PANEL_VIEWPORT_WIDE_ONCE;
  return INLINE_PANEL_VIEWPORT_WIDE_OFF;
}

/** @param {unknown} raw */
export function normalizeInlinePanelViewportWideOnceDone(raw) {
  return raw === true;
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function normalizeInlinePanelAutoshowEnabled(raw) {
  return raw === true;
}

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
  // v0.1.195: デフォルト OFF。「ランキング = 件数降順」というユーザーの直感に合わせる。
  // 既存ユーザーが明示 true で保存していれば opt-in として尊重する。
  return raw === true;
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

/**
 * v0.1.407: 配信ごとの「最後に取得した watch スナップショット」キャッシュキー。
 * popup/パネルを開き直した瞬間に前回値を即描画して「—／取得中…」フラッシュを消すため、
 * 取得成功時に書き、boot で読む（cached-first render）。
 * @param {string} liveId lv123
 */
export function watchSnapshotStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_watch_snapshot_${id}`;
}

/** @param {string} liveId lv123 */
export function giftUsersStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_gift_users_${id}`;
}

/**
 * v0.1.456 レジューム: 配信ごとの「過去ログ巡回で前回到達した最古コメント vpos」を保存する
 * キー。「もう一度ためす」押下や自動リトライ時にこれを読んで crawlNdgrBackward の
 * resumeFromVpos に渡し、前回の続きから掘り始める（同じ区画の取り直し＝dedupe 弾きで
 * 増えない問題の解消）。reached_start（配信開始まで到達）で完了したらクリアする。
 * @param {string} liveId lv123
 */
export function backfillResumeStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_backfill_resume_${id}`;
}

/**
 * niconico の watch ページ DOM から掬った
 *   - 配信者参加イベントバナー
 *   - イベント累計／番組累計バルーン
 *   - 視聴者貢献度ランキング
 *   - リアルタイム5値（来場・コメ・予約・広告・ギフト）
 * を 1 オブジェクトでまとめて保存するキー。ライブ中は popup 表示の正本、
 * 終了後は HTML レポート / マーケ分析の文脈ブロックとして読まれる。
 *
 * @param {string} liveId lv123
 */
export function eventDomStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_event_dom_${id}`;
}

/**
 * v0.1.198: niconico ギフト sub-app 由来の「個別ギフト履歴 + 種類別集計」を保存。
 * iframe 内の Vue サブアプリ DOM をスキャンした結果（gift-history-list / total-dold-count-list）
 * を popup へ受け渡すための専用キー。
 *
 *   {
 *     liveId, capturedAt,
 *     history: GiftHistoryItem[],   // 60+ 件の個別ギフト
 *     totalCounts: TotalGiftCountItem[]  // 33 種類の集計
 *   }
 *
 * @param {string} liveId lv123
 */
export function giftSubAppHistoryStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_gift_subapp_history_${id}`;
}

/**
 * v0.1.531: 配信者プロフィール（nvapi ユーザー情報＋プロフィールページ解析）の統合結果を保存。
 * レポートのヘッダーカードに「プレミアム会員・フォロー/フォロワー・LV・配信開始日・
 * 累計配信日数・欲しいものリスト」等を反映するための専用キー。取得できた項目だけ入る。
 *
 *   {
 *     userId, nickname, avatarUrl, pageUrl, level, isPremium,
 *     followeeCount, followerCount, broadcastStartDate,
 *     cumulativeBroadcastDays, wishlistUrl, broadcastRequestEnabled, capturedAt
 *   }
 *
 * @param {string} liveId lv123
 */
export function broadcasterProfileStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_broadcaster_profile_${id}`;
}

/**
 * v0.1.534: 配信ごとの「数値IDコメンター × フォロー/フォロワー」スナップショット。
 * 背後巡回で取得できた分を随時更新し、マーケ分析の全量表・JSON 埋め込みの正本にする。
 *
 *   {
 *     liveId, capturedAt,
 *     totalNumericCommenters, withFollowData,
 *     rows: [{ userId, commentCount, nickname, followerCount?, followeeCount?, level?, isPremium?, followFetchedAt? }]
 *   }
 *
 * @param {string} liveId lv123
 */
export function commenterFollowLiveStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_commenter_follow_live_${id}`;
}
