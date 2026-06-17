// @ts-nocheck — 任意の診断 JSON を歩く動的整形(statusFormat.js と同系。厳密型は付けない)
/**
 * status.html「全体マインドマップ」のツリーモデルを組み立てる純関数(2026-06-18 ユーザー要望)。
 *
 * 狙い: status.html を開けば「ここを見れば全部わかる1枚」。AI も人間も、今の配信の状態を
 *   中心 → 枝(概要/コメント取得/北極星レーン/過去ログ/取得経路/popup診断/生JSON)で俯瞰でき、
 *   何かあっても根本(どの枝が🔴か)から辿れる。
 *
 * 設計:
 *   - 入力は status-entry が既に持つデータ(overviewText / livesData / fastDiag / popupDiag)だけ。
 *     新規 storage 読み書きゼロ・外部送信ゼロ(プライバシー方針)。
 *   - 出力はプレーンなツリー(描画は status-entry が native <details>/<summary> で行う=外部ライブラリ無し)。
 *   - 各ノードに badge(🟢健全/🟡注目/🔴要対応/⚪情報)を付け、読まなくても色で状態が分かる。
 *   - 値が無い枝は「未取得」を明示(空白で迷わせない=星野メソッド)。
 *
 * @typedef {{ label: string, value?: string, badge?: ''|'ok'|'warn'|'bad'|'info', children?: MindNode[], open?: boolean }} MindNode
 */

/** 安全に数値化 */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
/** 安全に文字列化(短縮) */
function str(v, max = 200) {
  return String(v == null ? '' : v).slice(0, max);
}

/**
 * @param {{ overviewText?: string, livesData?: any[], fastDiag?: any, popupDiag?: any }} data
 * @returns {MindNode}
 */
export function buildStatusMindmapModel(data) {
  const livesData = Array.isArray(data?.livesData) ? data.livesData : [];
  const fast = data?.fastDiag?.content && typeof data.fastDiag.content === 'object'
    ? data.fastDiag.content
    : null;
  const gift = fast?.giftDiagnostics && typeof fast.giftDiagnostics === 'object'
    ? fast.giftDiagnostics
    : null;
  const popupDiag = data?.popupDiag && typeof data.popupDiag === 'object' ? data.popupDiag : null;

  /** @type {MindNode} */
  const root = {
    label: '君斗りんく 状態マインドマップ',
    badge: 'info',
    open: true,
    children: []
  };

  root.children.push(buildOverviewBranch(livesData));
  root.children.push(buildLivesBranch(livesData));
  root.children.push(buildCommentIngestBranch(gift));
  root.children.push(buildNorthStarBranch(gift));
  root.children.push(buildBackfillBranch(fast));
  root.children.push(buildPipelineHealthBranch(fast));
  root.children.push(buildPopupDiagBranch(popupDiag));

  return root;
}

/** 概要(記録/取得率の要約) */
function buildOverviewBranch(livesData) {
  const recordedSum = livesData.reduce((a, lv) => a + (num(lv?.recordedCount) || 0), 0);
  const officialSum = livesData.reduce((a, lv) => a + (num(lv?.officialCommentCount) || 0), 0);
  const recordingCount = livesData.filter((lv) => lv?.recording).length;
  /** @type {MindNode} */
  const node = { label: '概要', badge: 'info', open: true, children: [] };
  node.children.push({ label: '記録中の配信', value: `${recordingCount} 件`, badge: recordingCount > 0 ? 'ok' : 'info' });
  node.children.push({ label: '累計 記録', value: `${recordedSum} 件` });
  if (officialSum > 0) {
    const pct = Math.round((recordedSum / officialSum) * 100);
    node.children.push({
      label: '取得率(累計)',
      value: `${pct}% (記録 ${recordedSum} / 公式 ${officialSum})`,
      badge: pct >= 80 ? 'ok' : pct >= 40 ? 'warn' : 'bad'
    });
  }
  return node;
}

