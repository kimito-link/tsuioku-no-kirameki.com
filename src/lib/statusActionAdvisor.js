// @ts-nocheck — 任意の診断 JSON を歩く動的判定(statusMindmapModel.js と同系)
/**
 * status.html「🩹 いま気になる点と対処」解決カードを組み立てる純関数(2026-06-18・COUNCIL status-allinone)。
 *
 * 狙い: 「あらゆる不具合が直せる」は幻想。代わりに【直せる範囲=次に何をすればいいか迷わない状態】を作る。
 *   既存の診断値(fastDiag/popupDiag/livesData)を【既知パターン辞書】と照合し、
 *   症状→原因(推定)→次の一手 を重大度順のカードで返す。直せない原因は「status の外(ブラックボックス)」と正直に出す。
 *
 * 設計(SYNTHESIS):
 *   - 新規データ取得ゼロ・外部送信ゼロ・依存ゼロ(statusMindmapModel と同じ入力を使う薄いルール層)。
 *   - 辞書は【実コードで裏取りした症状だけ】(推測の症状を増やさない)。新症状は実データ確認後に1行足す。
 *   - 出力はプレーンな配列。描画は status-entry が行う。
 *
 * @typedef {{
 *   id: string, severity: 'bad'|'warn'|'info', symptom: string, cause: string,
 *   action: string, fixableHere: 'yes'|'partly'|'no'
 * }} ActionCard
 */

const SEV_RANK = { bad: 0, warn: 1, info: 2 };

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 既知パターン辞書から、現在の診断に該当する解決カードを重大度順に返す。
 * @param {{ livesData?: any[], fastDiag?: any, popupDiag?: any }} data
 * @returns {ActionCard[]}
 */
