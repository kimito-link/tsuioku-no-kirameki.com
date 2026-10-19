/**
 * 黒い幕(サイドパネルの縞)の「回ごとの記録」と、ユーザーが言わなくても読める結論の1行(純粋関数・I/O禁止)。v0.1.1690
 *
 * ■ なぜ要るか(2026-10-19・ユーザー「黒い幕は相変わらず出る。伝えなくても計器でわかるようにしてほしい」)
 *   既存の「サイドパネルを開く時間」は、中央値と最大しか出さない(例: 中央値1.7秒・最大21.7秒)。何回のうち何回が黒かったか、
 *   どの回がどの区間で時間を食ったかは、回ごとの記録(opens 履歴)に既にあるのに、読める形になっていなかった。
 *   → 回ごとに「黒かった時間」と「時間を食った区間」を並べ、冒頭に「直近N回のうち気づく/長い回が何回・最長」を出す。
 *
 * ■ 測る時間
 *   押した回: 押下 → 親の最初の描画(clickToFirstPaintMs)。
 *   押していない回(タブ切替など): 文書開始 → 親の最初の描画(docToFirstPaintMs)=【下限】(押下より前の時間は測れない)。
 *   最初の描画が取れていない回は「未描画」(黒いままの疑い)。
 *
 * ■ 守ること: 事実の数値と区間だけ。原因は断定しない。描画には関与しない。
 * @module blackCurtainLedger
 */

/** これ以上は「気づく」黒さ(ms)。 */
export const BLACK_NOTICEABLE_MS = 400;
/** これ以上は「長い」黒さ(ms)。 */
export const BLACK_LONG_MS = 1500;
/** 区間の名指しをする最小の長さ(ms)。これ未満の区間は名指ししない。 */
const WHERE_MIN_MS = 300;

/** @param {unknown} v */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * @typedef {{ id: number, source: 'click'|'doc', blackMs: number|null, grade: 'ok'|'noticeable'|'long'|'unpainted', where: 'click_to_doc'|'before_script'|'after_script'|'none', clickToDocMs: number|null, docToFirstPaintMs: number|null, scriptAtMs: number|null }} CurtainRow
 */

/**
 * @param {unknown} opens opens 履歴(sidepanelOpenTiming.buildOpenTiming の結果の配列)
 * @returns {CurtainRow[]} 新しい順
 */
export function buildBlackCurtainRows(opens) {
  const list = Array.isArray(opens) ? opens.filter((e) => e && typeof e === 'object') : [];
  /** @type {CurtainRow[]} */
  const rows = [];
  for (const raw of list) {
    const e = /** @type {any} */ (raw);
    const id = num(e.id);
    if (id == null) continue;
    const click = e.clickMissing !== true && num(e.clickToFirstPaintMs) != null;
    const blackMs = click ? num(e.clickToFirstPaintMs) : num(e.docToFirstPaintMs);
    const clickToDocMs = num(e.clickToDocMs);
    const docToFirstPaintMs = num(e.docToFirstPaintMs);
    const scriptAtMs = num(e.scriptAtMs);
    /** @type {CurtainRow['grade']} */
    let grade = 'ok';
    if (blackMs == null) grade = 'unpainted';
    else if (blackMs >= BLACK_LONG_MS) grade = 'long';
    else if (blackMs >= BLACK_NOTICEABLE_MS) grade = 'noticeable';
    /** @type {CurtainRow['where']} */
    let where = 'none';
    if (blackMs != null && blackMs >= BLACK_NOTICEABLE_MS) {
      if (click && clickToDocMs != null && clickToDocMs >= WHERE_MIN_MS && clickToDocMs >= blackMs / 2) where = 'click_to_doc';
      else if (docToFirstPaintMs != null && scriptAtMs != null && scriptAtMs >= WHERE_MIN_MS && scriptAtMs >= docToFirstPaintMs / 2) where = 'before_script';
      else if (docToFirstPaintMs != null && docToFirstPaintMs >= WHERE_MIN_MS) where = 'after_script';
    }
    rows.push({ id: Math.round(id), source: click ? 'click' : 'doc', blackMs: blackMs == null ? null : Math.round(blackMs), grade, where, clickToDocMs, docToFirstPaintMs, scriptAtMs });
  }
  rows.sort((a, b) => b.id - a.id);
  return rows;
}

const WHERE_LABEL = {
  click_to_doc: '押下→文書開始(Chrome/SW側)',
  before_script: '文書作成→スクリプト開始(拡張プロセスが先に塞がっていた)',
  after_script: 'スクリプト開始→最初の描画',
  none: ''
};

/** @param {number} ms */
const ago = (ms) => {
  if (!(ms >= 0)) return '?';
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}秒前`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m}分前` : `${Math.round(m / 60)}時間前`;
};

/**
 * 状態速報に出す記録(複数行)。事実だけ。
 * @param {unknown} opens
 * @param {number} nowMs
 * @returns {string} 記録が無ければ ''
 */
export function formatBlackCurtainLedger(opens, nowMs) {
  const rows = buildBlackCurtainRows(opens);
  if (!rows.length) return '';
  const longN = rows.filter((r) => r.grade === 'long' || r.grade === 'unpainted').length;
  const notN = rows.filter((r) => r.grade === 'noticeable').length;
  const blacks = /** @type {number[]} */ (rows.map((r) => r.blackMs).filter((v) => typeof v === 'number'));
  const worst = blacks.length ? Math.max(...blacks) : null;
  const head =
    longN + notN === 0
      ? `黒い幕の記録: 直近${rows.length}回のすべてが${BLACK_NOTICEABLE_MS}ms未満(最長${worst ?? '?'}ms)`
      : `黒い幕の記録: 直近${rows.length}回のうち 長い${longN}回(${BLACK_LONG_MS}ms以上か未描画)・気づく${notN}回(${BLACK_NOTICEABLE_MS}ms以上)・最長${worst ?? '?'}ms`;
  const body = rows.map((r) => {
    const t = ago(nowMs - r.id);
    const kind = r.source === 'click' ? '押下から' : '押下なし(切替など・下限)';
    const grade = { ok: '速い', noticeable: '気づく', long: '長い', unpainted: '未描画' }[r.grade];
    const where = r.where !== 'none' ? ` ← 主に ${WHERE_LABEL[r.where]}` : '';
    return `  ・${t} ${kind} ${r.blackMs == null ? '最初の描画が取れず' : `${r.blackMs}ms`} [${grade}]${where}`;
  });
  return [head, ...body].join('\n');
}
