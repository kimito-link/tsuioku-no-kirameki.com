/**
 * censusWatch.js — 状態速報の「拡張プロセスの忙しさ(文書別)」を、数字だけで機械的に読む純関数(2026-10-20)。
 *
 * 背景: 配置のたびに「更新→F5→3分待つ→『おした』→速報を読む→基準線と比べる」を人と私が手でやっていた。
 *   この読み取り〜比較を機械にする(scripts/census-watch.mjs が使う)。判定は人の記憶でなくコードに置く。
 *
 * 安全: 速報本文には第三者のコメント本文・名前が入りうる。ここは census 行(「・<種類>#<id> 稼働…」)だけを
 *   正規表現で拾い、返すのは「数字」と「nls_ で始まるキー名」だけ。入力の他の文字列は返さない・保存しない。
 *
 * 誤読の防止: 台帳 oc は【上位3族】しか出ない。キーが無い=0回、とは限らない(別の大きい族に押し出されただけの
 *   可能性)。evaluateExpect はそれを 'absent-from-top3' と明示し、pass とは言わない。
 *
 * @module censusWatch
 */

/** @typedef {{ key: string, n: number, kb: number }} OcEntry */
/** @typedef {{ kind: string, id: string, windowSec: number, busyPct: number|null, oc: OcEntry[] }} CensusDoc */
/** @typedef {{ version: string|null, writeMode: 'chunk'|'whole'|'unknown', commentRatePerSec: number|null, docs: CensusDoc[] }} CensusReport */
/** @typedef {{ maxPerMin: number, maxKbPerMin: number, docs: number }} KeyAgg */

const DOC_LINE_RE = /^\s*・([a-z][a-z-]*)#([a-z0-9]+) 稼働(\d+)(分|秒):(.*)$/;
const BUSY_RE = /=稼働の([\d.]+)%/;
const OC_RE = /(nls_[A-Za-z0-9_*]+)×(\d+)\((\d+)KB\)/g;
const VERSION_RE = /サイドパネル自己診断:[^\n]*? \/ (v\d+\.\d+\.\d+) \//;
const RATE_RE = /取得 ([\d.]+)件\/秒/;

/**
 * @param {unknown} text 状態速報の本文
 * @returns {CensusReport}
 */
export function parseCensusReport(text) {
  const s = typeof text === 'string' ? text : '';
  /** @type {CensusDoc[]} */
  const docs = [];
  for (const line of s.split('\n')) {
    const m = DOC_LINE_RE.exec(line);
    if (!m) continue;
    const windowSec = Number(m[3]) * (m[4] === '分' ? 60 : 1);
    const rest = m[5];
    const busy = BUSY_RE.exec(rest);
    /** @type {OcEntry[]} */
    const oc = [];
    const at = rest.indexOf('onChanged');
    if (at >= 0) {
      OC_RE.lastIndex = 0;
      const tail = rest.slice(at);
      let k;
      while ((k = OC_RE.exec(tail))) oc.push({ key: k[1], n: Number(k[2]), kb: Number(k[3]) });
    }
    docs.push({ kind: m[1], id: m[2], windowSec, busyPct: busy ? Number(busy[1]) : null, oc });
  }
  const ver = VERSION_RE.exec(s);
  const rate = RATE_RE.exec(s);
  /** @type {'chunk'|'whole'|'unknown'} */
  let writeMode = 'unknown';
  if (/コメント書込モード ✅チャンク追記/.test(s)) writeMode = 'chunk';
  else if (/コメント書込モード[^\n]*(丸ごと|全件|whole)/.test(s)) writeMode = 'whole';
  return {
    version: ver ? ver[1] : null,
    writeMode,
    commentRatePerSec: rate ? Number(rate[1]) : null,
    docs
  };
}

/**
 * 窓の十分長い文書が1つでもあるか(10秒窓の「0回」を信じないための関所)。
 * @param {CensusReport} report
 * @param {number} minSec
 */
export function isWindowMature(report, minSec) {
  return report.docs.some((d) => d.windowSec >= minSec);
}

/** コメントが流れているとみなす最低の取得率(件/秒)。これ未満の窓では comments 系の判定は無効。 */
export const MIN_COMMENT_RATE = 0.2;
/** 速報がこの秒数より古ければ待つ(status-live 自身も5分以上古いと警告する)。 */
export const MAX_REPORT_AGE_SEC = 300;

