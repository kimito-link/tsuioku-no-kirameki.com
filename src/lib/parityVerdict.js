// 3画面パリティ「①POP=②応援プレビュー=③WEBプレビュー が同一で完全か」の総合判定(純関数)。
//   council/parity-diagnose-SYNTHESIS.md の決定木を1か所に集約。観測のみ=描画/記録/数字は変えない。
//
//   設計の核(誤検知根絶):
//     - 取得不能(watch無し/popup未取得/別配信/古い/未ロード/未publish/apiRows無し)は必ず 'pending'(🟡保留)。
//       ×(mismatch)にしない。✅(ok)は「必須が全部取れて全部OK」のときだけ(厳しめ)。
//     - 必須が取れているのに false のときだけ 'mismatch'(🔴)。
//   ②応援プレビューの描画は status から直接読めないので previewAck(passive 専用 ack キー・別キー)で受ける。
//   ③WEBの実描画は別ドメインで読めない=観測の天井は「publish済+新鮮+送った鏡が整合」。

const DEFAULT_FRESH_MS = 180_000; // 3分。これより古い観測は鮮度不足として保留寄りに扱う。

/**
 * @param {{
 *   trust?: any,                  // buildDiagnosticsTrust の戻り(hasWatchTab/popup/verdict/popupTrustable)
 *   publishSelfDiag?: any,        // buildLiveviewPublishSelfDiag の戻り(consistency/publish/lastPost/mirrors)
 *   laneRenderDiag?: any,         // buildStoryUserLaneRenderDiag の戻り(verdict/started/...)=①応援レーン描画
 *   northStarProbe?: any,         // popupDiag.popup.northStarRenderProbe(refreshAllStarted)=①北極星描画
 *   previewAck?: any,             // ②応援プレビューの描画 ack(別キー: { ready, ts, liveId })
 *   currentLiveId?: string,
 *   nowMs?: number,
 *   freshMs?: number
 * }} input
 * @returns {{ verdict: 'ok'|'pending'|'mismatch', reason: string, nextAction: string, code: string }}
 */
