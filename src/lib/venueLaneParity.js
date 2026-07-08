/**
 * 会場レーンのパリティ計器(純関数)。会場が実際に paint した段割当列を、①POP の実描画鏡
 * (KEY_LANE_MIRROR = laneMirror.js の LaneMirrorSnapshot)と突合し、「一致していると機械が
 * 言い切れる1行トークン」を組み立てる。
 *
 * 設計正本: memory/reference_pop_venue_parity_SYNTHESIS.md §0(P/T/X 3層の一致定義)・§C-2・§D。
 *   - P層: 鏡の5段(link/gift/ad/konta/tanu)は集合も順序もプレフィックス一致していなければならない。
 *   - T層: 会場が鏡の先(①のcap外)に継ぎ足した分は「尾」=説明済み差分(件数を明記して緑のまま)。
 *   - X層: 鏡にまだ居ない直近発言者(即着席のライブ感)は60秒の猶予窓内なら「暫定」=説明済み。
 *   - 嘘の緑防止: ✅は mirror mode ∧ 同一配信 ∧ 鏡が新鮮 ∧ 全段プレフィックス一致 ∧ 未説明0 ∧
 *     鏡縮退なし の全条件ANDのみ。fallback は常に ⚪(①一致を主張しない)。
 *   - 嘘の赤防止: 尾/暫定を未説明から分類除外。uid無しセル(広告主等)は idLine+title で照合。
 *
 * DOM/chrome 非依存=単体テスト可能。venueBar.js が観測値を渡し、結果を venueSeatsDiag に同梱する。
 */

/** 鏡が「新鮮」とみなせる年齢(ms)。完璧な診断シート設計の W_soft=180s と同じ。 */
export const VENUE_LANE_MIRROR_SOFT_WINDOW_MS = 180_000;
/** X層(鏡にまだ居ない直近発言者)の猶予窓(ms)。①のpoll+paint+publishの通常10秒に十分な余裕。 */
export const VENUE_LANE_TRANSIENT_WINDOW_MS = 60_000;

const TIERS = /** @type {const} */ (['link', 'gift', 'ad', 'konta', 'tanu']);
const TIER_LABEL = { link: 'link', gift: 'gift', ad: 'ad', konta: 'konta', tanu: 'tanu' };

/**
 * 鏡セル/会場laneアイテムの照合キー。uid があれば uid、無ければ idLine+title(広告主セル等)。
 * @param {{ userId?: unknown, entry?: { userId?: unknown }, idLine?: unknown, meta?: { idLine?: unknown }, title?: unknown }} cellOrItem
 * @returns {string}
 */
export function venueLaneParityKey(cellOrItem) {
  const c = /** @type {any} */ (cellOrItem && typeof cellOrItem === 'object' ? cellOrItem : {});
  const uid = String(c.userId ?? c.entry?.userId ?? '').trim();
  if (uid) return `u:${uid}`;
  const idLine = String(c.idLine ?? c.meta?.idLine ?? '').trim();
  const title = String(c.title ?? '').trim();
  const composite = `${idLine}|${title}`;
  return composite === '|' ? '' : `c:${composite}`;
}

/**
 * 鏡スナップショットから段別キー列を取り出す。
 * @param {Partial<import('./laneMirror.js').LaneMirrorSnapshot>|null|undefined} snap
 * @returns {Record<typeof TIERS[number], string[]>}
 */
export function laneMirrorTierKeySequences(snap) {
  const s = /** @type {any} */ (snap && typeof snap === 'object' ? snap : {});
  const out = /** @type {Record<string, string[]>} */ ({});
  for (const tier of TIERS) {
    const arr = Array.isArray(s[tier]) ? s[tier] : [];
    out[tier] = arr.map((c) => venueLaneParityKey(c)).filter(Boolean);
  }
  return /** @type {any} */ (out);
}

