/**
 * mainThreadBlockerCensus.js — メインスレッドを止めた【当人】を名指しする計器(純関数)。
 *
 * ★なぜ要るか(2026-08-14 ユーザー実機・「一時的に戻すのではなく根本療法は計器」)
 *   サイドパネルが黒くなる件で、速報はここまでしか言えていなかった:
 *       最大タイマー遅延=1806ms 🔴イベントループ停止
 *       ★幕/シェードは下流=描画側を直しても消えない。スレッドを止めている処理を探すこと
 *   ＝**「探せ」で終わっていて、誰が止めたかを名指ししていない**。
 *   読んでも直せない計器は価値が低い([[instrument-value-is-measured-by-fixes-2026-08-12]])。
 *
 * ■ ユーザーの観測(これが設計の根拠)
 *   「しばらく配信を見ないとスリープ状態になってるっぽい」「しばらくすると戻る」
 *   ＝**復帰時にまとめ描きしてスレッドを止めている**疑い。実際 storyGrowthChurn は
 *     cellsBuilt=360 / avgMs=12.6 を記録していた。
 *
 * ■ この計器の契約(症状でなく原因を出す)
 *   1. **長い処理を実測して名前で記録する**(推測しない)。区間に名前を付けて包むだけ。
 *   2. 直近の最悪1件だけでなく **累計・回数・最悪** を持つ(1回の外れ値に騙されない)。
 *   3. **停止と同時に何が起きていたか**(可視復帰の直後か)を添える=再現条件が分かる。
 *   4. 純関数・DOM/chrome 非依存。時刻は呼び出し側が渡す。
 *
 * ★これは「遅くなった原因を隠す」対策ではない。**遅くしている当人を特定する**ための計器。
 *
 * @module mainThreadBlockerCensus
 */

/** これ以上かかった区間を「長い」として記録する[ms]。1フレーム(16ms)の約3倍。 */
export const LONG_TASK_MS = 50;

/**
 * @typedef {{
 *   name: string,
 *   ms: number,
 *   atMs: number,
 *   sinceVisibleMs: number
 * }} BlockerSample
 */

/**
 * @typedef {{
 *   totalMs: number,
 *   count: number,
 *   worstMs: number,
 *   worstName: string,
 *   byName: Record<string, { ms: number, count: number, worstMs: number }>,
 *   afterResumeMs: number,
 *   afterResumeCount: number,
 *   samples: BlockerSample[]
 * }} BlockerCensus
 */

/** 保持するサンプル数(古いものから捨てる)。 */
const MAX_SAMPLES = 8;

/** @returns {BlockerCensus} 空の集計。 */
export function createBlockerCensus() {
  return {
    totalMs: 0,
    count: 0,
    worstMs: 0,
    worstName: '',
    byName: Object.create(null),
    afterResumeMs: 0,
    afterResumeCount: 0,
    samples: []
  };
}

/**
 * 1区間の実測を足す。**LONG_TASK_MS 未満は捨てる**(ノイズを溜めない)。
 *
 * @param {BlockerCensus} census
 * @param {object} input
 * @param {string} input.name 区間名(例 'grid-rebuild' / 'lane-heavy' / 'refresh')
 * @param {number} input.ms 実測[ms]
 * @param {number} [input.atMs] 発生時刻(Date.now 相当)
 * @param {number} [input.sinceVisibleMs] 可視復帰からの経過[ms](-1=不明)
 * @returns {BlockerCensus} 同じ参照(破壊的更新・呼び出し側の state をそのまま使う)
 */
