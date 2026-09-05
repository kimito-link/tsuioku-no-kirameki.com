/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】「その指標、いつから測っていないか」の判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】指標の陳腐化の判定はこのファイルのみ
 *
 * improvementStaleness.js — ★「測っていない指標」を数える。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★なぜ要るか(2026-08-22 ユーザー指摘「退化してない？進化させる計器のはず」)
 *
 *   ★実測すると、台帳はこうなっていた:
 *     diag-ms(診断の所要)   … 最終 v0.1.1416（★10日以上前）
 *     panel-block-ms        … 最終 v0.1.1454
 *     dom-nodes 他6種       … ★一度も記録が無い
 *     bundle-kb / gate-selftest … 毎版(自動記録)
 *
 *   ＝ ★10指標のうち【自動の2つしか動いていなかった】。
 *   その間に診断の所要は 29,303ms → 19ms と1,500倍動いたのに、
 *   ★台帳には1件も残っていない。
 *
 * ■ ★これは「オプトインの台帳は死ぬ」の再来
 *   手で書く指標は、書くのを忘れた瞬間に死ぬ。
 *   ★このリポは同じ型を既に踏んでいる(diagChannelRegistry は3ヶ月で登録1件)。
 *
 * ■ ★どう解くか（強制しない・気づけるようにする）
 *   「書かないと赤」にすると【嘘の数字】が入る(規約③と同じ理由)。
 *   → ★**何版ぶん測っていないかを数えて見せる**だけにする。
 *     数が増えていくのが見えれば、忘れたことを忘れられない。
 *
 * ■ ★なぜ「一度も無い」と「古い」を分けるか
 *   一度も無い … まだ測る手段が無い/対象外かもしれない（★まだ分からない）
 *   古い       … ★測れるのに測っていない（放置されている）
 *   [[unknown-vs-absent]] と同じ仕分け。混ぜると優先順位が付けられない。
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * ここを超えて記録が無ければ「放置されている」とみなす版数。
 *
 * ★10の根拠: このリポは1日に5〜8版出る。10版＝おおよそ1〜2日。
 *   それ以上あいだが空くなら、意図して測っていない状態と言える。
 */
export const IMPROVEMENT_STALE_VERSIONS = 10;

/** @param {string} v @returns {number[]} */
function parseVersion(v) {
  return String(v || '')
    .split('.')
    .map((p) => Number(p))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

/**
 * 版の距離(何版ぶん離れているか)。同じ体系(0.1.x)を前提に patch 差で数える。
 * @param {string} from @param {string} to
 * @returns {number|null} 測れなければ null
 */
export function versionDistance(from, to) {
  const a = parseVersion(from);
  const b = parseVersion(to);
  if (a.length < 3 || b.length < 3) return null;
  // ★major/minor が違うなら patch 差では測れない＝measured でない
  if (a[0] !== b[0] || a[1] !== b[1]) return null;
  return Math.abs(b[2] - a[2]);
}

/**
 * @typedef {object} StalenessRow
 * @property {string} metric 指標ID
 * @property {string} label 人が読む名前
 * @property {'fresh'|'stale'|'never'} state ★never と stale を混ぜない
 * @property {string} lastVersion 最後に記録された版('' なら一度も無い)
 * @property {number|null} behind 何版ぶん測っていないか(測れなければ null)
 */

/**
 * 指標ごとに「いつから測っていないか」を出す。
 *
 * @param {object} input
 * @param {readonly {id:string,label:string}[]} input.metrics 宣言テーブル
 * @param {readonly {version:string,metric:string}[]} input.history 実測値の台帳
 * @param {string} input.currentVersion いまの版
 * @param {number} [input.staleAfter] 何版空いたら stale とするか
 * @returns {StalenessRow[]} ★宣言順。fresh も返す(全体像が見えないと判断できない)
 */
export function analyzeImprovementStaleness(input) {
  const metrics = Array.isArray(input?.metrics) ? input.metrics : [];
  const history = Array.isArray(input?.history) ? input.history : [];
  const current = String(input?.currentVersion || '');
  const staleAfter =
    typeof input?.staleAfter === 'number' && Number.isFinite(input.staleAfter) && input.staleAfter > 0
      ? input.staleAfter
      : IMPROVEMENT_STALE_VERSIONS;

  return metrics.map((m) => {
    const id = String(m?.id || '');
    const rows = history.filter((r) => String(r?.metric || '') === id);
    if (rows.length === 0) {
      // ★「一度も無い」は放置とは限らない(まだ測る手段が無いかもしれない)
      return /** @type {StalenessRow} */ ({
        metric: id,
        label: String(m?.label || id),
        state: 'never',
        lastVersion: '',
        behind: /** @type {number|null} */ (null)
      });
    }
    const lastVersion = String(rows[rows.length - 1]?.version || '');
    const behind = versionDistance(lastVersion, current);
    const state = behind !== null && behind > staleAfter ? 'stale' : 'fresh';
    return { metric: id, label: String(m?.label || id), state, lastVersion, behind };
  });
}

/**
 * 人が読む1行にする。★数だけ出して強制はしない。
 * @param {StalenessRow[]} rows
 * @returns {string}
 */
export function formatImprovementStalenessLine(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const stale = list.filter((r) => r.state === 'stale');
  const never = list.filter((r) => r.state === 'never');
  const fresh = list.filter((r) => r.state === 'fresh');

  const head = `改善記録の鮮度: 測れている ${fresh.length} / ${list.length} 種`;
  if (stale.length === 0 && never.length === 0) return `${head} ✅`;

  const lines = [head];
  if (stale.length) {
    lines.push(
      `  🟡 ${stale.length}種が放置されています(測れるのに測っていない): `
      + stale.map((r) => `${r.label}(${r.behind}版前)`).join(' / ')
    );
  }
  if (never.length) {
    lines.push(
      `  ⚪ ${never.length}種は一度も記録がありません(★測る手段が無いだけかもしれません): `
      + never.map((r) => r.label).join(' / ')
    );
  }
  return lines.join('\n');
}
