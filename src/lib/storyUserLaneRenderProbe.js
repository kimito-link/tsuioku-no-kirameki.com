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
  DONE: 'done', // 正常完了
  // heavyRace再発の即効対策(HANDOFF-heavyrace-backfill-IMPL.md A): 暫定の縮小 supply が完全描画を
  //   上書きしそうになったので paint を見送り前回描画を守った(=単調性ガードが実弾を止めた)。
  SHRINK_KEPT: 'shrink-kept'
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
    heavyEverSettled: false, // v0.1.1241: 一度でも settled に到達したか(最後が race でも消えない)
    // heavyRace再発の即効対策(A): 暫定縮小の上書きを見送った累計回数(>0=ガードが完全描画を守った)。
    shrinkKeepCount: 0,
    // ───────────────────────────────────────────────────────────────────
    // v0.1.1229 計器(会議2026-08-02): 「レーンが出たり消えたり」の真因が
    //   (a)レースの頻発 なのか (b)entriesProvisional が立たずガードが素通り なのかを
    //   機械的に切り分ける。実測で shrinkKeepCount:0(ガードが一度も発動しない)ことは
    //   分かったが、「呼ばれて条件を満たさなかった」のか「そもそも縮小していない」のかが
    //   区別できなかった。★症状でなく原因を出すための計器。
    // ───────────────────────────────────────────────────────────────────
    /** 直近 paint 時点の entriesProvisional 実値(-1=未計測 / 0=false / 1=true)。 */
    lastProvisional: -1,
    /** paint 時点で provisional=true だった累計(=ガードが働きうる状態だった回数)。 */
    provisionalTrueCount: 0,
    /** paint 時点で provisional=false だった累計。これが支配的なら (b) が濃厚。 */
    provisionalFalseCount: 0,
    /** 直近の「描かなかった理由」。none=実際に描いた。 */
    lastPaintSkipReason: '',
    /** 理由別の累計。29回走って1件しか描けない内訳をここで説明する。 */
    paintSkipReasons: {},
    /** 縮小を検知した累計(next < prev*0.6)。ガード未発動でもここは増える=切り分けの要。 */
    shrinkDetectedCount: 0,
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
  // ★v0.1.1241: heavySettleState は【最後の1回】しか持たない。5回中4回 race でも
  //   「一度は全件が乗った」事実が消え、実配信 lv351085849 で droppedTotal=0(誰も消えていない)
  //   なのに「たぬ姉が暫定固着の疑い」と誤警告した。race は自己修復の途中経過でもあるので
  //   (v0.1.1035: race で bail しても readAtMs を打って次 refresh が settled で始まれる)、
  //   settled 到達の有無を別に持ち、症状から原因を飛躍して名指ししない。
  if (state === STORY_USER_LANE_HEAVY_SETTLE.SETTLED) {
    probe.heavyEverSettled = true;
  }
}

/** paint を見送った理由の正本(状態速報の内訳ラベルにそのまま使う)。 */
export const STORY_USER_LANE_SKIP_REASON = Object.freeze({
  NONE: 'none', // 実際に描いた
  SHRINK: 'shrink', // 単調性ガードが縮小上書きを見送った
  EMPTY: 'empty', // 空ガードが既存タイルを守った
  DIFF_SKIP: 'diffskip', // 同一 signature で再描画不要
  PROVISIONAL_FALSE: 'provisional-false' // ★縮小しているのに provisional=false でガードが素通り
});

/**
 * v0.1.1229: paint の判断結果を1件記録する(計器の失敗は描画を止めない)。
 *
 * ★これが (a)/(b) の切り分けの核心:
 *   - provisional-false が支配的        → (b) フラグ側が原因
 *   - provisionalTrue なのに shrinkKeep が増えない → ガードの条件式が原因
 *   - none が多い(skipせず描いて1件)     → (a) 供給側が原因
 *
 * @param {object} probe
 * @param {{ provisional?: unknown, reason?: string, shrinkDetected?: boolean }} info
 */