/** 視聴中の配信(per-live) */
function buildLivesBranch(livesData) {
  /** @type {MindNode} */
  const node = { label: '視聴中の配信', badge: livesData.length ? 'info' : 'warn', open: true, children: [] };
  if (!livesData.length) {
    node.children.push({ label: '視聴中の配信なし', value: 'ニコ生 watch を開くと出ます', badge: 'warn' });
    return node;
  }
  for (const lv of livesData) {
    const pct = num(lv?.officialRatePct);
    const ended = !!lv?.endedAt;
    /** @type {MindNode} */
    const liveNode = {
      label: `[${str(lv?.liveId || '不明', 24)}]`,
      value: ended ? '配信終了' : '記録中',
      badge: pct == null ? 'info' : pct >= 80 ? 'ok' : pct >= 40 ? 'warn' : 'bad',
      children: []
    };
    if (pct != null) {
      liveNode.children.push({
        label: '取得率',
        value: `${pct}% (記録 ${num(lv?.recordedCount) ?? 0} / 公式 ${num(lv?.officialCommentCount) ?? 0})`,
        badge: pct >= 80 ? 'ok' : pct >= 40 ? 'warn' : 'bad'
      });
    }
    const ago = num(lv?.lastIngestAgoMs);
    if (ago != null) {
      liveNode.children.push({ label: '最終取り込み', value: `${Math.round(ago / 1000)} 秒前`, badge: ago < 120000 ? 'ok' : 'warn' });
    }
    node.children.push(liveNode);
  }
  return node;
}

/** コメント取得(経路別件数・userId 率・dedupe・DOM観測) */
function buildCommentIngestBranch(gift) {
  /** @type {MindNode} */
  const node = { label: 'コメント取得', badge: 'info', open: true, children: [] };
  if (!gift) {
    node.children.push({ label: '未取得', value: '視聴中の配信が無いと取れません', badge: 'info' });
    return node;
  }
  const obs = gift.commentObservability || {};
  const bySrc = obs.commentIngestBySource || {};
  const srcNode = { label: '経路別の取り込み件数', children: [] };
  for (const [k, v] of Object.entries(bySrc)) {
    const n = num(v) || 0;
    // visible(DOM観測)が0でも NDGR で取れていれば実害なしなので info 扱い
    srcNode.children.push({ label: k, value: `${n} 件`, badge: n > 0 ? 'ok' : 'info' });
  }
  node.children.push(srcNode);

  const uid = obs.savedCommentsUidStats || {};
  const uidPct = num(uid.withUidPercent);
  if (uidPct != null) {
    node.children.push({
      label: 'userId 付き保存率',
      value: `${uidPct}% (付き ${num(uid.withUid) ?? 0} / 無し ${num(uid.withoutUid) ?? 0})`,
      badge: uidPct >= 90 ? 'ok' : uidPct >= 50 ? 'warn' : 'bad'
    });
  }

  const dd = obs.ndgrMessageIdDedupe || {};
  if (num(dd.accepted) != null) {
    node.children.push({
      label: 'NDGR 重複除去',
      value: `採用 ${num(dd.accepted) ?? 0} / 重複drop ${num(dd.droppedDuplicate) ?? 0}`,
      badge: 'ok'
    });
  }

  // DOM観測コメント(visible)が0 かつ commentTablePresent=false の注意喚起(既知: NDGR で取れていれば実害なし)
  const visible = num(bySrc.visible);
  if (visible === 0) {
    node.children.push({
      label: 'DOM観測コメント',
      value: 'visible=0(番号セル無し等)。NDGR 経由で取れていれば実害なし',
      badge: 'info'
    });
  }
  return node;
}

/** 北極星レーン(公式値の5レーン) */
function buildNorthStarBranch(gift) {
  /** @type {MindNode} */
  const node = { label: '北極星レーン(公式値)', badge: 'info', open: true, children: [] };
  const lanes = gift?.['北極星レーン'];
  if (!lanes || typeof lanes !== 'object') {
    node.children.push({ label: '未取得', value: '視聴中の配信が無いと取れません', badge: 'info' });
    return node;
  }
  for (const [name, info] of Object.entries(lanes)) {
    if (!info || typeof info !== 'object') continue;
    const state = str(info.state || '');
    const count = num(info.count);
    const value = num(info.value);
    const ndgrValue = num(info.ndgrValue);
    let badge = 'info';
    if (state === 'ok' && (count > 0 || value > 0 || ndgrValue != null)) badge = 'ok';
    else if (state === 'ok') badge = 'warn'; // ok だが中身0=「空」
    else if (/no_event|no_program_gift/.test(state)) badge = 'info'; // 対象外(イベント無し等)
    const parts = [];
    if (state) parts.push(`state=${state}`);
    if (count != null) parts.push(`count=${count}`);
    if (value != null) parts.push(`value=${value}`);
    if (ndgrValue != null) parts.push(`ndgr=${ndgrValue}`);
    node.children.push({ label: str(name, 40), value: parts.join(' / '), badge });
  }
  return node;
}

