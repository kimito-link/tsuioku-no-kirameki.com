/**
 * 状態速報の主要KPIを時系列で記録し、「スナップショットでは見えない劣化」を検知する純関数(v0.1.862)。
 *
 * 背景: 状態ページは「今この瞬間」のスナップショットなので、『取得率がじわじわ下がっている』『記録が
 *   N分前から止まっている』『来場が減り続けている』のような時間変化の異常が見えない。診断の信頼度
 *   メーター(v0.1.861)が値の意味を、自己矛盾検知(v0.1.859)が瞬間の食い違いを捕まえるのに対し、
 *   トレンドは「時間の経過でしか分からない劣化」を担当する(診断3層目)。
 *
 * 設計: status が refresh するたびに主要KPI(記録合計/公式合計/取得率/来場合計)を1点、storage のリング
 *   バッファ(KEY_STATUS_TREND・既定 throttle 30秒・上限120点≈1時間)に積む(commentIngestLog と同型の
 *   append+cap 純関数)。analyzeTrend が直近の点列から停滞/低下を判定し、対処カードに出せる findings を返す。
 *   新規ネットワーク取得ゼロ・外部送信ゼロ。判定は『機械的に決まる事実(増えていない/下がり続け)』だけ。
 *
 * v0.1.887: catchingUp = この時点に「放送中×追いつき中(率<100)」の配信があったか。true の間は取得率が
 *   見かけ上下がるのが正常(新配信を開くと分母が判明して 100%→低% に落ちる)=rate-declining の偽陽性を抑止。
 *
 * @typedef {{
 *   t: number,            // 記録時刻(ms)
 *   recorded: number,     // 記録合計(全配信)
 *   official: number,     // 公式コメント合計
 *   ratePct: number|null, // 取得率(記録/公式*100)。公式0なら null
 *   watch: number|null,   // 来場合計。取れなければ null
 *   catchingUp?: boolean  // 放送中×追いつき中の配信があったか(true なら下落は正常)
 * }} TrendSample
 *
 * @typedef {{ v: number, items: TrendSample[] }} TrendLog
 *
 * @typedef {{ id: string, severity: 'bad'|'warn', message: string }} TrendFinding
 */

export const STATUS_TREND_VERSION = 1;
export const STATUS_TREND_MAX_POINTS = 120; // 30秒 throttle で約1時間ぶん。
export const STATUS_TREND_MIN_GAP_MS = 30_000; // 積み過ぎない(storage 競合を増やさない)。

/** @param {unknown} v @returns {number|null} */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** raw を安全に TrendSample[] へ正規化(壊れた値は捨てる)。 @param {unknown} raw @returns {TrendSample[]} */
function normalizeLog(raw) {
  const items =
    raw && typeof raw === 'object' && Array.isArray(/** @type {any} */ (raw).items)
      ? /** @type {any[]} */ (/** @type {any} */ (raw).items)
      : [];
  /** @type {TrendSample[]} */
  const clean = [];
  for (const it of items) {
    const t = num(it?.t);
    if (t == null || t <= 0) continue;
    clean.push({
      t: Math.floor(t),
      recorded: Math.max(0, Math.floor(num(it?.recorded) ?? 0)),
      official: Math.max(0, Math.floor(num(it?.official) ?? 0)),
      ratePct: num(it?.ratePct),
      watch: num(it?.watch),
      catchingUp: it?.catchingUp === true
    });
  }
  return clean;
}

/**
 * KPI サンプルをリングに積む(throttle 付き)。前回から minGapMs 未満なら null を返す(=storage 更新しない)。
 * @param {unknown} prevRaw 既存 TrendLog(storage 由来)
 * @param {{ recorded?: number, official?: number, ratePct?: number|null, watch?: number|null, catchingUp?: boolean }} kpi
 * @param {number} nowMs
 * @param {{ minGapMs?: number, maxPoints?: number }} [opts]
 * @returns {TrendLog|null} 更新後ログ。throttle で間引いたら null。
 */
