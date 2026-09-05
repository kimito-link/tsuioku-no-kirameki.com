// feature-map.mjs
// コードベースの「機能ごとマインドマップ」を自動生成する(2026-06-17 会議結論)。
//
// 動機(実バグ): 会場モード(venueBar)に配信者サムネが匿名混入したバグの真因は、
//   content-entry が持つ broadcaster 情報が venueBar に「届く経路が無い」こと=
//   storage を介したデータの流れが途切れていたのに誰の目にも見えていなかった。
//   → 「誰が書き・誰が読むか」を機械的に可視化すれば、この種の断線が一目で分かる。
//
// 設計(会議4役一致+司令塔の裏取り):
//   - 機能境界 = esbuild の entry(=バンドル境界=実行コンテキスト)を起点にする。
//     build.mjs が既に 9 entry を明示しており、それがそのまま機能単位。新規依存ゼロ。
//   - データソースの優先度: ①storage キーの producer/consumer(今回のバグの核) ②import グラフ。
//   - 出力 = 機能ごとに分割した Mermaid を Markdown へ(AIはテキストで読め、人間はGitHubで図に)。
//     docs/feature-map/ に焼く(dist には入れない=配布物を汚さない)。
//
// 重い新規依存は入れない方針: esbuild(既存)の metafile で import グラフを取り、
//   storage キーは正規表現で抽出する(@babel/parser や graphlib は使わない)。
//   この種の自前静的解析は scan-dead-lib.mjs と同じ流儀。

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const SRC = join(ROOT, 'src');
const OUT_DIR = join(ROOT, 'docs', 'feature-map');

/** --check: 再生成して tracked 出力と差分が出たら / 新規の storage 断線が出たら exit 1。 */
const CHECK_MODE = process.argv.includes('--check');
/** @type {string[]} check モードで検出した問題。 */
const checkProblems = [];

/**
 * 生成物を「書く(通常)」or「既存と比較(check)」する。OUT_DIR 相対のファイル名で受ける。
 * @param {string} filename
 * @param {string} content
 */
function emit(filename, content) {
  const full = join(OUT_DIR, filename);
  if (CHECK_MODE) {
    let cur = '';
    try {
      cur = readFileSync(full, 'utf8');
    } catch {
      cur = '';
    }
    if (cur !== content) {
      checkProblems.push(`drift: docs/feature-map/${filename} が最新ではありません(\`npm run feature-map\` を実行してコミット)`);
    }
  } else {
    writeFileSync(full, content, 'utf8');
  }
}

/**
 * build.mjs と同じ entry → 機能名の対応表(機能境界の正本)。
 * build.mjs が entry を増やしたらここも足す(意図的に手で名付ける=機能名は人間が決める)。
 * @type {{ entry: string, feature: string, label: string }[]}
 */
const FEATURES = [
  { entry: 'src/extension/content-entry.js', feature: 'content', label: '記録エンジン(watchページ常駐)' },
  { entry: 'src/extension/popup-entry.js', feature: 'popup', label: 'ポップアップ(応援レーン)' },
  { entry: 'src/extension/venue-entry.js', feature: 'venue', label: '会場モード(standalone)' },
  { entry: 'src/extension/comeview-entry.js', feature: 'comeview', label: 'コメビュ(別窓)' },
  { entry: 'src/extension/status-entry.js', feature: 'status', label: '状態速報ページ' },
  { entry: 'src/extension/offscreen-entry.js', feature: 'offscreen', label: 'コメント IDB 書き手' },
  { entry: 'src/extension/backfill-sw-entry.js', feature: 'backfill-sw', label: 'バックフィル SW' },
  { entry: 'src/extension/page-intercept-entry.js', feature: 'page-intercept', label: 'ページ傍受' },
  { entry: 'app/app.js', feature: 'web-status', label: 'Web版 状態(スマホ)' }
];

/** 解析から除外するパス断片。 */
const EXCLUDE = [/\.test\.js$/, /node_modules/];

/**
 * storage 断線の「既知の疑い」ベースライン(2026-06-18 時点の全件)。
 * 大半は MVP 静的解析の偽陽性(設定キーを lib 純関数経由で set / background.js・offscreen で書く 等)。
 * `--check` は **この一覧に無い新規の断線が出たときだけ失敗**する(=本物の新規断線=今回の broadcaster バグ型を検知)。
 * 偽陽性が将来解消されたら(producer/consumer が両方付いたら)この一覧から消えても check は通る(緩む方向は安全)。
 * 新しいキーを足して意図的に producer/consumer 片方だけなら、ここに1行足してから再生成する。
 */
/**
 * ★DOM属性の「書き手↔読み手」断線ベースライン(2026-08-21 時点の全件)。
 *
 * ■ なぜ要るか(ユーザー方針:「まず丸ごと理解。改善はそのあと」)
 *   既存の地図(code-tree/feature-map)は **ファイル単位**で 99.3% 網羅している。
 *   それでも 2026-08-21 に見つかった不具合5件は **1件も検出できなかった**。
 *   ★共通点: どれも「値の書き手と読み手の対」の破れ＝**ファイルを読んでも見えない**。
 *   ★storage キーには既に同じ検出器(writeStorageBusMap)があり実際に効いている。
 *     storage-bus.md 自身が「将来は verify:map で機械判定する」と次の一手を書いていた。
 *   → **同じ形を DOM属性へ広げる**(新規発明はしない・正本を散らさない)。
 *
 * ■ ★静的解析だけで成立する根拠(実測・推測ではない)
 *   setAttribute('data-nls-…') のリテラル 31種 / ★動的生成(テンプレート・連結) 0件。
 *   ＝ このリポの DOM 属性名は全部リテラル。ランタイム計測は不要(過剰設計になる)。
 *   ★ただし定数経由の読みが実在する(content-entry.js:310 の NLS_AUTH_TOKEN_ATTR)ので
 *     **定数も解決する**。生文字列 grep だけだと誤って「読み手なし」と判定する
 *     (2026-08-21 に同型で iframe.nl-ifr-loading を死んだCSSと誤判定した)。
 *
 * ■ 掟(storage 側と同じ)
 *   --check は **この一覧に無い新規の断線が出たときだけ失敗**する。
 *   ＝ 既存の借金は一度に返さなくてよい / ★新しくサボると赤くなる。
 *   意図的に片側だけにするなら、ここに1行足してから再生成する。
 */
