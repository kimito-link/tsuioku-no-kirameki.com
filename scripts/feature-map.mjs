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
  mkdirSync(OUT_DIR, { recursive: true });

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
  writeFileSync(join(OUT_DIR, 'impact-map.md'), lines.join('\n'), 'utf8');
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

  writeFileSync(join(OUT_DIR, 'storage-bus.md'), lines.join('\n'), 'utf8');
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

    writeFileSync(join(OUT_DIR, `${f.feature}.md`), lines.join('\n'), 'utf8');
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
  writeFileSync(join(OUT_DIR, 'index.md'), lines.join('\n'), 'utf8');
}

main().catch((err) => {
  console.error('feature-map failed:', err);
  process.exit(1);
});
