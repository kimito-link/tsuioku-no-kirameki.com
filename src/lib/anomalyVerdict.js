// anomalyVerdict.js — 計器の値に「正常域」を持たせ、異常を【名指し】する純関数群。
//
// ───────────────────────────────────────────────────────────────────────────
// なぜこれが要るか(2026-08-04 の会議・council/why-fixes-dont-stick-*):
//   実測: 3分間で 描画504回→2517回(毎秒11回)・コメントは26件しか増えていない
//         = 1コメントあたり77回の描き直し。ユーザーには「ちかちか」として見えていた。
//   しかし当時の速報は【どの計器も異常と報告していない】:
//     storyGrowthChurn  「積み上がりのみ(設計どおり)」
//     scrollWhiteoutDiag count=0
//     完全性スコア       描画・UI健全性 🟢100%
//
//   描画回数2517はレポートに印字されていた。にもかかわらず誰も気づかなかったのは、
//   【多いか少ないかの判定が無い】から。人もAIも数字の羅列は読み飛ばす。
//
//   ★このプロダクトの計器は「値を出す」ことはしてきたが「異常を名指しする」ことを
//     してこなかった。90日で164回「根治」を宣言しながら同じ症状が41回再発した
//     (サムネ41/読み上げ37/固まる15)構造的な原因の一つがこれ。
//
// 設計方針:
//   ・比を見る。絶対数は配信規模で変わるので閾値にできない(描画2517回が多いかは
//     コメント件数と対にして初めて言える)。
//   ・「判定不能」を必ず持つ。母数が小さいときに白黒つけると誤報になり、
//     誤報は計器全体の信頼を落として読み飛ばしを生む(それが今回の遠因)。
//   ・純関数。既存の集計に一切触れない=hot path を汚さない(v0.1.1201の教訓)。
// ───────────────────────────────────────────────────────────────────────────

/** @typedef {'ok'|'warn'|'bad'|'unknown'} AnomalyLevel */

/**
 * @typedef {{
 *   level: AnomalyLevel,
 *   label: string,
 *   detail: string
 * }} AnomalyVerdict
 */

/**
 * null/undefined/空文字を「値なし」として弾いた上で数値化する。
 * Number(null)===0 / Number('')===0 のため、素の Number() では
 * 「値が無い」と「値がゼロ」を区別できない。この取り違えこそが
 * 本モジュールが防ごうとしている誤りなので、入口で断つ。
 *
 * @param {unknown} v
 * @returns {number} 値なし/不正なら NaN
 */
function toNumberStrict(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'boolean') return NaN;
  return Number(v);
}

/**
 * 描き直しの理由のうち、コメント到着とは【無関係】なものの割合を出す。
 *
 * ★なぜ要るか(2026-08-23・実データで判明)
 *   ユーザーの速報: 「1コメントあたり7.7回描き直しています」
 *   ★ところが内訳を数えると:
 *     実際に描いた 1,106回 のうち
 *     コメント到着が理由 … ★33回(3.0%)
 *     それ以外(storage更新) … ★1,073回(97.0%)
 *   ⟹ ★原因の97%はコメントではないのに「1コメントあたり」と名乗っていた。
 *
 *   ＝ [[instrument-can-name-the-wrong-culprit]] の再来。
 *   ★分母に置いただけの値を、原因のように読ませてはいけない。
 *
 * ★コメント由来と見なす理由キー
 *   ctail(コメント末尾) / comment_ingest / csummary。
 *   ★ここに無いものを「コメント由来でない」と決めつけない: 判定できないものは
 *   unknown として数え、名指しの分母から外す。
 *
 * @param {Record<string, number>|null|undefined} reasons 理由別の回数
 * @returns {{ measured: boolean, topName: string, topShare: number, commentShare: number }}
 */
export function dominantRepaintCause(reasons) {
  const r = reasons && typeof reasons === "object" ? reasons : null;
  if (!r) return { measured: false, topName: "", topShare: 0, commentShare: 0 };

  let painted = 0;
  let commentish = 0;
  /** @type {{name:string,n:number}} */
  let top = { name: "", n: 0 };
  for (const [name, raw] of Object.entries(r)) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    // ★止めた回数は「描いた」ではないので分母から外す(速報も分子から除外済み)。
    if (name === "self_write_skipped") continue;
    painted += n;
    if (/ctail|comment_ingest|csummary/i.test(name)) commentish += n;
    if (n > top.n) top = { name, n };
  }
  if (painted <= 0) return { measured: false, topName: "", topShare: 0, commentShare: 0 };
  return {
    measured: true,
    topName: top.name,
    topShare: top.n / painted,
    commentShare: commentish / painted
  };
}

/**
 * 描画回数がコメント件数に対して過剰でないかを判定する。
 *
 * 正常域の根拠(2026-08-04 実測):
 *   健全な配信: コメント9937件 / 描画3回     = 0.0003回/件
 *   異常な配信: コメント  26件 / 描画2013回  = 77回/件 ← ユーザーが「ちかちか」と報告
 *   設計上、1コメントで再描画されるのは高々数回(段ごと)。
 *   10回/件を超えたら明らかに何かが暴走している。
 *
 * @param {unknown} paintCount 累計描画回数
 * @param {unknown} commentCount 累計コメント件数
 * @param {?Record<string, number>} repaintReasons 理由別の回数(あれば原因を名指しする)
 * @returns {AnomalyVerdict}
 */