const DOM_ATTR_DISCONNECT_BASELINE = new Set([
  /* ── 🟠 書き手だけ: 読み手が【CSS(.html)】に居る ─────────────────
   * この解析は .js しか読まないので、CSS セレクタで使う属性は必ずここに出る。
   * ★偽陽性であって借金ではない(実コードで1件ずつ確認済み)。
   */
  'data-nl-popup-content-painted', 'data-nl-state', 'data-nl-support-wired',
  'data-nl-toolbar-only', 'data-nl-usage-terms-ack', 'data-nls-heat',
  'data-nls-hidden-injected', 'data-nls-warmup-state',
  // HTML 文字列側で組み立て、CSS が読む。
  'data-nl-score-final',

  /* ── 🟠 書き手だけ: 本当に読み手が居ない(★書きっぱなし＝消す候補) ──
   * ★これは偽陽性ではなく**実際の借金**。第2版以降で消す。
   * 消すときはこの行も一緒に消す(件数が減る方向は check を通る)。
   */
  'data-nls-ndgr-dedupe',            // 人間可読サマリ版。読むのは -dedupe-snapshot だけ
  'data-nls-ndgr-view-uri-count',    // getAttribute する箇所が repo 全体に無い
  'data-nls-intercept-visitor-probe', // sessionStorage フラグ ON 時だけの調査用
  'data-nls-backfill',               // popup は storage 経由で読む(属性は読まれない)
  'data-nls-backfill-diag',          // DevTools 目視専用
  'data-nls-page-intercept-href',    // 値が変わらないのに毎回書き直している(第2版で対処)
  'data-nls-page-intercept-referrer',// 同上

  /* ── 🔵 読み手だけ: 書き手が【静的HTML】に居る ────────────────
   * extension/popup.html に data-nl-trio-slot='rink' 等が直書きされている(6箇所)。
   * ★.html を読まない解析の構造的な偽陽性。
   */
  'data-nl-trio-slot'
]);

