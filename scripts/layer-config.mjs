/**
 * layer-config.mjs — ★どのリポでも使えるように「設定」を読む部分だけを切り出す。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★ユーザー要求(2026-08-21)
 *   「はんようてきなものにしたいのでいれて」
 *   対象: web-ios-android / soushin-suggest.link にも同じ仕組みを入れたい。
 *
 * ■ ★3リポの形は全く違う(実測してから設計した・推測ではない)
 *   | リポ | 構成 | 言語 |
 *   |---|---|---|
 *   | tsuioku-no-kirameki | `src/lib` にフラット719ファイル | 素のJS(ESM) |
 *   | web-ios-android     | pnpmモノレポ packages 8 + apps 3 | ★TS主体(370 .ts / 93 .js) |
 *   | soushin-suggest.link| `src/` `functions/` `tools/` | TS 148 / JS 107 |
 *
 *   ★走査場所も拡張子も禁止APIも違う ＝ **ハードコードでは汎用にならない**。
 *   → 設定ファイル `layer.config.json` をリポ直下に置く形にする。
 *
 * ■ 設定が無いときは(既定値)
 *   ★このリポ(追憶のきらめき)の現状値をそのまま既定にする。
 *   ＝ **設定を置かなければ今までと同じ挙動**(移行で壊れない)。
 *
 * ■ 設定の例(web-ios-android のモノレポ想定)
 *   {
 *     "scan": ["packages/*\/src", "apps/*\/src"],
 *     "ext": [".ts", ".js"],
 *     "forbid": ["fetch", "document", "window", "process.env"],
 *     "baseline": ["packages/db/src/client.ts"]
 *   }
 * ───────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * @typedef {object} LayerConfig
 * @property {string[]} scan 走査するディレクトリ(glob の `*` を1段だけ展開)
 * @property {string[]} ext 対象の拡張子
 * @property {string[]} exclude 除外する部分文字列(パスに含まれたら飛ばす)
 * @property {string[]} forbid 禁止する識別子(これを実コードで使うと「純粋でない」)
 * @property {string[]} baseline 既存の例外(ここに載っているものは赤くしない)
 * @property {string} label 画面に出す箱の名前
 */

/** ★既定値 = このリポの現状。設定が無くても今までどおり動く。 */
export const DEFAULT_CONFIG = Object.freeze({
  scan: ['src/lib'],
  ext: ['.js'],
  exclude: ['.test.', '/node_modules/', '/dist/'],
  forbid: ['chrome', 'fetch', 'localStorage', 'sessionStorage', 'indexedDB', 'document', 'window'],
  baseline: [],
  label: 'src/lib'
});

/**
 * `layer.config.json` を読む。無ければ既定値。
 *
 * @param {string} root リポジトリのルート
 * @returns {LayerConfig}
 */
export function loadLayerConfig(root) {
  const p = join(root, 'layer.config.json');
  if (!existsSync(p)) return { ...DEFAULT_CONFIG };
  let parsed = {};
  try {
    parsed = JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    // ★壊れた設定で黙って既定値に落ちると、守っているつもりで守れていない状態になる。
    throw new Error(`layer.config.json が読めません: ${e.message}`);
  }
  return {
    scan: Array.isArray(parsed.scan) && parsed.scan.length ? parsed.scan : DEFAULT_CONFIG.scan,
    ext: Array.isArray(parsed.ext) && parsed.ext.length ? parsed.ext : DEFAULT_CONFIG.ext,
    exclude: Array.isArray(parsed.exclude) ? parsed.exclude : DEFAULT_CONFIG.exclude,
    forbid: Array.isArray(parsed.forbid) && parsed.forbid.length
      ? parsed.forbid
      : DEFAULT_CONFIG.forbid,
    baseline: Array.isArray(parsed.baseline) ? parsed.baseline : [],
    label: typeof parsed.label === 'string' && parsed.label ? parsed.label : parsed.scan?.join(', ') || DEFAULT_CONFIG.label
  };
}

/**
 * `scan` の指定を実ディレクトリへ展開する。
 *
 * ★`packages/*\/src` のような **`*` を1段だけ**展開する(依存を増やさないため
 *   glob ライブラリは使わない。モノレポの `packages/*` はこれで足りる)。
 *
 * @param {string} root
 * @param {string[]} patterns
 * @returns {string[]} 実在するディレクトリの絶対パス
 */
export function expandScanDirs(root, patterns) {
  /** @type {string[]} */
  const out = [];
  for (const pat of patterns) {
    if (!pat.includes('*')) {
      const d = join(root, pat);
      if (existsSync(d) && statSync(d).isDirectory()) out.push(d);
      continue;
    }
    const [head, ...rest] = pat.split('*');
    const baseDir = join(root, head);
    if (!existsSync(baseDir)) continue;
    const tail = rest.join('*').replace(/^[/\\]/, '');
    for (const name of readdirSync(baseDir)) {
      const mid = join(baseDir, name);
      if (!statSync(mid).isDirectory()) continue;
      const d = tail ? join(mid, tail) : mid;
      if (existsSync(d) && statSync(d).isDirectory()) out.push(d);
    }
  }
  return out;
}

/**
 * 走査対象のファイルを集める(再帰)。
 *
 * @param {string} root
 * @param {LayerConfig} cfg
 * @returns {string[]} root からの相対パス(スラッシュ区切り)
 */
export function listTargetFiles(root, cfg) {
  /** @type {string[]} */
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(root, full).split('\\').join('/');
      if (cfg.exclude.some((x) => `/${rel}`.includes(x))) continue;
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (cfg.ext.some((e) => name.endsWith(e))) out.push(rel);
    }
  };
  for (const d of expandScanDirs(root, cfg.scan)) walk(d);
  return out.sort();
}

/**
 * 禁止識別子の正規表現を作る。
 *
 * ★直前が `.` や引用符でないことを要求する(プロパティ名 `foo.document` や
 *   文字列の一部を拾わない)。★`chrome` は `chrome.tabs` のような形だけ拾う。
 *
 * @param {string[]} forbid
 * @returns {RegExp}
 */
export function buildForbidRe(forbid) {
  const alts = forbid
    .map((f) => (f === 'chrome' ? 'chrome\\.[a-z]\\w*' : f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('|');
  return new RegExp(`(?:^|[^\\w.'"\`])(${alts})\\s*[.(]`);
}
