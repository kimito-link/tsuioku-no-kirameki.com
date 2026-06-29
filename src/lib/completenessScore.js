// @ts-nocheck — セル(動的 level)とレジストリを突き合わせて集計する。判定文字列は実行時に固定。
/**
 * completenessScore.js — 状態速報「網羅的完全性診断(PageSpeed 型)」のスコア集計(純関数)。
 *
 * 背景(council/completeness-diagnosis-SYNTHESIS.md): healthCells(23+セル)を diagnosisRegistry の
 *   category/weight/mandatory と突き合わせ、PageSpeed 風の「カテゴリ別スコア + 総合達成率 +
 *   ✅完璧判定 + 完璧まであと何項目 + 対象外N項目」を出す。表示(aiShareFullText)と計算をここで分離。
 *
 * 会議の裁定(司令塔が実コードで裏取り):
 *   - score 変換: ok=1 / warn=0.5 / bad=0 / processing=0.5。na は【除外】(構造的限界=匿名/該当無しを
 *     不合格にしない=嘘の赤を出さない)。ただし na の項目数は別途数えて「対象外N項目」と必ず明記(隠さない)。
 *   - 達成率(%) = Σ(weight·score)/Σweight ×100(na 除外後の母数)。
 *   - 「完全(✅完璧)」 = mandatory 項目が全て ok かつ warn/bad ゼロ かつ processing ゼロ。
 *       processing が残る間は「✅完璧」にしない(永遠 backfill で100%詐称を防ぐ)=「⏳取り込み中」。
 *
 * ★純関数(chrome 非依存)。入力は buildHealthCells() が返すセル配列だけ(新規 read なし)。
 *
 * @module completenessScore
 */

import {
  DIAGNOSIS_CATEGORIES,
  DIAGNOSIS_BY_ID,
  categoryById
} from './diagnosisRegistry.js';

/** level → スコア(0..1)。na は集計から除外するので null を返す。 */
function levelScore(level) {
  switch (level) {
    case 'ok':
      return 1;
    case 'warn':
      return 0.5;
    case 'processing':
      return 0.5;
    case 'bad':
      return 0;
    default:
      return null; // 'na' / 未知 = 母数から除外
  }
}

/**
 * セル配列 → 完全性スコアモデル。
 * @param {Array<{id:string, label:string, level:string}>} cells buildHealthCells() の戻り
 * @returns {{
 *   overallPct: number|null,
 *   verdict: 'complete'|'processing'|'incomplete'|'unknown',
 *   verdictText: string,
 *   naCount: number,
 *   processingCount: number,
 *   remainingToComplete: number,
 *   failing: Array<{id:string,label:string,level:string,category:string}>,
 *   categories: Array<{ id:string, label:string, pct:number|null, ok:number, total:number, na:number,
 *                       processing:number, failing:number, level:'ok'|'warn'|'bad'|'processing'|'na' }>
 * }}
 */
