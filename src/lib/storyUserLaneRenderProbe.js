// @ts-nocheck — 任意の probe / diag を歩く動的判定
/**
 * 応援レーン描画の自己診断（council/lane-render-self-diag-SYNTHESIS.md）。
 *
 * 狙い = 状態速報（AI共有テキスト）を1回コピーして渡すだけで、「応援レーン（りんく/こん太/たぬ姉/
 *   ギフト/広告の顔つき段）が鏡にはあるのに画面に出ない／ローディングが終わらない」の原因が
 *   抜け漏れなく分かるようにする。北極星レーンには _northStarRenderProbe があるのに、応援レーンには
 *   同等のプローブが無く「描画が走ったか・どこで止まったか・実際に何件出たか」を状態速報から知る術が
 *   無かった＝盲点（v0.1.953 の純Web鏡の盲点の、ちょうど一層上の同じ構図）。
 *
 * ★制約（MEMORY 鉄則・実装の絶対条件）:
 *   - 新規 storage read を増やさない。プローブは popup-entry が globalThis 的に1個持ち、描画経路の
 *     入口/分岐/出口を記録するだけ（北極星プローブと同方式）。
 *   - 純データの build/format/cards をここ（lib）に隔離してテストする。popup-entry は記録の1行ずつだけ。
 *   - 件数と step のみ（キー値・個人情報は持ち込まない）。
 *   - paint の read path を新規ラップしない。domTilesPainted は paint 直後の childElementCount を
 *     記録するだけ＝描画サイクルを変えない（観測であって描画を変えない）。
 *
 * @module storyUserLaneRenderProbe
 */

/**
 * v0.1.1006: 「匿名主体の配信」とみなす userId 付き率(%)の上限。これ以下なら、コメントは供給されても
 *   顔タイルに乗れる人(userId 解決可)がほぼ居ない=heavy 経路の 0 タイルは正常(描画停止でない)。
 *   匿名184はDOMにも識別子が無く userId 解決不能=応援レーンに出ないのは仕様(対処カードの説明と同旨)。
 *   10% = 実機 lv350860018(2.6%)のような匿名主体を拾い、userId付きが一定数ある配信は誤って正常化しない。
 */
export const LANE_ANON_DOMINATED_MAX_PCT = 10;

/** 描画経路で到達しうる step（lastReachedStep に入る値の正本）。 */
export const STORY_USER_LANE_STEPS = Object.freeze({
  START: 'start',
  ENTRIES_EMPTY_RETURN: 'entries-empty-return', // heavy 経路: STORY_SOURCE_STATE.entries が空で即 return
  MIRROR_EMPTY: 'mirror-empty', // mirror 経路: 鏡 totalCells===0
  PAINTED: 'painted', // paintStoryUserLaneDomFilled を呼んだ直後
  DONE: 'done' // 正常完了
});

/**
 * プローブの初期状態を作る（popup-entry が1個だけ持つ）。
 * @returns {object}
 */
export function createStoryUserLaneRenderProbe() {
  return {
    activePath: '', // 'heavy' | 'mirror' | ''
    started: 0,
    completed: 0,
    lastReachedStep: '',
    lastError: '',
    domTilesPainted: -1, // paint 直後の DOM 顔タイル総数（-1=未計測）
    mirrorCells: -1, // mirror 経路の鏡 非null件数（-1=未計測）
    entriesLen: -1, // heavy 経路の STORY_SOURCE_STATE.entries 件数（-1=未計測）
    // v0.1.1033: heavy 完了コールバックが settled=true に到達したか/どの early-return で抜けたか。
    //   「たぬ姉レーンが暫定(直近N件)で固着」の真因(refreshGen レース)を状態速報から観測する。
    heavySettleState: '', // '' | 'settled' | 'race' | 'stale-snapshot' | 'null-resp' | 'empty-covered'
    heavyRaceReturns: 0, // 14532(refreshGen レース)で早期 return した累計回数(多い=レース支配的)
    lastRunAtBase: 0 // 最終実行 epoch ms（lastRunAgoMs 算出用）
  };
}