/**
 * 「いま判定してよいか」を決める。ready でなければ reasons に待つ理由を全部返す。
 * @param {CensusReport} report
 * @param {{ wantVersion?: string|null, minWindowSec: number, reportAgeSec: number|null }} ctx
 * @returns {{ ready: boolean, reasons: string[], commentsFlowing: boolean }}
 */
export function decideReady(report, ctx) {
  /** @type {string[]} */
  const reasons = [];
  if (ctx.reportAgeSec == null || ctx.reportAgeSec > MAX_REPORT_AGE_SEC) {
    reasons.push(`速報が古い/生成時刻不明(${ctx.reportAgeSec == null ? '不明' : Math.round(ctx.reportAgeSec) + '秒'})`);
  }
  if (ctx.wantVersion && report.version !== ctx.wantVersion) {
    reasons.push(`版が違う(期待 ${ctx.wantVersion} / 実機 ${report.version || '不明'})=更新+F5 待ち`);
  }
  if (!report.docs.length) {
    reasons.push('census 行が無い(状態画面が開いていない/まだ溜まっていない)');
  } else if (!isWindowMature(report, ctx.minWindowSec)) {
    const longest = Math.max(...report.docs.map((d) => d.windowSec));
    reasons.push(`窓が短い(最長 ${longest}秒 < ${ctx.minWindowSec}秒)`);
  }
  const commentsFlowing = report.commentRatePerSec != null && report.commentRatePerSec >= MIN_COMMENT_RATE;
  if (!commentsFlowing) {
    reasons.push(`コメントがほぼ流れていない(取得 ${report.commentRatePerSec ?? '不明'}件/秒 < ${MIN_COMMENT_RATE})`);
  }
  return { ready: reasons.length === 0, reasons, commentsFlowing };
}

/**
 * キーごとの『毎分の回数/KB』の最大(文書ごと)。窓が minSec 未満の文書は使わない。
 * @param {CensusDoc[]} docs
 * @param {number} minSec
 * @returns {Record<string, KeyAgg>}
 */
export function aggregateByKey(docs, minSec) {
  /** @type {Record<string, KeyAgg>} */
  const out = {};
  for (const d of docs) {
    if (d.windowSec < minSec || d.windowSec <= 0) continue;
    const min = d.windowSec / 60;
    for (const o of d.oc) {
      const slot = out[o.key] || (out[o.key] = { maxPerMin: 0, maxKbPerMin: 0, docs: 0 });
      slot.docs += 1;
      slot.maxPerMin = Math.max(slot.maxPerMin, o.n / min);
      slot.maxKbPerMin = Math.max(slot.maxKbPerMin, o.kb / min);
    }
  }
  return out;
}

/**
 * 「このキーは毎分 maxPerMin 回以下」の判定。上位3族に無いときは pass と言い切らない。
 * @param {Record<string, KeyAgg>} agg
 * @param {{ key: string, maxPerMin: number }} expect
 * @returns {{ verdict: 'pass'|'fail'|'absent-from-top3', perMin: number|null, note: string }}
 */
export function evaluateExpect(agg, expect) {
  const slot = agg[expect.key];
  if (!slot) {
    return {
      verdict: 'absent-from-top3',
      perMin: null,
      note: `${expect.key} はどの文書の上位3族にも出ていない(0回とは限らない。別の大きい族に押し出された可能性。族別の回数は測定用ブラウザで数える)`
    };
  }
  const ok = slot.maxPerMin <= expect.maxPerMin;
  return {
    verdict: ok ? 'pass' : 'fail',
    perMin: slot.maxPerMin,
    note: `${expect.key} 最大 ${slot.maxPerMin.toFixed(2)}回/分(基準 ${expect.maxPerMin}回/分以下)`
  };
}

/**
 * 基準線との差(毎分の回数)。どちらか片方にしかないキーも落とさない。
 * @param {Record<string, KeyAgg>} baseline
 * @param {Record<string, KeyAgg>} now
 * @returns {Array<{ key: string, baseline: number|null, now: number|null, changePct: number|null }>}
 */
export function compareToBaseline(baseline, now) {
  const keys = new Set([...Object.keys(baseline || {}), ...Object.keys(now || {})]);
  return [...keys].sort().map((key) => {
    const b = baseline && baseline[key] ? baseline[key].maxPerMin : null;
    const n = now && now[key] ? now[key].maxPerMin : null;
    const changePct = b != null && n != null && b > 0 ? ((n - b) / b) * 100 : null;
    return { key, baseline: b, now: n, changePct };
  });
}
