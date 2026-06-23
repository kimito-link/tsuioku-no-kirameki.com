/**
 * status.html 用「軽量 fastDiag ダイジェスト」。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 2026-06-23(council/status-heavy-open-SYNTHESIS.md): 診断ページ status.html が重い真因=
 *   content が書く巨大な fastDiag(実測 ~40KB: giftSubAppRelayDiag / ndgrUnknownSamples /
 *   interceptFetchLog / eventDomBundleSummary 等の生ログを内包)を、status が【2秒ごと】に
 *   read + JSON.parse + render していた。chrome.storage.local は単一 LevelDB=直列 read で、この
 *   40KB の read+parse が 2秒ループを占有=「開くのも開いてからも重い」。
 *
 *   ★だが status が fastDiag から実際に使うのは【4フィールドだけ】(実コードで確認):
 *     - fastDiag.lives(enumerateActiveLives 経路2の lv フォールバック)
 *     - fastDiag.content.giftDiagnostics['北極星レーン'](公式値レーンの状況行)
 *     - fastDiag.content.giftDiagnostics.commentObservability.savedCommentsUidStats.withUidPercent
 *     - fastDiag.content.networkErrorProbe.ndgrConnectStatus
 *   残り ~38KB は status は一切読まない。
 *
 *   → content が full fastDiag を書く時、同時にこの4フィールドだけの軽量ダイジェストを別キーに書く。
 *     status の2秒ループは full の代わりに lite を read(回数は同じ=read を増やさない=過去の地雷
 *     「read を足すと重くなる」を踏まない。サイズだけ ~40分の1)。full fastDiag は AI共有ボタン押下時だけ読む。
 *
 *   ★lite の形は full の【読み取りパスと同形】にする(lives / content.giftDiagnostics['北極星レーン'] /
 *     content.giftDiagnostics.commentObservability.savedCommentsUidStats.withUidPercent /
 *     content.networkErrorProbe.ndgrConnectStatus)。こうすると status の consumer コードは
 *     read するキーを変えるだけで済み、各セクションの参照式を書き換えなくてよい(最小ブラスト半径)。
 * ───────────────────────────────────────────────────────────────────────────
 *
 * @module statusFastDiagLite
 */

/** status 用 軽量 fastDiag ダイジェストの storage key(full の KEY_AI_SHARE_FAST_DIAG とは別物)。 */
export const KEY_STATUS_FAST_DIAG_LITE = 'nls_status_fast_diag_lite_v1';

/**
 * full fastDiag payload から、status が使う最小フィールドだけを抜いた軽量ダイジェストを作る純関数。
 *   読み取りパスは full と同形(lives / content.giftDiagnostics['北極星レーン'] /
 *   content.giftDiagnostics.commentObservability.savedCommentsUidStats.withUidPercent /
 *   content.networkErrorProbe.ndgrConnectStatus)。verbose な生ログは一切含めない。
 *
 * @param {any} payload full fastDiag payload(persistAiShareFastDiagnostics が作る形)
 * @returns {{ lives: Array<{ liveId: string }>, content: any }}
 *   content は status の参照式と同形(giftDiagnostics['北極星レーン'] /
 *   giftDiagnostics.commentObservability.savedCommentsUidStats.withUidPercent /
 *   networkErrorProbe.ndgrConnectStatus)。詳細は下記コード参照。
 */
export function buildStatusFastDiagLite(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const content = p.content && typeof p.content === 'object' ? p.content : {};
  const gift = content.giftDiagnostics && typeof content.giftDiagnostics === 'object'
    ? content.giftDiagnostics
    : {};
  const obs = gift.commentObservability && typeof gift.commentObservability === 'object'
    ? gift.commentObservability
    : {};
  const uidStats = obs.savedCommentsUidStats && typeof obs.savedCommentsUidStats === 'object'
    ? obs.savedCommentsUidStats
    : {};
  const net = content.networkErrorProbe && typeof content.networkErrorProbe === 'object'
    ? content.networkErrorProbe
    : {};

  const withUidPercent =
    typeof uidStats.withUidPercent === 'number' ? uidStats.withUidPercent : null;

  // lives は enumerateActiveLives 経路2でしか使わず、各要素は liveId/lv だけ見る=最小化して持つ。
  const lives = Array.isArray(p.lives)
    ? p.lives.map((/** @type {any} */ r) => ({
        liveId: String((r && (r.liveId || r.lv)) || '').trim()
      }))
    : [];

  // ★読み取りパスを full と同形に保つ(status の consumer を書き換えないため):
  //   lite.content.giftDiagnostics['北極星レーン']
  //   lite.content.giftDiagnostics.commentObservability.savedCommentsUidStats.withUidPercent
  //   lite.content.networkErrorProbe.ndgrConnectStatus
  return {
    lives,
    content: {
      giftDiagnostics: {
        '北極星レーン': gift['北極星レーン'] ?? null,
        commentObservability: {
          savedCommentsUidStats: { withUidPercent }
        }
      },
      networkErrorProbe: {
        ndgrConnectStatus: String(net.ndgrConnectStatus || '')
      }
    }
  };
}
