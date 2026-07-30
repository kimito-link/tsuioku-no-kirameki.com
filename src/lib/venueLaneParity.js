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
/**
 * 鏡を「popup実質不在」とみなす年齢(ms)。SOFT を超えた鏡は v0.1.1136(C2)の判断で
 * fallback へ降格せずそのまま使い続ける(モード往復による段総入替ちらつきの防止)が、
 * その判断は「数分規模の一時的な遅れ」を想定したもの。popup が数時間開かれない実機ケース
 * (実測: 鏡stale 21437s=約6時間)では、その間に来た新規参加者が段に一切現れない実害が出る。
 * HARD を超えたら fallback(全参加者を候補から組む)へ降格させ、新規参加者を可視化する。
 *
 * ⚠️ SOFT(180s)とは別定数のまま維持すること。1つにまとめると C2 のちらつき防止が壊れる
 *    (venue-avatar-stale-mirror-DESIGN.md §G-8)。
 */
export const VENUE_LANE_MIRROR_HARD_WINDOW_MS = 900_000;
/** X層(鏡にまだ居ない直近発言者)の猶予窓(ms)。①のpoll+paint+publishの通常10秒に十分な余裕。 */
export const VENUE_LANE_TRANSIENT_WINDOW_MS = 60_000;
/** ①POPと会場のタイル寸法に許容する相対差。超えたら見た目不一致。 */
export const VENUE_TILE_GEOMETRY_TOLERANCE = 0.1;