export function buildCompletenessScore(cells) {
  const list = Array.isArray(cells) ? cells : [];
  // カテゴリ別の集計箱を初期化(レジストリのカテゴリ順)。
  const catAgg = Object.create(null);
  for (const c of DIAGNOSIS_CATEGORIES) {
    catAgg[c.id] = { id: c.id, label: c.label, wsum: 0, wscore: 0, ok: 0, total: 0, na: 0, processing: 0, failing: 0 };
  }

  let wsumAll = 0;
  let wscoreAll = 0;
  let naCount = 0;
  let processingCount = 0;
  let mandatoryNotOk = 0;
  let warnBadCount = 0;
  const failing = [];

  for (const cell of list) {
    const meta = cell && DIAGNOSIS_BY_ID[cell.id];
    if (!meta) continue; // レジストリ外のセル(将来 id)は集計しない=網羅は test で別途強制
    const agg = catAgg[meta.category];
    if (!agg) continue;
    const level = cell.level;
    const sc = levelScore(level);
    agg.total += 1;

    if (sc == null) {
      // na = 対象外(母数から除外)。数だけ数えて明記する。
      agg.na += 1;
      naCount += 1;
      continue;
    }
    const w = Number(meta.weight) || 1;
    agg.wsum += w;
    agg.wscore += w * sc;
    wsumAll += w;
    wscoreAll += w * sc;

    if (level === 'ok') agg.ok += 1;
    if (level === 'processing') {
      agg.processing += 1;
      processingCount += 1;
    }
    if (level === 'warn' || level === 'bad') {
      agg.failing += 1;
      warnBadCount += 1;
      failing.push({ id: meta.id, label: meta.label, level, category: meta.category });
    }
    if (meta.mandatory && level !== 'ok') mandatoryNotOk += 1;
  }

  // カテゴリ別 pct と level を確定。
  const categories = DIAGNOSIS_CATEGORIES.map((c) => {
    const a = catAgg[c.id];
    const pct = a.wsum > 0 ? Math.round((a.wscore / a.wsum) * 100) : null;
    let level = 'na';
    if (a.failing > 0) level = a.failing && a.wscore / Math.max(1, a.wsum) < 0.5 ? 'bad' : 'warn';
    else if (a.processing > 0) level = 'processing';
    else if (a.wsum > 0) level = 'ok';
    return { id: a.id, label: a.label, pct, ok: a.ok, total: a.total, na: a.na, processing: a.processing, failing: a.failing, level };
  });

  const overallPct = wsumAll > 0 ? Math.round((wscoreAll / wsumAll) * 100) : null;

  // 完全判定: mandatory 全 ok かつ warn/bad ゼロ かつ processing ゼロ → complete。
  //   processing が残る → processing(取り込み中)。warn/bad or mandatory 未達 → incomplete。
  //   集計対象が1つも無い(全 na/未起動) → unknown。
  let verdict = 'unknown';
  if (wsumAll <= 0) verdict = 'unknown';
  else if (warnBadCount === 0 && mandatoryNotOk === 0 && processingCount === 0) verdict = 'complete';
  else if (warnBadCount === 0 && mandatoryNotOk === 0 && processingCount > 0) verdict = 'processing';
  else verdict = 'incomplete';

  // 「✅完璧まであと何項目」= warn/bad の数 + 未達 mandatory のうち warn/bad に未計上分(重複避け)。
  //   processing は「あと項目」に数える(完璧を名乗らせないため)。簡潔に: failing + processing。
  const remainingToComplete = warnBadCount + processingCount;

  const verdictText = formatVerdictText({ verdict, overallPct, remainingToComplete, naCount });

  return {
    overallPct,
    verdict,
    verdictText,
    naCount,
    processingCount,
    remainingToComplete,
    failing,
    categories
  };
}

/** 総合判定の1行文言。 */
function formatVerdictText({ verdict, overallPct, remainingToComplete, naCount }) {
  const pctStr = overallPct == null ? '—' : `${overallPct}%`;
  const naStr = naCount > 0 ? ` ・ 対象外 ${naCount}項目` : '';
  if (verdict === 'complete') return `✅ 完璧 (達成 ${pctStr}${naStr})`;
  if (verdict === 'processing') return `⏳ 取り込み中 (達成 ${pctStr} ・ 完璧まであと ${remainingToComplete}項目${naStr})`;
  if (verdict === 'incomplete') return `🔴 未完成 (達成 ${pctStr} ・ 完璧まであと ${remainingToComplete}項目${naStr})`;
  return `— 判定対象なし (まだ配信を見ていない/データ未取得${naStr})`;
}

/**
 * 完全性スコアを状態速報用テキスト行に整形する。
 * @param {ReturnType<typeof buildCompletenessScore>} score
 * @returns {string[]}
 */
export function formatCompletenessScoreLines(score) {
  if (!score) return [];
  const lines = [];
  lines.push('### 完全性スコア');
  lines.push(`総合: ${score.verdictText}`);
  for (const cat of score.categories) {
    const mark = cat.level === 'ok' ? '🟢' : cat.level === 'warn' ? '🟡' : cat.level === 'bad' ? '🔴' : cat.level === 'processing' ? '⏳' : '⚪';
    const pctStr = cat.pct == null ? '対象外' : `${cat.pct}%`;
    const naSuffix = cat.na > 0 ? ` ・対象外${cat.na}` : '';
    // 集計対象0(全 na/未使用)のカテゴリは「— 未使用/対象外」を出す(死に行で埋めない判断はしない=網羅優先)。
    const countStr = cat.total > 0 ? ` (${cat.ok}/${cat.total - cat.na}${naSuffix})` : '';
    lines.push(`- ${cat.label}: ${mark} ${pctStr}${countStr}`);
  }
  if (score.failing.length) {
    const names = score.failing.map((f) => `${f.label}(${categoryById(f.category).label})`).join(' / ');
    lines.push(`不合格の項目: ${names}`);
  }
  return lines;
}
