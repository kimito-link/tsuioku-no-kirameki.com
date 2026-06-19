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
 * docs/ 直下(feature-map サブフォルダではない)へ生成物を書く/比較する。
 * spine-map は MAP.md / repo-tree-map.html と同階層に置く(全地図が docs/ 直下に並ぶ)。
 * @param {string} filename docs/ 相対のファイル名
 * @param {string} content
 */
function emitDocs(filename, content) {
  const full = join(ROOT, 'docs', filename);
  if (CHECK_MODE) {
    let cur = '';
    try {
      cur = readFileSync(full, 'utf8');
    } catch {
      cur = '';
    }
    if (cur !== content) {
      checkProblems.push(`drift: docs/${filename} が最新ではありません(\`npm run feature-map\` を実行してコミット)`);
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

/**
 * 「コードの背骨(spine)」= データの一生を4段に削いだ正本(2026-06-20 会議+世界事例リサーチ)。
 *
 * 狙い: 既存マップ(repo-tree-map=ディレクトリ羅列 / feature-map=網羅依存図 / storage-bus=全キー一覧)は
 *   どれも「網羅型」で細かい。今回ほしいのは枝葉を削いだ **背骨1本**=「取得→記録→集計→表示」を、
 *   ブラウザで開けば10秒で追える図。データの受け渡しは chrome.storage キー(=血管)で起きる断線
 *   (broadcaster バグ型)を赤で晒す。
 *
 * 設計判断(リサーチ結論):
 *   - 節(stage)は人間が決める正本(枝葉=個々の純関数は載せない)。`file` は実在必須=`--check` で消失検知。
 *   - 段間を渡る storage キー(`wires`)は人間が「背骨の血管」を選ぶが、producer/consumer と断線色は
 *     既存解析(keyMap)から機械が埋める=辞書はキー名だけ・状態は自動(腐らない)。
 *   - wires のキー名・file はすべて実コードで裏取り済み(storage-bus.md の実データと一致)。
 *
 * 節を足す/変えるとき: 実際に grep して「その段の代表ファイル」「段間を渡る実キー」を確かめてから直す。
 * @type {{
 *   stages: { id: string, label: string, emoji: string, desc: string, files: string[] }[],
 *   wires: { key: string, from: string, to: string, note: string }[]
 * }}
 */
const SPINE = {
  stages: [
    { id: 'acquire', label: '取得', emoji: '📡', desc: 'NDGR(protobuf直読み)+watch DOM観測でコメント/ギフトを集める',
      files: ['src/extension/content-entry.js', 'src/extension/page-intercept-entry.js'] },
    { id: 'record', label: '記録', emoji: '💾', desc: 'IndexedDB / chunk / tail バッファへ永続化(記録本体)',
      files: ['src/extension/content-entry.js', 'src/extension/offscreen-entry.js', 'src/extension/backfill-sw-entry.js'] },
    { id: 'aggregate', label: '集計', emoji: '🧮', desc: '保存データ→応援レーン/会場/ランキング/プロフィールへ畳み込む',
      files: ['src/domain', 'src/data', 'src/lib'] },
    { id: 'display', label: '表示', emoji: '🪟', desc: 'パネル(応援レーン)/会場/状態ページへ描く',
      files: ['src/extension/popup-entry.js', 'src/extension/venueBar.js', 'src/extension/status-entry.js'] }
  ],
  // 段間を渡る「血管」= 代表 storage キー(全て実コードで裏取り・storage-bus.md と一致)。
  // producer/consumer の実体・断線判定は keyMap から自動で埋める(ここはキー名と意味だけ)。
  wires: [
    { key: 'KEY_AI_SHARE_FAST_DIAG', from: 'acquire', to: 'display', note: '診断スナップショット(content→popup/status)' },
    { key: 'KEY_COMMENT_PANEL_STATUS', from: 'record', to: 'display', note: '記録パネルの状態(content→popup)' },
    { key: 'fn:chunkIndexKey', from: 'record', to: 'display', note: 'chunk 索引(content→popup)' },
    { key: 'KEY_BACKFILL_PROGRESS', from: 'record', to: 'display', note: '過去ログ取得の進捗(sw/content→popup)' },
    { key: 'KEY_USER_COMMENT_PROFILE_CACHE', from: 'aggregate', to: 'display', note: 'コメント者プロフィール(content→comeview/popup/venue)' },
    { key: 'KEY_LIVE_BROADCASTER_CTX', from: 'aggregate', to: 'display', note: '配信者本人の身元(content→venue)=過去の断線バグの経路' }
  ]
};

/** 解析から除外するパス断片。 */
const EXCLUDE = [/\.test\.js$/, /node_modules/];

/**
 * storage 断線の「既知の疑い」ベースライン(2026-06-18 時点の全件)。
 * 大半は MVP 静的解析の偽陽性(設定キーを lib 純関数経由で set / background.js・offscreen で書く 等)。
 * `--check` は **この一覧に無い新規の断線が出たときだけ失敗**する(=本物の新規断線=今回の broadcaster バグ型を検知)。
 * 偽陽性が将来解消されたら(producer/consumer が両方付いたら)この一覧から消えても check は通る(緩む方向は安全)。
 * 新しいキーを足して意図的に producer/consumer 片方だけなら、ここに1行足してから再生成する。
 */
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
  'KEY_SUPPORT_CELEBRATION_STATE', 'KEY_SW_PROGRESS', 'KEY_THUMB_AUTO', 'KEY_THUMB_INTERVAL_MS',
  'fn:backfillHeartbeatKey', 'fn:chunkMigratedKey', 'fn:comeviewPinStorageKey', 'fn:commentDbSummaryKey',
  'fn:eventDomStorageKey', 'fn:giftSubAppHistoryStorageKey', 'fn:perfDiagStorageKey', 'fn:tailStorageKey',
  'fn:watchSnapshotStorageKey', 'nls_backfill_progress_v1', 'nls_mcp_live_latest_v1',
  // popup が optional-chaining + computed key で set するため producer を静的解析が取りこぼす偽陽性
  // (実書込は popup-entry.js:collectAiShareDevMonitorPayloadBundle・status-entry.js が読む。2026-06-18 確認)
  'KEY_AI_SHARE_POPUP_DIAG'
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
  /** @type {{ re: RegExp, role: 'producer'|'consumer' }[]} */
  const patterns = [
    { re: /chrome\.storage\.local\.get\s*\(/g, role: 'consumer' },
    { re: /chrome\.storage\.local\.(?:set|remove)\s*\(/g, role: 'producer' },
    { re: /\bsetStorageLocalSilent\s*\(/g, role: 'producer' }
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

  writeStorageBusMap(keyMap);
  writeFeatureMaps(reach, access, f2f);
  writeImpactMap(f2f);
  writeIndex(keyMap);
  writeSpineMap(keyMap, sourceFiles);

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

/* ============================================================================
 * 背骨マップ(spine-map): データの一生「取得→記録→集計→表示」を1本の縦図に削ぐ。
 *   - docs/spine-map.html … ブラウザで開けば図(inline SVG・依存ゼロ・no CDN)。
 *   - docs/spine-map.md  … AI/GitHub 用のテキスト正本(同じ内容)。
 * SPINE 辞書(人間が決める節と血管)+ keyMap(機械が埋める producer/consumer/断線)から生成。
 * ========================================================================== */

/** HTML エスケープ(テキストノード/属性両用の最小)。 */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * SPINE.stages の各節が「実在するファイル/ディレクトリを持つか」を判定する。
 * 1つも実在しなければ節が腐っている=`--check` で落とす(リサーチ: 空ルールは no-op になる前に殺す)。
 * @param {string[]} sourceFiles ROOT 相対の全 src/app ファイル
 * @returns {{ stage: typeof SPINE.stages[number], presentFiles: string[], missingFiles: string[] }[]}
 */
function resolveSpineStages(sourceFiles) {
  return SPINE.stages.map((stage) => {
    const presentFiles = [];
    const missingFiles = [];
    for (const f of stage.files) {
      // ディレクトリ指定(src/lib 等)は配下に1つでもファイルがあれば実在とみなす。
      const isDir = !f.endsWith('.js');
      const exists = isDir
        ? sourceFiles.some((sf) => sf === f || sf.startsWith(f + '/'))
        : sourceFiles.includes(f);
      if (exists) presentFiles.push(f);
      else missingFiles.push(f);
    }
    return { stage, presentFiles, missingFiles };
  });
}

/**
 * SPINE.wires の各血管の接続状態を keyMap から判定する。
 *   connected … producer も consumer も居る(正常)
 *   broken    … 片側しか居ない(broadcaster バグ型=赤)
 *   missing   … キー自体が解析に出てこない(辞書が腐っている疑い=要再確認)
 * @param {Map<string, { producers: Set<string>, consumers: Set<string> }>} keyMap
 * @returns {{ wire: typeof SPINE.wires[number], status: 'connected'|'broken'|'missing', producers: string[], consumers: string[] }[]}
 */
function resolveSpineWires(keyMap) {
  return SPINE.wires.map((wire) => {
    const entry = keyMap.get(wire.key);
    if (!entry) return { wire, status: /** @type {const} */ ('missing'), producers: [], consumers: [] };
    const producers = [...entry.producers].sort();
    const consumers = [...entry.consumers].sort();
    const status = producers.length && consumers.length
      ? /** @type {const} */ ('connected')
      : /** @type {const} */ ('broken');
    return { wire, status, producers, consumers };
  });
}

/** ファイル名だけ(パスの末尾)に短縮。表示を軽くする。 */
function baseName(p) {
  return String(p).split('/').pop();
}

/**
 * 背骨の HTML(inline SVG)を組み立てる。縦に4段の節カード、節間に血管(矢印+キー名)。
 * 断線(broken/missing)は赤。依存ゼロ(素の HTML+CSS+inline SVG・no CDN)。
 * @param {ReturnType<typeof resolveSpineStages>} stages
 * @param {ReturnType<typeof resolveSpineWires>} wires
 */
function buildSpineHtml(stages, wires) {
  const brokenWires = wires.filter((w) => w.status !== 'connected');
  const missingStageFiles = stages.flatMap((s) => s.missingFiles);
  const banner = brokenWires.length || missingStageFiles.length
    ? `<div class="banner warn">⚠️ 断線の疑い ${brokenWires.length} 件 / 節ファイル消失 ${missingStageFiles.length} 件 — 下の赤い血管・節を確認。</div>`
    : '<div class="banner ok">✅ 背骨の血管はすべて producer/consumer 両側がつながっています。</div>';

  // 各段カード(節)。
  const stageCards = stages.map(({ stage, presentFiles, missingFiles }, i) => {
    const wiresOut = wires.filter((w) => w.wire.from === stage.id);
    const wireRows = wiresOut.map((w) => {
      const toLabel = SPINE.stages.find((s) => s.id === w.wire.to)?.label || w.wire.to;
      const cls = w.status === 'connected' ? 'wire ok' : 'wire bad';
      const statusTxt = w.status === 'connected' ? 'つながっている'
        : w.status === 'broken' ? '⚠️ 片側のみ(断線の疑い)' : '⚠️ 解析に出ない(辞書要確認)';
      const detail = w.status === 'connected'
        ? `書: ${w.producers.map(baseName).join(', ')} → 読: ${w.consumers.map(baseName).join(', ')}`
        : w.status === 'broken'
          ? `書: ${w.producers.map(baseName).join(', ') || '(なし)'} / 読: ${w.consumers.map(baseName).join(', ') || '(なし)'}`
          : 'keyMap に producer も consumer も無い';
      return `<div class="${cls}" title="${esc(w.wire.key)}: ${esc(statusTxt)}">`
        + `<span class="wkey">🩸 ${esc(w.wire.key)}</span> <span class="warrow">→ ${esc(toLabel)}</span>`
        + `<div class="wnote">${esc(w.wire.note)} — <b>${esc(statusTxt)}</b><br><span class="wfiles">${esc(detail)}</span></div>`
        + '</div>';
    }).join('');
    const fileChips = [
      ...presentFiles.map((f) => `<span class="path">${esc(f)}</span>`),
      ...missingFiles.map((f) => `<span class="path dead">${esc(f)} (消失)</span>`)
    ].join('');
    const connector = i < stages.length - 1
      ? '<div class="connector"><svg viewBox="0 0 40 34" width="40" height="34" aria-hidden="true">'
        + '<line x1="20" y1="0" x2="20" y2="26" stroke="currentColor" stroke-width="2"/>'
        + '<polygon points="20,34 14,24 26,24" fill="currentColor"/></svg></div>'
      : '';
    return `<section class="stage${missingFiles.length ? ' miss' : ''}">`
      + `<div class="shead"><span class="snum">${i + 1}</span>`
      + `<span class="semoji">${esc(stage.emoji)}</span>`
      + `<span class="sname">${esc(stage.label)}</span></div>`
      + `<div class="sdesc">${esc(stage.desc)}</div>`
      + `<div class="paths">${fileChips}</div>`
      + (wireRows ? `<div class="wires">${wireRows}</div>` : '')
      + '</section>'
      + connector;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>コードの背骨マップ — 君斗りんくの追憶のきらめき</title>
<style>
  :root{ --bg:#0f1115; --panel:#161922; --ink:#e6e8ec; --sub:#aab0bb; --muted:#7b8390; --line:#2a2f3a;
    --ok:#2f7d4a; --warn:#b5485f; --tag-bg:#1d2740; --tag-bd:#3f5b8c; --tag-ink:#bcd2f6; }
  body{ margin:0; padding:28px 20px; background:var(--bg); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Yu Gothic UI",sans-serif; }
  .wrap{ max-width:860px; margin:0 auto; }
  h1{ font-size:21px; margin:0 0 4px; }
  .meta{ color:var(--muted); font-size:12px; margin:0 0 16px; line-height:1.6; }
  .meta a{ color:#7fa8e0; }
  .banner{ border-radius:10px; padding:10px 14px; font-size:13px; margin:0 0 18px; line-height:1.6; }
  .banner.ok{ background:rgba(47,125,74,.16); border:1px solid var(--ok); color:#b8f0cf; }
  .banner.warn{ background:rgba(181,72,95,.16); border:1px solid var(--warn); color:#f6c7d2; }
  section.stage{ background:var(--panel); border:1.5px solid var(--line); border-radius:12px; padding:14px 18px; }
  section.stage.miss{ border-color:var(--warn); background:rgba(181,72,95,.08); }
  .shead{ display:flex; align-items:center; gap:10px; }
  .snum{ display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px;
    border-radius:50%; background:var(--tag-bg); border:1px solid var(--tag-bd); color:var(--tag-ink);
    font-size:13px; font-weight:700; }
  .semoji{ font-size:18px; }
  .sname{ font-size:17px; font-weight:700; color:#fff; }
  .sdesc{ font-size:12.5px; color:var(--sub); margin:6px 0 9px; line-height:1.6; }
  .paths{ display:flex; gap:6px; flex-wrap:wrap; }
  .path{ font-family:"Menlo","Consolas",monospace; font-size:11.5px; background:rgba(255,255,255,.06);
    border:1px solid var(--line); border-radius:6px; padding:2px 7px; color:#bcd2f6; }
  .path.dead{ color:#f6c7d2; border-color:var(--warn); background:rgba(181,72,95,.12); }
  .wires{ margin-top:11px; display:grid; gap:7px; }
  .wire{ border-radius:8px; padding:7px 11px; font-size:12px; border:1px solid var(--line);
    background:rgba(255,255,255,.03); }
  .wire.ok{ border-left:3px solid var(--ok); }
  .wire.bad{ border-left:3px solid var(--warn); background:rgba(181,72,95,.10); border-color:var(--warn); }
  .wkey{ font-family:"Menlo","Consolas",monospace; font-size:11.5px; color:#ffe3b8; }
  .warrow{ color:var(--muted); font-size:11.5px; }
  .wnote{ color:var(--sub); margin-top:3px; line-height:1.55; }
  .wire.bad .wnote b{ color:#f6c7d2; }
  .wfiles{ color:var(--muted); font-family:"Menlo","Consolas",monospace; font-size:10.5px; }
  .connector{ color:var(--tag-bd); display:flex; justify-content:center; margin:2px 0; }
  .legend{ margin-top:22px; font-size:12.5px; color:var(--sub); background:var(--panel);
    border:1px solid var(--line); border-radius:12px; padding:14px 18px; line-height:1.9; }
  .legend b{ color:var(--ink); }
</style>
</head>
<body>
<div class="wrap">
  <h1>🦴 コードの背骨マップ（データの一生）</h1>
  <p class="meta">
    取得→記録→集計→表示の<b>背骨1本</b>。網羅でなく根幹だけ。線（🩸=storageキー＝血管）が
    <b>つながっているか</b>を見れば、値が作られても届かない「断線」（過去の broadcaster バグ型）に気づける。<br>
    <code>scripts/feature-map.mjs</code> が実コードから自動生成（手編集しない・no CDN・依存ゼロ）。
    テキスト正本: <a href="spine-map.md">spine-map.md</a> ／ 全地図の入口: <a href="MAP.md">MAP.md</a> ／
    全storageキー: <a href="feature-map/storage-bus.md">storage-bus.md</a>。
  </p>
  ${banner}
  <div class="spine">
    ${stageCards}
  </div>
  <div class="legend">
    <b>読み方</b>: 上から下へデータが流れる。各カード＝1つの段（節）。カード内の🩸＝その段から次の段へ
    データを渡す storage キー（血管）。<br>
    <b style="color:#b8f0cf">緑の血管</b>＝書く人(producer)も読む人(consumer)も居る＝つながっている。
    <b style="color:#f6c7d2">赤の血管</b>＝片側しか居ない＝<b>断線の疑い</b>（値は作られたが届かない／その逆）。<br>
    <b>節ファイルが消失</b>すると赤枠＋(消失)。<code>npm run feature-map -- --check</code> が verify:cc で
    これを検知して落とす（地図が腐らない）。
  </div>
</div>
</body>
</html>
`;
}

/**
 * 背骨の Markdown(AI/GitHub 用のテキスト正本)。HTML と同じ内容をプレーンに。
 * @param {ReturnType<typeof resolveSpineStages>} stages
 * @param {ReturnType<typeof resolveSpineWires>} wires
 */
function buildSpineMd(stages, wires) {
  const lines = [];
  lines.push('# 🦴 コードの背骨マップ（データの一生・自動生成）');
  lines.push('');
  lines.push('> `npm run feature-map` で再生成。手で編集しない（`--check` が verify:cc で腐りを検知）。');
  lines.push('> 取得→記録→集計→表示の**背骨1本**。網羅でなく根幹だけ。視覚版: [spine-map.html](spine-map.html)。');
  lines.push('> 🩸=段間を渡る storage キー(血管)。両側(producer/consumer)が居れば「つながっている」、');
  lines.push('> 片側だけなら**断線の疑い**(値は作られたが届かない=過去の broadcaster バグ型)。');
  lines.push('');

  const brokenWires = wires.filter((w) => w.status !== 'connected');
  const missingStageFiles = stages.flatMap((s) => s.missingFiles);
  if (brokenWires.length || missingStageFiles.length) {
    lines.push(`## ⚠️ 要確認: 断線の疑い ${brokenWires.length} 件 / 節ファイル消失 ${missingStageFiles.length} 件`);
    for (const w of brokenWires) {
      lines.push(`- 🔴 \`${w.wire.key}\` (${w.wire.note}) — ` +
        (w.status === 'broken'
          ? `書: ${w.producers.join(', ') || '(なし)'} / 読: ${w.consumers.join(', ') || '(なし)'}`
          : 'keyMap に producer も consumer も無い(辞書要確認)'));
    }
    for (const f of missingStageFiles) lines.push(`- 🔴 節ファイル消失: \`${f}\``);
    lines.push('');
  } else {
    lines.push('✅ 背骨の血管はすべて producer/consumer 両側がつながっています。');
    lines.push('');
  }

  for (let i = 0; i < stages.length; i++) {
    const { stage, presentFiles, missingFiles } = stages[i];
    lines.push(`## ${i + 1}. ${stage.emoji} ${stage.label}`);
    lines.push('');
    lines.push(stage.desc);
    lines.push('');
    lines.push('担当ファイル:');
    for (const f of presentFiles) lines.push(`- \`${f}\``);
    for (const f of missingFiles) lines.push(`- 🔴 \`${f}\` (消失)`);
    const wiresOut = wires.filter((w) => w.wire.from === stage.id);
    if (wiresOut.length) {
      lines.push('');
      lines.push('次の段へ渡す血管(storageキー):');
      for (const w of wiresOut) {
        const toLabel = SPINE.stages.find((s) => s.id === w.wire.to)?.label || w.wire.to;
        const mark = w.status === 'connected' ? '🟢' : '🔴';
        const detail = w.status === 'connected'
          ? `書 ${w.producers.join(', ')} → 読 ${w.consumers.join(', ')}`
          : w.status === 'broken'
            ? `片側のみ — 書 ${w.producers.join(', ') || '(なし)'} / 読 ${w.consumers.join(', ') || '(なし)'}`
            : '解析に出ない(辞書要確認)';
        lines.push(`- ${mark} \`${w.wire.key}\` → ${toLabel}: ${w.wire.note} — ${detail}`);
      }
    }
    if (i < stages.length - 1) {
      lines.push('');
      lines.push('  ↓');
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * spine-map.html + spine-map.md を docs/ 直下へ出す(または --check で比較)。
 * @param {Map<string, { producers: Set<string>, consumers: Set<string> }>} keyMap
 * @param {string[]} sourceFiles
 */
function writeSpineMap(keyMap, sourceFiles) {
  const stages = resolveSpineStages(sourceFiles);
  const wires = resolveSpineWires(keyMap);
  // 節が完全に消えている(presentFiles ゼロ)なら辞書が腐っている=check で落とす。
  for (const { stage, presentFiles } of stages) {
    if (presentFiles.length === 0) {
      checkProblems.push(`spine: 段「${stage.label}」の担当ファイルが1つも実在しません(SPINE 辞書を実コードで直す)`);
    }
  }
  emitDocs('spine-map.html', buildSpineHtml(stages, wires));
  emitDocs('spine-map.md', buildSpineMd(stages, wires));
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