const STORAGE_DISCONNECT_BASELINE = new Set([
  'KEY_ANONYMOUS_IDENTICON_ENABLED', 'KEY_AUTOPATROL_ENABLED', 'KEY_AUTOPATROL_STATE',
  'KEY_BACKFILL_AUTO_DISABLED', 'KEY_BACKFILL_BG_KICK_ENABLED', 'KEY_BACKFILL_SW_MODE',
  'KEY_CALM_PANEL_MOTION', 'KEY_CDB_OFFSCREEN_ENABLED', 'KEY_COMMENTER_FOLLOWING_LIST_CACHE',
  'KEY_COMMENT_IDB_ENABLED', 'KEY_COMMENT_PANEL_AUTO_RESTORE', 'KEY_DEEP_HARVEST_QUIET_UI',
  'KEY_FOLD_ANONYMOUS_IN_RANK_STRIP', 'KEY_INCREMENTAL_DEDUP_ENABLED', 'KEY_INLINE_FLOATING_ANCHOR',
  'KEY_INLINE_PANEL_AUTOSHOW_ENABLED', 'KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT',
  'KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY', 'KEY_INLINE_PANEL_WIDTH_MODE', 'KEY_LAST_WATCH_URL',
  'KEY_MARKETING_EXPORT_MASK_LABELS', 'KEY_NDGR_DETERMINISTIC_BACKFILL', 'KEY_NDGR_FORWARD_ENABLED',
  'KEY_PAINT_PERF_RING_V1', 'KEY_PROFILE_RESOLVE_STATE', 'KEY_RECORDING', 'KEY_STORY_GROWTH_COLLAPSED',
  // v0.1.1271: 会場モードのボタンを出すか。producer=popup-entry.js(トグル保存)/
  //   consumer=content-entry.js(readVenueButtonVisible が chrome.storage.local.get で読む)。
  //   両方あるが、consumer 側が helper 関数の中で読むため静的解析が取りこぼす偽陽性。
  //   KEY_RECORDING(同じく readRecordingFlag 経由)と全く同型。
  'KEY_VENUE_BUTTON_VISIBLE',
  'KEY_SUPPORT_CELEBRATION_STATE', 'KEY_SW_PROGRESS', 'KEY_THUMB_AUTO', 'KEY_THUMB_INTERVAL_MS',
  'fn:backfillHeartbeatKey', 'fn:chunkMigratedKey', 'fn:comeviewPinStorageKey', 'fn:commentDbSummaryKey',
  'fn:eventDomStorageKey', 'fn:giftSubAppHistoryStorageKey', 'fn:perfDiagStorageKey', 'fn:tailStorageKey',
  // v0.1.1057: イベント順位変動→効果音の判定ロジックを popup-entry.js から
  //   src/lib/officialEventRankSoundEffect.js へ切り出したところ、producer(venueBar.js)/
  //   consumer(officialEventRankSoundEffect.js経由でpopup-entry.jsから到達)が別ファイルに
  //   分散し、静的解析がエントリ→lib への間接到達を追えず偽陽性で断線扱いになった。
  //   経路自体は実在(officialEventRankSoundEffect.test.js 8件緑・popup-entry.js:208で
  //   import済み)。KEY_EFFECT_SOUND_ENABLED は producer=popup-entry.js/consumer=venueBar.js、
  //   KEY_VENUE_EFFECT_SOUND_PRESENCE は producer=venueBar.js/consumer=officialEventRankSoundEffect.js。
  'KEY_EFFECT_SOUND_ENABLED', 'KEY_VENUE_EFFECT_SOUND_PRESENCE',
  // v0.1.991: 応援レーン(アイコン列)を heavy 非依存で起動する renderStoryUserLaneFromLightCommentsForCurrentLive が
  //   nls_csummary_<lv> を read。producer は content-entry.js(記録のたびに書く)=popup は consumer のみ=意図的な分離。
  'fn:summaryStorageKey',
  // content の producer は literal(`nls_gift_history_throws_${lid}`)で書くため、関数名キーの静的解析が
  // producer を取りこぼす偽陽性(実書込は content-entry.js・popup/live-view が読む。2026-06-21 確認)。
  'fn:giftHistoryThrowsStorageKey',
  'fn:watchSnapshotStorageKey', 'nls_backfill_progress_v1', 'nls_mcp_live_latest_v1',
  // v0.1.1090: ギフト個別イベント欠落配信のデルタ補完検知(giftDeltaFallback.js)向け。
  //   producer=content-entry.js(setStorageLocalSilentの引数内でofficialGiftPointsAggregateStorageKey(liveId)
  //   を直接呼ぶ=検出対象)。consumer=venueBar.js は先に変数へ束ねてから chrome.storage.local.get([...])/
  //   changes[key] で参照するため、fn:tailStorageKey/fn:commentDbSummaryKeyと同型の静的解析の
  //   取りこぼし(呼び出しがget/set呼び出しの引数領域の外)。経路自体は実在。
  'fn:officialGiftPointsAggregateStorageKey',
  // v0.1.1382: コメント書込モード計器(丸ごと書き戻し か チャンク追記か)。
  //   producer=content-entry.js:12542(storage.local.set の中で直接書く=検出される)。
  //   consumer=sidepanel-entry.js:644 は `chrome?.storage?.local?.get?.(KEY)` と
  //   **オプショナルチェーン呼び出し**で読むため、静的解析が consumer 側を取りこぼす偽陽性。
  //   ★経路は実在する(2026-08-12 に両側を目視確認・配線テスト
  //   src/lib/commentChunkModeFailOpen.wiring.test.js が producer/consumer の両方を断言する)。
  'KEY_COMMENT_WRITE_MODE_DIAG',
  // v0.1.1384: 拡張更新時の自動タブリロードの実行痕跡。
  //   producer=extension/background.js:833(SW 側の素のスクリプト=この検査の走査対象外)。
  //   consumer=src/extension/status-entry.js:829(extras で1キーだけ読み、速報の行に出す)。
  //   ★経路は実在する(2026-08-13 に両側を目視確認・配線テスト
  //   src/lib/autoTabReloadTrace.wiring.test.js が producer/consumer の両方を断言する)。
  'nls_last_auto_tab_reload',
  // popup が optional-chaining + computed key で set するため producer を静的解析が取りこぼす偽陽性
  // (実書込は popup-entry.js:collectAiShareDevMonitorPayloadBundle・status-entry.js が読む。2026-06-18 確認)
  'KEY_AI_SHARE_POPUP_DIAG',
  // 応援レーンの鏡(2026-06-23): PR1 で popup が producer のみ。status の consumer は後続 PR で繋ぐ
  //   (POP に並ぶべきものを診断にそっくり映す土台)。繋いだらこの行を外す。
  'KEY_LANE_MIRROR',
  // 応援ライブビュー公開ペイロード(2026-06-25): producer=status-entry / consumer=live-view-entry の
  //   【別バンドル間ハンドオフ】(status が書く→live-view が読んで POST)。静的解析はバンドルを跨げず
  //   片側しか見えない偽陽性。経路自体は実機(ブラウザ)で click→POST→公開URL 表示を確認済み。
  'KEY_LIVEVIEW_PUBLISH_PAYLOAD',
  // 送信結果のページ横断記録(2026-06-26・diagnostics-completeness 第3段): producer=status-entry +
  //   live-view-entry の両方が書く / consumer=status-entry が読む。根2(globalThis ページ別)の根治で
  //   storage に1件記録=どのページの公開ボタンで送っても status が「送信済み」を読める。意図的な構造。
  'KEY_LIVEVIEW_PUBLISH_OUTCOME',
  // コメントタイムライン鏡(2026-06-26・liveview-wholesale 第2段): producer=popup-entry / consumer=status-entry が
  //   jsonBlob に相乗り→純Web(app/live-view)が貼る。別バンドル間ハンドオフで静的解析は片側しか見えない偽陽性。
  //   純Webで「コメントが進む動き」を出すための最新N件鏡。経路は実機で確認予定。
  'KEY_COMMENT_TIMELINE_MIRROR',
  // 鏡バンドル統合(2026-07-02・v0.1.1036): 5鏡を1回の atomic set にまとめる mirrorBundleFlushScheduler の
  //   legacyPayload(動的キーのマップ)経由で書くようにしたため、popup-entry の literal `set({[KEY_X]:...})` が消え、
  //   静的解析が producer を取りこぼす偽陽性。実書込は popup-entry:mergeAndScheduleFlush(scheduler.legacyPayload を
  //   chrome.storage.local.set)・consumer は popup(②apply)/status/app。経路は同一 tick 一貫化のための意図的な間接化。
  'KEY_STAT_CARDS_MIRROR', 'KEY_TOP_SUPPORTERS_MIRROR', 'KEY_NORTH_STAR_MIRROR', 'KEY_STORY_DIAG_MIRROR',
  // マイ効果音の割当世代カウンタ(2026-07-05・Phase A・council/pachinko-ultimate-SYNTHESIS.md §1.2):
  //   producer は src/lib/customSoundStore.js#bumpCustomSoundRev が引数の storageLocal.set({[KEY]:...})
  //   経由で書く(chrome.storage.local を直接リテラルで触らない=テスト用にDI可能にした設計)ため、
  //   静的解析が producer を取りこぼす偽陽性。consumer は venueBar.js/popup-entry.js の
  //   storage.onChanged + status-entry.js の chrome.storage.local.get(直読み)。経路は実在
  //   (customSoundStore.test.js の bumpCustomSoundRev テストで確認済み)。
  'KEY_CUSTOM_SOUND_REV',
  // 操作音マスタートグル(2026-07-05・Phase D1・council/operation-sound-SYNTHESIS.md §4.2):
  //   producer は popup-entry.js:storageSetSafe({[KEY_OP_SOUND_ENABLED]:...})(opSoundEnabledToggle
  //   change ハンドラ)。storageSetSafe は引数の bag を chrome.storage.local.set(bag) に渡す薄いラッパー
  //   (拡張context無効化を静かに吸収する設計)のため、set 呼び出し引数にキーリテラルが直接現れず
  //   静的解析が producer を取りこぼす偽陽性。consumer は popup-entry.js の
  //   chrome.storage.local.get(KEY_OP_SOUND_ENABLED)(起動時キャッシュ)+ openBag 経由(refresh時)。
  //   経路は実在(storageKeys.test.js の isOpSoundEnabled テストで純関数側は確認済み)。
  'KEY_OP_SOUND_ENABLED',
  // 結果発表シーケンス計器(2026-07-06・SC3・council/broadcast-scoring-SYNTHESIS.md §2.1):
  //   producer は popup-entry.js:publishScoreAnnounceDiag が safeStorageLocalSet({[KEY]:...})で
  //   書く(検出対象・実際に見えている)。consumer は status-entry.js が直接 safeStorageLocalGet(KEY)
  //   するのではなく、statusExtrasBatch.js の EXTRAS_BATCH_KEYS 配列変数経由で
  //   safeStorageLocalGet(EXTRAS_BATCH_KEYS) を呼ぶ(KEY_HIGHLIGHT_LEDGER 等の既存20キーと同型の
  //   間接化)ため、引数領域に KEY_SCORE_ANNOUNCE_DIAG の識別子が現れず静的解析が consumer を
  //   取りこぼす偽陽性。経路は実在(statusExtrasBatch.test.js の pickExtrasBatchValues テストで
  //   scoreAnnounceDiag の受け渡しを確認済み・buildScoreAnnounceDiagLines が status-entry.js の
  //   概要行に描画する)。
  'KEY_SCORE_ANNOUNCE_DIAG',
  // 幕(全画面を覆う待ち画面)の計器(2026-08-19):
  //   producer は src/lib/panelWakeCurtainDom.js:publishCurtainDiag が
  //   chrome.storage.local.set({[KEY]:...}) で書く(検出対象)。
  //   consumer は status-entry.js が直接 get するのではなく、
  //   statusExtrasBatch.js の EXTRAS_BATCH_KEYS 配列変数経由で読む
  //   (KEY_SCORE_ANNOUNCE_DIAG 等の既存キーと同型の間接化)ため、
  //   引数領域に識別子が現れず静的解析が consumer を取りこぼす偽陽性。
  //   ★経路は実在し、panelWakeCurtain.wiring.test.js が
  //   【書き手2箇所と読み手】の両方を機械照合している(変異で赤を確認済)。
  'KEY_PANEL_WAKE_CURTAIN_DIAG'
]);