export function buildStatusActions(data) {
  const livesData = Array.isArray(data?.livesData) ? data.livesData : [];
  const fast = data?.fastDiag?.content && typeof data.fastDiag.content === 'object'
    ? data.fastDiag.content : null;
  const gift = fast?.giftDiagnostics && typeof fast.giftDiagnostics === 'object'
    ? fast.giftDiagnostics : null;
  const obs = gift?.commentObservability || {};
  const popup = data?.popupDiag?.popup && typeof data.popupDiag.popup === 'object'
    ? data.popupDiag.popup : null;

  /** @type {ActionCard[]} */
  const cards = [];
  const add = (c) => cards.push(c);

  // --- 視聴中の配信なし(最優先で分かりやすい) ---
  if (!livesData.length) {
    add({
      id: 'no-live',
      severity: 'warn',
      symptom: '視聴中の配信が見つかりません',
      cause: 'ニコ生 watch ページが開かれていない',
      action: 'ニコ生の watch ページを開いてから、この画面に戻ってください',
      fixableHere: 'yes'
    });
  }

  // --- 取得率(配信ごと・放送中で低いもの) ---
  for (const lv of livesData) {
    const pct = num(lv?.officialRatePct);
    if (pct == null || lv?.endedAt) continue;
    if (pct < 40) {
      add({
        id: `capture-low-${lv.liveId || ''}`,
        severity: 'warn',
        symptom: `取得率が低い(${pct}% / 配信 ${lv.liveId || ''})`,
        cause: '過去ログの取り込み(backfill)が追いつき中、または失速している可能性',
        action: 'この配信タブを前面にして数分待つ → 改善しなければ watch タブを F5。記録自体(IndexedDB)は失われません',
        fixableHere: 'partly'
      });
    }
  }

  // --- userId 付き保存率(匿名主体=原理的に直せない) ---
  const uidPct = num(obs.savedCommentsUidStats?.withUidPercent);
  if (uidPct != null && uidPct < 50) {
    add({
      id: 'uid-low',
      severity: 'info',
      symptom: `コメントに userId が付く率が低い(${uidPct}%)`,
      cause: '匿名(184)主体の配信。匿名コメントは DOM にも識別子が無く、userId は NDGR にしか存在しない(仕様)',
      action: 'これは原理的な制約で異常ではありません。会場/応援レーンに匿名の人が出にくいのは仕様です',
      fixableHere: 'no'
    });
  }

  // --- 北極星レーン: state=ok だが空 ---
  const lanes = gift?.['北極星レーン'];
  if (lanes && typeof lanes === 'object') {
    const emptyOk = Object.entries(lanes).filter(([, info]) => {
      if (!info || typeof info !== 'object') return false;
      const v = num(info.value), c = num(info.count), nd = num(info.ndgrValue);
      return info.state === 'ok' && !(c > 0 || v > 0 || nd != null);
    }).map(([name]) => name);
    if (emptyOk.length) {
      add({
        id: 'lane-empty',
        severity: 'warn',
        symptom: `公式値レーンが空(${emptyOk.join(' / ')})`,
        cause: '取得は ok だが中身が 0。描画/取得の詰まり、またはその配信に該当データが無い',
        action: 'popup を開き直す / watch タブを F5。それでも空ならその配信にギフト等が無いだけの可能性',
        fixableHere: 'partly'
      });
    }
  }

  // --- 北極星レーン描画が途中で詰まる(popup診断) ---
  const ns = popup?.northStarRenderProbe;
  if (ns && typeof ns === 'object') {
    const started = num(ns.refreshAllStarted) || 0;
    const completed = num(ns.refreshAllCompleted) || 0;
    if (started > 0 && completed === 0) {
      add({
        id: 'northstar-stuck',
        severity: 'bad',
        symptom: '応援レーンの描画が途中で止まっている',
        cause: `描画ループが開始(${started})したのに完了(0)していない${ns.lastError ? ` / エラー: ${String(ns.lastError).slice(0, 60)}` : ''}`,
        action: '拡張を再読み込み(chrome://extensions でリロード) → watch タブを F5',
        fixableHere: 'partly'
      });
    }
  }

  // --- アバター取得が追いつかない ---
  const avatarMapSize = num(gift?.avatarNicknameMatchDiag?.avatarMapSize);
  const interceptTotal = num(gift?.avatarUidDiag?.interceptedUsersTotal);
  if (avatarMapSize != null && interceptTotal != null && interceptTotal >= 5 && avatarMapSize * 2 < interceptTotal) {
    add({
      id: 'avatar-lagging',
      severity: 'info',
      symptom: `アバター取得が追いついていない(${avatarMapSize}/${interceptTotal})`,
      cause: 'アバター画像の取得が観測ユーザー数に追いついていない(時間差)',
      action: 'しばらく待つと埋まることが多いです。急ぐなら watch タブを F5',
      fixableHere: 'partly'
    });
  }

  // --- NDGR 接続断(status の外=ブラックボックス) ---
  const ndgrConn = String(fast?.networkErrorProbe?.ndgrConnectStatus || '');
  if (ndgrConn && ndgrConn !== 'connected') {
    add({
      id: 'ndgr-disconnected',
      severity: 'bad',
      symptom: `コメント配信(NDGR)に接続できていない(${ndgrConn})`,
      cause: '通信断。回線・プロキシ・DNS など status からは特定できない要因の可能性(原因特定不可エリア)',
      action: 'watch タブを F5 → 直らなければ拡張リロード/ブラウザ再起動。これで直れば拡張の問題ではありません',
      fixableHere: 'no'
    });
  }

  // --- 多タブ DOM 混入 ---
  if (gift?.multiTabDiag?.staleDomBundleSuspected) {
    add({
      id: 'stale-dom',
      severity: 'info',
      symptom: '他の配信の DOM が混ざっている疑い',
      cause: '複数タブ/SPA 遷移の名残。記録には影響しないが公式値レーンが混乱することがある',
      action: '使っていないニコ生タブを閉じる / この watch を開き直す',
      fixableHere: 'partly'
    });
  }

  cards.sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9));
  return cards;
}
