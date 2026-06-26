// @ts-nocheck — 任意の lv サマリを歩く動的判定
/**
 * 「数字の出どころ（何を数えているか）」を状態速報に事実として出す（council/comment-count-provenance-question.txt）。
 *
 * 狙い = ユーザー実機「記録 1,005 > 本家コメ 926」のありえない逆転に対し、まず【各数字が何を・どのソースから・
 *   いつ数えているか】を事実として完全に出す。判定(正常/要確認)は今回やらない=誤検知ゼロ。
 *   ユーザー要求「正確なデータが完全に出る診断を(他より)先に」。
 *
 * 実コードで確定した各カウンタの正体:
 *   - 記録(recordedCount) = この PC が IndexedDB に保存した件数。【即時更新・単調】(同一配信内で後退しない=
 *     過去最大を保持)。ギフトシステムメッセージは保存時に除外。表示文言「応援コメント」だが実体は通常コメント全部。
 *   - 本家コメ(officialCommentCount) = ニコ生公式のコメント総数(NDGR statistics・page-intercept 経由)。
 *     【遅延して届く】(更新タイミングが不定)。
 *   → 配信中に「記録(即時・単調) > 本家(遅延値)」が一時的に起きるのは構造上正常。
 *
 * ★制約: 新規 storage read を増やさない(既に手元の lv サマリの値だけで組む)。純関数(chrome 非依存)。件数のみ。
 *
 * @module commentCountProvenance
 */

/** 数値化(取れなければ null)。 */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 日本語整形。 */
function ja(n) {
  return Number(n).toLocaleString('ja-JP');
}

/** 経過 ms を「N秒前/N分前」に(取れなければ '')。 */
function agoLabel(ms) {
  const m = Number(ms);
  if (!Number.isFinite(m) || m < 0) return '';
  const sec = Math.round(m / 1000);
  return sec < 90 ? `${sec}秒前` : `${Math.round(sec / 60)}分前`;
}

/**
 * 1配信ぶんの「数字の出どころ」を組む。判定はせず事実だけを構造化する。
 * @param {object} lv summarizeOneLive の戻り(recordedCount/officialCommentCount/officialRatePct/lastIngestAgoMs/lv 等)
 * @returns {object|null} 出どころ事実(数字が無ければ null)
 */
export function buildCommentCountProvenance(lv) {
  const o = lv && typeof lv === 'object' ? lv : null;
  if (!o) return null;
  const recorded = num(o.recordedCount);
  const official = num(o.officialCommentCount);
  if (recorded == null && official == null) return null;

  const ratePct =
    recorded != null && official != null && official > 0
      ? Math.round((recorded / official) * 100)
      : null;

  return {
    lv: String(o.lv || o.liveId || ''),
    recorded: {
      value: recorded,
      // 実コードの定義をそのまま事実として持つ(誇張も判定もしない)。
      what: 'この PC が保存した件数（即時・単調＝同一配信内で減らない・ギフト系は保存時に除外）',
      source: 'IndexedDB（自分の記録）'
    },
    official: {
      value: official,
      what: 'ニコ生公式のコメント総数',
      source: 'NDGR 公式統計（遅延して届く）',
      ageLabel: agoLabel(o.lastIngestAgoMs)
    },
    ratePct,
    // 逆転は「事実」として記すだけ(警告にはしない=今回は判定しない)。
    recordedExceedsOfficial: recorded != null && official != null && recorded > official
  };
}

/**
 * 状態速報に載せるテキスト行配列。判定はせず「何を数えているか」を並べる。
 * @param {object[]} livesData summarizeOneLive の配列
 * @returns {string[]}
 */
export function formatCommentCountProvenanceLines(livesData) {
  const lives = Array.isArray(livesData) ? livesData : [];
  const provs = lives.map(buildCommentCountProvenance).filter(Boolean);
  if (!provs.length) return [];

  const lines = [];
  lines.push('### 数字の出どころ（何を数えているか）');
  lines.push('（各数字が「何を・どこから・いつ」数えているかの事実です。判定はしていません）');
  for (const p of provs) {
    if (p.lv) lines.push(`[${p.lv}]`);
    if (p.recorded.value != null) {
      lines.push(`- 記録 ${ja(p.recorded.value)} = ${p.recorded.what}｜出どころ: ${p.recorded.source}`);
    }
    if (p.official.value != null) {
      const age = p.official.ageLabel ? `（${p.official.ageLabel}の値）` : '';
      lines.push(`- 本家コメ ${ja(p.official.value)} = ${p.official.what}${age}｜出どころ: ${p.official.source}`);
    }
    if (p.ratePct != null) {
      lines.push(`- 一致度: 記録/本家 = ${p.ratePct}%`);
    }
    if (p.recordedExceedsOfficial) {
      // 事実＋構造的な理由の注記(警告ではない)。
      lines.push(
        '  ※ 記録が本家コメより多いことがあります。記録は「即時・単調（減らない）」、本家コメは「公式の遅延値」' +
          'なので、配信中は記録が一時的に上回るのは仕組み上ふつうです（数え方が違うだけで壊れてはいません）。'
      );
    }
  }
  return lines;
}
