/**
 * distFingerprint.js — 「この dist はこのソースから build されたものか」を判定する純関数。
 *
 * ★背景(2026-09-21・council-fable設計): `.husky/pre-push` が `npm run verify`(build込み)を
 *   実行し、`scripts/build.mjs` が実行のたびに現在時刻を `NL_BUILD_ID` として dist に埋め込む
 *   ため、commit前にbuildしてpushしても、pre-pushが再度buildを実行して新しい時刻が埋め込まれ、
 *   push直後に必ずbuildIdのみのdist差分が残る無限ループになっていた。
 *
 * ★NL_BUILD_ID(JST 時刻)は buildAgeCell.js の計器(「このビルドは何日前か」を利用者に警告する
 *   機能。2026-08-14の実機事故の再発防止として実装済み)が依存しているので一切触らない。
 *   代わりに「ビルド入力の blob sha の集合」を指紋にし、時刻は照合から【マスクして】外す。
 *
 * fs / child_process に触らない(src/lib の掟)。I/O は scripts/check-dist-fresh.mjs / build.mjs 側。
 *
 * @module distFingerprint
 */

export const FINGERPRINT_SCHEMA = 1;

/** バンドル入力に現れなくても常に指紋へ入れる(ツールチェーン・設定の代表)。 */
export const ALWAYS_INPUTS = Object.freeze([
  'package.json',
  'package-lock.json',
  'scripts/build.mjs',
  'tsconfig.json'
]);

/** buildIdJst() の形式(bundleBuildId.js と同じ MMDD-HHmmss)。g で全箇所を対象にする。 */
const BUILD_ID_RE_G = /\b\d{4}-\d{6}\b/g;

/**
 * dist 本文から buildId を消す(同じ入力の build 同士を同一視するため)。
 * @param {unknown} text
 * @returns {string}
 */
export function maskBuildId(text) {
  return String(text ?? '').replace(BUILD_ID_RE_G, 'MMDD-HHmmss');
}

/**
 * metafile の入力パスを正規化: posix・重複除去・node_modules 除外・常時入力を合流・ソート。
 * @param {readonly string[]|undefined} paths
 * @returns {string[]}
 */
export function normalizeInputs(paths) {
  const set = new Set(ALWAYS_INPUTS);
  for (const p of paths || []) {
    const s = String(p).replace(/\\/g, '/').replace(/^\.\//, '');
    if (!s) continue;
    if (s.startsWith('node_modules/') || s.includes('/node_modules/')) continue;
    set.add(s);
  }
  return [...set].sort();
}

/**
 * 指紋の元テキスト。呼び出し側が sha256 する。
 * @param {{ mode: string, entries: Array<{ path: string, blob: string }> }} input
 * @returns {string}
 */
export function fingerprintText({ mode, entries }) {
  const lines = (entries || [])
    .map((e) => `${e.path} ${e.blob}`)
    .sort();
  return `schema=${FINGERPRINT_SCHEMA}\nmode=${mode}\n${lines.join('\n')}\n`;
}

/**
 * 照合。sidecar(build.mjsが書いた指紋)と、対象treeから取り直した値を突き合わせる。
 *
 * @param {{
 *   sidecar: { schema?: number, mode?: string, fingerprint?: string,
 *              inputs?: string[], outputs?: Record<string,string> } | null,
 *   fingerprint: string | null,
 *   missingInputs: string[],
 *   outputHashes: Record<string, string | null>
 * }} args
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function judgeDistFreshness({ sidecar, fingerprint, missingInputs, outputHashes }) {
  const problems = [];
  if (!sidecar || sidecar.schema !== FINGERPRINT_SCHEMA || typeof sidecar.fingerprint !== 'string') {
    problems.push('.dist-fingerprint.json が無い/形式が違う → npm run build(その後 git add)');
    return { ok: false, problems };
  }
  if (missingInputs.length) {
    problems.push(
      `build 時にあった入力がこの tree に無い(削除/改名後に build していない): ${missingInputs.join(', ')}`
    );
  }
  if (fingerprint !== sidecar.fingerprint) {
    problems.push(
      `ビルド入力が dist と一致しない(期待 ${sidecar.fingerprint.slice(0, 12)} / ` +
        `実際 ${String(fingerprint).slice(0, 12)}) → npm run build`
    );
  }
  for (const [out, want] of Object.entries(sidecar.outputs || {})) {
    const got = outputHashes[out];
    if (got == null) {
      problems.push(`${out} がこの tree に無い(dist の git add 忘れ)`);
    } else if (got !== want) {
      problems.push(`${out} の中身が build 時と違う(buildId 以外の差)→ 手編集 / build:watch の出力 / add 漏れ`);
    }
  }
  return { ok: problems.length === 0, problems };
}