/** heavy 完了コールバックの結末コード(heavySettleState に入る値の正本)。 */
export const STORY_USER_LANE_HEAVY_SETTLE = Object.freeze({
  SETTLED: 'settled', // watchPopupHeavyCommentsSettled=true に到達(=全件がレーンに乗る正常)
  RACE: 'race', // 14532 refreshGen !== gen で早期 return(次 refresh に追い越された)
  STALE_SNAPSHOT: 'stale-snapshot', // 14530 snapshotKey 不一致で早期 return
  NULL_RESP: 'null-resp', // 14531 heavy が null
  EMPTY_COVERED: 'empty-covered' // 14542 空 resp だが arr が total の8割超
});

/**
 * heavy 完了コールバックの結末を記録する(pure・popup-entry が1行で呼ぶ)。
 * @param {object} probe
 * @param {string} state STORY_USER_LANE_HEAVY_SETTLE のいずれか
 */
export function recordStoryUserLaneHeavySettle(probe, state) {
  if (!probe || typeof probe !== 'object') return;
  probe.heavySettleState = String(state || '');
  if (state === STORY_USER_LANE_HEAVY_SETTLE.RACE) {
    probe.heavyRaceReturns = (Number(probe.heavyRaceReturns) || 0) + 1;
  }
}

/**
 * 描画 step を記録する（popup-entry の描画関数が呼ぶ）。
 * @param {object} probe createStoryUserLaneRenderProbe() の戻り
 * @param {string} step STORY_USER_LANE_STEPS のいずれか
 * @param {object} [patch] { activePath?, domTilesPainted?, mirrorCells?, entriesLen?, error?, nowMs? }
 */
export function recordStoryUserLaneStep(probe, step, patch) {
  if (!probe || typeof probe !== 'object') return;
  const p = patch && typeof patch === 'object' ? patch : {};
  probe.lastReachedStep = String(step || '');
  if (typeof p.activePath === 'string') probe.activePath = p.activePath;
  if (Number.isFinite(p.domTilesPainted)) probe.domTilesPainted = Math.max(0, Math.floor(p.domTilesPainted));
  if (Number.isFinite(p.mirrorCells)) probe.mirrorCells = Math.max(0, Math.floor(p.mirrorCells));
  if (Number.isFinite(p.entriesLen)) probe.entriesLen = Math.max(0, Math.floor(p.entriesLen));
  if (p.error != null) probe.lastError = String(p.error).slice(0, 200);
  if (step === STORY_USER_LANE_STEPS.START) {
    probe.started += 1;
    probe.lastError = '';
    if (Number.isFinite(p.nowMs)) probe.lastRunAtBase = Number(p.nowMs);
  }
  if (step === STORY_USER_LANE_STEPS.DONE) probe.completed += 1;
}

/**
 * 診断JSON(popup.storyUserLaneRenderProbe)に出す形へ。lastRunAgoMs を nowMs から算出。
 * @param {object} probe
 * @param {number} nowMs
 * @returns {object|null}
 */
export function snapshotStoryUserLaneRenderProbe(probe, nowMs) {
  if (!probe || typeof probe !== 'object') return null;
  const now = Number(nowMs) || 0;
  return {
    activePath: probe.activePath || '',
    started: probe.started || 0,
    completed: probe.completed || 0,
    lastReachedStep: probe.lastReachedStep || '',
    lastError: probe.lastError || '',
    domTilesPainted: Number.isFinite(probe.domTilesPainted) ? probe.domTilesPainted : -1,
    mirrorCells: Number.isFinite(probe.mirrorCells) ? probe.mirrorCells : -1,
    entriesLen: Number.isFinite(probe.entriesLen) ? probe.entriesLen : -1,
    heavySettleState: probe.heavySettleState || '',
    heavyRaceReturns: Number(probe.heavyRaceReturns) || 0,
    lastRunAgoMs: probe.lastRunAtBase > 0 && now > 0 ? Math.max(0, now - probe.lastRunAtBase) : null
  };
}