export function recordStoryUserLanePaintDecision(probe, info) {
  if (!probe || typeof probe !== 'object') return;
  try {
    const prov = info?.provisional === true;
    probe.lastProvisional = prov ? 1 : 0;
    if (prov) probe.provisionalTrueCount = (Number(probe.provisionalTrueCount) || 0) + 1;
    else probe.provisionalFalseCount = (Number(probe.provisionalFalseCount) || 0) + 1;
    if (info?.shrinkDetected === true) {
      probe.shrinkDetectedCount = (Number(probe.shrinkDetectedCount) || 0) + 1;
    }
    const reason = String(info?.reason || '');
    if (reason) {
      probe.lastPaintSkipReason = reason;
      const bag = probe.paintSkipReasons || (probe.paintSkipReasons = {});
      bag[reason] = (Number(bag[reason]) || 0) + 1;
    }
  } catch { /* 計器の失敗は描画を止めない */ }
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
  // heavyRace再発の即効対策(A): 単調性ガードが暫定縮小の上書きを見送った回数(RACE カウントと同型)。
  if (step === STORY_USER_LANE_STEPS.SHRINK_KEPT) probe.shrinkKeepCount = (Number(probe.shrinkKeepCount) || 0) + 1;
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
    heavyEverSettled: probe.heavyEverSettled === true, // v0.1.1241: 誤警告防止(最後が race でも消えない)
    shrinkKeepCount: Number(probe.shrinkKeepCount) || 0,
    // v0.1.1229: (a)/(b) 切り分け用。
    lastProvisional: Number.isFinite(probe.lastProvisional) ? probe.lastProvisional : -1,
    provisionalTrueCount: Number(probe.provisionalTrueCount) || 0,
    provisionalFalseCount: Number(probe.provisionalFalseCount) || 0,
    shrinkDetectedCount: Number(probe.shrinkDetectedCount) || 0,
    lastPaintSkipReason: String(probe.lastPaintSkipReason || ''),
    paintSkipReasons:
      probe.paintSkipReasons && typeof probe.paintSkipReasons === 'object'
        ? { ...probe.paintSkipReasons }
        : {},
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

  // ★2026-08-08: 「まだ落ち着いていない」判定。暫定paintだけで確定paintが0回なら
  //   読み込み途中＝0件でも異常ではない。heavyEverSettled も併せて見る
  //   (どちらかでも「確定した」と言えるなら settling ではない)。
  const provisionalOnly =
    (Number(s.provisionalTrueCount) || 0) > 0 &&
    (Number(s.provisionalFalseCount) || 0) === 0 &&
    s.heavyEverSettled !== true;

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
  } else if (expected > 0 && dom === 0 && path === 'heavy' && provisionalOnly) {
    // ★2026-08-08: 「まだ落ち着いていない」を🔴(描画停止)と言わない。
    //
    // ■ 実機で踏んだ誤報(状態速報 2026-08-07T15:59)
    //   heavy が entries26 で走り domTiles0 の瞬間を切り取って
    //   「供給26件あるのに画面0件＝描画が止まっています」と🔴を出し、
    //   「開発者に共有してください」まで案内していた。しかし同じ報告の中で
    //   鏡149件・会場152席は正常に出ており、描画経路は生きていた。
    //   実態は popup 起動283ms・幕(shade)が出たまま・heavyEverSettled=false
    //   =【まだ一度も読み切っていない】だけ。
    //
    // ■ 見分け方: 全ての paint が provisional(暫定)で、確定 paint が0回。
    //   確定が一度でもあって0件なら本物の異常なので従来どおり🔴のまま。
    //   ★これは [[instrument-name-can-mislead]] と同型(計器が正常を犯人と名指しする)。
    verdict = 'settling';
    reason =
      `供給${expected}件・画面0件ですが、まだ暫定描画のみ(確定paint 0回)＝` +
      '読み込み途中です。popup を数十秒開いたままにして取り直してください' +
      '（それでも0件なら本物の異常です）';
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
    heavyEverSettled: s.heavyEverSettled === true, // v0.1.1241
    shrinkKeepCount: Number(s.shrinkKeepCount) || 0,
    // v0.1.1229: (a)/(b) 切り分け用(そのまま持ち越す)。
    lastProvisional: Number.isFinite(s.lastProvisional) ? s.lastProvisional : -1,
    provisionalTrueCount: Number(s.provisionalTrueCount) || 0,
    provisionalFalseCount: Number(s.provisionalFalseCount) || 0,
    shrinkDetectedCount: Number(s.shrinkDetectedCount) || 0,
    lastPaintSkipReason: String(s.lastPaintSkipReason || ''),
    paintSkipReasons: s.paintSkipReasons && typeof s.paintSkipReasons === 'object' ? s.paintSkipReasons : {},
    // heavyRace根治(B)計器: fresh-read で heavy 全件再読みを省いた累計(popup-entry が snap に直接載せる)。
    heavyFreshReadReuseCount: Number(s.heavyFreshReadReuseCount) || 0,
    // ★v0.1.1341: 再利用が0回のとき【なぜ0なのか】を言うための最後の判定理由
    //   ('coverage' | 'fresh-read' | '')。0のときこそ出す(異常時に診断が消えるのを防ぐ)。
    heavyReuseLastReason: String(s.heavyReuseLastReason || ''),
    // ★v0.1.1363: 世代が進んでも手元の全件で描いた回数(race固着の回避が効いた証拠)。
    //   ★ここに足し忘れると、popup が snap に載せても行に出ない=個別列挙が値を落とす型。
    heavyRacePaintedFromCache: Number(s.heavyRacePaintedFromCache) || 0,
    // ★v0.1.1346: タイル数の往復(点滅)の要約。popup が summarize 済みの物を載せる。
    laneTileOscillation:
      s.laneTileOscillation && typeof s.laneTileOscillation === 'object'
        ? s.laneTileOscillation
        : null,
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
        : // ★2026-08-08: 読み込み途中は🔴(異常)ではなく⏳(待ち)。
          //   🔴のままだと「開発者に共有してください」まで案内して実機で誤報になった。
          d.verdict === 'settling'
          ? '⏳'
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
  // ★v0.1.1241: 「一度でも settled したか」で言い分けを変える。race は自己修復の途中経過でもあり
  //   (v0.1.1035: race で bail しても次 refresh が settled で始まれる)、最後の1回が race というだけで
  //   固着を名指しすると、実配信 lv351085849 のように droppedTotal=0(誰も消えていない)でも誤警告になる。
  if (d.heavySettleState) {
    const settleLabel =
      d.heavySettleState === 'settled'
        ? '✅ settled(全件がレーンに乗る正常)'
        : d.heavySettleState === 'race'
          ? d.heavyEverSettled
            ? `⚪ race(累計${d.heavyRaceReturns}回)だが一度は全件到達済み=自己修復中(固着ではない)`
            : `⚠ race(refreshに追い越され未settle・累計${d.heavyRaceReturns}回)=一度も全件到達なし=たぬ姉が暫定固着の疑い`
          : d.heavySettleState;
    lines.push(`  → heavy 完了: ${settleLabel}`);
  }
  // heavyRace再発の即効対策(A): 単調性ガードが暫定縮小の上書きを止めた回数(>0=前回の完全描画を守れている証拠)。
  if (Number(d.shrinkKeepCount) > 0) {
    lines.push(`  → ⚠ 暫定縮小の上書きを ${d.shrinkKeepCount} 回防御(前回の完全描画を保持=たぬ姉固着を回避)`);
  }
  // ★v0.1.1229(会議2026-08-02): 「出たり消えたり」の (a)レース頻発 / (b)フラグ未設定 を切り分ける。
  //   ここが出れば、次に直すべき場所が推測でなく数字で決まる。
  const provT = Number(d.provisionalTrueCount) || 0;
  const provF = Number(d.provisionalFalseCount) || 0;
  const shrinkDet = Number(d.shrinkDetectedCount) || 0;
  if (provT + provF > 0) {
    const reasons = d.paintSkipReasons && typeof d.paintSkipReasons === 'object' ? d.paintSkipReasons : {};
    const parts = [];
    for (const k of Object.keys(reasons)) {
      const n = Number(reasons[k]) || 0;
      if (n > 0) parts.push(`${k}${n}`);
    }
    lines.push(
      `  → 描画判断: 暫定${provT}/確定${provF} / 縮小検知${shrinkDet}回 / 見送り内訳(${parts.join(' ') || 'なし'})`
    );
    // ★真因の名指し。縮小しているのに provisional=false ならガードは構造上素通りする。
    if (shrinkDet > 0 && Number(d.shrinkKeepCount) === 0 && provF > 0) {
      lines.push(
        '  → ⚠ 縮小しているのにガードが素通り(provisional=false)=タイルが消える直接原因。フラグ設定側を疑う'
      );
    }
  }
  /*
   * heavyRace根治(B): fresh-read で heavy 全件再読みを省いた回数。
   *
   * ★v0.1.1341: 【0のときこそ理由を出す】。
   *   旧実装は `> 0` のときだけ行を出していたため、**効いていないときに限って
   *   速報から消える**という逆立ちだった(異常時ほど診断が消える型)。
   *   実測(2026-08-12): heavyFreshReadReuseCount=0 / heavyRaceReturns=26 で
   *   「再利用が一度も成立していない」のに、その事実が速報に1文字も出なかった。
   *   ★再利用が成立しない原因は入力側にあるので、最後の判定理由を併記する。
   */
  /*
   * ★v0.1.1346: タイル数の【往復】= 点滅。
   *   既存の縮小ガードは「前回より減ったか」しか見ないので、
   *   2⇄30 の往復も 2→2 の停滞も同じ「縮小0回」に見えていた。
   *   往復が観測されたときだけ出す(正常時のノイズにしない)。
   */
  /*
   * ★v0.1.1355: 「減った」ときも必ず出す(ユーザー実機「途中で増えたり減ったりしてる」)。
   *   旧実装は reversals>0(往復した)ときだけ出していたため、
   *   **17→2 に減ったまま戻らない**経過が「✅往復なし」として黙殺されていた
   *   (異常時ほど診断が消える型)。減少は往復に数えられないので条件に足す。
   */
  const osc = d.laneTileOscillation;
  if (osc && osc.line && (Number(osc.reversals) > 0 || Number(osc.drops) > 0)) {
    lines.push(`  → ${osc.line}`);
  }
  /*
   * ★v0.1.1363: 世代が進んでいても【手元の全件】で描いた回数。
   *   実機(2026-08-12)は race 46回・settled 0回で、158件あるのに18件しか描けていなかった
   *   (会場は①の鏡なので会場も18件=「会場モードがりんくしかない」)。
   *   再利用が成立していても .then() のマイクロタスク1回で世代が進み、必ず bail していた。
   *   この行が出る=その固着を抜けた証拠。
   */
  const fromCache = Number(d.heavyRacePaintedFromCache) || 0;
  if (fromCache > 0) {
    lines.push(`  → 🛡 世代が進んでも手元の全件で描いた: ${fromCache}回(race固着の回避が効いている)`);
  }
  const freshReuse = Number(d.heavyFreshReadReuseCount) || 0;
  const raceN = Number(d.heavyRaceReturns) || 0;
  if (freshReuse > 0) {
    lines.push(`  → heavy 全件再読み省略(fresh-read再利用): ${freshReuse} 回(backfill中の re-read ループ抑止が効いている)`);
  } else if (raceN > 0) {
    const why = String(d.heavyReuseLastReason || '').trim();
    /*
     * ★v0.1.1352: 理由を【原因語+次の一手】まで翻訳する。
     *   旧実装は「cachedが無い/lv不一致/件数0のいずれか」と3択のまま出しており、
     *   ユーザーが「どれ?」と聞き返さないと次に進めなかった
     *   (2026-08-12 指摘「全部質問しなくても分かるようにならないと困る」)。
     *   decideHeavyChunkReadReuse が理由を名指しするようになったので、ここで人語にする。
     */
    const whyLabel = why === 'coverage'
      ? 'coverage(80%カバー)で再利用済み=fresh-readの出番が無い'
      : why === 'no-cache'
        ? '★原因=前回の全件読みが1度も残っていない(popupを開き直した直後/heavy readが毎回失敗)'
        : why === 'lv-mismatch'
          ? '★原因=キャッシュが別配信のもの(配信を移った直後なら次の全件読みで解消)'
          : why === 'empty-cache'
            ? '★原因=前回の全件読みが0件で終わっている(読めていないのにキャッシュだけ残った)'
            : why
              ? `最後の判定理由=${why}`
              : '★再利用が一度も判定されていない(判定関数まで到達していない)';
    lines.push(`  → ⚠ heavy 全件再読みの省略が0回(race ${raceN}回) ${whyLabel}`);
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

/**
 * v0.1.1229: 「今回の描画がタイルを大幅に減らすか」をガードとは独立に判定する。
 *
 * ★ガードの発動条件(provisional 必須)と切り離して測るのが要点。
 *   でないと「縮小していない」と「縮小したがガードが素通りした」が同じ値になり、
 *   実測 shrinkKeepCount:0 の意味が読めない(今回の切り分けが詰まった直接の理由)。
 *
 * @param {{ laneLink?: any, laneGift?: any, laneAd?: any, laneKonta?: any, laneTanu?: any }|null|undefined} els
 * @param {number} nextTileCount
 * @param {number} [ratio] 既定 1(ガードと同じ定義=1枚でも減ったら縮小)
 *   ★v0.1.1240: 既定を 0.6 → 1 に変更。ガードは v0.1.1233 で `next < prev` になったのに
 *     計器だけ 0.6 のままで、定義がズレていた。その結果、実配信 v0.1.1239 で
 *     **誰も消えていない**(消えた人0人/来た人423人/DOM433件)のに
 *     「⚠ 縮小しているのにガードが素通り」という誤警告が出た。
 *     計器とガードで「縮小」の意味が違うと、切り分けが永久に詰まる。
 * @returns {boolean}
 */
export function detectStoryUserLaneShrink(els, nextTileCount, ratio = 1) {
  try {
    const lanes = els ? [els.laneLink, els.laneGift, els.laneAd, els.laneKonta, els.laneTanu] : [];
    let prev = 0;
    for (const lane of lanes) {
      if (lane && typeof lane.childElementCount === 'number') prev += lane.childElementCount;
    }
    if (prev <= 0) return false;
    const next = Math.max(0, Math.floor(Number(nextTileCount) || 0));
    return next < Math.floor(prev * ratio);
  } catch {
    return false;
  }
}

/**
 * v0.1.1229: 縮小判定→計器記録までを1関数に閉じる(popup-entry の肥大を避ける)。
 *
 * @param {object} probe
 * @param {object} args
 * @param {any} args.els レーン要素群
 * @param {number} args.nextTileCount 今回描こうとしている総タイル数
 * @param {unknown} args.provisional STORY_SOURCE_STATE.entriesProvisional
 * @param {boolean} args.guardHit shouldKeepStoryUserLaneTilesOnShrink の戻り
 * @returns {{ shrinkDetected: boolean }}
 */
export function notePaintDecision(probe, args) {
  const shrinkDetected = detectStoryUserLaneShrink(args?.els, Number(args?.nextTileCount) || 0);
  recordStoryUserLanePaintDecision(probe, {
    provisional: args?.provisional,
    shrinkDetected,
    reason: args?.guardHit === true
      ? STORY_USER_LANE_SKIP_REASON.SHRINK
      : (shrinkDetected
          ? STORY_USER_LANE_SKIP_REASON.PROVISIONAL_FALSE
          : STORY_USER_LANE_SKIP_REASON.NONE)
  });
  return { shrinkDetected };
}