/** @param {unknown} value */
function positiveMetric(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** DPR込みの物理寸法で相対差を判定する。 @param {number} a @param {number} b */
function geometryDiffers(a, b) {
  if (!(a > 0) || !(b > 0)) return false;
  return Math.abs(a - b) / Math.max(a, b) > VENUE_TILE_GEOMETRY_TOLERANCE;
}


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
 * v4(2026-07-14 会場独自受け皿の撤去): 段に鏡外メンバーが混ざること自体は
 *   v2から変わらず「全部 未説明=🔴」だが、鏡外メンバーの行き先(独自受け皿)が消えたため、
 *   その突合・DOM・幾何比較を全て削除。✅条件=「全段 件数完全等値 ∧ dom.measured ∧
 *   全段 dom.visible===painted.length ∧ 重複0 ∧ 迷子0 ∧ 空可視0 ∧ 無鍵0」。
 *
 * v3(Tri-Parity=実DOM census・reference_diag_truth_SYNTHESIS.md §C-3):
 *   - 入力に dom(venueDomCensusToParityDom の要約)を追加。
 *   - DOM過剰/欠落は unexplained に計上(`${tier}:DOM余n`/`DOM欠n`)=真犯人を1行で名指し。
 *   - 幽霊(ghost)は不可視なので verdict 不算入・`幽N` 併記のみ(消し残り予備軍の観測)。
 *   - dom が無い/measured でないとき mirror モードは ⚪「DOM未計測」=✅を名乗れない(fail-closed)。
 *
 * @param {{
 *   snap: Partial<import('./laneMirror.js').LaneMirrorSnapshot>|null|undefined,
 *   liveId: string,
 *   nowMs: number,
 *   mode: 'mirror'|'fallback',
 *   painted: Partial<Record<typeof TIERS[number], string[]>>,
 *   transientKeys?: ReadonlySet<string>|string[],
 *   visibleShown?: number,
 *   logicalTotal?: number,
 *   dom?: ReturnType<typeof import('./venueDomCensus.js').venueDomCensusToParityDom>|null
 * }} input
 *   - painted: 会場が実際に paint した段別キー列(venueLaneParityKey で作る)。
 *   - transientKeys: X層(60秒窓内の直近発言者)のキー集合。
 *   - dom: 実DOM census 要約(venueDomCensus.js)。null=未計測(mirror では ⚪)。
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
 *   dom: null | { measured: boolean, ghost: number, bare: number, visibleEmpty: number, unkeyed: number,
 *                 blank: number, blankAnon: number,
 *                 dupIntra: number, dupCross: number, strays: number,
 *                 charFrame: number, crowdOn: boolean, crowdCount: number, probeFail: number,
 *                 probeFailTimeout: number, probeFailError: number, probeRetried: number },
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
  // v0.1.1195(根治2・二段窓): HARD超は「popup実質不在→fallbackへ降格した」ことが状態速報から
  //   一目で分かるよう別表記にする(SOFT帯の`鏡stale`は鏡を使い続けている状態=意味が違う)。
  else if (mirrorAgeMs > VENUE_LANE_MIRROR_HARD_WINDOW_MS) mirrorIssue = `鏡staleHard(${mirrorAgeSec}s→fallback降格)`;
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

    // 段内の鏡外(pop に居ない painted)の分類。
    // v2/v4: mirror モードでは【段に鏡外が居ること自体が違反】(鏡外メンバーは会場に表示しないのが正しい姿)。
    //   説明済み扱い(v1 の capOverflow 分岐)は廃止し、全部 未説明=🔴 に計上する(嘘の緑防止)。
    //   tail/transient フィールドは「段内に居た鏡外の内訳」の診断値として残す(期待値0)。
    let tail = 0;
    let transientCount = 0;
    for (const k of drawn) {
      if (popSet.has(k)) continue;
      if (transientKeys.has(k)) transientCount += 1;
      else tail += 1;
      if (mode === 'mirror' && !mirrorIssue) {
        unexplainedCount += 1;
        if (unexplainedSamples.length < 5) unexplainedSamples.push(`${tier}:余${k}`);
      }
      // fallback では「①に無い人」を主張できない=分類だけ(尾扱い・件数明記・⚪)。
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

  // --- v3: 実DOM census 突合(Tri-Parity の第3面=段割当データ⇄段実DOM) ---
  const isMirrorJudgingEarly = mode === 'mirror' && !mirrorIssue;
  const domIn = /** @type {any} */ (inp.dom && typeof inp.dom === 'object' ? inp.dom : null);
  const domMeasured = !!(domIn && domIn.measured === true && domIn.perSection && typeof domIn.perSection === 'object');
  const popDomIn =
    snap?.domSelf && typeof snap.domSelf === 'object' ? /** @type {any} */ (snap.domSelf) : null;
  const popDomMeasured = !!(
    popDomIn &&
    popDomIn.measured === true &&
    popDomIn.perTier &&
    typeof popDomIn.perTier === 'object'
  );
  /** @type {string[]} */
  const popDomMismatchParts = [];
  /** @type {string[]} */
  const geometryMismatchParts = [];
  /** @type {string[]} */
  const geometryMissingParts = [];
  const popupDpr = popDomMeasured ? positiveMetric(popDomIn.dpr) || 1 : 1;
  const venueDpr = domMeasured ? positiveMetric(domIn.dpr) || 1 : 1;

  if (popDomMeasured) {
    for (const tier of TIERS) {
      const visible = Math.max(0, Math.floor(Number(popDomIn.perTier[tier]?.visible) || 0));
      const expected = perTier[tier].pop;
      const diff = visible - expected;
      if (diff === 0) continue;
      popDomMismatchParts.push(`${tier}:可視${visible}(鏡${expected})`);
      if (isMirrorJudgingEarly) {
        unexplainedCount += Math.abs(diff);
        if (unexplainedSamples.length < 5) {
          unexplainedSamples.push(diff > 0 ? `${tier}:①DOM余${diff}` : `${tier}:①DOM欠${-diff}`);
        }
      }
    }
  }
  /** @type {string[]} DOM≠データ の段別内訳(`tanu:可視204(データ154 裸50)` 形式) */
  const domMismatchParts = [];
  if (domMeasured) {
    /** @param {string} sec @param {number} expected */
    const checkSection = (sec, expected) => {
      const c = domIn.perSection[sec] || {};
      const visible = Math.max(0, Math.floor(Number(c.visible) || 0));
      const bare = Math.max(0, Math.floor(Number(c.bare) || 0));
      const diff = visible - expected;
      if (diff === 0) return;
      domMismatchParts.push(
        `${/** @type {any} */ (TIER_LABEL)[sec]}:可視${visible}(データ${expected}${bare > 0 ? ` 裸${bare}` : ''})`
      );
      // DOM過剰/欠落は「説明できない画面上の差」=未説明へ計上(mirror 判定時のみ verdict に影響)。
      if (isMirrorJudgingEarly) {
        unexplainedCount += Math.abs(diff);
        if (unexplainedSamples.length < 5) {
          unexplainedSamples.push(diff > 0 ? `${sec}:DOM余${diff}` : `${sec}:DOM欠${-diff}`);
        }
      }
    };
    for (const tier of TIERS) checkSection(tier, perTier[tier].painted);
    if (popDomMeasured) {
      /** @param {any} source @param {number} dpr */
      const readGeometry = (source, dpr) => ({
        visible: Math.max(0, Math.floor(Number(source?.visible) || 0)),
        tileW: positiveMetric(source?.tileW),
        tileH: positiveMetric(source?.tileH),
        physicalW: positiveMetric(source?.tileW) * dpr,
        physicalH: positiveMetric(source?.tileH) * dpr
      });
      /** @param {string} label @param {ReturnType<typeof readGeometry>} popupGeometry
       * @param {ReturnType<typeof readGeometry>} venueGeometry */
      const compareGeometry = (label, popupGeometry, venueGeometry) => {
        if (!(popupGeometry.tileW > 0 && popupGeometry.tileH > 0 && venueGeometry.tileW > 0 && venueGeometry.tileH > 0)) {
          geometryMissingParts.push(label);
          return;
        }
        if (
          !geometryDiffers(popupGeometry.physicalW, venueGeometry.physicalW) &&
          !geometryDiffers(popupGeometry.physicalH, venueGeometry.physicalH)
        ) return;
        geometryMismatchParts.push(
          `${label}:${venueGeometry.tileW}×${venueGeometry.tileH}px(①${popupGeometry.tileW}×${popupGeometry.tileH}px)`
        );
        if (isMirrorJudgingEarly) {
          unexplainedCount += 1;
          if (unexplainedSamples.length < 5) unexplainedSamples.push(`${label}:幾何差`);
        }
      };

      for (const tier of TIERS) {
        const popupGeometry = readGeometry(popDomIn.perTier[tier], popupDpr);
        const venueGeometry = readGeometry(domIn.perSection[tier], venueDpr);
        if (popupGeometry.visible > 0 && venueGeometry.visible > 0) {
          compareGeometry(tier, popupGeometry, venueGeometry);
        }
      }
    }
  }
  const domGhost = domMeasured ? Math.max(0, Math.floor(Number(domIn.ghost) || 0)) : 0;
  const domDupTotal = domMeasured
    ? Math.max(0, Math.floor(Number(domIn.dupIntra) || 0)) +
      Math.max(0, Math.floor(Number(domIn.dupCross) || 0))
    : 0;
  const domStrays = domMeasured ? Math.max(0, Math.floor(Number(domIn.strays) || 0)) : 0;
  const domVisibleEmpty = domMeasured ? Math.max(0, Math.floor(Number(domIn.visibleEmpty) || 0)) : 0;
  const domUnkeyed = domMeasured ? Math.max(0, Math.floor(Number(domIn.unkeyed) || 0)) : 0;
  // 重複/迷子/空可視/無鍵は「検証できない・二重在籍・白円」=✅ブロッカー(幽霊 ghost は不算入)。
  const domAnomalyCount = domDupTotal + domStrays + domVisibleEmpty + domUnkeyed;

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
  } else if (domMeasured && domAnomalyCount > 0) {
    verdict = '🔴';
    reason = `DOM異常(重複${domDupTotal} 迷子${domStrays} 空可視${domVisibleEmpty} 無鍵${domUnkeyed})`;
  } else if (!domMeasured) {
    // fail-closed: DOMを測れなかったとき✅を名乗れない(データ一致だけでは画面の真実を保証しない)。
    verdict = '⚪';
    reason = 'DOM未計測';
  } else if (!popDomMeasured) {
    verdict = '⚪';
    reason = '①DOM未計測';
  } else if (geometryMissingParts.length > 0) {
    verdict = '⚪';
    reason = `寸法未計測(${geometryMissingParts.join(',')})`;
  } else if (mirrorPruned) {
    verdict = '⚪';
    reason = '鏡縮退(判定は鏡範囲のみ)';
  } else {
    verdict = '✅';
    reason = '';
  }

  // line: mirror モードは「段=鏡と等値」が前提なので +尾n 表記を出さない(段内の鏡外は未説明側に出る)。
  //   fallback は v1 表記のまま(尾扱い・⚪)。v4: 独自受け皿の人数表記は撤去。
  const isMirrorJudging = mode === 'mirror' && !mirrorIssue;
  const totalTransientInLanes = TIERS.reduce((a, t) => a + perTier[t].transient, 0);
  const tierStr = TIERS.map((t) => {
    const p = perTier[t];
    const tailStr = !isMirrorJudging && p.tail > 0 ? `+尾${p.tail}` : '';
    return `${TIER_LABEL[t]}${p.pop}${tailStr}`;
  }).join(' ');
  const ageStr = mirrorAgeSec >= 0 && Number.isFinite(mirrorAgeMs) ? `鏡(${mirrorAgeSec}s前)` : '鏡なし';
  const midStr = isMirrorJudging ? '' : ` / 暫定${totalTransientInLanes}`;
  // v3 DOMセグメント: 一致なら「DOM=データ(幽N)」、不一致なら主犯内訳つき「DOM≠ …」、未計測は明示。
  //   fallback でも census があれば参考で写す(白円/迷子はモード無関係の会場単独異常)。
  /** @type {string} */
  let domStr;
  if (!domMeasured) {
    domStr = ' / DOM未計測';
  } else if (domMismatchParts.length > 0) {
    domStr = ` / DOM≠ ${domMismatchParts.join(' ')} / 重複${domDupTotal} 迷子${domStrays}`;
  } else {
    domStr =
      ` / DOM=データ${domGhost > 0 ? `(幽${domGhost})` : ''}` +
      (domDupTotal > 0 || domStrays > 0 ? ` / 重複${domDupTotal} 迷子${domStrays}` : '');
  }
  const popDomStr = !popDomMeasured
    ? ' / ①DOM未計測'
    : popDomMismatchParts.length > 0
      ? ` / ①DOM≠鏡 ${popDomMismatchParts.join(' ')}`
      : ' / ①DOM=鏡';
  let geometryStr = '';
  if (popDomMeasured && domMeasured) {
    if (geometryMismatchParts.length > 0) {
      geometryStr = ` / 幾何≠ ${geometryMismatchParts.join(' ')}`;
    } else if (geometryMissingParts.length > 0) {
      geometryStr = ` / 幾何未計測(${geometryMissingParts.join(',')})`;
    } else {
      geometryStr = ' / 幾何=一致';
    }
  }
  // 付帯(>0のときだけ末尾): 「顔が多く見える」容疑者(群衆Canvas/額縁)と✅ブロッカー(無鍵/空可視)の実数。
  //   v0.1.1116: 白円(blank=avatar が blank.jpg)と顔プローブ404も参考併記。blankAnon(数値IDでない鍵の
  //   白円=identiconになるべき人が白い)は導出バグの証拠で、修正後の期待値0(数値IDの白円は①も同じ=正)。
  const domBlank = domMeasured ? Math.max(0, Math.floor(Number(domIn.blank) || 0)) : 0;
  const domBlankAnon = domMeasured ? Math.max(0, Math.floor(Number(domIn.blankAnon) || 0)) : 0;
  const domProbeFail = domMeasured ? Math.max(0, Math.floor(Number(domIn.probeFail) || 0)) : 0;
  // venue-avatar-stale-mirror-DESIGN.md §D: 顔プローブ失敗の種別(timeout/error)を分けて
  //   表示する。白丸(blank)が「一度の一時失敗が永久固着している」現象かどうかの切り分け用
  //   (timeout優勢+鏡age大なら本設計の想定どおり)。
  const domProbeFailTimeout = domMeasured ? Math.max(0, Math.floor(Number(domIn.probeFailTimeout) || 0)) : 0;
  const domProbeFailError = domMeasured ? Math.max(0, Math.floor(Number(domIn.probeFailError) || 0)) : 0;
  // venue-avatar-stale-mirror-DESIGN.md §C-1(段階1): 負キャッシュTTL+バックオフ再プローブが
  //   実際に発行された累計。段階1の効果(白丸がretryで回復しているか)を実配信で直接確認する計器。
  const domProbeRetried = domMeasured ? Math.max(0, Math.floor(Number(domIn.probeRetried) || 0)) : 0;
  const extraStr = domMeasured
    ? (domIn.crowdOn === true ? ` / 群衆on(${Math.max(0, Math.floor(Number(domIn.crowdCount) || 0))})` : '') +
      (Number(domIn.charFrame) > 0 ? ` / 額縁${Math.floor(Number(domIn.charFrame))}` : '') +
      (domUnkeyed > 0 ? ` / 無鍵${domUnkeyed}` : '') +
      (domVisibleEmpty > 0 ? ` / 空可視${domVisibleEmpty}` : '') +
      (domBlank > 0 ? ` / 白円${domBlank}(匿名${domBlankAnon})` : '') +
      (domProbeFail > 0 ? ` / 顔404=${domProbeFail}(t:${domProbeFailTimeout},e:${domProbeFailError})` : '') +
      (domProbeRetried > 0 ? ` / 顔再試行${domProbeRetried}` : '')
    : '';
  const line =
    `会場一致 ${verdict}${verdict === '⚪' ? reason : ageStr} ${tierStr}` +
    midStr +
    domStr +
    popDomStr +
    geometryStr +
    ` / 未説明${unexplainedCount}` +
    (unexplainedSamples.length > 0 ? `(${unexplainedSamples.join(', ')})` : '') +
    (visibleShown < logicalTotal ? ` / 表示${visibleShown}/${logicalTotal}` : '') +
    extraStr;

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
    // v3: 実DOM census 要約(perSection は line に写した後なので落とす=storage を太らせない)。
    dom: domMeasured
      ? {
          measured: true,
          ghost: domGhost,
          bare: Math.max(0, Math.floor(Number(domIn.bare) || 0)),
          visibleEmpty: domVisibleEmpty,
          unkeyed: domUnkeyed,
          blank: domBlank,
          blankAnon: domBlankAnon,
          dupIntra: Math.max(0, Math.floor(Number(domIn.dupIntra) || 0)),
          dupCross: Math.max(0, Math.floor(Number(domIn.dupCross) || 0)),
          strays: domStrays,
          charFrame: Math.max(0, Math.floor(Number(domIn.charFrame) || 0)),
          crowdOn: domIn.crowdOn === true,
          crowdCount: Math.max(0, Math.floor(Number(domIn.crowdCount) || 0)),
          probeFail: domProbeFail,
          probeFailTimeout: domProbeFailTimeout,
          probeFailError: domProbeFailError,
          probeRetried: domProbeRetried
        }
      : null,
    line
  };
}

