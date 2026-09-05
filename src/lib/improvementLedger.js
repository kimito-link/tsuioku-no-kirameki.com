/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】版ごとの実測値の「改善/退化」判定と、申請用の要約
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】指標の「どちらが良いか」の宣言はこのファイルのみ
 *
 * improvementLedger.js — ★版ごとの改善記録。数字で退化を止め、申請にも使う。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★ユーザー指示(2026-08-21)
 *   「計器にバージョンにより改善記録つくれますか？退化させないように」
 *   「申請のときにもつかえるように」
 *
 * ■ ★実データで確かめた現状(推測ではない)
 *   changelog は **1,349版**あるのにキーは version/date/summary/items の4つだけ。
 *   ＝ 実測値の欄が無く、「軽くしました」と書いてあっても**数字で証明できない**。
 *   数字を含む版は 390(29%)、うち before→after の形は **18版**だけだった。
 *
 * ■ ★設計の要(実データが教えてくれた)
 *   その18件を見ると **小さいほど良いとは限らない**:
 *     0.1.887  100% → 0%    ★改善(エラー率が消えた)
 *     0.1.1298 2回 → 13回    ★改善(描画が動くようになった)
 *     0.1.1102 3秒 → 12秒    ★改善(間引きを緩めて取りこぼしを無くした)
 *   → ★**方向は数字から推測できない**。指標ごとに宣言する。
 *     推測すると改善を退化と誤判定し、**直した人を止めてしまう**。
 *
 * ■ 掟
 *   ・★測れていないものを「改善」と言わない(根拠なき緑を作らない)
 *   ・★未宣言の指標は unknown。勝手に方向を決めない
 *   ・★申請文には**根拠のある項目だけ**載せる(載せると嘘になる)
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * @typedef {object} MetricSpec
 * @property {string} id 指標のID(主キー)
 * @property {string} label 人が読む名前
 * @property {'lower'|'higher'} better ★どちらが良いか。数字から推測しない
 * @property {string} unit 単位
 * @property {string} why なぜこの指標を見るのか(実損の記録)
 */

/**
 * ★指標の宣言テーブル(正本)。
 *
 * ★`better` を必ず書く。これが無いと 100%→0% を退化と誤判定する。
 * ★新しい指標を足すときは `why`(なぜ見るのか)も書く。書けないなら、
 *   その指標はまだ「測る価値がある」と言えていない。
 */
