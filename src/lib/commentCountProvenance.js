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
  // ★v0.1.1003 誤検知根治: 「本家コメが新鮮か」は公式統計(statistics.comments)が最後に更新された
  //   時刻で測る(officialCommentStatsAgeMs)。これが無い旧経路だけ lastIngestAgoMs(コメント取り込み
  //   時刻)にフォールバック。両者は別クロックで、コメントは毎秒来る(lastIngest=0秒前)が公式統計は
  //   遅延更新で数分古いことがあり、従来は「0秒前=新鮮」と誤認して『遅延では説明できない』要確認を
  //   誤発火していた(実機 lv350859008 102→106% が公式遅延だった疑い)。
  const officialStatsAge = Number(o.officialCommentStatsAgeMs);
  const officialAgeMs = Number.isFinite(officialStatsAge) && officialStatsAge >= 0
    ? officialStatsAge
    : Number(o.lastIngestAgoMs);
  const officialIsFresh = Number.isFinite(officialAgeMs) && officialAgeMs >= 0 && officialAgeMs <= OFFICIAL_FRESH_MS;

  // ★v0.1.1008 誤検知根治: 時系列で「記録の過剰増(二重計上)が起きていない」なら、本家が新鮮でも
  //   要確認にしない。直近窓の 本家Δ/記録Δ を比べ、記録Δが本家Δを有意に上回らなければ、101% 等の
  //   小さな超過は本家統計の遅延/母数差(記録が正しく先行)で説明できる=正常。実機 lv350859704
  //   (本家+0/記録+0=終了配信で固定・101%)が「新鮮なのに超過」で🟡居座っていたのを消す。
  //   時系列の材料が無いとき(null)は従来どおり(ガードしない=後方互換)。本物の二重(記録Δ≫本家Δ)は素通し。
  const tsOfficialDelta = num(o.officialStatisticsCommentsDelta);
  const tsRecordedDelta = num(o.officialReceivedCommentsDelta);
  const timeSeriesShowsNoOverRecording =
    tsOfficialDelta != null &&
    tsRecordedDelta != null &&
    tsRecordedDelta - tsOfficialDelta <= Math.max(2, Math.round(tsOfficialDelta * 0.2));

  // 3段階判定(誤検知防止のため、判定できる材料が揃ったときだけ ok/normal/check を出す)。
  let verdict = 'unknown';
  let verdictReason = '';
  if (recorded != null && official != null && official > 0 && ratePct != null) {
    if (!recordedExceedsOfficial) {
      verdict = 'ok';
      verdictReason = '記録は本家コメ以下＝正常（記録は本家の一部）';
    } else if (ratePct > RECORD_OVER_OFFICIAL_NORMAL_MAX_PCT) {
      // 130% 超は遅延では説明しにくい=要確認(別配信混入/二重計上の疑い)。時系列で過剰増が無くても、
      //   この大差は遅延だけでは説明しにくいので check のまま(本物の取りこぼし/混入を見逃さない)。
      verdict = 'check';
      verdictReason = `記録が本家コメを大きく上回っています(${ratePct}%)。本家の遅延だけでは説明しにくく、別配信の混入か二重計上の疑いがあります`;
    } else if (officialIsFresh && !timeSeriesShowsNoOverRecording) {
      // 本家が新鮮(60秒以内)なのに記録超 かつ 時系列で過剰増あり(or 材料無し)=遅延で説明できない=要確認。
      verdict = 'check';
      verdictReason = `本家コメが新鮮(${agoLabel(officialAgeMs)})なのに記録が上回っています(${ratePct}%)。遅延では説明しにくいので要確認です`;
    } else if (officialIsFresh && timeSeriesShowsNoOverRecording) {
      // 本家は新鮮だが時系列で記録の過剰増が無い=小さな超過は本家統計の遅延/母数差で説明可能=正常。
      verdict = 'normal';
      verdictReason = `記録が本家コメをやや上回りますが、直近で記録の過剰増(二重計上)は見られず＝本家統計の遅延/母数差で説明できる正常範囲です(${ratePct}%)`;
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
      // v0.1.1007: 本家コメ齢は公式統計の更新時刻(officialCommentStatsAgeMs)を優先(v0.1.1003 と同じ正しいクロック)。
      ageLabel: agoLabel(
        Number.isFinite(officialStatsAge) && officialStatsAge >= 0 ? officialStatsAge : o.lastIngestAgoMs
      )
    },
    ratePct,
    recordedExceedsOfficial,
    verdict,
    verdictReason,
    // v0.1.1007: 焼き付き vs 本家遅延の時系列材料(panel_summary 由来・窓内の本家Δ/記録Δ)。
    timeSeries: {
      officialDelta: num(o.officialStatisticsCommentsDelta),
      recordedDelta: num(o.officialReceivedCommentsDelta),
      windowMs: num(o.officialCommentSampleWindowMs)
    }
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
 * v0.1.1001 計器: fastDiag から「記録のうち commentNo 欠落行の割合」を取り出す。
 *   記録>本家(check)の内訳が「二重計上の温床(欠落行が多い)」か「本家統計の数え方差(欠落行は
 *   少ない)」かをスクショ1枚で切り分けるため。欠落行は dedup キーが capturedAt 秒依存で
 *   ライブ/backfill 間で二重しうる(commentRecord.js:75-84)。取れなければ null。
 * @param {object|null|undefined} fastDiag
 * @returns {{ percent: number, count: number, total: number }|null}
 */
function commentNoLessStatsFromFastDiag(fastDiag) {
  try {
    const s = fastDiag?.content?.giftDiagnostics?.commentObservability?.savedCommentsUidStats;
    if (!s || typeof s !== 'object') return null;
    const percent = Number(s.commentNoLessPercent);
    const count = Number(s.commentNoLess);
    const total = Number(s.totalSaved);
    if (!Number.isFinite(percent)) return null;
    return { percent, count: Number.isFinite(count) ? count : 0, total: Number.isFinite(total) ? total : 0 };
  } catch {
    return null;
  }
}

/**
 * v0.1.1186 計器: fastDiag から dedup シード計器(skip/rebuild/requeue回数・1回のマージの
 *   added件数)を取り出す。記録>本家(check)の異常が「storedTotal一致で state 再利用した
 *   skip 経路の不完全 state が原因」かを切り分けるため。取れなければ null。
 * @param {object|null|undefined} fastDiag
 * @returns {{ seedSkipCount: number, seedRebuildCount: number, seedRequeueCount: number,
 *   maxIncrementalAddedCount: number, suspiciousAddedCount: number,
 *   addedNoLessCount: number, addedTotalCount: number }|null}
 */
function dedupeSeedDiagFromFastDiag(fastDiag) {
  try {
    const s = fastDiag?.content?.giftDiagnostics?.commentObservability?.dedupeSeedDiag;
    if (!s || typeof s !== 'object') return null;
    return {
      seedSkipCount: Number(s.seedSkipCount) || 0,
      seedRebuildCount: Number(s.seedRebuildCount) || 0,
      seedRequeueCount: Number(s.seedRequeueCount) || 0,
      maxIncrementalAddedCount: Number(s.maxIncrementalAddedCount) || 0,
      suspiciousAddedCount: Number(s.suspiciousAddedCount) || 0,
      addedNoLessCount: Number(s.addedNoLessCount) || 0,
      addedTotalCount: Number(s.addedTotalCount) || 0,
      seedUnseededRejectCount: Number(s.seedUnseededRejectCount) || 0
    };
  } catch {
    return null;
  }
}

/**
 * 状態速報に載せるテキスト行配列。判定はせず「何を数えているか」を並べる。
 * @param {object[]} livesData summarizeOneLive の配列
 * @param {object|null} [fastDiag] commentNo 欠落割合の計器(記録>本家の内訳切り分け用・省略可)
 * @returns {string[]}
 */
export function formatCommentCountProvenanceLines(livesData, fastDiag = null) {
  const lives = Array.isArray(livesData) ? livesData : [];
  const provs = lives.map(buildCommentCountProvenance).filter(Boolean);
  if (!provs.length) return [];

  const noLess = commentNoLessStatsFromFastDiag(fastDiag);
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
      // v0.1.1001 計器: 記録>本家(要確認)のとき、commentNo 欠落行の割合を内訳として出す。
      //   高い(例 90%+)=匿名184主体=二重計上の温床が大きい。低い=本家統計の数え方差の疑い。
      if (noLess) {
        lines.push(
          `- 内訳(計器): 記録のうち commentNo 欠落行 ${ja(noLess.count)}件 (${noLess.percent}%)` +
            ` — 高いほど匿名主体で二重計上が起きやすい/低いほど本家統計の数え方差の疑い`
        );
      }
      // v0.1.1007 時系列計器: 焼き付き vs 本家遅延の切り分け。直近の窓で「本家がどれだけ増えたか(本家Δ)」と
      //   「記録がどれだけ増えたか(記録Δ)」を並べる。本家Δ≈記録Δ なら母数差/本家遅延(=記録が正しく先行)、
      //   本家Δ≪記録Δ なら記録の過剰増(二重計上の疑い)。panel_summary に既にある値=新規 read ゼロ。
      const ts = p.timeSeries;
      if (ts && (ts.officialDelta != null || ts.recordedDelta != null)) {
        const winSec = ts.windowMs != null ? Math.round(ts.windowMs / 1000) : null;
        const winLabel = winSec != null && winSec > 0 ? `直近${winSec}秒で ` : '直近窓で ';
        const od = ts.officialDelta != null ? `本家+${ja(ts.officialDelta)}` : '本家+?';
        const rd = ts.recordedDelta != null ? `記録+${ja(ts.recordedDelta)}` : '記録+?';
        const hint =
          ts.officialDelta != null && ts.recordedDelta != null
            ? ts.recordedDelta - ts.officialDelta > Math.max(2, Math.round(ts.officialDelta * 0.2))
              ? ' — 記録Δが本家Δを上回る＝記録の過剰増(二重計上)寄り'
              : ' — 本家Δ≈記録Δ＝母数差/本家の遅延寄り(記録が正しく先行)'
            : '';
        lines.push(`- 時系列(計器): ${winLabel}${od} / ${rd}${hint}`);
      }
      // v0.1.1186 計器: 記録Δが本家Δを上回るケースで、dedup シードの skip/rebuild 回数と
      //   1回のマージで確定した added の最大件数を出す。maxIncrementalAddedCount が本家Δと
      //   比べて桁違いに大きい(suspiciousAddedCount>0)なら、skip 経路で再利用した state が
      //   不完全だった疑い(仮説の直接裏取り)。
      const dsd = dedupeSeedDiagFromFastDiag(fastDiag);
      if (dsd && (dsd.seedSkipCount > 0 || dsd.seedRebuildCount > 0)) {
        const suspiciousHint =
          dsd.suspiciousAddedCount > 0
            ? ' — 1回のマージで大量addedを検知(dedup再利用stateが不完全だった疑い)'
            : '';
        lines.push(
          `- dedupシード(計器): skip${ja(dsd.seedSkipCount)}回 / rebuild${ja(dsd.seedRebuildCount)}回` +
            ` / requeue${ja(dsd.seedRequeueCount)}回 / 1回の最大added${ja(dsd.maxIncrementalAddedCount)}件` +
            `${suspiciousHint}`
        );
        // v0.1.1196 計器: added のうち commentNo 欠落行の割合。dedup キーは欠落時だけ
        //   capturedAt の秒が混ざるので、「ライブ経路と backfill 経路で capturedAt の導出が
        //   違うためキーが一致せず二重計上する」仮説はこの行でしか成立しない。
        //   ここが 0 に近ければ仮説を棄却でき、seed skip 経路(別候補)に絞れる。
        if (dsd.addedTotalCount > 0) {
          const pct = Math.round((dsd.addedNoLessCount / dsd.addedTotalCount) * 100);
          const verdict =
            dsd.addedNoLessCount === 0
              ? ' — 番号欠落0件=capturedAt起因の二重計上は否定的(seed skip側を疑う)'
              : pct >= 20
                ? ' — 番号欠落が多い=capturedAt導出の経路差による二重計上が有力'
                : '';
          lines.push(
            `- added内訳(計器): 番号欠落${ja(dsd.addedNoLessCount)}件 / 全${ja(dsd.addedTotalCount)}件(${pct}%)${verdict}`
          );
        }
        // v0.1.1199: 空keySetのstate再利用を弾いた回数。>0 なら「本来二重計上していた場面を
        //   防いだ」証拠(根治が効いている)。0のまま推移し逆転も起きないなら再発なし。
        if (dsd.seedUnseededRejectCount > 0) {
          lines.push(
            `- dedup再seed(計器): 空keySetの再利用を${ja(dsd.seedUnseededRejectCount)}回ブロック — 二重計上を未然に防ぎました(v0.1.1199の根治が作動)`
          );
        }
      }
    }
  }
  return lines;
}