/**
 * 状態速報用の判定オブジェクト（formatLines/toActionCards が共有）。
 * 「鏡N件 → 画面M件描画」の食い違いと、止まった step を症状に翻訳する。
 * @param {object|null} probeSnap snapshotStoryUserLaneRenderProbe の戻り（fastDiag.popup.storyUserLaneRenderProbe）
 * @returns {object}
 */
export function buildStoryUserLaneRenderDiag(probeSnap, ctx) {
  const s = probeSnap && typeof probeSnap === 'object' ? probeSnap : null;
  if (!s) return { present: false };

  const path = s.activePath || '';
  const dom = Number.isFinite(s.domTilesPainted) ? s.domTilesPainted : -1;
  const mirror = Number.isFinite(s.mirrorCells) ? s.mirrorCells : -1;
  const entries = Number.isFinite(s.entriesLen) ? s.entriesLen : -1;
  const step = s.lastReachedStep || '';
  const started = s.started || 0;
  const completed = s.completed || 0;
  // ★v0.1.1006 誤検知の根治: 応援レーンの顔タイルは userId(識別子)を持つ人しか乗らない(匿名184は
  //   DOM にも識別子が無く userId 解決不能=仕様)。匿名主体の配信は「コメントは供給されているが
  //   乗れる人がいない」ので 0 タイルが正常。withUidPercent(記録のうち userId 付き率)が極端に低いとき
  //   heavy 経路の 0 タイルを🔴(描画停止)と誤報しないため、しきい値で「匿名主体=正常」に倒す。
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const withUidPercent = Number(c.withUidPercent);
  const anonymousDominated =
    Number.isFinite(withUidPercent) && withUidPercent >= 0 && withUidPercent <= LANE_ANON_DOMINATED_MAX_PCT;

  // 「期待件数」= 経路に応じた供給件数（mirror なら鏡、heavy なら entries）。
  const expected = path === 'mirror' ? mirror : path === 'heavy' ? entries : Math.max(mirror, entries, -1);

  // 症状の判定（council の (A)〜(E)）。
  let verdict = 'unknown';
  let reason = '';
  if (started === 0) {
    verdict = 'not_started';
    // v0.1.980: 「未起動」のとき次の一手を文言に含める(状態速報1枚で原因と対処が分かるように)。
    //   v0.1.976〜979 で描画は重い処理(heavy refresh)非依存の独立トリガから起動するようにした。
    //   それでも started=0 なら、拡張に新コードがまだ乗っていない(リロード前)か、popup を開いてから
    //   時間が経っておらず独立トリガ(初回400ms/1500ms+周期)が回る前=拡張🔄リロード→watch F5→
    //   popup を数秒開いたままにして再取得、で起動するはず。
    reason =
      '描画関数が一度も呼ばれていません（対処: 拡張を🔄リロード→watch を F5→popup を数秒開いたままにして再度コピー。v0.1.976〜979 で重い処理を待たず独立して描画を起動するようにしています）';
  } else if (s.lastError) {
    verdict = 'errored';
    reason = `描画中に例外: ${s.lastError}`;
  } else if (expected === 0) {
    verdict = 'empty_source';
    reason = '元データ（鏡/コメント）が0件＝出なくて正常';
  } else if (expected > 0 && dom === 0 && path === 'heavy' && anonymousDominated) {
    // ★v0.1.1006: 匿名主体(userId付き率が極低)の配信は、コメントは供給されても顔タイルに乗れる人が
    //   いない=0タイルが正常。🔴(描画停止)でなく正常扱いにして誤報を消す。
    verdict = 'empty_source_anonymous';
    reason = `供給${expected}件は匿名主体(userId付き率${Math.round(withUidPercent * 10) / 10}%)で顔タイルに乗れる人がいない＝0件で正常（匿名は識別子が無く応援レーンに出ないのは仕様）`;
  } else if (expected > 0 && dom === 0) {
    verdict = 'source_but_no_dom';
    reason = `供給${expected}件あるのに画面0件＝描画が止まっています（最後の到達=${step || '不明'}）`;
  } else if (dom > 0 && completed === 0) {
    verdict = 'painted_not_completed';
    reason = `画面に${dom}件出ましたが描画が完走していません（途中で止まった疑い・最後の到達=${step || '不明'}）`;
  } else if (dom > 0) {
    verdict = 'ok';
    reason = `画面に${dom}件描画済み`;
  }

  return {
    present: true,
    path,
    started,
    completed,
    lastReachedStep: step,
    lastError: s.lastError || '',
    domTilesPainted: dom,
    mirrorCells: mirror,
    entriesLen: entries,
    expected,
    heavySettleState: String(s.heavySettleState || ''),
    heavyRaceReturns: Number(s.heavyRaceReturns) || 0,
    lastRunAgoMs: s.lastRunAgoMs ?? null,
    // v0.1.1040 計器: 段ごとの実 replaceChildren 回数(churn 実測)をそのまま持ち越す。
    laneRepaintCounts: s.laneRepaintCounts && typeof s.laneRepaintCounts === 'object' ? s.laneRepaintCounts : null,
    verdict,
    reason
  };
}