/**
 * @param {string} p
 * @returns {boolean}
 */
function isExcluded(p) {
  return EXCLUDE.some((re) => re.test(p));
}

/**
 * src 配下の全 .js を列挙する(test 除く)。
 * @returns {string[]} ROOT 相対パス
 */
function listSourceFiles() {
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (name.endsWith('.js') && !isExcluded(full)) {
        out.push(relative(ROOT, full).split('\\').join('/'));
      }
    }
  };
  walk(SRC);
  // app/app.js も解析対象(web-status entry)
  const appJs = join(ROOT, 'app', 'app.js');
  try {
    if (statSync(appJs).isFile()) out.push('app/app.js');
  } catch { /* app が無い構成は無視 */ }
  return out;
}

/**
 * esbuild の metafile から、各 entry が import で到達するファイル集合を得る。
 * @returns {Promise<Map<string, Set<string>>>} feature → 到達ファイル(ROOT相対)集合
 */
async function buildImportReach() {
  /** @type {Map<string, Set<string>>} */
  const reach = new Map();
  for (const f of FEATURES) {
    try {
      const result = await esbuild.build({
        entryPoints: [f.entry],
        bundle: true,
        write: false,
        metafile: true,
        format: 'iife',
        platform: 'browser',
        logLevel: 'silent',
        // 実ビルドの define を省略(到達グラフだけ欲しいので dead-code 除去の差は許容)。
        define: { NL_BUILD_ID: '""', NL_DEV_HOTRELOAD: 'false' }
      });
      const inputs = Object.keys(result.metafile.inputs)
        .map((p) => p.split('\\').join('/'))
        .filter((p) => p.startsWith('src/') || p.startsWith('app/'))
        .filter((p) => !isExcluded(p));
      reach.set(f.feature, new Set(inputs));
    } catch (err) {
      console.warn(`[feature-map] entry build failed: ${f.entry}: ${err?.message || err}`);
      reach.set(f.feature, new Set());
    }
  }
  return reach;
}

/**
 * `text` の `openIdx`(開き括弧 `(` の位置)から、対応する閉じ括弧までの中身を返す。
 * 括弧の深さを数えるだけの簡易版(文字列内の括弧も数えるが storage 実引数では稀)。
 * 対応が見つからない場合は安全側で最大 600 文字を返す。
 * @param {string} text
 * @param {number} openIdx `(` の index
 * @returns {string} 括弧の中身(括弧自身は含まない)
 */
function sliceBalancedArgs(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length && i < openIdx + 4000; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return text.slice(openIdx + 1, i);
    }
  }
  return text.slice(openIdx + 1, openIdx + 600);
}

/**
 * 1ファイルの中身から storage キーアクセスを抽出する。
 *
 * 拾うもの(MVP・今回のバグをカバーする最小):
 *   - chrome.storage.local.set({ [X]: ... }) / set({ 'lit': ... })  → producer
 *   - chrome.storage.local.get(X) / get('lit') / get([X, ...])      → consumer
 *   - chrome.storage.local.remove(X)                                 → producer(消す=書く側)
 *   X は KEY_ 定数名(識別子)か文字列リテラル。動的キー生成関数(xxxStorageKey(liveId))は
 *   "fn:xxxStorageKey" として記録する(値は配信ごとに変わるが producer/consumer の対は分かる)。
 *
 * @param {string} text ファイル内容
 * @returns {{ producers: Set<string>, consumers: Set<string> }}
 */
/**
 * 1ファイルから DOM属性の書き手/読み手を抽出する。
 *
 * ★storage 側(extractStorageAccess)と同じ形。producers=書く / consumers=読む。
 * ★定数経由(getAttribute(NLS_AUTH_TOKEN_ATTR))も解決する。
 *
 * @param {string} text
 * @param {Map<string, string>} globalConstAttr ★全ファイル横断の定数辞書(export された定数を跨いで解決)
 * @returns {{ producers: Set<string>, consumers: Set<string> }}
 */