export const IMPROVEMENT_METRICS = Object.freeze([
  Object.freeze({
    id: 'diag-ms', label: '診断の所要', better: 'lower', unit: 'ms',
    why: '計器の読み過ぎで診断が817秒かかりアプリを重くした実事故(2026-07)'
  }),
  Object.freeze({
    id: 'bundle-kb', label: 'バンドルの大きさ', better: 'lower', unit: 'KB',
    why: '更新履歴が1,042KB(全体の43%)まで膨れ、親スレッドを1,373ms止めた'
  }),
  Object.freeze({
    id: 'panel-block-ms', label: 'パネルが止まる時間', better: 'lower', unit: 'ms',
    why: '実機で16.7秒中15.9秒(95%)停止。止まっている間は何も描けない'
  }),
  Object.freeze({
    id: 'dom-nodes', label: '画面の部品数', better: 'lower', unit: '個',
    // ★2026-08-31: 「業界推奨1,500」を撤回。その基準(Lighthouse dom-size)は
    //   13.0(2025-10)で廃止され、実測でも 7,053要素で recalc+layout 15.6ms
    //   (新基準の閾値40msの半分以下)だった。★理由を自分の実測に置き換える。
    why: '過去に3,984個で29.3秒固まった実測がある(桁が違うと実害が出る)'
  }),
  Object.freeze({
    id: 'repaint-per-comment', label: '1コメントあたりの描き直し', better: 'lower', unit: '回',
    why: '8.1回まで増えた実測がある(正常は3回以下)'
  }),
  Object.freeze({
    id: 'lane-repaint', label: 'レーンの描画回数', better: 'higher', unit: '回',
    why: '★0回=描けていない。増えるほど良い(0.1.1298 で 2回→13回 は改善)'
  }),
  Object.freeze({
    id: 'record-rate', label: 'コメント取得率', better: 'higher', unit: '%',
    why: '公式値に対する取りこぼしの少なさ。100%前後が正常'
  }),
  Object.freeze({
    id: 'comment-delay-sec', label: 'コメントの遅れ', better: 'lower', unit: '秒',
    why: '裏タブのタイマークランプで47秒遅延した実事故(2026-08-17)'
  }),
  Object.freeze({
    id: 'error-rate', label: 'エラー率', better: 'lower', unit: '%',
    why: '0.1.887 で 100%→0% にした実績(この形は「小さいほど良い」)'
  }),
  Object.freeze({
    id: 'gate-selftest', label: '自己検査を持つ検査の数', better: 'higher', unit: '本',
    why: '毒を入れても赤くならない検査は、静かに全部通す(45リポからの収穫)'
  }),
  Object.freeze({
    id: 'cross-checked-claims', label: '別の手段でも確かめた回数', better: 'higher', unit: '回',
    // ★2026-09-06 に1日分を数えた実測。訂正9件を分類したら共通構造が出た:
    //     #4 git merge-tree の出力だけ見て「衝突0件」→ 実際は7ファイル衝突
    //     #5 文字列カウントだけで「抽出しやすい関数4個」→ 構文解析すると0個
    //     #8 サブエージェントの報告だけで「重複5個」→ 自分で grep したら2個
    //   ★どれも【別の手段で1回確かめれば1分で分かった】。
    //   ★会議(2026-09-06)は「ツール出力のハッシュ二重検証」を提案したが、
    //     ★#4 で検証したところ成立しない: merge-tree は【正しく0件と返した】。
    //     誤りは改竄ではなく【正しい出力の誤読】だった。
    //     ⟹ 効くのはハッシュではなく【別経路でもう一度確かめたか】。
    // ★★なぜ「1つの手段で断定した回数(lower)」ではなく、この形(higher)なのか:
    //   前者は【正直に訂正を書くほど数字が悪化する】＝正直さを罰する指標になる。
    //   ★実際に測ってみたら、コミット本文の「訂正」記述は機械的に数えられた(直近5日で4件)。
    //   ★だからこそ危ない。書けば書くほど赤くなる仕組みは、書かない方向に働く。
    //   ⟹ ★【確かめた回数】を数える。増やす行動がそのまま正解になる。
    why: '9件の訂正のうち3件は「道具の出力を1つだけ見て断定」だった。別経路で1回確かめれば防げた(2026-09-06)'
  })
]);

/** @param {string} id @returns {MetricSpec|null} */
function specOf(id) {
  return IMPROVEMENT_METRICS.find((m) => m.id === id) || null;
}

/**
 * ★数値だけ受ける。`Number(null)===0` の穴を塞ぐ。
 * ★今日この穴を3回踏んでいる(popupDomCensus / aboutBlankGapVerdict / parityVerdict)。
 * @param {unknown} v @returns {number|null}
 */
function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * @typedef {object} ImprovementVerdict
 * @property {'improved'|'regressed'|'same'|'unknown'} direction
 * @property {string} line 人が読む1行
 * @property {MetricSpec|null} spec
 */

/**
 * before→after が改善か退化かを判定する。
 *
 * ★方向は必ず宣言テーブルから取る(数字から推測しない)。
 *
 * @param {{ metric?: string, before?: unknown, after?: unknown }} input
 * @returns {ImprovementVerdict}
 */
export function judgeImprovement(input) {
  const spec = specOf(String(input?.metric || ''));
  if (!spec) {
    return {
      direction: 'unknown',
      spec: null,
      line: `⚪ ${String(input?.metric || '(無名)')}: 未宣言の指標(改善か退化か判定できません)`
    };
  }
  const before = num(input?.before);
  const after = num(input?.after);
  if (before === null || after === null) {
    // ★測れていないものを改善と言わない。
    return {
      direction: 'unknown',
      spec,
      line: `⚪ ${spec.label}: 測れていません(改善とも退化とも言えません)`
    };
  }
  if (before === after) {
    return { direction: 'same', spec, line: `⚪ ${spec.label}: 変化なし(${after}${spec.unit})` };
  }
  const wentDown = after < before;
  const improved = spec.better === 'lower' ? wentDown : !wentDown;
  const arrow = `${before}${spec.unit} → ${after}${spec.unit}`;
  return improved
    ? { direction: 'improved', spec, line: `✅ ${spec.label}: ${arrow} 改善` }
    : { direction: 'regressed', spec, line: `🔴 ${spec.label}: ${arrow} ★退化` };
}