export function noteBlocker(census, input) {
  const c = census && typeof census === 'object' ? census : createBlockerCensus();
  const ms = Number(input?.ms);
  if (!Number.isFinite(ms) || ms < LONG_TASK_MS) return c;
  const name = String(input?.name || '(無名)');
  const atMs = Number(input?.atMs) || 0;
  const sinceVisibleMs = Number.isFinite(Number(input?.sinceVisibleMs))
    ? Number(input.sinceVisibleMs)
    : -1;

  c.totalMs += ms;
  c.count += 1;
  if (ms > c.worstMs) {
    c.worstMs = ms;
    c.worstName = name;
  }
  const slot = c.byName[name] || (c.byName[name] = { ms: 0, count: 0, worstMs: 0 });
  slot.ms += ms;
  slot.count += 1;
  if (ms > slot.worstMs) slot.worstMs = ms;

  /*
   * ★「復帰直後か」を分けて数える。ユーザー観測(スリープ→戻ると黒)が正しいなら
   *   afterResume 側に偏るはずで、**偏りそのものが仮説の検証**になる。
   *   5秒以内を「復帰直後」とする(黒が見えている時間帯より十分長く取る)。
   */
  if (sinceVisibleMs >= 0 && sinceVisibleMs <= 5000) {
    c.afterResumeMs += ms;
    c.afterResumeCount += 1;
  }

  c.samples.push({ name, ms: Math.round(ms), atMs, sinceVisibleMs });
  if (c.samples.length > MAX_SAMPLES) c.samples.shift();
  return c;
}

/**
 * 速報用の1行。**異常が無ければ空文字**(正常なものは出さない)。
 *
 * @param {BlockerCensus|null|undefined} census
 * @returns {string}
 */
export function formatBlockerLine(census) {
  const c = census;
  if (!c || typeof c !== 'object') return '';
  const count = Number(c.count) || 0;
  if (count <= 0) return 'メインスレッド ✅ 長い処理は観測されていません';

  const worstMs = Math.round(Number(c.worstMs) || 0);
  const worstName = String(c.worstName || '(無名)');
  const totalMs = Math.round(Number(c.totalMs) || 0);

  // 累計の多い順に上位3つ=「誰がいちばん止めているか」。
  const top = Object.keys(c.byName || {})
    .map((k) => ({ name: k, ...c.byName[k] }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 3)
    .map((e) => `${e.name} ${Math.round(e.ms)}ms(${e.count}回・最悪${Math.round(e.worstMs)}ms)`)
    .join(' / ');

  const mark = worstMs >= 500 ? '🔴' : worstMs >= 200 ? '🟡' : '⚪';
  const lines = [
    `メインスレッド ${mark} 長い処理 ${count}回・合計${totalMs}ms・最悪 ${worstName} ${worstMs}ms`,
    `  → 止めている当人(累計の多い順): ${top}`
  ];

  const arCount = Number(c.afterResumeCount) || 0;
  if (arCount > 0) {
    const arMs = Math.round(Number(c.afterResumeMs) || 0);
    const pct = totalMs > 0 ? Math.round((arMs / totalMs) * 100) : 0;
    lines.push(
      `  → うち可視復帰の直後(5秒以内): ${arCount}回 ${arMs}ms (全体の${pct}%)` +
        (pct >= 50
          ? ' ★スリープからの復帰でまとめ描きしている=ここが黒の主因'
          : '')
    );
  }
  if (worstMs >= 200) {
    lines.push('  → ★幕/シェードは【下流】。この当人を短くしない限り黒は消えません');
  }
  return lines.join('\n');
}

/**
 * 同期処理を包んで実測する(戻り値はそのまま返す)。
 * ★例外時も必ず計測する(重い処理ほど落ちやすく、落ちた回を取りこぼすと真因を見失う)。
 *
 * @template T
 * @param {BlockerCensus} census
 * @param {string} name
 * @param {() => T} fn
 * @param {{ now?: () => number, sinceVisibleMs?: number }} [opts]
 * @returns {T}
 */
export function measureBlocker(census, name, fn, opts = {}) {
  const now = typeof opts.now === 'function' ? opts.now : defaultNow;
  const t0 = now();
  try {
    return fn();
  } finally {
    const ms = now() - t0;
    try {
      noteBlocker(census, {
        name,
        ms,
        atMs: Date.now(),
        sinceVisibleMs: Number.isFinite(Number(opts.sinceVisibleMs))
          ? Number(opts.sinceVisibleMs)
          : -1
      });
    } catch {
      /* 計器の失敗で本処理を壊さない */
    }
  }
}

/** @returns {number} */
function defaultNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
