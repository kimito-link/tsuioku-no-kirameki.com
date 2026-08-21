/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】「拡張のどの処理が何ms使ったか」の集計と、★測れていない時間の判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】区間の実測とカバー率の判定はこのファイルのみ
 *
 * autoSectionCensus.js — ★全経路を【機械的に】測る。人の当て推量を計器から追い出す。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★ユーザー指示(2026-08-21)がこのモジュールの出発点
 *   「表面的なものを考えるんじゃなくて、まず DOM を全部把握して
 *     それを計器に入れる基本から見直すべき」
 *   その後 DOM Tree Visualizer を見て「これでできたものを計器にいれればいいかも」
 *
 *   ★あのツールの本質は「絵」ではなく **全要素を機械的に測ること**。
 *     人が「ここが怪しい」と当たりをつける余地が無い＝**見落としが原理的に起きない**。
 *     ユーザーが言っていたのはこの性質のことだった。
 *
 * ■ ★いまの計器の構造的欠陥(コードで確認・推測ではない)
 *   `mainThreadBlockerBoot.js:54` の `markBlockerSection` は
 *   **区間名のラベルを置くだけで、自分では何も測っていない**。
 *   実測は 250ms ごとのハートビートが行い、遅れを見つけた時点の
 *   `_currentSection` を読む。ところが `markBlockerSection` は `finally` で
 *   ★**区間を抜けた瞬間にラベルを戻す**(`:60`)。
 *   ＝ ハートビートが鳴るのは区間が終わった後のことが多く、
 *     ★**実際には拡張が止めていても「(拡張の外)」と出る**。
 *
 *   加えて囲みは実測で **3箇所だけ**だった:
 *     renderCommentTicker / renderStoryCommentDetailPanel / renderCharacterScene
 *   ★これは「私が事前に怪しいと思った所」＝**推測が計器に混入していた**。
 *   実機は 16.7秒中15.9秒(95%)停止しているのに犯人は「(拡張の外)」だった。
 *
 * ■ このモジュールが変えること
 *   1. ★**区間そのものを実測**する。ハートビートの取りこぼしに依存しない。
 *   2. ★**50ms未満も捨てない**。`noteBlocker` は 50ms 未満を捨てるので
 *      「20msが100回=2秒」が完全に見えなかった。細かい積み上げこそ主犯になりうる。
 *   3. ★**測れていない時間を数える**(カバー率)。囲み忘れが数字で出る。
 *      カバー率が低いうちは **犯人を断言しない**
 *      ([[zero-count-may-mean-unmeasured-2026-08-04]] /
 *       [[discarded-pass-reason-makes-greens-unreadable-2026-08-12]])。
 * ───────────────────────────────────────────────────────────────────────────
 */

/** これ以上かかった1回は個別に残す[ms]。1フレーム(16ms)の約3倍。 */
export const AUTO_SECTION_SLOW_MS = 50;

/** カバー率がこれ未満なら「まだ測れていない」と自己申告する[%]。 */
export const AUTO_SECTION_COVERAGE_WARN_PCT = 30;

/** 個別に残す遅いサンプルの上限。 */
const MAX_SLOW_SAMPLES = 8;

/** 速報に出す区間の上限。 */
const TOP_N = 4;

/**
 * @typedef {{ name: string, ms: number, atMs: number }} AutoSectionSample
 */

/**
 * @typedef {object} AutoSectionCensus
 * @property {number} totalMs 測れた合計[ms]
 * @property {number} count 区間の実行回数
 * @property {Record<string, { ms: number, count: number, worstMs: number }>} byName
 * @property {AutoSectionSample[]} slowSamples
 */

/**
 * @typedef {object} AutoSectionVerdict
 * @property {'ok'|'warn'|'na'} level
 * @property {number|null} coveragePct 経過時間のうち測れた割合[%]
 * @property {number|null} uncoveredMs 測れていない時間[ms]
 * @property {string} worstName 累計が最大の区間
 * @property {string} line 速報に出す1行
 */

/** @param {unknown} v @returns {number|null} ★Number(null)=0 の穴を塞ぐ。 */
function num(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
}

/** @returns {AutoSectionCensus} 空の集計。 */
export function createAutoSectionCensus() {
  return {
    totalMs: 0,
    count: 0,
    byName: Object.create(null),
    slowSamples: []
  };
}