/**
 * 人が読む1行(judgeImprovement の line をそのまま返す薄い口)。
 * @param {{ metric?: string, before?: unknown, after?: unknown }} input
 * @returns {string}
 */
export function formatImprovementLine(input) {
  return judgeImprovement(input).line;
}

/**
 * ★版をまたいで「過去最良より悪くなった版」を名指しする。
 *
 * ★これが「退化させない」の芯。直前の版とだけ比べると、
 *   じわじわ悪化して元に戻るのを見逃す([[cumulative-value-shown-as-current-state]] と同型)。
 *   ★**過去最良**と比べる。
 *
 * @param {ReadonlyArray<{version?:string, metric?:string, value?:unknown}>|null|undefined} history
 * @returns {{version:string, metric:string, label:string, value:number, best:number, bestVersion:string}[]}
 */
export function detectRegressions(history) {
  if (!Array.isArray(history)) return [];
  /** @type {Map<string, {best:number, version:string}>} */
  const best = new Map();
  /** @type {{version:string, metric:string, label:string, value:number, best:number, bestVersion:string}[]} */
  const out = [];

  for (const raw of history) {
    const row = raw && typeof raw === 'object' ? raw : {};
    const spec = specOf(String(row.metric || ''));
    const value = num(row.value);
    if (!spec || value === null) continue; // ★測れていない行は判定しない
    const version = String(row.version || '');
    const prev = best.get(spec.id);
    if (!prev) {
      best.set(spec.id, { best: value, version });
      continue;
    }
    /*
     * ★note で【なぜ悪化してよいか】を書いた行は退化として数えない。
     *   ★ただし過去最良は更新しない(悪い方を新しい基準にしない)＝ラチェットは緩まない。
     *   ★このリポで生き残った仕掛けは全部この形(ベースライン＋ラチェット):
     *     既存の借金は許容し、★新規だけ赤にする。
     *   ★数字を消すのではなく【理由を書かせる】のが要。台帳に事実は残る。
     */
    const accepted = typeof row.note === 'string' && row.note.trim() !== '';
    const isBetter = spec.better === 'lower' ? value < prev.best : value > prev.best;
    if (isBetter) {
      best.set(spec.id, { best: value, version });
      continue;
    }
    if (value !== prev.best && !accepted) {
      out.push({
        version, metric: spec.id, label: spec.label,
        value, best: prev.best, bestVersion: prev.version
      });
    }
  }
  return out;
}

/**
 * ★申請(ストア審査)に出せる1枚を作る。
 *
 * ★根拠のある項目だけ載せる。測っていないものを「良くなりました」と書くと嘘になる
 *   ([[disclosure-must-match-behavior-2026-08-03]]: 文書4つと実挙動が食い違った実績)。
 *
 * @param {ReadonlyArray<{version?:string, metric?:string, before?:unknown, after?:unknown, note?:string}>|null|undefined} entries
 * @returns {string}
 */
export function buildSubmissionSummary(entries) {
  const rows = Array.isArray(entries) ? entries : [];
  const lines = [];
  lines.push('# 改善の記録（実測値）');
  lines.push('');
  lines.push('> 各行は「何を・どこから・どこまで」測った実測値です。');
  lines.push('> ★測れていない項目は載せていません（推定値・体感は含みません）。');
  lines.push('');

  /** @type {string[]} */
  const body = [];
  for (const raw of rows) {
    const row = raw && typeof raw === 'object' ? raw : {};
    const v = judgeImprovement(row);
    // ★根拠が無い/退化している項目は申請文に載せない。
    if (v.direction !== 'improved' || !v.spec) continue;
    const before = num(row.before);
    const after = num(row.after);
    const note = row.note ? ` — ${String(row.note)}` : '';
    body.push(`| ${String(row.version || '')} | ${v.spec.label} | ${before}${v.spec.unit} | ${after}${v.spec.unit} |${note ? ' ' + String(row.note) + ' |' : ' |'}`);
  }

  if (body.length === 0) {
    lines.push('まだ実測値つきの改善記録がありません。');
    return lines.join('\n');
  }
  lines.push('| 版 | 何を測ったか | 前 | 後 | 内容 |');
  lines.push('|---|---|---|---|---|');
  lines.push(...body);
  return lines.join('\n');
}
