/**
 * giftAdPipelineCensus.js — ギフト/広告が「取れて→出て→鳴る」まで通っているかを
 * 段ごとに名指しする(純関数)。
 *
 * ★なぜ要るか(2026-08-14 ユーザー要望「ギフト・広告の計器も」)
 *
 * ■ 実機で起きていたこと(速報から)
 *     公式値レーン: ギフト貢献:✅31 / 広告:✅7 / ギフト履歴:⏳取得中 / E順位:⏳取得中
 *   `⏳取得中` が **1時間以上ずっと** 続いていた(state='iframe_unrendered')。
 *   ＝実質は失敗しているのに、画面は永久に「進行中」に見える。
 *   ★**「進行中」は緑でも赤でもないので、誰も異常と認識できない**
 *     ([[zero-count-may-mean-unmeasured-2026-08-04]] と同型の穴)。
 *
 * ■ もう一つの穴: ギフトは「取れた件数」と「会場に出た件数」が別物
 *   会場のギフト段は 0 のまま(gift0)なのに、貢献度は 31 件取れていた。
 *   ＝**取得できていることと、画面に出ていることは別**。段で切って両方出す。
 *
 * ■ 段(この順で落ちる)
 *   ① 取得   : 公式から値が取れたか(apiRows / ndgrValue)
 *   ② 反映   : レーン/鏡に載ったか(mirrorCount)
 *   ③ 演出   : 検知→演出→音まで通ったか(giftEffectDiag)
 *
 * ★掟: 「進行中」を無条件に許さない。**経過時間を見て、長すぎる進行中は警告にする**
 *   (cumulative-value-shown-as-current-state と逆向きの穴=止まっているのに進行中に見える)。
 *
 * @module giftAdPipelineCensus
 */

/** これを超えて「取得中」のままなら、進行中ではなく詰まりとみなす[ms]。 */
export const STUCK_PENDING_MS = 5 * 60 * 1000;

/** @param {unknown} v @returns {number} */
function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * @typedef {{ id:string, label:string, level:'ok'|'warn'|'bad'|'na', text:string }} PipelineStage
 */

/**
 * ギフト/広告の段別判定を作る。
 *
 * @param {object} input
 * @param {any} [input.northStar] fastDiag の `北極状レーン` 相当(貢献度/広告/履歴/順位)
 * @param {any} [input.giftEffect] giftEffectDiag(検知→演出→音)
 * @param {number} [input.liveElapsedMs] 配信の経過時間[ms](「ずっと取得中」の判定に使う)
 * @returns {{ stages: PipelineStage[], line: string }}
 */
export function buildGiftAdPipeline(input) {
  const ns = input?.northStar && typeof input.northStar === 'object' ? input.northStar : {};
  const fx = input?.giftEffect && typeof input.giftEffect === 'object' ? input.giftEffect : null;
  const elapsed = n(input?.liveElapsedMs);

  /** @type {PipelineStage[]} */
  const stages = [];

  // ── ① 取得(公式値が取れているか) ─────────────────────────
  const sources = [
    { key: '1_貢献度ランキング', label: 'ギフト貢献度', countKey: 'apiRows' },
    { key: '+α_広告ランキング', label: '広告ランキング', countKey: 'apiRows' },
    { key: '2_ギフト履歴', label: 'ギフト履歴', countKey: 'count' },
    { key: '5_イベント現在順位', label: 'イベント順位', countKey: 'value' }
  ];
  for (const s of sources) {
    const node = ns[s.key];
    if (!node || typeof node !== 'object') {
      stages.push({ id: s.key, label: s.label, level: 'na', text: '—' });
      continue;
    }
    const state = String(node.state || '');
    const got = n(node[s.countKey]);
    if (state === 'no_event') {
      stages.push({ id: s.key, label: s.label, level: 'na', text: 'イベント無し(対象外)' });
      continue;
    }
    if (state === 'ok' && got > 0) {
      stages.push({ id: s.key, label: s.label, level: 'ok', text: `${got}件` });
      continue;
    }
    /*
     * ★ここが本題: 「取得中(iframe_unrendered 等)」を無条件に進行中扱いしない。
     *   配信開始から十分経っているのに取れていないなら、それは**詰まり**。
     */
    const stuck = elapsed > STUCK_PENDING_MS;
    stages.push({
      id: s.key,
      label: s.label,
      level: stuck ? 'warn' : 'na',
      text: stuck
        ? `取得できていません(${Math.round(elapsed / 60000)}分経過・state=${state || '不明'})`
        : '取得中'
    });
  }

  // ── ③ 演出(検知→演出→音) ─────────────────────────────
  if (fx) {
    const detected = n(fx.detected ?? fx.detectedTotal);
    const played = n(fx.played ?? fx.effectTotal);
    const sound = n(fx.sound ?? fx.soundTotal);
    if (detected > 0) {
      const lost = detected - played;
      stages.push({
        id: 'gift-effect-chain',
        label: 'ギフト演出→音',
        level: lost > 0 ? 'warn' : 'ok',
        text: lost > 0
          ? `検知${detected}→演出${played}(${lost}件が演出されず)→音${sound}`
          : `検知${detected}→演出${played}→音${sound}`
      });
    }
  }

  const bad = stages.filter((s) => s.level === 'bad').length;
  const warn = stages.filter((s) => s.level === 'warn').length;
  const mark = bad > 0 ? '🔴' : warn > 0 ? '🟡' : '✅';
  const head = `ギフト/広告の通り道 ${mark} ` +
    (warn + bad > 0 ? `${warn + bad}段で詰まっています` : '取得〜演出まで通っています');
  const body = stages
    .filter((s) => s.level !== 'na')
    .map((s) => `  → ${s.label}: ${s.text}`)
    .join('\n');
  const stuckHint = warn > 0
    ? '\n  → ★「取得中」のまま数分以上続くのは詰まりです(公式iframeが描画されていない疑い)'
    : '';

  return { stages, line: body ? `${head}\n${body}${stuckHint}` : head };
}
