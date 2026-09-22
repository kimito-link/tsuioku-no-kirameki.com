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
 * ★前提(2026-09-22 実測で裏取り済み): blob sha は「作業ツリー→git checkout時のフィルタ後」の
 *   バイト列から決まる(`git hash-object` = `git rev-parse HEAD:<path>` を実測で確認)。
 *   このリポは `core.autocrlf=false`(改行変換なし)であり、CI(Ubuntu, actions/checkout@v4)も
 *   既定でフィルタを入れない。**両者の設定が一致している前提が崩れる(例: 誰かが自分の
 *   グローバル設定で `autocrlf=true` の clone を作り、その環境で `npm run build` を実行する)と、
 *   同じ commit でも blob sha がずれて指紋が不一致になりうる。** これは実害としては
 *   「本来正しいのに check-dist-fresh が赤くなる」偽陽性であり、`npm run build` すれば
 *   その環境の autocrlf で再計算されるため直る(危険側には倒れない)。
 *   `.gitattributes` の `.husky/* text eol=lf` はフックのCRLF化だけを防ぐもので、
 *   この autocrlf 依存そのものは解消しない(2026-09-22 時点で未解決の既知の前提)。
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
 * esbuild の metafile から拾った「正規化前」の入力本数が、健全な build 実行として
 * 妥当かを判定する。
 *
 * ★なぜ要るか(2026-09-22 実測で確定した穴): `results.flatMap((r) => Object.keys(
 *   r.metafile?.inputs || {}))` は、将来 esbuild の metafile 仕様が変わって空になっても
 *   【エラーを出さない】。その場合 `normalizeInputs([])` は ALWAYS_INPUTS の4件だけを
 *   静かに返し、指紋はソースを一切見ずに計算される。結果「build し忘れても常に緑になる」
 *   という、このゲートの存在意義を消す壊れ方をする。ここで早期に throw させて気づけるようにする。
 *
 * ★閾値は当てずっぽうの絶対数(現状761件等)ではなく、呼び出し側が持つ「entryPoint 数
 *   (=targets.length)」という相対値にする。esbuild の性質上、各 entryPoint は最低でも
 *   自分自身のファイル1つを metafile.inputs に含むはずなので、
 *   「入力本数が entryPoint 数を下回ることはあり得ない」が原理的な下限になる。
 *   targets が将来増減しても閾値を書き直す必要がない。
 *
 * @param {{ rawInputCount: number, targetCount: number }} args
 * @returns {{ ok: boolean, reason: string | null }}
 */
export function judgeBuildInputsHealthy({ rawInputCount, targetCount }) {
  if (rawInputCount <= 0) {
    return {
      ok: false,
      reason: 'esbuild の metafile.inputs が空(rawInputCount=0)。esbuild のバージョン変更等で形式が変わった疑い'
    };
  }
  if (rawInputCount < targetCount) {
    return {
      ok: false,
      reason:
        `metafile.inputs の件数(${rawInputCount})が entryPoint 数(${targetCount})を下回る。` +
        '各 entryPoint は最低1 input を持つはずなので異常'
    };
  }
  return { ok: true, reason: null };
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
