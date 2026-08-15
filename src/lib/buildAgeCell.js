/**
 * buildAgeCell.js — いま動いているビルドが【いつのものか】を出す(純関数)。
 *
 * ★なぜ要るか(2026-08-14 の事件・会議 lead が「1往復で終わっていた」と名指し)
 *   私は7版を出したつもりで、実機には**1つも届いていなかった**。
 *   Chrome はリポの `extension/` を直接読むのに、私は別の場所へ配っていた。
 *   ユーザーの実機はずっと **v0.1.1283(8日前)** のままで、
 *   その間ユーザーが言い続けた「**なにもかわってない**」は**全部正しかった**。
 *
 *   このとき速報は自分の古さを1文字も言わなかった。
 *   ＝ 速報が「私は8日前のビルドです」と最初の1行で言っていれば、
 *     **7版ぶんの空振りは起きなかった**。
 *
 * ■ 判定の考え方
 *   ビルド時刻そのものは異常ではない(古い版を使い続けるのは自由)。
 *   ★しかし **開発中(＝ユーザーが修正を待っている)** 文脈では、
 *     数日前のビルドは「反映されていない」の第一容疑者になる。
 *   よって: 24時間以内=ok / 3日以内=warn / それ以上=bad とし、
 *   文言は責めずに「反映されていない可能性」を示す。
 *
 * ■ NL_BUILD_ID の形式(scripts/build.mjs の buildIdJst)
 *   `MMDD-HHmmss`(JST)。**年が入っていない**ので、
 *   年をまたぐと差が巨大/負になる。素直に引き算すると
 *   1月1日に「364日前のビルド」と誤診する。
 *   → 未来向きに出た差は「年をまたいだ」と解釈して1年戻す。
 *     ★ここは実際に踏みうる罠なので test で固定する。
 *
 * @module buildAgeCell
 */

/** `MMDD-HHmmss` を厳密に判定する。 */
const BUILD_ID_RE = /^(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/;

/** 24時間。 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * BUILD_ID(JST の MMDD-HHmmss)と現在時刻から、ビルドの古さ[ms]を求める。
 *
 * ★呼び出し側が now を渡す(純関数・時計を内部で読まない)。
 *
 * @param {unknown} buildId 例 '0815-204834'
 * @param {number} nowMs Date.now()
 * @returns {number|null} 古さ[ms]。読めなければ null。
 */
export function buildAgeMs(buildId, nowMs) {
  const s = String(buildId ?? '').trim();
  const m = s.match(BUILD_ID_RE);
  const now = Number(nowMs);
  if (!m || !Number.isFinite(now) || now <= 0) return null;

  const [, mm, dd, hh, mi, ss] = m;
  /*
   * ★JST 固定で組む。ブラウザのタイムゾーンで解釈すると、
   *   JST 以外の環境で最大±半日ずれる(「昨日のビルド」を今日と誤判定する)。
   *   UTC で組んで JST 分(-9h)を引く。
   */
  const jstNow = new Date(now + 9 * 60 * 60 * 1000);
  const year = jstNow.getUTCFullYear();
  const asUtc = Date.UTC(year, Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
  let builtMs = asUtc - 9 * 60 * 60 * 1000;

  /*
   * ★年またぎ: 12月のビルドを1月に読むと「未来」に見える。
   *   1日分の余裕(時計ずれ)を超えて未来なら、前年のビルドとみなす。
   */
  if (builtMs - now > DAY_MS) {
    const prevUtc = Date.UTC(year - 1, Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
    builtMs = prevUtc - 9 * 60 * 60 * 1000;
  }
  return Math.max(0, now - builtMs);
}

/**
 * 古さを日本語にする。
 * @param {number} ageMs
 * @returns {string}
 */
function humanAge(ageMs) {
  const min = Math.floor(ageMs / 60000);
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  return `${Math.floor(hour / 24)}日前`;
}

/**
 * 「このビルドの古さ」セル。
 *
 * @param {{ buildId?: unknown, version?: unknown, nowMs?: number }} input
 * @returns {import('./healthCells.js').HealthCell}
 */
export function buildBuildAgeCell(input) {
  const now = Number(input?.nowMs) || 0;
  const ageMs = buildAgeMs(input?.buildId, now);
  const ver = String(input?.version ?? '').trim();
  const verPart = ver ? `v${ver} ` : '';

  if (ageMs == null) {
    return {
      id: 'build-age', label: 'このビルドの新しさ', kind: /** @type {'state'} */ ('state'),
      value: null, level: /** @type {'na'} */ ('na'), text: '—'
    };
  }

  const level = ageMs >= 3 * DAY_MS ? 'bad' : ageMs >= DAY_MS ? 'warn' : 'ok';
  const text = level === 'ok'
    ? `${verPart}${humanAge(ageMs)}のビルド`
    : `${verPart}${humanAge(ageMs)}のビルドです。最新の修正が反映されていない可能性があります`;

  return {
    id: 'build-age', label: 'このビルドの新しさ', kind: /** @type {'state'} */ ('state'),
    value: null, level: /** @type {'ok'|'warn'|'bad'} */ (level), text
  };
}
