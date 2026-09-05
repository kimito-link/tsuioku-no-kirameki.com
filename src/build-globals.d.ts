/**
 * ビルド時に esbuild の `define` で注入される定数の型宣言。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★なぜ要るか（2026-08-29）
 *   `scripts/build.mjs` の `common.define` が全バンドルへ注入する定数は、
 *   ソース上はどこにも宣言が無いため TypeScript が「見つからない名前」と言う。
 *
 *   ★これまでは `popup-entry.js` が先頭で `// @ts-nocheck` して回避していたが、
 *   それは**そのファイルの型検査を丸ごと捨てる**やり方で、真似ると検査が痩せる。
 *   （実際 venueBar.js に同じ定数を使ったら、そこだけ型エラーになった）
 *
 *   ⟹ ★型として1回だけ宣言する。以後どのファイルからでも `typeof` 無しで使える。
 *
 * ■ ★実行時の注意（型が付いても消えない罠）
 *   これらは **define で置換される**ので、置換されない経路（テストから直接 import する等）
 *   では **実行時に undefined** になる。値を読むときは
 *   `typeof NL_BUILD_ID !== 'undefined'` のガードを併用すること
 *   （型の問題と実行時の問題は別）。
 *
 * ■ 正本
 *   注入している当人は `scripts/build.mjs` の `common.define`。
 *   ★ここを増やしたら、あちらにも足すこと（片方だけだと嘘になる）。
 * ───────────────────────────────────────────────────────────────────────────
 */
export {};

declare global {
  /** ビルド時刻の識別子（JST の MMDD-HHmmss）。「本当に新しいバンドルか」の切り分けに使う。 */
  const NL_BUILD_ID: string;

  /** dev ホットリロードを有効にするか。配布ビルドでは常に false（dead-code 除去される）。 */
  const NL_DEV_HOTRELOAD: boolean;

  /** ビルド時点の package.json の version。実行時に manifest と突き合わせて版混在を検知する。 */
  const NL_BUNDLE_VERSION: string;

  /** 配布(release)ビルドか。status の生診断JSON等を出し分ける。popup/status のみ注入。 */
  const NL_RELEASE: boolean;
}