export function judgePaintPerComment(paintCount, commentCount, repaintReasons) {
  const paints = toNumberStrict(paintCount);
  const comments = toNumberStrict(commentCount);
  if (!Number.isFinite(paints) || !Number.isFinite(comments) || paints < 0 || comments < 0) {
    return { level: 'unknown', label: '判定不能', detail: '値が取れていません' };
  }
  // 母数が小さいと比が跳ねる(起動直後の数件で誤報を出さない)。
  if (comments < 20) {
    return {
      level: 'unknown',
      label: '判定不能',
      detail: `コメント${comments}件では判定できません(20件以上で判定)`
    };
  }
  const ratio = paints / comments;
  // ★原因を名指しする(分母に置いただけの値を原因のように読ませない)。
  //   2026-08-23 実データ: 描き直し1,106回のうちコメント由来は★3.0%だけだった。
  const cause = dominantRepaintCause(repaintReasons);
  //   ★コメント由来が半分に満たないなら「1コメントあたり」とは言わない。
  const blamesComment = !cause.measured || cause.commentShare >= 0.5;
  const per = blamesComment
    ? '1コメントあたり'
    : 'コメント1件につき(★原因の大半はコメント以外)';
  const causeNote = cause.measured && !blamesComment
    ? ` ★描き直しの${Math.round(cause.commentShare * 100)}%だけがコメント由来。`
      + `最多の理由は ${cause.topName}(${Math.round(cause.topShare * 100)}%)`
    : '';
  const shown = ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1);
  if (ratio >= 10) {
    return {
      level: 'bad',
      label: '描き直しすぎ',
      detail: `${per}${shown}回描き直しています(正常は3回以下)。画面のちらつきの原因です` + causeNote
    };
  }
  if (ratio >= 3) {
    return {
      level: 'warn',
      label: '描き直しが多い',
      detail: `${per}${shown}回描き直しています(正常は3回以下)` + causeNote
    };
  }
  return {
    level: 'ok',
    label: '正常',
    detail: `${per}${shown}回`
  };
}

/**
 * 計器の値が「今この瞬間のもの」かを判定する。
 *
 * なぜ要るか(2026-08-04 に実際に踏んだ):
 *   読み上げの床を2→5に変えて版を出したが、速報は「最終発話88789秒前(24時間前)」の
 *   化石値を出し続けていた(会場モードが開き直されていなかった)。
 *   その値を見て私は「まだ実効上限2だ、変更が効いていない」と誤読し、
 *   さらに版を重ねた。【古い値を新しい値と誤認する】のは最も高くつく誤りなので、
 *   値そのものより先に"齢"を判定する。
 *
 * @param {unknown} ageMs 値が観測されてからの経過ms
 * @param {unknown} freshMs これ以内なら新鮮とみなすms
 * @returns {AnomalyVerdict}
 */
export function judgeValueFreshness(ageMs, freshMs) {
  const age = toNumberStrict(ageMs);
  const fresh = toNumberStrict(freshMs);
  if (!Number.isFinite(age) || age < 0) {
    return { level: 'unknown', label: '判定不能', detail: '観測時刻が取れていません' };
  }
  const limit = Number.isFinite(fresh) && fresh > 0 ? fresh : 60_000;
  if (age <= limit) {
    return { level: 'ok', label: '新鮮', detail: `${Math.round(age / 1000)}秒前の値` };
  }
  const min = Math.round(age / 60_000);
  if (age >= 10 * 60_000) {
    return {
      level: 'bad',
      label: '化石値',
      detail: `${min}分前の値です。この数字で判断してはいけません(対象を開き直してください)`
    };
  }
  return {
    level: 'warn',
    label: '古い',
    detail: `${min}分前の値です。現状と違う可能性があります`
  };
}

/**
 * 「変更した版が実際に動いているか」を判定する。
 *
 * なぜ要るか: 版を出しても pull/リロード/F5 の3手順を踏まないとChromeに届かない。
 *   届いていない状態で症状を測ると、直っていない理由を延々と探すことになる。
 *   期待版と実行版を突き合わせ、違えば【他の全診断より先に】それを言う。
 *
 * @param {unknown} runningVersion 実際に動いている版(拡張が自己申告)
 * @param {unknown} expectedVersion 期待する版
 * @returns {AnomalyVerdict}
 */
export function judgeVersionApplied(runningVersion, expectedVersion) {
  const running = String(runningVersion || '').trim();
  const expected = String(expectedVersion || '').trim();
  if (!running || !expected) {
    return { level: 'unknown', label: '判定不能', detail: '版数が取れていません' };
  }
  if (running === expected) {
    return { level: 'ok', label: '反映済み', detail: `v${running} が動いています` };
  }
  return {
    level: 'bad',
    label: '未反映',
    detail: `動いているのは v${running} で、期待は v${expected} です。`
      + '拡張のリロードとタブのF5をしてください(これをしないと変更は届きません)'
  };
}

/**
 * 複数の判定から、最も重いものを1つ選ぶ(速報の先頭に出す用)。
 * bad > warn > unknown > ok の順。okしか無ければ ok を返す。
 *
 * @param {readonly AnomalyVerdict[]} verdicts
 * @returns {AnomalyVerdict}
 */
export function worstVerdict(verdicts) {
  const list = Array.isArray(verdicts) ? verdicts : [];
  /** @type {Record<AnomalyLevel, number>} */
  const rank = { bad: 3, warn: 2, unknown: 1, ok: 0 };
  let worst = /** @type {AnomalyVerdict} */ ({
    level: 'ok',
    label: '正常',
    detail: ''
  });
  for (const v of list) {
    if (!v || typeof v !== 'object') continue;
    const lv = /** @type {AnomalyLevel} */ (v.level);
    if (!(lv in rank)) continue;
    if (rank[lv] > rank[worst.level]) worst = v;
  }
  return worst;
}