export function appendTrendSample(prevRaw, kpi, nowMs, opts = {}) {
  const now = num(nowMs);
  if (now == null) return null;
  const minGap = num(opts.minGapMs) ?? STATUS_TREND_MIN_GAP_MS;
  const cap = Math.max(8, Math.min(2000, Math.floor(num(opts.maxPoints) ?? STATUS_TREND_MAX_POINTS)));
  const items = normalizeLog(prevRaw);
  const last = items[items.length - 1];
  if (last && now - last.t < minGap) return null; // 間引き=積み過ぎない。
  /** @type {TrendSample} */
  const row = {
    t: Math.floor(now),
    recorded: Math.max(0, Math.floor(num(kpi?.recorded) ?? 0)),
    official: Math.max(0, Math.floor(num(kpi?.official) ?? 0)),
    ratePct: num(kpi?.ratePct),
    watch: num(kpi?.watch),
    catchingUp: kpi?.catchingUp === true
  };
  const nextItems = [...items, row].slice(-cap);
  return { v: STATUS_TREND_VERSION, items: nextItems };
}

/**
 * トレンドから劣化を検知する。十分な点(時間幅)が無ければ何も出さない(早合点しない)。
 * @param {unknown} raw TrendLog
 * @param {number} nowMs
 * @returns {TrendFinding[]}
 */
export function analyzeTrend(raw, nowMs) {
  const now = num(nowMs);
  /** @type {TrendFinding[]} */
  const findings = [];
  const items = normalizeLog(raw);
  if (now == null || items.length < 3) return findings; // 3点未満は傾向と言えない。

  const first = items[0];
  const last = items[items.length - 1];
  const spanMs = last.t - first.t;
  if (spanMs < 90_000) return findings; // 1分半未満は時間幅不足=判定しない(誤検知防止)。

  // 1) 記録が止まっている: 直近の窓(>=3分)で recorded が1件も増えていない。配信が続いていれば異常。
  //    「公式が増えているのに記録が増えない」=取りこぼし。公式も止まっていれば配信側が静かなだけ=出さない。
  const windowStart = now - 5 * 60_000;
  const win = items.filter((s) => s.t >= windowStart);
  if (win.length >= 3 && win[win.length - 1].t - win[0].t >= 180_000) {
    const recGrew = win[win.length - 1].recorded - win[0].recorded;
    const offGrew = win[win.length - 1].official - win[0].official;
    if (recGrew === 0 && offGrew > 0) {
      const mins = Math.round((win[win.length - 1].t - win[0].t) / 60_000);
      findings.push({
        id: 'records-stalled',
        severity: 'bad',
        message:
          `記録が約${mins}分前から増えていません(公式は ${offGrew} 件増加)。` +
          `取りこぼし=この配信タブを前面にして数分待つ→改善しなければ F5。記録(IndexedDB)は失われません。`
      });
    }
  }

  // 2) 取得率が下がり続けている: ratePct が有効な点が3つ以上あり、単調に低下し、合計低下が >=10pt。
  //    多タブ名残の一時的揺れと区別するため「一貫した低下」かつ「明確な幅」だけ。
  //    v0.1.887: ただし直近窓に「放送中×追いつき中(catchingUp)」の点が1つでもあれば出さない。
  //    新配信を途中参加で開くと公式の分母が判明して取得率が 100%→低% に落ちるのは【正常な追いつき中】で
  //    あって劣化ではない(per-stream の v0.1.886 と同じ偽陽性が trend 側に残っていた)。本当の劣化=
  //    「もう追いつき中の配信が無い(全部 endedAt or 100%)のに取得率が単調低下」だけを warn にする。
  const rated = items.filter((s) => s.ratePct != null);
  if (rated.length >= 3) {
    const recent = rated.slice(-4);
    const anyCatchingUp = recent.some((s) => s.catchingUp === true);
    let monotoneDown = true;
    for (let i = 1; i < recent.length; i++) {
      if (/** @type {number} */ (recent[i].ratePct) > /** @type {number} */ (recent[i - 1].ratePct)) {
        monotoneDown = false;
        break;
      }
    }
    const drop =
      /** @type {number} */ (recent[0].ratePct) - /** @type {number} */ (recent[recent.length - 1].ratePct);
    if (monotoneDown && drop >= 10 && !anyCatchingUp) {
      findings.push({
        id: 'rate-declining',
        severity: 'warn',
        message:
          `取得率が下がり続けています(${Math.round(/** @type {number} */ (recent[0].ratePct))}%→` +
          `${Math.round(/** @type {number} */ (recent[recent.length - 1].ratePct))}%)。` +
          `公式の伸びに記録が追いつけていない可能性=タブを前面にして様子を見てください。`
      });
    }
  }

  return findings;
}