/** 経路の日本語ラベル。 */
function pathLabel(path) {
  if (path === 'mirror') return '鏡(プレビュー)';
  if (path === 'heavy') return 'コメント由来(popup)';
  return '不明';
}

/**
 * 状態速報に載せるテキスト行配列。
 * @param {object} diag buildStoryUserLaneRenderDiag の戻り
 * @param {{ loadingActive?: boolean }} [ctx] ローディング overlay が表示中か（status-entry が渡す）
 * @returns {string[]}
 */
export function formatStoryUserLaneRenderDiagLines(diag, ctx) {
  const d = diag && typeof diag === 'object' ? diag : {};
  if (!d.present) return [];
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const lines = [];
  const dom = d.domTilesPainted >= 0 ? `${d.domTilesPainted}件描画` : '描画件数不明';
  const supply =
    d.path === 'mirror'
      ? `鏡${d.mirrorCells >= 0 ? d.mirrorCells : '?'}件`
      : d.path === 'heavy'
        ? `コメント${d.entriesLen >= 0 ? d.entriesLen : '?'}件`
        : `供給${d.expected >= 0 ? d.expected : '?'}件`;
  const mark =
    d.verdict === 'ok' || d.verdict === 'empty_source' || d.verdict === 'empty_source_anonymous'
      ? '✅'
      : d.verdict === 'unknown'
        ? ''
        : '🔴';
  lines.push(
    `応援レーン描画: 経路=${pathLabel(d.path)} / ${supply} → 画面${dom} ${mark}` +
      (d.lastReachedStep ? ` / 最後の到達=${d.lastReachedStep}` : '') +
      (d.lastRunAgoMs != null ? ` / ${Math.round(d.lastRunAgoMs / 1000)}秒前` : '')
  );
  if (d.reason) lines.push(`  → ${d.reason}`);
  // 描画済みなのにローディングが終わらない＝overlay バグ（status-entry が overlay 状態を渡したときだけ）。
  if (c.loadingActive === true && d.domTilesPainted > 0) {
    lines.push('  → ⚠ 画面に描画済みなのにローディング表示が続いています（ローディングを畳むバグの疑い）');
  }
  // v0.1.1040 計器: 段ごとの実 replaceChildren 回数(churn 実測)。特定の段だけ回数が突出=その段が churn 源。
  if (d.laneRepaintCounts && typeof d.laneRepaintCounts === 'object') {
    const r = d.laneRepaintCounts;
    lines.push(
      `  → 段別 再描画回数(累計): りんく${r.link || 0} / こん太${r.konta || 0} / たぬ姉${r.tanu || 0} / ギフト${r.gift || 0} / 広告${r.ad || 0}` +
        '（特定の段だけ突出＝その段が churn 源）'
    );
  }
  // v0.1.1033: heavy 完了が settled に到達したか。race 多発=たぬ姉レーンが暫定(直近N件)で固着の真因。
  if (d.heavySettleState) {
    const settleLabel =
      d.heavySettleState === 'settled'
        ? '✅ settled(全件がレーンに乗る正常)'
        : d.heavySettleState === 'race'
          ? `⚠ race(refreshに追い越され未settle・累計${d.heavyRaceReturns}回)=たぬ姉が暫定固着の疑い`
          : d.heavySettleState;
    lines.push(`  → heavy 完了: ${settleLabel}`);
  }
  return lines;
}