export function buildParityVerdict(input) {
  const a = input && typeof input === 'object' ? input : {};
  const trust = a.trust && typeof a.trust === 'object' ? a.trust : null;
  const selfDiag = a.publishSelfDiag && typeof a.publishSelfDiag === 'object' ? a.publishSelfDiag : null;
  const laneDiag = a.laneRenderDiag && typeof a.laneRenderDiag === 'object' ? a.laneRenderDiag : null;
  const nsProbe = a.northStarProbe && typeof a.northStarProbe === 'object' ? a.northStarProbe : null;
  const ack = a.previewAck && typeof a.previewAck === 'object' ? a.previewAck : null;
  const nowMs = Number(a.nowMs) || 0;
  const freshMs = Number(a.freshMs) > 0 ? Number(a.freshMs) : DEFAULT_FRESH_MS;
  const curLid = String(a.currentLiveId || '').trim().toLowerCase();

  const pend = (/** @type {string} */ reason, /** @type {string} */ nextAction, /** @type {string} */ code) =>
    /** @type {{verdict:'pending',reason:string,nextAction:string,code:string}} */ ({ verdict: 'pending', reason, nextAction, code });
  const fail = (/** @type {string} */ reason, /** @type {string} */ nextAction, /** @type {string} */ code) =>
    /** @type {{verdict:'mismatch',reason:string,nextAction:string,code:string}} */ ({ verdict: 'mismatch', reason, nextAction, code });

  // --- 決定木(優先順・SYNTHESIS の順) ---
  // 1. watch 無し → 保留
  if (!trust || trust.hasWatchTab !== true) {
    return pend('視聴中の配信が無い(①②③は空/古くて当然)', 'ニコ生 watch を開いて popup を数秒開く', 'no_watch');
  }
  // 2. popup 診断が未取得/古い/別配信 → 保留(信頼の核が立たない)
  const popup = trust.popup && typeof trust.popup === 'object' ? trust.popup : null;
  if (!popup || popup.present !== true) {
    return pend('popup 固有診断が未取得', 'watch タブで popup を開く', 'popup_absent');
  }
  if (popup.lidMatch === false) {
    return pend('popup 診断が別配信のもの', 'watch を F5 して popup を開き直す', 'popup_other_live');
  }
  if (popup.fresh === false) {
    return pend('popup 診断が古い', 'popup を開き直して数秒待つ', 'popup_stale');
  }

  // 3. ①POP 描画(応援レーン+北極星)が起動しているか。
  //   ★v0.1.988: 診断の出自(viewKind)が passive(応援プレビュー)のときは、heavy 経路の probe
  //     (started/refreshAllStarted)が 0 でも正常=passive は鏡から描く別経路。①POP の起動判定は
  //     heavy popup(embed_watch/toolbar/popup)由来の診断のときだけ行う。passive 由来なら
  //     ①の起動は「鏡が現配信で新鮮(下の mirrors/consistency)」で代替評価する(誤診回避)。
  const viewKind = String(popup.viewKind || '').trim();
  const diagFromHeavyPopup = viewKind === '' || viewKind === 'embed_watch' || viewKind === 'toolbar' || viewKind === 'popup';
  if (diagFromHeavyPopup) {
    const laneStarted = laneDiag ? (Number(laneDiag.started) > 0 || laneDiag.verdict === 'ok') : null;
    const nsStarted = nsProbe ? Number(nsProbe.refreshAllStarted) > 0 : null;
    // 応援レーンが空ソース(供給0=出なくて正常)は false 扱いにしない。
    const laneEmptyNormal = laneDiag && laneDiag.verdict === 'empty_source';
    if (laneStarted === false && !laneEmptyNormal) {
      return fail('①POPの応援レーン描画が起動していない(a)', '拡張を🔄リロード→watch F5→popupを数秒開く', 'pop_lane_not_started');
    }
    if (nsStarted === false) {
      return fail('①POPの北極星描画が起動していない(a)', '拡張を🔄リロード→watch F5→popupを数秒開く', 'pop_northstar_not_started');
    }
  }

  // 4. データ整合(拡張 apiRows ≒ 鏡件数・現配信)。consistency に mismatch があれば 🔴。
  const consistency = selfDiag && Array.isArray(selfDiag.consistency) ? selfDiag.consistency : null;
  if (consistency) {
    const realMismatch = consistency.find((/** @type {any} */ c) => c && c.match === false && c.skipped !== true);
    if (realMismatch) {
      const lane = String(realMismatch.lane || 'レーン');
      return fail(
        `①は描けたが鏡に出ていない/食い違い(b): ${lane} 拡張${realMismatch.extRows}≠鏡${realMismatch.mirrorRows}`,
        'この状態速報を開発者に共有(鏡publishの取りこぼし)', 'data_mismatch'
      );
    }
  }

  // 5. ③WEB 送達(publish 済 + 新鮮)。未publish は保留(×にしない)。
  const publishReady = selfDiag?.publish?.ready === true;
  const lastPost = selfDiag?.lastPost && typeof selfDiag.lastPost === 'object' ? selfDiag.lastPost : null;
  if (!publishReady) {
    return pend('③WEB公開キーが未設定', '公開設定(ingestKey/viewToken)を用意', 'web_no_keys');
  }
  if (!lastPost || lastPost.everSent !== true) {
    return pend('③WEBへまだ送信していない', '「🌐このURLをWEBでも公開する」を押す', 'web_not_published');
  }
  if (lastPost.ok === false) {
    return fail('③WEBへの送信が失敗している', 'この状態速報を開発者に共有(送信エラー)', 'web_publish_failed');
  }
  if (lastPost.ageSec != null && lastPost.ageSec * 1000 > freshMs) {
    return pend('③WEBの送信が古い(再公開で新鮮化)', '「🌐このURLをWEBでも公開する」を再度押す', 'web_stale');
  }

  // 6. ②応援プレビュー描画 ack(別キー)。無ければ保留(まだ開いていない可能性)。
  if (!ack || ack.ready !== true) {
    return pend('②応援プレビューの描画が未確認', '応援プレビュー(診断内)を一度開く', 'preview_no_ack');
  }
  if (curLid && String(ack.liveId || '').trim().toLowerCase() !== curLid) {
    return pend('②応援プレビューの ack が別配信', '応援プレビューを開き直す', 'preview_other_live');
  }
  if (ack.ts && nowMs && nowMs - Number(ack.ts) > freshMs) {
    return pend('②応援プレビューの描画が古い', '応援プレビューを開き直す', 'preview_stale');
  }

  // すべて必須クリア。
  return { verdict: 'ok', reason: '①POP=②応援プレビュー=③WEB が同一で完全', nextAction: '', code: 'ok' };
}

/**
 * 状態速報の先頭に出す1行。
 * @param {ReturnType<typeof buildParityVerdict>} v
 * @returns {string}
 */
export function formatParityVerdictLine(v) {
  const d = v && typeof v === 'object' ? v : { verdict: 'pending', reason: '', nextAction: '' };
  if (d.verdict === 'ok') {
    return '## 3画面パリティ: ✅ 同一で完全(①POP=②応援プレビュー=③WEB)';
  }
  const mark = d.verdict === 'mismatch' ? '🔴 不一致' : '🟡 保留';
  const tail = d.nextAction ? ` → ${d.nextAction}` : '';
  return `## 3画面パリティ: ${mark} — ${d.reason}${tail}`;
}