function extractDomAttrAccess(text, globalConstAttr) {
  const producers = new Set();
  const consumers = new Set();

  /*
   * ★同じファイル内の `const NAME = 'data-…'` を先に集めて辞書にする。
   *   これが無いと定数経由の読みを取りこぼし、**実際には読まれている属性を
   *   「読み手なし」と誤判定**する(2026-08-21 に同型の誤判定をした)。
   */
  /** @type {Map<string, string>} */
  const constAttr = new Map(globalConstAttr || []);
  for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*['"](data-[a-z0-9-]+)['"]/g)) {
    constAttr.set(m[1], m[2]);
  }

  /**
   * リテラルならそのまま、識別子なら定数辞書で解決して target へ入れる。
   * @param {RegExp} re
   * @param {Set<string>} target
   */
  const harvest = (re, target) => {
    for (const m of text.matchAll(re)) {
      const lit = m[1];
      const ident = m[2];
      const attr = lit || (ident ? constAttr.get(ident) : '');
      if (attr && attr.startsWith('data-')) target.add(attr);
    }
  };

  /*
   * ★書き手は setAttribute のみ。removeAttribute は「消す」だけなので数えない
   *   (消し手を書き手に数えると、書き手不在の断線を隠してしまう)。
   */
  harvest(/\.setAttribute(?:\?\.)?\(\s*(?:['"](data-[a-z0-9-]+)['"]|([A-Za-z_$][\w$]*))/g, producers);
  // 読み手: getAttribute / hasAttribute
  harvest(/\.(?:getAttribute|hasAttribute)(?:\?\.)?\(\s*(?:['"](data-[a-z0-9-]+)['"]|([A-Za-z_$][\w$]*))/g, consumers);
  /*
   * 読み手: 属性セレクタ [data-…]。querySelector / CSS 文字列の両方を拾う。
   * ★これを入れないと「CSSでだけ使う属性」を読み手なしと誤判定する。
   */
  harvest(/\[\s*(data-[a-z0-9-]+)\s*[\]=~^$*|]/g, consumers);


  /*
   * ★dataset 表記も拾う。`el.dataset.nlRecording = v` は
   *   `data-nl-recording` を書いているのと同じ(camelCase ⇄ kebab-case)。
   *   ★これを拾わないと「書き手が居ない」と誤判定する
   *   (実際 data-nl-recording は popup-entry.js:15065 が dataset で書いている)。
   */
  const camelToKebab = (name) => 'data-' + name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  for (const m of text.matchAll(/\.dataset\.([A-Za-z][\w$]*)\s*=/g)) {
    const attr = camelToKebab(m[1]);
    if (attr.startsWith('data-')) producers.add(attr);
  }
  for (const m of text.matchAll(/\.dataset\.([A-Za-z][\w$]*)\s*(?![=\w])/g)) {
    const attr = camelToKebab(m[1]);
    if (attr.startsWith('data-')) consumers.add(attr);
  }


  /*
   * ★HTML文字列の中の属性も「書き手」。
   *   `\` data-nl-uid="${uid}"\`` のようにテンプレートで組み立てる書き方が実在する
   *   (supportTimelineHtml.js:106)。setAttribute だけを見ると
   *   ★実際には書かれている属性を「書き手なし」と誤判定する。
   */
  for (const m of text.matchAll(/\sdata-(nl|nls|nlsb)-([a-z0-9-]+)\s*=\s*["'`]/g)) {
    producers.add('data-' + m[1] + '-' + m[2]);
  }

  return { producers, consumers };
}

function extractStorageAccess(text) {
  const producers = new Set();
  const consumers = new Set();

  /**
   * 引数領域の文字列からキー名(KEY_定数 / 接頭辞付きリテラル / 動的キー関数)を target へ。
   * @param {string} argRegion
   * @param {Set<string>} target
   */
  const harvestKeys = (argRegion, target) => {
    // KEY_xxx 識別子(末尾まで=途切れさせない)
    for (const km of argRegion.matchAll(/\bKEY_[A-Z0-9_]+\b/g)) target.add(km[0]);
    // 'nls_...' / "cdb_..." などの直書きキーリテラル(storage キーらしい接頭辞のみ)
    for (const lm of argRegion.matchAll(/['"`]((?:nls|cdb|kcv)_[a-z0-9_]+)['"`]/gi)) target.add(lm[1]);
    // xxxStorageKey(...) / xxxKey(...) 動的キー生成関数呼び出し
    for (const fm of argRegion.matchAll(/\b([a-z][A-Za-z0-9]*(?:StorageKey|Key))\s*\(/g)) {
      const fn = fm[1];
      if (fn === 'localStorageKey') continue;
      target.add(`fn:${fn}`);
    }
  };

  // 呼び出しパターン: 正規表現で呼び出し頭を見つけ、引数領域(括弧の深さで正確に切る)から
  //   キーを拾う。文字列窓 slice で識別子が途切れる/隣の呼び出しを巻き込む v1 の反省を回避。
  //   - chrome.storage.local.get → consumer / set,remove → producer
  //   - setStorageLocalSilent(...) は content-entry.js 固有の set ラッパー → producer
  //     (これを拾わないと KEY_LIVE_BROADCASTER_CTX のように「書き手が見えない」誤検知が出る)
  //   - safeStorageLocalGet/Set/Remove(...)(v0.1.1080・src/lib/safeStorageLocal.js)は
  //     popup-entry.js/venueBar.js/status-entry.js 共通の context-invalidated 安全ラッパー。
  //     これを拾わないと Phase A〜D1 で追加した診断キー(KEY_VOICE_EFFECT_DIAG 等)が軒並み
  //     「書き手が見えない」誤検知になる(実際は producer/consumer とも実在)。
  /** @type {{ re: RegExp, role: 'producer'|'consumer' }[]} */
  const patterns = [
    { re: /chrome\.storage\.local\.get\s*\(/g, role: 'consumer' },
    { re: /chrome\.storage\.local\.(?:set|remove)\s*\(/g, role: 'producer' },
    { re: /\bsetStorageLocalSilent\s*\(/g, role: 'producer' },
    { re: /\bsafeStorageLocalGet\s*\(/g, role: 'consumer' },
    { re: /\bsafeStorageLocalSet\s*\(/g, role: 'producer' },
    { re: /\bsafeStorageLocalRemove\s*\(/g, role: 'producer' }
  ];
  for (const { re, role } of patterns) {
    const target = role === 'consumer' ? consumers : producers;
    while (re.exec(text) !== null) {
      const argRegion = sliceBalancedArgs(text, re.lastIndex - 1);
      harvestKeys(argRegion, target);
    }
  }
  return { producers, consumers };
}

/**
 * ファイル → どの機能に属するかを逆引き(複数機能に属しうる=共有 lib)。
 * @param {Map<string, Set<string>>} reach
 * @returns {Map<string, string[]>} ROOT相対ファイル → feature名配列
 */
function fileToFeatures(reach) {
  /** @type {Map<string, string[]>} */
  const map = new Map();
  for (const [feature, files] of reach) {
    for (const file of files) {
      const arr = map.get(file) || [];
      arr.push(feature);
      map.set(file, arr);
    }
  }
  return map;
}

/** Mermaid のノード ID に使える安全な識別子へ。 */
function nid(s) {
  return 'n_' + s.replace(/[^A-Za-z0-9]/g, '_');
}

/** Mermaid ラベル用エスケープ(改行・引用符の無害化)。 */
function mlabel(s) {
  return String(s).replace(/"/g, "'").replace(/[\r\n]+/g, ' ');
}

async function main() {
  if (!CHECK_MODE) mkdirSync(OUT_DIR, { recursive: true });

  const sourceFiles = listSourceFiles();
  const reach = await buildImportReach();
  const f2f = fileToFeatures(reach);

  // 各ファイルの storage アクセスを抽出。
  /** @type {Map<string, { producers: Set<string>, consumers: Set<string> }>} */
  const access = new Map();
  for (const file of sourceFiles) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    access.set(file, extractStorageAccess(text));
  }

  // storage キー → { producers: Set<file>, consumers: Set<file> }
  /** @type {Map<string, { producers: Set<string>, consumers: Set<string> }>} */
  const keyMap = new Map();
  const ensureKey = (k) => {
    if (!keyMap.has(k)) keyMap.set(k, { producers: new Set(), consumers: new Set() });
    return keyMap.get(k);
  };
  for (const [file, acc] of access) {
    for (const k of acc.producers) ensureKey(k).producers.add(file);
    for (const k of acc.consumers) ensureKey(k).consumers.add(file);
  }

  /*
   * ★DOM属性の書き手/読み手も同じ形で集める(2026-08-21)。
   *   ファイル単位の地図では見えない「値の対の破れ」を機械的に出す。
   */
  /** @type {Map<string, { producers: Set<string>, consumers: Set<string> }>} */
  const attrMap = new Map();
  const ensureAttr = (k) => {
    if (!attrMap.has(k)) attrMap.set(k, { producers: new Set(), consumers: new Set() });
    return attrMap.get(k);
  };
  /*
   * ★先に【全ファイル】の `const X = 'data-…'` を集める。
   *   定数は export されて別ファイルで使われる(例: INLINE_HOST_HIDDEN_ATTR は
   *   inlineHostVisibilityIntent.js:103 で定義し content-entry.js:2883 が書く)。
   *   ★ファイル内だけ見ると【実際には書かれている属性】を「書き手なし」と誤判定する。
   */
  /** @type {Map<string, string>} */
  const globalConstAttr = new Map();
  for (const file of sourceFiles) {
    const t = readFileSync(join(ROOT, file), 'utf8');
    for (const m of t.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*['"](data-[a-z0-9-]+)['"]/g)) {
      globalConstAttr.set(m[1], m[2]);
    }
  }
  for (const file of sourceFiles) {
    const acc = extractDomAttrAccess(readFileSync(join(ROOT, file), 'utf8'), globalConstAttr);
    for (const k of acc.producers) ensureAttr(k).producers.add(file);
    for (const k of acc.consumers) ensureAttr(k).consumers.add(file);
  }

  writeDomAttrBusMap(attrMap);
  writeStorageBusMap(keyMap);
  writeFeatureMaps(reach, access, f2f);
  writeImpactMap(f2f);
  writeIndex(keyMap);

  if (CHECK_MODE) {
    if (checkProblems.length) {
      for (const p of checkProblems) console.error(`[feature-map] ${p}`);
      process.exit(1);
    }
    console.log('[feature-map] up to date(生成物 drift なし・新規 storage 断線なし)。');
    return;
  }
  console.log(`feature-map: generated ${FEATURES.length} feature maps + storage-bus + impact-map into docs/feature-map/`);
}

/** feature 名 → 人間向けラベル(FEATURES の label)。 */
function featureLabel(feature) {
  const f = FEATURES.find((x) => x.feature === feature);
  return f ? f.label : feature;
}

/**
 * 影響範囲マップ(impact-map.md)。
 * 「このファイルを変えたら、どの機能(entry/バンドル)が壊れうるか」を逆引きで一覧化する。
 * f2f(file → 到達している feature 配列)を blast radius(波及機能数)の降順で並べる。
 * 既存の import 到達グラフ(buildImportReach)を再利用するだけ=新規 esbuild 実行も新依存もゼロ。
 * @param {Map<string, string[]>} f2f
 */
function writeImpactMap(f2f) {
  // 共有度(複数 feature に到達)の高い順 → 同数ならパス名順。
  const rows = [...f2f.entries()]
    .map(([file, feats]) => ({ file, feats: [...new Set(feats)].sort() }))
    .sort((a, b) => b.feats.length - a.feats.length || a.file.localeCompare(b.file));

  const lines = [];
  lines.push('# 影響範囲マップ（自動生成・このファイルを変えたら何が壊れるか）');
  lines.push('');
  lines.push('> `npm run feature-map` で再生成。手で編集しない。');
  lines.push('> 各 src/app ファイルが、どの機能(esbuild entry=バンドル)に取り込まれているかの逆引き。');
  lines.push('> **波及機能数(blast radius)が多いファイルほど、変更時の影響が大きい**(共有部品)。');
  lines.push('> 実装前にここで「触るファイルが何に波及するか」を確認すると誤前提を潰せる。');
  lines.push('');

  const widespread = rows.filter((r) => r.feats.length >= 3);
  if (widespread.length) {
    lines.push(`## ⚠️ 影響大（3機能以上に波及・${widespread.length} ファイル）`);
    lines.push('');
    lines.push('ここを変えると複数の実行コンテキストに影響する。変更時は各 feature の動作確認を。');
    lines.push('');
    for (const r of widespread) {
      lines.push(`- \`${r.file}\` → **${r.feats.length} 機能**: ${r.feats.map(featureLabel).join(' / ')}`);
    }
    lines.push('');
  }

  lines.push('## 全ファイルの波及先（機能数の多い順）');
  lines.push('');
  lines.push('| ファイル | 波及機能数 | 波及先(機能) |');
  lines.push('|---|---|---|');
  for (const r of rows) {
    lines.push(`| \`${r.file}\` | ${r.feats.length} | ${r.feats.map(featureLabel).join(' / ')} |`);
  }
  lines.push('');
  emit('impact-map.md', lines.join('\n'));

  // 機械可読版(impact-check.mjs が読む・markdown を parse させない)。labels も同梱。
  const json = {
    generatedBy: 'scripts/feature-map.mjs',
    files: rows.map((r) => ({
      file: r.file,
      featureCount: r.feats.length,
      features: r.feats,
      labels: r.feats.map(featureLabel)
    }))
  };
  emit('impact-map.json', JSON.stringify(json, null, 2) + '\n');
}

/**
 * DOM属性のデータバス図 + 断線検出を docs/feature-map/dom-attr-bus.md に出す。
 *
 * ★storage-bus と同じ形・同じ掟(ベースラインに無い新規の断線だけ --check を落とす)。
 *
 * @param {Map<string, { producers: Set<string>, consumers: Set<string> }>} attrMap
 */
/**
 * ★自分が所有する属性か(nl / nls / nlsb 接頭辞)。
 *
 * ★これで絞らないと **ニコ生本体の属性**(data-props / data-testid / data-user-id 等)が
 *   「読む人だけ」として大量に並ぶ。他人のDOMを読むだけなのは**正常**であって断線ではない。
 *   実測: 絞らないと 63件(うち38件が外部) → 絞ると 25件。
 * ★ノイズの多い検出器は読まれなくなって死ぬ。所有権で絞るのが正しい線引き。
 *
 * @param {string} attr
 * @returns {boolean}
 */
function isOwnDomAttr(attr) {
  return /^data-(nl|nls|nlsb)-/.test(attr);
}

function writeDomAttrBusMap(attrMap) {
  const lines = [];
  lines.push('# DOM属性 データバス図（自動生成）');
  lines.push('');
  lines.push('> `npm run feature-map` で再生成。手で編集しない。');
  lines.push('> `<html>` 等に書く `data-*` 属性ごとに「誰が書き(producer)・誰が読むか(consumer)」を示す。');
  lines.push('');
  lines.push('> ★なぜこの図が要るか: 既存の地図は**ファイル単位**で 99.3% 網羅しているのに、');
  lines.push('> 2026-08-21 の不具合5件を**1件も検出できなかった**。どれも「書き手↔読み手の対」の');
  lines.push('> 破れで、**1ファイルを読んでも見えない**種類だったため。storage キーには既に');
  lines.push('> 同じ検出器があり実際に効いていたので、**同じ形を DOM属性へ広げた**。');
  lines.push('');

  /** @type {string[]} */
  const producerOnly = [];
  /** @type {string[]} */
  const consumerOnly = [];
  for (const [k, v] of [...attrMap.entries()].sort()) {
    if (!isOwnDomAttr(k)) continue; // ★他人(ニコ生)の属性は対象外
    const hasP = v.producers.size > 0;
    const hasC = v.consumers.size > 0;
    if (hasP && !hasC) producerOnly.push(k);
    if (!hasP && hasC) consumerOnly.push(k);
  }

  /*
   * ★--check: ベースラインに無い【新規の断線】だけを失敗にする。
   *   既存の借金は一度に返さなくてよく、★新しくサボると赤くなる。
   *   このリポで生き残った仕掛けは全てこの形(未記入数の固定・バンドル予算)。
   */
  for (const k of [...producerOnly, ...consumerOnly]) {
    if (!DOM_ATTR_DISCONNECT_BASELINE.has(k)) {
      checkProblems.push(`新規の DOM属性 断線: "${k}"(書き手/読み手の片方しか無い)。経路を繋ぐか、意図的なら DOM_ATTR_DISCONNECT_BASELINE に追記`);
    }
  }

  lines.push('## ⚠️ 断線（書く人だけ / 読む人だけ）');
  lines.push('');
  lines.push('> 🟠 = 書いているが誰も読まない（書きっぱなし＝消す候補）');
  lines.push('> 🔵 = 読んでいるが誰も書かない（★常に空を読む＝バグの可能性が高い）');
  lines.push('');
  if (producerOnly.length === 0 && consumerOnly.length === 0) {
    lines.push('- (なし)');
  } else {
    for (const k of producerOnly) {
      const mark = DOM_ATTR_DISCONNECT_BASELINE.has(k) ? '' : ' ★新規';
      lines.push(`- 🟠 **${k}**${mark} — 書く人だけ: ${[...attrMap.get(k).producers].map(shortFile).join(', ')}`);
    }
    for (const k of consumerOnly) {
      const mark = DOM_ATTR_DISCONNECT_BASELINE.has(k) ? '' : ' ★新規';
      lines.push(`- 🔵 **${k}**${mark} — 読む人だけ: ${[...attrMap.get(k).consumers].map(shortFile).join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## 全属性');
  lines.push('');
  lines.push('| 属性 | 書く人(producer) | 読む人(consumer) |');
  lines.push('|---|---|---|');
  for (const [k, v] of [...attrMap.entries()].sort()) {
    if (!isOwnDomAttr(k)) continue;
    const ps = v.producers.size ? [...v.producers].map(shortFile).join('<br>') : '—';
    const cs = v.consumers.size ? [...v.consumers].map(shortFile).join('<br>') : '—';
    lines.push(`| \`${k}\` | ${ps} | ${cs} |`);
  }
  lines.push('');

  emit('dom-attr-bus.md', lines.join('\n'));
}

/**
 * storage を介したデータバス図 + 断線検出を docs/feature-map/storage-bus.md に出す。
 * @param {Map<string, { producers: Set<string>, consumers: Set<string> }>} keyMap
 */
function writeStorageBusMap(keyMap) {
  const lines = [];
  lines.push('# storage データバス図（自動生成）');
  lines.push('');
  lines.push('> `npm run feature-map` で再生成。手で編集しない。');
  lines.push('> chrome.storage.local のキーごとに「誰が書き(producer)・誰が読むか(consumer)」を示す。');
  lines.push('');

  // 断線検出: producer のみ / consumer のみ のキーを先に列挙(=今回のバグ型)。
  /** @type {string[]} */
  const producerOnly = [];
  /** @type {string[]} */
  const consumerOnly = [];
  for (const [k, v] of [...keyMap.entries()].sort()) {
    const hasP = v.producers.size > 0;
    const hasC = v.consumers.size > 0;
    if (hasP && !hasC) producerOnly.push(k);
    if (!hasP && hasC) consumerOnly.push(k);
  }

  // --check: ベースラインに無い【新規の断線】だけを失敗にする(既存の偽陽性は許容)。
  for (const k of [...producerOnly, ...consumerOnly]) {
    if (!STORAGE_DISCONNECT_BASELINE.has(k)) {
      checkProblems.push(`新規の storage 断線: "${k}"(producer/consumer の片方しか無い)。経路を繋ぐか、意図的なら STORAGE_DISCONNECT_BASELINE に追記`);
    }
  }

  lines.push('## ⚠️ 断線の疑い（書く人だけ / 読む人だけ）');
  lines.push('');
  lines.push('> 「書く人はいるが読む人がいない」「読む人はいるが書く人がいない」キー。');
  lines.push('> **これは「疑い」であって確定ではない**(MVP の静的解析の限界):');
  lines.push('> - 設定キー(`KEY_INLINE_*` 等)は書き手が lib の純関数経由で `storage.set` するため');
  lines.push('>   この解析が producer を取りこぼす → 「読む人だけ」に偽陽性で出る。');
  lines.push('> - 別コンテキスト(background.js・offscreen 等)や動的キー(`fn:xxxStorageKey`)で');
  lines.push('>   補完される正常ケースもある。');
  lines.push('> それでも **今回の broadcaster バグのような「経路がそもそも無い」断線はここに出る**。');
  lines.push('> 1件ずつ実コードで確認すること(将来は `verify:map` で機械判定する=会議 Q4)。');
  lines.push('');
  if (producerOnly.length === 0 && consumerOnly.length === 0) {
    lines.push('- (なし)');
  } else {
    for (const k of producerOnly) {
      lines.push(`- 🟠 **${k}** — 書く人だけ（読む経路が無い疑い）: ${[...keyMap.get(k).producers].join(', ')}`);
    }
    for (const k of consumerOnly) {
      lines.push(`- 🔵 **${k}** — 読む人だけ（書く経路が無い疑い）: ${[...keyMap.get(k).consumers].join(', ')}`);
    }
  }
  lines.push('');

  // 全キーの producer/consumer 表。
  lines.push('## 全 storage キー');
  lines.push('');
  lines.push('| キー | 書く人(producer) | 読む人(consumer) |');
  lines.push('|---|---|---|');
  for (const [k, v] of [...keyMap.entries()].sort()) {
    const p = [...v.producers].map(shortFile).join('<br>') || '—';
    const c = [...v.consumers].map(shortFile).join('<br>') || '—';
    lines.push(`| \`${k}\` | ${p} | ${c} |`);
  }
  lines.push('');

  emit('storage-bus.md', lines.join('\n'));
}

/** src/extension/foo.js → extension/foo.js のように短く。 */
function shortFile(f) {
  return f.replace(/^src\//, '');
}

/**
 * 機能ごとの Mermaid マップを docs/feature-map/<feature>.md に出す。
 * @param {Map<string, Set<string>>} reach
 * @param {Map<string, { producers: Set<string>, consumers: Set<string> }>} access
 * @param {Map<string, string[]>} f2f
 */
function writeFeatureMaps(reach, access, f2f) {
  for (const f of FEATURES) {
    const files = [...(reach.get(f.feature) || new Set())].sort();
    const lines = [];
    lines.push(`# 機能マップ: ${f.label}（\`${f.feature}\`）`);
    lines.push('');
    lines.push('> `npm run feature-map` で再生成。手で編集しない。');
    lines.push(`> 起点 entry: \`${f.entry}\``);
    lines.push('');

    // storage アクセス(この機能内のファイルが触るキー)。
    /** @type {Set<string>} */
    const writes = new Set();
    /** @type {Set<string>} */
    const reads = new Set();
    for (const file of files) {
      const acc = access.get(file);
      if (!acc) continue;
      for (const k of acc.producers) writes.add(k);
      for (const k of acc.consumers) reads.add(k);
    }

    lines.push('## storage の出入り');
    lines.push('');
    lines.push(`- 書くキー: ${writes.size ? [...writes].sort().map((k) => `\`${k}\``).join(', ') : '(なし)'}`);
    lines.push(`- 読むキー: ${reads.size ? [...reads].sort().map((k) => `\`${k}\``).join(', ') : '(なし)'}`);
    lines.push('');

    // import 到達ファイル(機能の構成要素)を Mermaid で。entry を中心に lib を周囲へ。
    lines.push('## 構成ファイル（import 到達・最大40件表示）');
    lines.push('');
    lines.push('```mermaid');
    lines.push('graph LR');
    lines.push(`  ${nid(f.feature)}["${mlabel(f.label)}"]`);
    const libs = files.filter((x) => x !== f.entry).slice(0, 40);
    for (const file of libs) {
      const shared = (f2f.get(file) || []).length > 1;
      const cls = shared ? ':::shared' : '';
      lines.push(`  ${nid(f.feature)} --> ${nid(file)}["${mlabel(shortFile(file))}"]${cls}`);
    }
    lines.push('  classDef shared fill:#eee,stroke:#999,color:#666;');
    lines.push('```');
    lines.push('');
    if (files.length - 1 > 40) {
      lines.push(`> ほか ${files.length - 1 - 40} ファイル省略（全件は storage-bus.md / metafile 参照）。`);
      lines.push('');
    }

    emit(`${f.feature}.md`, lines.join('\n'));
  }
}

/**
 * 索引(index.md)。各機能マップと storage-bus へのリンク。
 * @param {Map<string, { producers: Set<string>, consumers: Set<string> }>} keyMap
 */
function writeIndex(keyMap) {
  const lines = [];
  lines.push('# コードベース機能マップ（自動生成）');
  lines.push('');
  lines.push('> `npm run feature-map` で再生成。手で編集しない。');
  lines.push('> 機能境界は esbuild の entry(バンドル単位)。境界の正本は `scripts/feature-map.mjs` の FEATURES。');
  lines.push('');
  lines.push('## 機能ごとのマップ');
  lines.push('');
  for (const f of FEATURES) {
    lines.push(`- [${f.label}](${f.feature}.md) — \`${f.entry}\``);
  }
  lines.push('');
  lines.push('## データの流れ・影響範囲');
  lines.push('');
  lines.push(`- [storage データバス図](storage-bus.md) — 全 ${keyMap.size} キーの producer/consumer と断線検出`);
  lines.push('- [影響範囲マップ](impact-map.md) — このファイルを変えたら何が壊れるか(波及機能の逆引き)');
  lines.push('');
  emit('index.md', lines.join('\n'));
}

main().catch((err) => {
  console.error('feature-map failed:', err);
  process.exit(1);
});