/**
 * 1区間の実測を足す。
 *
 * ★`noteBlocker` と違い **50ms 未満も捨てない**。
 *   細かい処理の積み上げ(20ms×100回=2秒)が主犯になりうるため。
 *
 * @param {AutoSectionCensus} census
 * @param {{ name?: unknown, ms?: unknown, atMs?: unknown }|null|undefined} input
 * @returns {AutoSectionCensus} 同じ参照(破壊的更新)
 */
export function noteAutoSection(census, input) {
  const c = census && typeof census === 'object' ? census : createAutoSectionCensus();
  if (!c.byName) c.byName = Object.create(null);
  if (!Array.isArray(c.slowSamples)) c.slowSamples = [];

  const ms = num(input && typeof input === 'object' ? input.ms : null);
  if (ms === null || ms < 0) return c;
  const rawName = input && typeof input === 'object' ? input.name : null;
  const name = typeof rawName === 'string' && rawName ? rawName : '(無名)';

  c.totalMs = (num(c.totalMs) ?? 0) + ms;
  c.count = (num(c.count) ?? 0) + 1;

  const slot = c.byName[name] || (c.byName[name] = { ms: 0, count: 0, worstMs: 0 });
  slot.ms += ms;
  slot.count += 1;
  if (ms > slot.worstMs) slot.worstMs = ms;

  if (ms >= AUTO_SECTION_SLOW_MS) {
    c.slowSamples.push({ name, ms: Math.round(ms), atMs: num(input?.atMs) ?? 0 });
    if (c.slowSamples.length > MAX_SLOW_SAMPLES) c.slowSamples.shift();
  }
  return c;
}

/**
 * 速報用の判定。
 *
 * ★カバー率が低いうちは **犯人を断言しない**。
 *   「測れていない時間」を先に出す方が、誤診より役に立つ。
 *
 * @param {AutoSectionCensus|null|undefined} census
 * @param {{ elapsedMs?: unknown }} [opts] 観測窓の長さ
 * @returns {AutoSectionVerdict}
 */
export function formatAutoSectionLines(census, opts = {}) {
  const c = census && typeof census === 'object' ? census : null;
  const elapsedMs = num(opts?.elapsedMs);
  const totalMs = c ? num(c.totalMs) ?? 0 : 0;

  if (!c || elapsedMs === null || elapsedMs <= 0) {
    return {
      level: 'na',
      coveragePct: null,
      uncoveredMs: null,
      worstName: '',
      line: '拡張の処理時間: ⚪未計測'
    };
  }

  const coveragePct = Math.round((totalMs / elapsedMs) * 100);
  const uncoveredMs = Math.max(0, Math.round(elapsedMs - totalMs));

  const ranked = Object.keys(c.byName || {})
    .map((k) => ({ name: k, ...c.byName[k] }))
    .sort((a, b) => b.ms - a.ms);
  const worstName = ranked.length ? ranked[0].name : '';

  const top = ranked
    .slice(0, TOP_N)
    .map((e) => `${e.name} ${Math.round(e.ms)}ms(${e.count}回・最悪${Math.round(e.worstMs)}ms)`)
    .join(' / ');

  /*
   * ★カバー率が低い＝囲めていない処理が多い。
   *   ここで「犯人は○○」と言うと、囲んだものの中の最大値を指すだけで誤診する。
   *   計器自身が「まだ測れていない」と言うのが正しい
   *   ([[instrument-must-name-the-cause-2026-08-01]] の裏返し:
   *    名指しできる根拠が無いなら名指ししない)。
   */
  if (coveragePct < AUTO_SECTION_COVERAGE_WARN_PCT) {
    return {
      level: 'warn',
      coveragePct,
      uncoveredMs,
      worstName,
      line:
        `拡張の処理時間: 🟡 ${coveragePct}%しか測れていない` +
        `(測れた${Math.round(totalMs)}ms / 経過${Math.round(elapsedMs)}ms)\n` +
        `  → ★残り${uncoveredMs}msは【囲んでいない処理】。犯人はまだ名指しできません` +
        (top ? `\n  → 測れている範囲の内訳: ${top}` : '')
    };
  }

  return {
    level: 'ok',
    coveragePct,
    uncoveredMs,
    worstName,
    line:
      `拡張の処理時間: ${coveragePct}%を計測(測れた${Math.round(totalMs)}ms / 経過${Math.round(elapsedMs)}ms)\n` +
      `  → 使っている順: ${top}`
  };
}