/** 過去ログ取得(backfill) */
function buildBackfillBranch(fast) {
  /** @type {MindNode} */
  const node = { label: '過去ログ取得(backfill)', badge: 'info', open: false, children: [] };
  const bf = fast?.romiDebug?.backfill;
  if (!bf || typeof bf !== 'object') {
    node.children.push({ label: '未取得', value: '視聴中の配信が無いと取れません', badge: 'info' });
    return node;
  }
  const stop = str(bf.stopReason || '');
  const done = num(bf.done) === 1;
  let badge = 'info';
  if (stop === 'reached_start' || done) badge = 'ok';
  else if (/stalled|no_progress|rate_limited|aborted/.test(stop)) badge = 'warn';
  node.badge = badge;
  node.children.push({ label: '状態', value: done ? '完了' : (bf.running ? '取得中' : '停止'), badge });
  if (stop) node.children.push({ label: '停止理由', value: stop, badge });
  node.children.push({ label: '取得', value: `rows=${num(bf.rows) ?? 0} / seg=${num(bf.seg) ?? 0}` });
  return node;
}

/** 取得経路の健全性(NDGR接続・external fetch・longTasks) */
function buildPipelineHealthBranch(fast) {
  /** @type {MindNode} */
  const node = { label: '取得経路の健全性', badge: 'info', open: false, children: [] };
  if (!fast) {
    node.children.push({ label: '未取得', value: '視聴中の配信が無いと取れません', badge: 'info' });
    return node;
  }
  const net = fast.networkErrorProbe || {};
  const ndgrConn = str(net.ndgrConnectStatus || '');
  if (ndgrConn) {
    node.children.push({
      label: 'NDGR 接続',
      value: `${ndgrConn} (再接続 ${num(net.ndgrReconnectCount) ?? 0})`,
      badge: ndgrConn === 'connected' ? 'ok' : 'bad'
    });
  }
  const ext = (fast.giftDiagnostics && fast.giftDiagnostics.externalFetchProbe) || {};
  if (ext.kokenLastOk != null) {
    node.children.push({
      label: '公式値 fetch(koken/nicoad)',
      value: `koken ${ext.kokenLastOk ? 'OK' : 'NG'}(${num(ext.kokenLastStatus) ?? '-'}) / nicoad ${ext.nicoadLastOk ? 'OK' : 'NG'}`,
      badge: ext.kokenLastOk ? 'ok' : 'warn'
    });
  }
  const lt = fast.longTasks || {};
  const maxMs = num(lt.maxMs);
  if (maxMs != null) {
    node.children.push({
      label: '重い処理(longTask 最大)',
      value: `${maxMs} ms`,
      badge: maxMs < 100 ? 'ok' : maxMs < 250 ? 'warn' : 'bad'
    });
  }
  // 多タブ汚染の注意
  const md = fast.giftDiagnostics?.multiTabDiag;
  if (md && md.staleDomBundleSuspected) {
    node.children.push({
      label: '多タブ DOM 混入',
      value: `他配信 DOM ${num(md.eventDomLvCount) ?? '?'} 件混入の疑い(記録に影響なし)`,
      badge: 'warn'
    });
  }
  return node;
}

/** popup 固有診断(AI診断コピー由来・別キー) */
function buildPopupDiagBranch(popupDiag) {
  /** @type {MindNode} */
  const node = { label: 'popup 固有診断(AI診断コピー由来)', badge: 'info', open: false, children: [] };
  const popup = popupDiag?.popup;
  if (!popup || typeof popup !== 'object') {
    node.children.push({
      label: '未取得',
      value: 'ニコ生 watch を開き拡張ポップアップの「AI診断コピー」を一度押すと集約されます',
      badge: 'warn'
    });
    return node;
  }
  const persistedAt = str(popupDiag.persistedAt || '');
  if (persistedAt) {
    node.children.push({ label: '取得時刻', value: persistedAt, badge: 'info' });
  }
  // アバター読み込み
  const av = popup.avatarLoadDiag;
  if (av && typeof av === 'object') {
    node.children.push({
      label: 'アバター読み込み',
      value: JSON.stringify(av).slice(0, 160),
      badge: 'info'
    });
  }
  // 北極星描画経路
  const ns = popup.northStarRenderProbe;
  if (ns && typeof ns === 'object') {
    const started = num(ns.refreshAllStarted) || 0;
    const completed = num(ns.refreshAllCompleted) || 0;
    node.children.push({
      label: '応援レーン描画経路',
      value: `開始 ${started} / 完了 ${completed}${ns.lastError ? ' / err=' + str(ns.lastError, 60) : ''}`,
      badge: started > 0 && completed === 0 ? 'bad' : completed > 0 ? 'ok' : 'info'
    });
  }
  return node;
}