/**
 * 致命カード（症状→原因→次の一手）。buildStatusActions の結果に結合する。
 * @param {object} diag buildStoryUserLaneRenderDiag の戻り
 * @param {{ loadingActive?: boolean }} [ctx]
 * @returns {Array<{id:string,severity:string,symptom:string,cause:string,action:string,fixableHere:string}>}
 */
export function storyUserLaneRenderDiagToActionCards(diag, ctx) {
  const d = diag && typeof diag === 'object' ? diag : {};
  if (!d.present) return [];
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const cards = [];

  if (d.verdict === 'source_but_no_dom') {
    cards.push({
      id: 'story-user-lane-no-dom',
      severity: 'bad',
      symptom: `応援レーンが鏡にはあるのに画面に出ていません（供給${d.expected}件 → 画面0件）`,
      cause: `描画が「${d.lastReachedStep || '不明'}」で止まっています。${
        d.path === 'heavy' && d.entriesLen === 0
          ? 'コメント全件読みが完走せず entries が空のまま（passive で踏みやすい既知地雷）。'
          : '描画関数が呼ばれていない、または早期 return しています。'
      }`,
      action: 'この状態速報を開発者(Claude)に共有してください。描画経路（経路=' + pathLabel(d.path) + '）のどこで止まっているか実コードで特定して直します。',
      fixableHere: 'no'
    });
  }

  if (d.verdict === 'errored') {
    cards.push({
      id: 'story-user-lane-error',
      severity: 'bad',
      symptom: '応援レーンの描画が例外で落ちています',
      cause: `描画中の例外: ${d.lastError}`,
      action: 'この状態速報を開発者(Claude)に共有してください。例外箇所を実コードで特定して直します。',
      fixableHere: 'no'
    });
  }

  if (d.verdict === 'painted_not_completed') {
    cards.push({
      id: 'story-user-lane-not-completed',
      severity: 'warn',
      symptom: `応援レーンが${d.domTilesPainted}件まで出ましたが描画が完走していません`,
      cause: `描画が「${d.lastReachedStep || '不明'}」で止まっています（途中で止まった疑い）。`,
      action: 'この状態速報を開発者(Claude)に共有してください。完走しない原因を実コードで特定して直します。',
      fixableHere: 'no'
    });
  }

  // 描画済みなのにローディングが終わらない（overlay を畳むバグ）。
  if (c.loadingActive === true && d.domTilesPainted > 0) {
    cards.push({
      id: 'story-user-lane-loading-stuck',
      severity: 'warn',
      symptom: '応援レーンは描画済みなのにローディング表示が終わりません',
      cause: '描画は成功しているのに、ローディング overlay を畳む処理が走っていません（overlay バグ）。',
      action: 'この状態速報を開発者(Claude)に共有してください。overlay を畳む経路を実コードで特定して直します。',
      fixableHere: 'no'
    });
  }

  return cards;
}