/**
 * venueSeatsDiag(storage)へ同梱する軽量形。状態速報は line をそのまま1行出す。
 *   v3: reason(⚪の理由=DOM未計測/fallback等)と dom 要約(数値のみ・keys/段別詳細なし)を追加。
 * @param {ReturnType<typeof buildVenueLaneParity>|null|undefined} parity
 * @returns {{ mode: string, verdict: string, reason: string, line: string, unexplained: number, mirrorAgeSec: number,
 *             dom: null | { measured: boolean, ghost: number, bare: number, visibleEmpty: number, unkeyed: number,
 *                           blank: number, blankAnon: number,
 *                           dupIntra: number, dupCross: number, strays: number,
 *                           charFrame: number, crowdOn: boolean, crowdCount: number, probeFail: number,
 *                           probeFailTimeout: number, probeFailError: number, probeRetried: number } }|null}
 */
export function toVenueLaneParityDiag(parity) {
  if (!parity || typeof parity !== 'object') return null;
  const dom = /** @type {any} */ (parity).dom;
  return {
    mode: String(parity.mode || ''),
    verdict: String(parity.verdict || ''),
    reason: String(parity.reason || ''),
    line: String(parity.line || ''),
    unexplained: Math.max(0, Math.floor(Number(parity.unexplained?.count) || 0)),
    mirrorAgeSec: Math.floor(Number(parity.mirrorAgeSec) || 0),
    dom:
      dom && typeof dom === 'object' && dom.measured === true
        ? {
            measured: true,
            ghost: Math.max(0, Math.floor(Number(dom.ghost) || 0)),
            bare: Math.max(0, Math.floor(Number(dom.bare) || 0)),
            visibleEmpty: Math.max(0, Math.floor(Number(dom.visibleEmpty) || 0)),
            unkeyed: Math.max(0, Math.floor(Number(dom.unkeyed) || 0)),
            blank: Math.max(0, Math.floor(Number(/** @type {any} */ (dom).blank) || 0)),
            blankAnon: Math.max(0, Math.floor(Number(/** @type {any} */ (dom).blankAnon) || 0)),
            dupIntra: Math.max(0, Math.floor(Number(dom.dupIntra) || 0)),
            dupCross: Math.max(0, Math.floor(Number(dom.dupCross) || 0)),
            strays: Math.max(0, Math.floor(Number(dom.strays) || 0)),
            charFrame: Math.max(0, Math.floor(Number(dom.charFrame) || 0)),
            crowdOn: dom.crowdOn === true,
            crowdCount: Math.max(0, Math.floor(Number(dom.crowdCount) || 0)),
            probeFail: Math.max(0, Math.floor(Number(/** @type {any} */ (dom).probeFail) || 0)),
            probeFailTimeout: Math.max(0, Math.floor(Number(/** @type {any} */ (dom).probeFailTimeout) || 0)),
            probeFailError: Math.max(0, Math.floor(Number(/** @type {any} */ (dom).probeFailError) || 0)),
            // venue-avatar-stale-mirror-DESIGN.md §C-1(段階1): 顔再試行回数(実測)。
            probeRetried: Math.max(0, Math.floor(Number(/** @type {any} */ (dom).probeRetried) || 0))
          }
        : null
  };
}
