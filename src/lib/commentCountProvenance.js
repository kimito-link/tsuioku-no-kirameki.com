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

/** 記録>本家 が「正常(遅延のせい)」とみなせる上限率。これを超えると要確認(二重計上/別配信混入の疑い)。 */
export const RECORD_OVER_OFFICIAL_NORMAL_MAX_PCT = 130;
/** 本家コメ値が「遅延中(=記録が先行して当然)」とみなす経過。これより新しいのに記録が大幅超なら異常寄り。 */
const OFFICIAL_FRESH_MS = 60 * 1000;

/**
 * 1配信ぶんの「数字の出どころ」を組む。事実に加え【3段階の判定】も持つ(v0.1.959)。
 *   判定: ok(記録≤本家=正常) / normal(記録>本家だが遅延で説明可=正常) / check(記録が本家を大幅超=要確認)。
 *   ★誤検知防止: 「記録>本家」は記録(即時単調) vs 本家(NDGR遅延)の構造で一時的に起きるのが正常。
 *     本家が遅延中(>60秒前) なら 130% までは normal。本家が新鮮(≤60秒前)なのに大幅超 or 率が 130% 超のときだけ check。
 * @param {object} lv summarizeOneLive の戻り(recordedCount/officialCommentCount/officialRatePct/lastIngestAgoMs/lv 等)
 * @returns {object|null} 出どころ事実+判定(数字が無ければ null)
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
  const recordedExceedsOfficial = recorded != null && official != null && recorded > official;
  const officialAgeMs = Number(o.lastIngestAgoMs);
  const officialIsFresh = Number.isFinite(officialAgeMs) && officialAgeMs >= 0 && officialAgeMs <= OFFICIAL_FRESH_MS;

  // 3段階判定(誤検知防止のため、判定できる材料が揃ったときだけ ok/normal/check を出す)。
  let verdict = 'unknown';
  let verdictReason = '';
  if (recorded != null && official != null && official > 0 && ratePct != null) {
    if (!recordedExceedsOfficial) {
      verdict = 'ok';
      verdictReason = '記録は本家コメ以下＝正常（記録は本家の一部）';
    } else if (ratePct > RECORD_OVER_OFFICIAL_NORMAL_MAX_PCT) {
      // 130% 超は遅延では説明しにくい=要確認(別配信混入/二重計上の疑い)。
      verdict = 'check';
      verdictReason = `記録が本家コメを大きく上回っています(${ratePct}%)。本家の遅延だけでは説明しにくく、別配信の混入か二重計上の疑いがあります`;
    } else if (officialIsFresh) {
      // 本家が新鮮(60秒以内)なのに記録超=遅延で説明できない=要確認。
      verdict = 'check';
      verdictReason = `本家コメが新鮮(${agoLabel(officialAgeMs)})なのに記録が上回っています(${ratePct}%)。遅延では説明しにくいので要確認です`;
    } else {
      verdict = 'normal';
      verdictReason = '記録が本家コメをやや上回るのは、記録が即時・単調／本家が遅延値のため＝正常範囲です';
    }
  }

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
    recordedExceedsOfficial,
    verdict,
    verdictReason
  };
}

/**
 * 「要確認(check)」の配信を症状カードに昇格する(buildStatusActions の結果に結合)。
 *   ★ok/normal/unknown は出さない=誤検知ゼロ(構造的に正常な逆転は警告しない)。
 * @param {object[]} livesData
 * @returns {Array<{id:string,severity:string,symptom:string,cause:string,action:string,fixableHere:string}>}
 */
export function commentCountProvenanceToActionCards(livesData) {
  const lives = Array.isArray(livesData) ? livesData : [];
  const cards = [];
  for (const lv of lives) {
    const p = buildCommentCountProvenance(lv);
    if (!p || p.verdict !== 'check') continue;
    cards.push({
      id: `comment-count-check-${p.lv || 'unknown'}`,
      severity: 'warn',
      symptom: `記録と本家コメの食い違いが大きいです（${p.lv}: 記録${ja(p.recorded.value)} / 本家${ja(p.official.value)}＝${p.ratePct}%）`,
      cause: p.verdictReason,
      action: 'この状態速報を開発者(Claude)に共有してください。別配信の混入か二重計上かを実コードで切り分けます。',
      fixableHere: 'no'
    });
  }
  return cards;
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
  lines.push('（各数字が「何を・どこから・いつ」数えているか＋正常/要確認の判定です）');
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
    // 3段階判定(v0.1.959)。ok/normal は🟢、check は🟡要確認。
    if (p.verdict === 'ok' || p.verdict === 'normal') {
      lines.push(`- 判定: 🟢 正常 — ${p.verdictReason}`);
    } else if (p.verdict === 'check') {
      lines.push(`- 判定: 🟡 要確認 — ${p.verdictReason}`);
    }
  }
  return lines;
}