/**
 * 会場一致パリティを組み立てる。
 *
 * @param {{
 *   snap: Partial<import('./laneMirror.js').LaneMirrorSnapshot>|null|undefined,
 *   liveId: string,
 *   nowMs: number,
 *   mode: 'mirror'|'fallback',
 *   painted: Partial<Record<typeof TIERS[number], string[]>>,
 *   transientKeys?: ReadonlySet<string>|string[],
 *   visibleShown?: number,
 *   logicalTotal?: number
 * }} input
 *   - painted: 会場が実際に paint した段別キー列(venueLaneParityKey で作る)。
 *   - transientKeys: X層(60秒窓内の直近発言者)のキー集合。
 * @returns {{
 *   mode: 'mirror'|'fallback',
 *   verdict: '✅'|'⚪'|'🔴',
 *   reason: string,
 *   mirrorAgeSec: number,
 *   mirrorPruned: boolean,
 *   perTier: Record<typeof TIERS[number], { pop: number, painted: number, prefixOk: boolean, tail: number, transient: number, missing: number }>,
 *   unexplained: { count: number, sampleKeys: string[] },
 *   visibleShown: number,
 *   logicalTotal: number,
 *   line: string
 * }}
 */
export function buildVenueLaneParity(input) {
  const inp = /** @type {any} */ (input && typeof input === 'object' ? input : {});
  const liveId = String(inp.liveId || '').trim().toLowerCase();
  const nowMs = Number.isFinite(Number(inp.nowMs)) ? Number(inp.nowMs) : 0;
  const snap = inp.snap && typeof inp.snap === 'object' ? inp.snap : null;
  const painted = inp.painted && typeof inp.painted === 'object' ? inp.painted : {};
  const transientKeys =
    inp.transientKeys instanceof Set
      ? inp.transientKeys
      : new Set(Array.isArray(inp.transientKeys) ? inp.transientKeys : []);
  const visibleShown = Math.max(0, Math.floor(Number(inp.visibleShown) || 0));
  const logicalTotal = Math.max(0, Math.floor(Number(inp.logicalTotal) || 0));
  const mode = inp.mode === 'mirror' ? 'mirror' : 'fallback';

  // --- 鏡の使用可否(嘘の緑防止の第一関門) ---
  const snapLiveId = String(snap?.liveId || '').trim().toLowerCase();
  const capturedAt = Math.max(0, Number(snap?.capturedAt) || 0);
  const mirrorAgeMs = capturedAt > 0 ? Math.max(0, nowMs - capturedAt) : Number.POSITIVE_INFINITY;
  const mirrorAgeSec = Number.isFinite(mirrorAgeMs) ? Math.round(mirrorAgeMs / 1000) : -1;
  /** @type {string} */
  let mirrorIssue = '';
  if (!snap) mirrorIssue = '鏡なし';
  else if (!snapLiveId || (liveId && snapLiveId !== liveId)) mirrorIssue = '鏡は別配信';
  else if (mirrorAgeMs > VENUE_LANE_MIRROR_SOFT_WINDOW_MS) mirrorIssue = `鏡stale(${mirrorAgeSec}s)`;

  const popSeq = laneMirrorTierKeySequences(snap);
  const popTotalCells = TIERS.reduce((a, t) => a + popSeq[t].length, 0);
  // 鏡縮退(512KB自衛で cap 半減)検知: Σセル数 < pickedLength なら鏡は①の実paintより狭い。
  const pickedLength = Math.max(0, Math.floor(Number(snap?.pickedLength) || 0));
  const mirrorPruned = popTotalCells > 0 && pickedLength > popTotalCells;

  /** @type {Record<string, { pop: number, painted: number, prefixOk: boolean, tail: number, transient: number, missing: number }>} */
  const perTier = {};
  /** @type {string[]} */
  const unexplainedSamples = [];
  let unexplainedCount = 0;

  for (const tier of TIERS) {
    const pop = popSeq[tier];
    const drawn = Array.isArray(painted[tier]) ? painted[tier].map(String).filter(Boolean) : [];
    const popSet = new Set(pop);

    // P層: プレフィックス一致(集合+順序)。painted の先頭 pop.length 件が pop と同一列か。
    let prefixOk = true;
    let missing = 0;
    if (mode === 'mirror' && !mirrorIssue) {
      for (let i = 0; i < pop.length; i += 1) {
        if (drawn[i] !== pop[i]) {
          prefixOk = false;
          break;
        }
      }
      if (!prefixOk) {
        // 順序/欠落の内訳: 鏡に居るのに描かれていない人=missing(未説明)。
        const drawnSet = new Set(drawn);
        for (const k of pop) {
          if (!drawnSet.has(k)) {
            missing += 1;
            if (unexplainedSamples.length < 5) unexplainedSamples.push(`${tier}:欠${k}`);
          }
        }
        // 欠落ゼロなのに prefix 不一致=並び違いのみ。1件として計上(サンプルは先頭のズレ位置)。
        if (missing === 0) {
          const at = pop.findIndex((k, i) => drawn[i] !== k);
          if (unexplainedSamples.length < 5) unexplainedSamples.push(`${tier}:順序@${at}`);
          unexplainedCount += 1;
        }
        unexplainedCount += missing;
      }
    } else {
      // fallback / 鏡が使えない時は P層判定を主張しない(⚪)。
      prefixOk = false;
    }

    // T/X層: pop に居ない painted 分の分類。
    let tail = 0;
    let transientCount = 0;
    for (const k of drawn) {
      if (popSet.has(k)) continue;
      if (transientKeys.has(k)) {
        transientCount += 1;
      } else if (mode === 'mirror' && !mirrorIssue) {
        // 鏡が「cap で切った」ことが数字で説明できる場合のみ尾=説明済み。
        const totalCandidates = Math.max(0, Math.floor(Number(snap?.totalCandidates) || 0));
        const capOverflowPossible = totalCandidates > pickedLength || mirrorPruned;
        if (capOverflowPossible) {
          tail += 1;
        } else {
          unexplainedCount += 1;
          if (unexplainedSamples.length < 5) unexplainedSamples.push(`${tier}:余${k}`);
        }
      } else {
        // fallback では「①に無い人」を主張できない=分類だけ(尾扱い・件数明記)。
        tail += 1;
      }
    }

    perTier[tier] = {
      pop: pop.length,
      painted: drawn.length,
      prefixOk,
      tail,
      transient: transientCount,
      missing
    };
  }

  // --- verdict(全条件AND=嘘の緑防止) ---
  /** @type {'✅'|'⚪'|'🔴'} */
  let verdict;
  /** @type {string} */
  let reason;
  if (mode !== 'mirror' || mirrorIssue) {
    verdict = '⚪';
    reason = mirrorIssue || 'fallback(鏡未使用)';
  } else if (unexplainedCount > 0) {
    verdict = '🔴';
    reason = `未説明${unexplainedCount}`;
  } else if (mirrorPruned) {
    verdict = '⚪';
    reason = '鏡縮退(判定は鏡範囲のみ)';
  } else {
    verdict = '✅';
    reason = '';
  }

  const totalTransient = TIERS.reduce((a, t) => a + perTier[t].transient, 0);
  const tierStr = TIERS.map((t) => {
    const p = perTier[t];
    const tailStr = p.tail > 0 ? `+尾${p.tail}` : '';
    return `${TIER_LABEL[t]}${p.pop}${tailStr}`;
  }).join(' ');
  const ageStr = mirrorAgeSec >= 0 && Number.isFinite(mirrorAgeMs) ? `鏡(${mirrorAgeSec}s前)` : '鏡なし';
  const line =
    `会場一致 ${verdict}${verdict === '⚪' ? reason : ageStr} ${tierStr}` +
    ` / 暫定${totalTransient} / 未説明${unexplainedCount}` +
    (unexplainedSamples.length > 0 ? `(${unexplainedSamples.join(', ')})` : '') +
    (visibleShown < logicalTotal ? ` / 表示${visibleShown}/${logicalTotal}` : '');

  return {
    mode,
    verdict,
    reason,
    mirrorAgeSec: Number.isFinite(mirrorAgeMs) ? mirrorAgeSec : -1,
    mirrorPruned,
    perTier: /** @type {any} */ (perTier),
    unexplained: { count: unexplainedCount, sampleKeys: unexplainedSamples },
    visibleShown,
    logicalTotal,
    line
  };
}

/**
 * venueSeatsDiag(storage)へ同梱する軽量形。状態速報は line をそのまま1行出す。
 * @param {ReturnType<typeof buildVenueLaneParity>|null|undefined} parity
 * @returns {{ mode: string, verdict: string, line: string, unexplained: number, mirrorAgeSec: number }|null}
 */
export function toVenueLaneParityDiag(parity) {
  if (!parity || typeof parity !== 'object') return null;
  return {
    mode: String(parity.mode || ''),
    verdict: String(parity.verdict || ''),
    line: String(parity.line || ''),
    unexplained: Math.max(0, Math.floor(Number(parity.unexplained?.count) || 0)),
    mirrorAgeSec: Math.floor(Number(parity.mirrorAgeSec) || 0)
  };
}
