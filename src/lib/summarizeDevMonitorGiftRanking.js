/**
 * v0.1.202 A-0: popup「詳しい状況（開発・切り分け用・折りたたみ）」の
 *               rows に追加する gift / ranking / multi-tab / network /
 *               avatar / viewer 情報の要約純関数。
 *
 * ユーザー要望「『詳しい状況』に gift/ranking が出ない、AI 診断と一緒にすべき」
 * を満たすため、AI 診断 payload と同じ raw data から popup の dev monitor
 * 表示用 rows を生成する。data の出所を 1 本化することで「popup 表示と
 * AI 共有 JSON の食い違い」を構造的に防ぐ。
 *
 * 入力は `KEY_AI_SHARE_FAST_DIAG` storage に content-entry.js が書き出す
 * fast cache（{ popup, content, exportedAt, ... }）と同じ shape を想定。
 *
 * 副作用なし。
 */

/**
 * @typedef {[string, string]} DevMonitorRow
 */

/**
 * fastCache から popup dev monitor 表示用の rows を生成する。
 * 入力が壊れていても crash しない（partial に出すか空配列）。
 *
 * @param {any} fastCache  AI share fast diag 形式の payload
 * @returns {DevMonitorRow[]}
 */
export function summarizeDevMonitorGiftRanking(fastCache) {
  /** @type {DevMonitorRow[]} */
  const rows = [];
  if (!fastCache || typeof fastCache !== 'object') return rows;

  const c = fastCache.content;
  if (!c || typeof c !== 'object') return rows;

  const gd = c.giftDiagnostics || {};

  // ギフト観測（NDGR / DOM コメント由来）
  const giftSummary =
    gd['ギフトサマリ'] && typeof gd['ギフトサマリ'] === 'object'
      ? gd['ギフトサマリ']
      : null;
  if (giftSummary) {
    const ndgrCount = numOr(giftSummary['NDGRギフトevent数'], 0);
    const ndgrPt = numOr(giftSummary['ギフトポイント観測'], 0);
    const domCount = numOr(giftSummary['コメントDOM由来ギフト観測数'], 0);
    const domPt = numOr(giftSummary['コメントDOM由来ギフトpt合計'], 0);
    rows.push([
      'ギフト観測（NDGR / DOM コメント由来）',
      `NDGR: ${ndgrCount} 件 / ${ndgrPt}pt、DOM由来: ${domCount} 件 / ${domPt}pt`
    ]);
  }

  // ギフトサイドバー履歴
  const subApp = c.giftSubAppDiag;
  if (subApp && typeof subApp === 'object') {
    const hc = numOr(subApp.historyCount, 0);
    const ifc = numOr(subApp.iframeCount, 0);
    const sfc = numOr(subApp.scrapableFrameCount, 0);
    const ok = hc > 0;
    rows.push([
      'ギフトサイドバー履歴',
      `${ok ? '✅' : '❌'} ${hc} 件 / iframe ${ifc} / scrape 可能 ${sfc}`
    ]);
  }

  // 応援ランキング自動オープン（v0.1.201 lastFailureReason 統合）
  const ao = gd.rankingDiag?.autoOpen;
  if (ao && typeof ao === 'object') {
    const reason =
      typeof ao.lastFailureReason === 'string' && ao.lastFailureReason
        ? ao.lastFailureReason
        : '';
    const attempts = numOr(ao.attemptCount, 0);
    if (reason) {
      const hint = ao.lastSidebarHints?.hints?.[0]?.text;
      const hintStr =
        hint && typeof hint === 'string' ? `（hint: ${hint}）` : '';
      rows.push(['応援ランキング自動オープン', `❌ ${reason}${hintStr}`]);
    } else if (attempts > 0) {
      const status =
        typeof ao.lastStatus === 'string' && ao.lastStatus
          ? ao.lastStatus
          : 'success';
      rows.push(['応援ランキング自動オープン', `✅ ${status}`]);
    } else {
      rows.push(['応援ランキング自動オープン', '— 試行なし']);
    }
  }

  // 貢献度ランキング件数
  const cr = gd.rankingDiag?.contributionRanking;
  if (cr && typeof cr === 'object') {
    const fc = numOr(cr.foundCount, 0);
    const attempts = numOr(gd.rankingDiag?.collectAttempts, 0);
    rows.push([
      '貢献度ランキング',
      fc > 0 ? `✅ ${fc} 件取得` : `❌ 0 件（試行 ${attempts} 回）`
    ]);
  }

  // multi-tab race 警告（v0.1.201 staleDomBundleSuspected 統合）
  const mt = gd.multiTabDiag;
  if (mt && typeof mt === 'object') {
    if (mt.staleDomBundleSuspected === true) {
      const parts = [];
      const lvCount = numOr(mt.eventDomLvCount, 0);
      if (lvCount > 30) parts.push(`過去 lv 残骸 ${lvCount} 件`);
      if (mt.currentLiveIdInNicoad === false) parts.push('nicoad 不一致');
      if (mt.currentLiveIdInEventDom === false) parts.push('current lv DOM 欠落');
      const summary = parts.length ? parts.join(' / ') : '判定基準該当';
      rows.push(['multi-tab race 警告', `⚠️ ${summary}`]);
    } else if (mt.hasSnapshot === true) {
      rows.push([
        'multi-tab race 警告',
        `✅ 残骸なし（lv 履歴 ${numOr(mt.eventDomLvCount, 0)} 件）`
      ]);
    }
  }

  // avatar / nickname 取得率
  const av = gd.avatarNicknameMatchDiag;
  if (av && typeof av === 'object') {
    rows.push([
      'avatar / nickname 取得率',
      `両方 ${numOr(av.avAndNick, 0)}、nick のみ ${numOr(av.nickNoAv, 0)}、avatar のみ ${numOr(av.avNoNick, 0)}`
    ]);
  }

  // viewer ログイン状態
  const meta = fastCache.popup?.watchSnapshotMeta;
  if (meta && typeof meta === 'object') {
    const viewerUid = String(meta.viewerUserId || '').trim();
    rows.push([
      'viewer ログイン状態',
      viewerUid
        ? `✅ uid 取得済（${viewerUid.slice(0, 8)}…）`
        : '❌ viewerUid 空（未ログイン or hook 不全）'
    ]);
  }

  // network 接続状態（v0.1.201 networkErrorProbe 統合）
  const net = c.networkErrorProbe;
  if (net && typeof net === 'object') {
    const ndgrOk = net.ndgrConnectStatus === 'connected';
    const nicoadStatus = String(net.nicoadFetchStatus || 'never');
    const swInactive = net.serviceWorkerInactive === true;
    const parts = [
      `NDGR ${ndgrOk ? '✅' : `❌ ${net.ndgrConnectStatus || 'unknown'}`}`,
      `nicoad ${nicoadStatus === 'success' ? '✅' : `❌ ${nicoadStatus}`}`,
      `SW ${swInactive ? '❌' : '✅'}`
    ];
    rows.push(['network 接続', parts.join(' / ')]);
  }

  return rows;
}

/**
 * @param {unknown} v
 * @param {number} fallback
 * @returns {number}
 */
function numOr(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
