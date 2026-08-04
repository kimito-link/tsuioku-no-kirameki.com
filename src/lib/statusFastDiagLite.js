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
  // v0.1.1002: commentNo 欠落割合の計器(記録>本家の内訳切り分け)も lite に通す。
  //   ★ここに足さないと status の provenance「内訳(計器)」が出ない(lite が full を間引くため)。
  const commentNoLess =
    typeof uidStats.commentNoLess === 'number' ? uidStats.commentNoLess : null;
  const commentNoLessPercent =
    typeof uidStats.commentNoLessPercent === 'number' ? uidStats.commentNoLessPercent : null;
  const totalSaved =
    typeof uidStats.totalSaved === 'number' ? uidStats.totalSaved : null;
  // v0.1.1186: dedup シード計器(記録が本家を上回る異常の切り分け)も lite に通す。
  //   ★ここに足さないと status の provenance「dedupシード(計器)」行が出ない([[fastdiag-lite-is-the-printer-subset]]と同型)。
  const dsd = obs.dedupeSeedDiag && typeof obs.dedupeSeedDiag === 'object' ? obs.dedupeSeedDiag : {};
  const dedupeSeedDiag = {
    seedSkipCount: typeof dsd.seedSkipCount === 'number' ? dsd.seedSkipCount : 0,
    seedRebuildCount: typeof dsd.seedRebuildCount === 'number' ? dsd.seedRebuildCount : 0,
    seedRequeueCount: typeof dsd.seedRequeueCount === 'number' ? dsd.seedRequeueCount : 0,
    maxIncrementalAddedCount:
      typeof dsd.maxIncrementalAddedCount === 'number' ? dsd.maxIncrementalAddedCount : 0,
    suspiciousAddedCount:
      typeof dsd.suspiciousAddedCount === 'number' ? dsd.suspiciousAddedCount : 0,
    // v0.1.1196: added のうち commentNo 欠落行の件数(二重計上の候補を切り分ける決定打)。
    //   dedup キーは commentNo 欠落時だけ capturedAt の秒が混ざるため、「ライブ経路と
    //   backfill 経路で capturedAt の導出が違う」仮説はこの行でしか成立しない。
    addedNoLessCount: typeof dsd.addedNoLessCount === 'number' ? dsd.addedNoLessCount : 0,
    addedTotalCount: typeof dsd.addedTotalCount === 'number' ? dsd.addedTotalCount : 0,
    // v0.1.1199: 空keySetのstate再利用を弾いた回数(=二重計上を未然に防いだ回数)。
    seedUnseededRejectCount:
      typeof dsd.seedUnseededRejectCount === 'number' ? dsd.seedUnseededRejectCount : 0
  };

  // lives は enumerateActiveLives 経路2でしか使わず、各要素は liveId/lv だけ見る=最小化して持つ。
  const lives = Array.isArray(p.lives)
    ? p.lives.map((/** @type {any} */ r) => ({
        liveId: String((r && (r.liveId || r.lv)) || '').trim()
      }))
    : [];

  // v0.1.1125: ちかちか調査の計器2つを lite に通す(印字の穴ふさぎ)。状態速報の
  //   「診断 JSON (fastDiag)」と対処候補(scrollWhiteoutToActionCards)はこの lite を読むため、
  //   ここに無い計器はユーザーのコピペに永久に出ない(v0.1.1124 hostMoveDiag が実機で読めなかった真因)。
  //   どちらも samples がリング cap 済み(hostMove=8件/whiteout同型)で小さい=lite の軽さは保つ。
  const hostMoveDiag =
    content.hostMoveDiag && typeof content.hostMoveDiag === 'object' ? content.hostMoveDiag : null;
  const scrollWhiteoutDiag =
    content.scrollWhiteoutDiag && typeof content.scrollWhiteoutDiag === 'object'
      ? content.scrollWhiteoutDiag
      : null;
  // v0.1.1250: パネルが一瞬消える計器も lite へ(通さないとコピペに永久に出ない=上のコメントの再演)。
  const hostFlipCensus =
    content.hostFlipCensus && typeof content.hostFlipCensus === 'object' ? content.hostFlipCensus : null;
  // v0.1.1253: 可視性の見張り(原因を問わない消失検知)も lite へ。
  const hostVisWatch =
    content.hostVisWatch && typeof content.hostVisWatch === 'object' ? content.hostVisWatch : null;
  // v0.1.1254: 復帰ゲートの計器も lite へ(通さないとコピペに永久に出ない)。
  const hostRecoveryDiag =
    content.hostRecoveryDiag && typeof content.hostRecoveryDiag === 'object'
      ? content.hostRecoveryDiag
      : null;
  const venueSeatsDiag = content.venueSeatsDiag && typeof content.venueSeatsDiag === 'object'
    ? content.venueSeatsDiag
    : null;
  const sdm = venueSeatsDiag && venueSeatsDiag.storyDiagMirror && typeof venueSeatsDiag.storyDiagMirror === 'object'
    ? venueSeatsDiag.storyDiagMirror
    : null;
  const sdmAge = Number(sdm?.ageSec);
  const venueSeatsDiagLite = sdm
    ? {
        storyDiagMirror: {
          present: sdm.present === true,
          ageSec: sdm.present === true && Number.isFinite(sdmAge) ? Math.max(0, Math.floor(sdmAge)) : null
        }
      }
    : null;

  // ★読み取りパスを full と同形に保つ(status の consumer を書き換えないため):
  //   lite.content.giftDiagnostics['北極星レーン']
  //   lite.content.giftDiagnostics.commentObservability.savedCommentsUidStats.withUidPercent
  //   lite.content.giftDiagnostics.commentObservability.dedupeSeedDiag(v0.1.1186)
  //   lite.content.networkErrorProbe.ndgrConnectStatus
  //   lite.content.hostMoveDiag / lite.content.scrollWhiteoutDiag
  return {
    lives,
    content: {
      giftDiagnostics: {
        '北極星レーン': gift['北極星レーン'] ?? null,
        commentObservability: {
          savedCommentsUidStats: { withUidPercent, commentNoLess, commentNoLessPercent, totalSaved },
          dedupeSeedDiag
        }
      },
      networkErrorProbe: {
        ndgrConnectStatus: String(net.ndgrConnectStatus || '')
      },
      hostMoveDiag,
      scrollWhiteoutDiag,
      hostFlipCensus,
      hostVisWatch,
      hostRecoveryDiag,
      venueSeatsDiag: venueSeatsDiagLite
    }
  };
}
