// @ts-nocheck — status 速報本文ビルダー: status-entry.js(@ts-nocheck)から挙動同値で切り出し。本文バイト一致のため in-body キャストを避け、元ファイルと同じ @ts-nocheck を踏襲。
// 状態速報(AI共有)本文ビルダー。②応援ライブビュー/③WEB が同一の status-report builder を
//   再利用できるよう、status-entry.js から挙動同値で切り出した純関数。本文はバイト一致。
import {
  buildLiveviewPublishSelfDiag,
  formatLiveviewPublishSelfDiagLines,
  liveviewPublishSelfDiagToActionCards
} from './liveviewPublishSelfDiag.js';
import { formatLaneRosterDeltaLine } from './laneRosterDelta.js';
import { summarizeLiveviewPublishOutcome } from './liveviewPublishOutcome.js';
import { summarizeLiveviewPublishOutcomeRecord } from './liveviewPublishOutcomeKey.js';
import { buildDiagnosticsTrust, formatDiagnosticsTrustLines } from './diagnosticsTrust.js';
import { buildParityVerdict, formatParityVerdictLine } from './parityVerdict.js';
// v0.1.1020: 「応援プレビューを開いている間は診断更新が重い」を名指しする純関数(refreshPerf×previewAck 突合)。
import { buildPreviewHeavyHint } from './previewHeavyHint.js';
import { buildPopupDiagUptimeNote } from './popupDiagUptimeNote.js';
import {
  buildStoryUserLaneRenderDiag,
  formatStoryUserLaneRenderDiagLines,
  storyUserLaneRenderDiagToActionCards
} from './storyUserLaneRenderProbe.js';
import {
  formatCommentCountProvenanceLines,
  commentCountProvenanceToActionCards
} from './commentCountProvenance.js';
// 応援コメント(最新N件・本文)を状態速報にも載せる(jsonBlob 同梱の鏡を貼るだけ=新規 read なし)。
import { formatCommentTimelineReportLines } from './commentTimelineReport.js';
// スクロール白化(重い・一瞬白くなる)を状態速報の読める所に出す(fastDiag に既にある値を貼るだけ)。
import {
  formatScrollWhiteoutReportLines,
  scrollWhiteoutToActionCards
} from './scrollWhiteoutReport.js';
import { buildHealthCells, summarizeHealthVerdict } from './healthCells.js';
// 網羅的完全性診断(PageSpeed 型・council/completeness-diagnosis-SYNTHESIS.md): healthCells を
//   diagnosisRegistry の category/weight/mandatory で集計し「カテゴリ別スコア+完璧判定」を出す。
import { buildCompletenessScore, formatCompletenessScoreLines } from './completenessScore.js';
import { buildVoiceDiagLine } from './voiceDiag.js';
import { buildGiftEffectDiagLines, giftEffectDiagToActionCards } from './giftEffectDiag.js';
import { buildMilestoneEffectDiagLines, milestoneEffectDiagToActionCards } from './milestoneEffectDiag.js';
// v0.1.1072: マイ効果音(customSoundStore.js)の取込状況(extras 12秒間引き)をAI共有本文にも併記。
import { buildCustomSoundDiagLine } from './customSoundDiag.js';
// Phase B(v0.1.1073): パチンコボイス演出の発火/スキップ内訳(extras 12秒間引き)をAI共有本文にも併記。
import { buildVoiceEffectDiagLines } from './voiceEffectDiag.js';
import { buildBgmPhaseDiagLines } from './bgmPhaseDiag.js';
import { buildOpSoundEffectDiagLines } from './opSoundEffectDiag.js';
// 感度パッチ(2026-07-06): コメント送信(所要ms/結果/フレーム試行回数)計器(extras 12秒間引き)をAI共有本文にも併記。
import { buildCommentPostDiagLines } from './commentPostDiag.js';
import { buildInstantPushDiagLines } from './instantPushDiag.js';
import { buildChannelSwitchDiagLines } from './channelSwitchDiag.js';
// SC2(council/broadcast-scoring-SYNTHESIS.md §2.2): ハイライト台帳(実際に発火した演出だけ記録)
//   (extras 12秒間引き)をAI共有本文にも併記。
import { buildHighlightLedgerDiagLines } from './highlightLedger.js';
import { reportPreviewCtxFromFastDiag } from './reportPreviewCtx.js';
import { buildReportPreviewLines } from './reportPreview.js';
import { buildStatusActions } from './statusActionAdvisor.js';
// v0.1.1026: アイコン画像(usericon)のロード失敗を状態速報で名指し(画像が壊れて見える理由=CDN側404を説明)。
import { avatarLoadDiagToActionCards } from './avatarLoadReport.js';
import { buildLaneStatusLine, buildLiveBlockText } from './statusFormat.js';
// 2026-07-14 診断カウンタchurn根治(diagnostic-architecture-strengthen-DESIGN.md C-3): 内訳・用語の
//   「表示ゆらぎ補正」回数を状態速報にも出す(popup 側の折りたたみでしか見えない値を1行貼るだけ)。
import { formatStoryAvatarDiagLine } from './storyAvatarDiagLine.js';

/**
 * v0.1.1005: 状態速報の更新所要(計器)を1行に整形する純関数。
 *   「診断ページが重い」を共有時にスクショ無しで切り分けるため、画面ヘッダーの
 *   「更新 Nms(重いステップ top2)」と同じ値を本文にも出す。材料が無ければ ''。
 * @param {{ totalMs?: number|null, stepMs?: Array<[string, number]> }|null|undefined} refreshPerf
 * @returns {string}
 */
export function formatRefreshPerfLine(refreshPerf) {
  const p = refreshPerf && typeof refreshPerf === 'object' ? refreshPerf : null;
  const total = p && Number.isFinite(Number(p.totalMs)) ? Number(p.totalMs) : null;
  if (total == null) return '';
  const steps = Array.isArray(p.stepMs) ? p.stepMs.slice() : [];
  steps.sort((a, b) => (Number(b?.[1]) || 0) - (Number(a?.[1]) || 0));
  const top = steps
    .slice(0, 3)
    .filter((s) => (Number(s?.[1]) || 0) > 0)
    .map((s) => `${s[0]} ${s[1]}ms`)
    .join(' / ');
  return `更新所要(計器): ${total}ms${top ? `(重い順: ${top})` : ''} — 小さいほど更新は軽い(体感が重いなら初期ロード/スクロール側)`;
}

/**
 * ★v0.1.1314: `chrome.tabs.query` が遅かったことを1行で名指しする純関数。
 *
 * ■ なぜ要るか(2026-08-06 から未解明で残っている数字)
 *   診断ページ 9,812ms の内訳で `lives` が 5,493ms を占めていたが、`lives` は
 *   【tabs.query + fastDiag フォールバック】の合計なのでどちらが遅いか名指しできなかった。
 *   ★tabs.query は storage を触らない(browser プロセスが応える)ので、
 *     ここが遅い＝真因は【拡張の外・browser プロセスの混雑】と切り分けられる。
 *     逆にここが速いのに lives が遅いなら、遅いのは storage 側と確定する。
 *   ＝計器は症状(遅い)でなく【原因のありか】を出す([[instrument-must-name-the-cause-2026-08-01]])。
 *
 * @param {{ count?: number, worstMs?: number, lastMs?: number, lastTabCount?: number }|null|undefined} diag
 * @returns {string} 遅延を観測していなければ ''(常時出さない)
 */
export function formatTabsQuerySlowLine(diag) {
  const d = diag && typeof diag === 'object' ? diag : null;
  const count = d ? Number(d.count) || 0 : 0;
  if (count <= 0) return '';
  const worst = Number(d.worstMs) || 0;
  const last = Number(d.lastMs) || 0;
  const tabCount = Number.isFinite(Number(d.lastTabCount)) ? Number(d.lastTabCount) : -1;
  const tabPart = tabCount >= 0 ? ` / 直近のwatchタブ数 ${tabCount}` : '';
  return (
    `★タブ一覧の取得が遅い: ${count}回(最悪 ${worst}ms / 直近 ${last}ms${tabPart})` +
    ' — これは storage でなくブラウザ側の応答待ちです(拡張の中を直しても速くなりません)'
  );
}

/**
 * 2026-07-14: renderAll 内のセクション別所要(計器)を1行に整形する純関数。
 *   診断ページ軽量化(lazy details 化)の対象を推測でなく実測で決めるための材料。材料が無ければ ''。
 * @param {Array<[string, number]>|null|undefined} renderSectionMs
 * @returns {string}
 */
export function formatRenderSectionMsLine(renderSectionMs) {
  const sections = Array.isArray(renderSectionMs) ? renderSectionMs.slice() : [];
  sections.sort((a, b) => (Number(b?.[1]) || 0) - (Number(a?.[1]) || 0));
  const top = sections
    .filter((s) => (Number(s?.[1]) || 0) > 0)
    .slice(0, 5)
    .map((s) => `${s[0]} ${s[1]}ms`)
    .join(' / ');
  if (!top) return '';
  return `renderAll内訳(重い順・上位5): ${top}`;
}

/**
 * 状態速報(AI共有)の本文を組み立てる。status-entry.js から挙動同値で切り出し。
 * @param {any} args
 * @returns {string}
 */
export function buildAiShareFullText({ overviewText, livesData, fastDiag, popupDiag, voiceDiag, venueSeatsDiag, laneDiag, laneMirror, reportPreview, trendFindings, jsonBlob, currentLiveId, publishKeys, publishOutcomeRec, previewRenderAck, refreshPerf, renderSectionMs, giftEffectDiag, milestoneEffectDiag, customSoundDiag, voiceEffectDiag, bgmPhaseDiag, opSoundEffectDiag, commentPostDiag, instantPushDiag, channelSwitchDiag, highlightLedger, sidepanelSelfDiag, extrasAgeMs }) {
  const lines = [];
  lines.push('## 君斗りんくの追憶のきらめき 状態速報');
  lines.push(`生成: ${new Date().toISOString()}`);
  // v0.1.1005: 「診断ページが重い」を共有時にスクショ無しで切り分けられるよう、更新所要(計器)を本文にも出す。
  //   画面ヘッダーの「更新 Nms(重いステップ top2)」と同じ値。これが小さい(数ms)なら更新処理は軽い=
  //   体感の重さは初期ロード/スクロール側、という切り分けが状態速報1枚で分かる。
  const perfLine = formatRefreshPerfLine(refreshPerf);
  if (perfLine) lines.push(perfLine);
  // 2026-07-14: 「更新所要(計器)」のrenderステップだけをさらに分解した内訳(診断ページ軽量化の実測材料)。
  const sectionMsLine = formatRenderSectionMsLine(renderSectionMs);
  if (sectionMsLine) lines.push(sectionMsLine);
  // ★v0.1.1314: 「lives が遅い」の内訳を名指しする(storage 側か browser 側かの切り分け)。
  //   遅延を観測していないときは1行も出さない=普段の速報を汚さない。
  const tabsQueryLine = formatTabsQuerySlowLine(refreshPerf?.tabsQuerySlow);
  if (tabsQueryLine) lines.push(tabsQueryLine);
  // v0.1.1020: 更新所要が重い×②応援プレビューが開いている(ack 新鮮)を突合し「②が重さの原因」を名指しする。
  //   ユーザー実機「応援プレビュー出すとめちゃ重い」への対応=体感でなく状態速報1枚で原因が分かる。
  try {
    const heavyHint = buildPreviewHeavyHint(refreshPerf, previewRenderAck, Date.now());
    if (heavyHint.line) lines.push(heavyHint.line);
  } catch { /* no-op: ヒントの失敗は状態速報を壊さない */ }
  lines.push('');
  // 送信結果(根2対策): storage 記録(ページ横断=live-view からの送信も拾う)を優先し、無ければ globalThis 集計。
  //   どちらの公開ボタンで送っても「送信済み」を status が読める。
  const nowMsForPublish = Date.now();
  const outcomeFromStorage = publishOutcomeRec
    ? summarizeLiveviewPublishOutcomeRecord(publishOutcomeRec, nowMsForPublish)
    : null;
  const outcomeFromGlobal = summarizeLiveviewPublishOutcome(nowMsForPublish);
  const publishOutcome =
    outcomeFromStorage && outcomeFromStorage.everSent ? outcomeFromStorage : outcomeFromGlobal;
  // 純Web公開コピーの自己診断を1回組む(read なし=渡された jsonBlob/引数だけ)。対処候補カード結合と
  //   専用セクション描画の両方で使い回す。失敗しても状態速報を壊さない。
  let publishSelfDiag = null;
  try {
    publishSelfDiag = buildLiveviewPublishSelfDiag({
      jsonBlob: jsonBlob || null,
      fastDiag,
      currentLiveId: String(currentLiveId || ''),
      publishKeys: publishKeys || {},
      lastPost: publishOutcome,
      nowMs: Date.now()
    });
  } catch {
    publishSelfDiag = null;
  }
  // 応援レーン描画の自己診断(popup の storyUserLaneRenderProbe から)。「鏡にはあるのに画面に出ない/
  //   ローディングが終わらない」を切り分ける。popupDiag.popup 経由(northStarRenderProbe と同じ場所)。
  let laneRenderDiag = null;
  // 「描画済みなのにローディングが終わらない」検知用: 視聴中の配信の perfDiag.shadeActive(ローディング幕)。
  let laneLoadingActive = false;
  try {
    const probeSnap = (popupDiag?.popup ?? popupDiag)?.storyUserLaneRenderProbe || null;
    // v0.1.1006: 匿名主体(userId付き率が極低)の配信は heavy 経路 0 タイルが正常=🔴誤報を消すため、
    //   withUidPercent を診断に渡す(fastDiag に既にある値・新規 read ゼロ)。
    const withUidPercent =
      fastDiag?.content?.giftDiagnostics?.commentObservability?.savedCommentsUidStats?.withUidPercent;
    laneRenderDiag = buildStoryUserLaneRenderDiag(probeSnap, { withUidPercent });
    const watching = Array.isArray(livesData)
      ? livesData.find((l) => l && l.recording && l.perfDiag) || livesData.find((l) => l && l.perfDiag)
      : null;
    laneLoadingActive = Boolean(watching && watching.perfDiag && watching.perfDiag.shadeActive === true);
  } catch {
    laneRenderDiag = null;
  }
  // 「この診断の信頼性」メタ診断(根本治療): 状態速報の冒頭に「どこが信頼でき・どこが空/古いか」を出す。
  //   個々の診断を取りこぼしても【取りこぼしている事実】が必ず最初に出る=同じループが構造的に止まる。
  try {
    const hasWatchTab = Array.isArray(livesData) && livesData.some((l) => l && l.recording);
    const trust = buildDiagnosticsTrust({
      hasWatchTab,
      currentLiveId: String(currentLiveId || ''),
      popupDiag: popupDiag || null,
      jsonBlob: jsonBlob || null,
      publishOutcome,
      // ★v0.1.1302: 鏡を含む補助データの齢(12秒キャッシュ)。表示専用。
      extrasAgeMs: extrasAgeMs == null ? null : extrasAgeMs,
      nowMs: Date.now()
    });
    // v0.1.985(council/parity-diagnose-SYNTHESIS.md): 状態速報の最先頭に「3画面パリティ」総合判定1行。
    //   ①POP=②応援プレビュー=③WEB が同一で完全か(✅/🟡保留/🔴不一致)+次の一手。既存指標の roll-up=観測のみ。
    //   誤検知根絶: 取得不能(watch無/未ロード/未publish 等)は必ず保留(×にしない)。
    try {
      const nsProbe = (popupDiag?.popup ?? popupDiag)?.northStarRenderProbe || null;
      const previewAck = previewRenderAck || null;
      const parity = buildParityVerdict({
        trust,
        publishSelfDiag,
        laneRenderDiag,
        northStarProbe: nsProbe,
        previewAck,
        // ★v0.1.1050: ④会場と①応援レーンの人数突合を追加(新規readなし=既にこの関数の引数に来ている値の roll-up)。
        venueSeatsDiag: venueSeatsDiag || null,
        laneDiagCounts: laneDiag || null,
        // ★v0.1.1056: ①②の世代パリティ突合(新規readなし=既にこの関数の引数に来ている laneMirror の roll-up)。
        laneMirror: laneMirror || null,
        currentLiveId: String(currentLiveId || ''),
        nowMs: Date.now()
      });
      lines.push(formatParityVerdictLine(parity));
      lines.push('');
      // v0.1.1015: ②応援プレビューの画面最上部に「パリティ・バッジ」を色付きで出すための構造化結果を
      //   jsonBlob に1個だけ相乗りさせる(新規 storage キーを増やさない=②③は statusReport と同じ経路で読む)。
      //   本文テキスト(戻り値)は一切変えない=①とバイト一致(drift ゼロ)。②はこれを読んでバッジ描画するだけ。
      if (jsonBlob && typeof jsonBlob === 'object') {
        jsonBlob.parityVerdict = {
          verdict: parity.verdict,
          reason: parity.reason,
          nextAction: parity.nextAction,
          code: parity.code
        };
      }
    } catch {
      /* no-op: パリティ判定の失敗は状態速報を壊さない */
    }
    const trustLines = formatDiagnosticsTrustLines(trust);
    if (trustLines.length) { for (const l of trustLines) lines.push(l); lines.push(''); }
    // 網羅的完全性診断(PageSpeed 型): 全観点をレジストリで網羅し、カテゴリ別スコア+✅完璧判定+
    //   完璧まであと何項目+対象外N項目を出す。観点追加=diagnosisRegistry に1行=抜けが構造的に出ない。
    try {
      const cells = buildHealthCells({ livesData, fastDiag, voiceDiag, venueSeatsDiag, laneDiag, giftEffectDiag, milestoneEffectDiag, previewRenderAck, laneMirror, nowMs: Date.now() });
      const score = buildCompletenessScore(cells);
      const scoreLines = formatCompletenessScoreLines(score);
      if (scoreLines.length) { for (const l of scoreLines) lines.push(l); lines.push(''); }
    } catch {
      /* no-op: 完全性スコアの失敗は状態速報を壊さない */
    }
  } catch {
    /* no-op: 信頼性ブロックの失敗は状態速報を壊さない */
  }
  /*
   * ★v0.1.1317: 会場の鏡うけとりは【概要ブロックの外】で出す。
   *
   * ■ なぜ外に出すか(通し検査が教えてくれた)
   *   会場系の診断行は全部 `if (overviewText)` の中にあり、overviewText は
   *   「視聴中の配信が無い」と空になる(status-entry.js:1477-1479)。
   *   ＝**会場が同期していないときほど、その診断が消える**という逆立ちした構造だった。
   *   この行は「会場が鏡を受け取れているか」を測るものなので、
   *   配信の有無に関係なく出せなければ意味がない。
   *   ★観測ゼロなら空文字=行ごと出ないので、普段の速報は汚さない。
   */
  try {
    const miLine = String(/** @type {any} */ (venueSeatsDiag)?.mirrorIntakeLine || '');
    if (miLine) lines.push(miLine);
  } catch {
    /* no-op */
  }
  if (overviewText) {
    lines.push('### 概要');
    lines.push(overviewText);
    // v0.1.846: 総合判定を概要に1行併記。満点=「異常ゼロ」(進行中/対象外は正常扱い)。
    //   ユーザー要望「全部100%になるまで=修復いらないぐらい完全に」への回答=異常が無ければ満点。
    try {
      const verdict = summarizeHealthVerdict(buildHealthCells({ livesData, fastDiag, popupDiag, voiceDiag, venueSeatsDiag, laneDiag, giftEffectDiag, milestoneEffectDiag, previewRenderAck, laneMirror }));
      const vmark = verdict.level === 'ok' ? '🟢' : verdict.level === 'warn' ? '🟡' : '🔴';
      lines.push(`総合判定: ${vmark} ${verdict.text}`);
    } catch {
      /* no-op: 判定失敗は概要を壊さない */
    }
    // v0.1.766: 概要に公式値レーン(北極星レーン)の状況も併記(視聴中の配信のみ)。
    const laneStr = buildLaneStatusLine(fastDiag?.content?.giftDiagnostics?.['北極星レーン']);
    if (laneStr) lines.push(laneStr);
    // 2026-07-14: 内訳・用語(popup折りたたみ)の技術行をそのまま状態速報にも貼る(表示ゆらぎ補正回数を含む)。
    try {
      const storyDiagSnap = (popupDiag?.popup ?? popupDiag)?.storyDiag || null;
      const storyDiagStr = storyDiagSnap ? formatStoryAvatarDiagLine(storyDiagSnap) : null;
      if (storyDiagStr) lines.push(storyDiagStr);
    } catch {
      /* no-op */
    }
    // v0.1.852: 会場モードの読み上げ診断(使用時のみ)。「たまに遅れる」の切り分け材料を AI 共有に載せる。
    try {
      const vStr = buildVoiceDiagLine(voiceDiag, Date.now());
      if (vStr) lines.push(vStr);
    } catch {
      /* no-op */
    }
    // v0.1.1111: 会場=①レーンのメンバー一致トークン(会場使用時のみ)。会場が paint 毎に突合した
    //   1行(venueLaneParity.js)をそのまま出す=「一致か・何が説明済みか・何が未説明か」が1行で分かる。
    try {
      const vpLine = String(/** @type {any} */ (venueSeatsDiag)?.laneParity?.line || '');
      if (vpLine) lines.push(vpLine);
    } catch {
      /* no-op */
    }
    // v0.1.1137(lanescene-structural-review MVP): ①=会場の鏡世代突合(laneParityとは独立の軽量な
    //   代理指標・revision/contentHashのみ見る)。両者は別の判定なので別行で出す。
    try {
      const srLine = String(/** @type {any} */ (venueSeatsDiag)?.sceneReceipt?.line || '');
      if (srLine) lines.push(srLine);
    } catch {
      /* no-op */
    }
    // 2026-07-14 診断先行(venue-tile-link-parity-diagnose-DESIGN.md): タイル実体(鏡uid)⇄席クラス
    //   (roster uid)の二重ソース不一致が実害を出しているかを数えるだけの1行(修正はしない・観測のみ)。
    try {
      const slpLine = String(/** @type {any} */ (venueSeatsDiag)?.seatLinkParity?.line || '');
      if (slpLine) lines.push(slpLine);
    } catch {
      /* no-op */
    }
    // 2026-07-15 診断先行(venue-yukkuri-named-diagnose): 「名前ありゆっくり顔」の実害を数えるだけの1行。
    try {
      const ynLine = String(/** @type {any} */ (venueSeatsDiag)?.yukkuriNamedCensus?.line || '');
      if (ynLine) lines.push(ynLine);
    } catch {
      /* no-op */
    }
    // 2026-07-21 診断先行: 応援TOP吹き出しchurnの実害を数えるだけの1行。
    try {
      const bcLine = String(/** @type {any} */ (venueSeatsDiag)?.bubbleChurn?.line || '');
      if (bcLine) lines.push(bcLine);
    } catch {
      /* no-op */
    }
    // v0.1.1054: ギフト/広告の「検知→演出→効果音」整合診断(使用時のみ)。「ちゃんと飛ぶか・音が出るか」を共有に載せる。
    try {
      const gLines = buildGiftEffectDiagLines(giftEffectDiag, Date.now());
      for (const l of gLines) lines.push(l);
    } catch {
      /* no-op */
    }
    // v0.1.1058: コメント数マイルストーンの「検知→演出→効果音」整合診断(使用時のみ)。
    try {
      const mLines = buildMilestoneEffectDiagLines(milestoneEffectDiag, Date.now());
      for (const l of mLines) lines.push(l);
    } catch {
      /* no-op */
    }
    // v0.1.858: レポート(DL前)の主要KPI(本文N/コメントした人/来場と応援参加…)。保存せず中身を共有できる。
    // v0.1.861: 信頼度注釈の文脈を fastDiag から作って渡す(匿名主体=推定寄り 等)。
    try {
      const rStr = buildReportPreviewLines(reportPreview, reportPreviewCtxFromFastDiag(fastDiag));
      if (rStr) lines.push(rStr);
    } catch {
      /* no-op */
    }
    // v0.1.1072: マイ効果音(取込件数/割当キー数/rev)。IDBが開けない環境では静かに「-」表示。
    try {
      const cStr = buildCustomSoundDiagLine(customSoundDiag);
      if (cStr) lines.push(cStr);
    } catch {
      /* no-op */
    }
    // Phase B(v0.1.1073): パチンコボイスの発火/スキップ内訳(未観測なら空=ノイズにしない)。
    try {
      const vLines = buildVoiceEffectDiagLines(voiceEffectDiag, Date.now());
      for (const l of vLines) lines.push(l);
    } catch {
      /* no-op */
    }
    // Phase C(v0.1.1074): BGM in/out・現在フェーズ・R値・B値(未観測なら空=ノイズにしない)。
    try {
      const bLines = buildBgmPhaseDiagLines(bgmPhaseDiag, Date.now());
      for (const l of bLines) lines.push(l);
    } catch {
      /* no-op */
    }
    // Phase D1(2026-07-05): 操作音(押下→成功→発音)観測値(未観測なら空=ノイズにしない)。
    try {
      const oLines = buildOpSoundEffectDiagLines(opSoundEffectDiag, Date.now());
      for (const l of oLines) lines.push(l);
    } catch {
      /* no-op */
    }
    // 感度パッチ(2026-07-06): コメント送信(所要ms/結果/フレーム試行回数)観測値(未観測なら空=ノイズにしない)。
    try {
      const cpLines = buildCommentPostDiagLines(commentPostDiag, Date.now());
      for (const l of cpLines) lines.push(l);
    } catch {
      /* no-op */
    }
    // v0.1.1092: コメント即時プッシュレーン(storage迂回)の送信N/受信N/表示遅延ms(未観測なら空=ノイズにしない)。
    try {
      const ipLines = buildInstantPushDiagLines(instantPushDiag, Date.now());
      for (const l of ipLines) lines.push(l);
    } catch {
      /* no-op */
    }
    // 2026-07-06: 配信切替(SPA遷移で iframe を作り直さない in-place 切替)の送信N/受信N/初描画ms
    //   (未観測なら空=ノイズにしない)。
    try {
      const csLines = buildChannelSwitchDiagLines(channelSwitchDiag, Date.now());
      for (const l of csLines) lines.push(l);
    } catch {
      /* no-op */
    }
    // SC2(council/broadcast-scoring-SYNTHESIS.md §2.2): 配信採点ハイライト台帳(件数/最終記録ago/
    //   上位ラベル・未観測なら空=ノイズにしない)。
    try {
      const hlLines = buildHighlightLedgerDiagLines(highlightLedger, Date.now());
      for (const l of hlLines) lines.push(l);
    } catch {
      /* no-op */
    }
    lines.push('');
  }
  // 検知された対処候補(症状→原因→次の一手)。AI が「何を直すか」を先頭で掴めるように上に置く。
  try {
    const actions = buildStatusActions({ livesData, fastDiag, popupDiag, reportPreview, trendFindings });
    // 純Web公開コピーの致命(キー未設定/未送信/送信失敗/件数不一致/liveId 不一致)を症状カードに昇格して結合。
    if (publishSelfDiag) {
      try { actions.push(...liveviewPublishSelfDiagToActionCards(publishSelfDiag)); } catch { /* no-op */ }
    }
    // 応援レーン描画の致命(鏡にはあるのに画面0件/例外/描画済みなのにローディング継続)を症状カードに昇格。
    if (laneRenderDiag) {
      try { actions.push(...storyUserLaneRenderDiagToActionCards(laneRenderDiag, { loadingActive: laneLoadingActive })); } catch { /* no-op */ }
    }
    // 数字の食い違い「要確認(記録が本家を大幅超=別配信混入/二重計上の疑い)」を症状カードに昇格(ok/normal は出さない)。
    try { actions.push(...commentCountProvenanceToActionCards(livesData)); } catch { /* no-op */ }
    // スクロール白化(重い・一瞬白くなって遅れて描画)を症状カードに昇格(count>0 のときだけ)。
    try { actions.push(...scrollWhiteoutToActionCards(fastDiag)); } catch { /* no-op */ }
    // v0.1.1026: アイコン画像のロード失敗(usericon 404/削除済み=画像が壊れて見える)を名指し(失敗0なら出さない)。
    try { actions.push(...avatarLoadDiagToActionCards((popupDiag?.popup ?? popupDiag)?.avatarLoadDiag)); } catch { /* no-op */ }
    // v0.1.1054: ギフト/広告の検知はしたが投擲演出/効果音が出ていない取りこぼしを症状カードに昇格。
    try { actions.push(...giftEffectDiagToActionCards(giftEffectDiag)); } catch { /* no-op */ }
    // v0.1.1058: コメント数マイルストーンの検知はしたが演出/効果音が出ていない取りこぼしを症状カードに昇格。
    try { actions.push(...milestoneEffectDiagToActionCards(milestoneEffectDiag)); } catch { /* no-op */ }
    lines.push('### 検知された対処候補(症状→原因→次の一手)');
    if (!actions.length) {
      lines.push('- 既知パターンに該当する問題は検知されませんでした(未知の症状なら下の診断 JSON を参照)。');
    } else {
      for (const a of actions) {
        const mark = a.severity === 'bad' ? '🔴' : a.severity === 'warn' ? '🟡' : '⚪';
        const fix = a.fixableHere === 'no' ? ' [statusの外が原因]' : a.fixableHere === 'partly' ? ' [操作で改善する場合あり]' : '';
        lines.push(`- ${mark} ${a.symptom}${fix}`);
        lines.push(`    原因(推定): ${a.cause}`);
        lines.push(`    次の一手: ${a.action}`);
      }
    }
    lines.push('');
  } catch {
    // 対処候補の生成失敗は AI共有を妨げない
  }
  if (livesData.length) {
    lines.push('### 配信ごと');
    for (const live of livesData) {
      lines.push(buildLiveBlockText(live));
      lines.push('');
    }
  }
  // 応援コメント(最新N件・本文): ユーザー指摘「配信の実コメントが診断ページに載っていない」を解消。
  //   応援ライブビューが描いている当の鏡(commentTimelineMirror)を貼るだけ=数字でなく本文が読める。
  //   jsonBlob に同梱済 → ①POP/②応援ライブビュー/③WEB すべてに同じコメント本文が出る(新規 read なし)。
  try {
    const ctLines = formatCommentTimelineReportLines(jsonBlob?.commentTimelineMirror || null, Date.now());
    if (ctLines.length) { for (const l of ctLines) lines.push(l); lines.push(''); }
  } catch {
    /* no-op: コメント本文表示の失敗は状態速報を壊さない */
  }
  // スクロール白化(重い・一瞬白くなって遅れて描画される): ユーザーが何度も報告・観測値は fastDiag に
  //   あったが状態速報の読める所に出ていなかった。ここで読める行に昇格する(新規 read なし)。
  try {
    const woLines = formatScrollWhiteoutReportLines(fastDiag);
    if (woLines.length) { for (const l of woLines) lines.push(l); lines.push(''); }
  } catch {
    /* no-op: 白化表示の失敗は状態速報を壊さない */
  }
  // 数字の出どころ(council/comment-count-provenance-question.txt): 「記録>本家コメ」のような食い違いに対し、
  //   各数字が何を・どこから・いつ数えているかを【事実として】出す(判定はしない=誤検知ゼロ)。
  try {
    const provLines = formatCommentCountProvenanceLines(livesData, fastDiag);
    if (provLines.length) { for (const l of provLines) lines.push(l); lines.push(''); }
  } catch {
    /* no-op: 出どころ表示の失敗は状態速報を壊さない */
  }
  // 純Web公開コピーの自己診断(これを見れば「純Webに何が送られ・何件で・古くないか・拡張と一致するか」が
  //   一目で分かる=スクショ往復が不要になる)。fastDiag JSON の直前=「データの羅列」の前に「コピーの健全性」。
  if (publishSelfDiag) {
    try {
      const selfLines = formatLiveviewPublishSelfDiagLines(publishSelfDiag);
      if (selfLines.length) { for (const l of selfLines) lines.push(l); lines.push(''); }
    } catch {
      /* no-op: 自己診断の失敗は状態速報を壊さない */
    }
  }
  // 応援レーン描画の自己診断(鏡N件 → 画面M件描画/止まった step/描画済みなのにローディング継続)。
  //   「鏡にはあるのに画面に出ない」を状態速報だけで切り分けられるようにする(スクショ往復ゼロ)。
  if (laneRenderDiag && laneRenderDiag.present) {
    try {
      const laneLines = formatStoryUserLaneRenderDiagLines(laneRenderDiag, { loadingActive: laneLoadingActive });
      if (laneLines.length) { for (const l of laneLines) lines.push(l); lines.push(''); }
    } catch {
      /* no-op: 自己診断の失敗は状態速報を壊さない */
    }
  }
  // v0.1.1231 Phase1: レーンの人物集合の増減。★「消えた人数」が本丸(不変条件=減ってはいけない)。
  //   来た人の累計は「上限48を撤廃したら何人になるか」の実測=上限を決める材料。
  try {
    const rosterSnap = (popupDiag?.popup ?? popupDiag)?.laneRosterDelta;
    const rosterLine = formatLaneRosterDeltaLine(rosterSnap);
    if (rosterLine) { lines.push(rosterLine); lines.push(''); }
  } catch { /* no-op: 計器の失敗は状態速報を壊さない */ }
  // ★v0.1.1249: タイルが減った「直前に供給を書いた者」を名指しする。
  //   roster は gift/ad 段を数えないため「消えた人0」でもタイルは減りうる=この行で補う。
  try {
    const supplyLine = String((popupDiag?.popup ?? popupDiag)?.laneSupplyOrigin?.line || '');
    if (supplyLine) { lines.push(supplyLine); lines.push(''); }
  } catch { /* no-op: 計器の失敗は状態速報を壊さない */ }
  // ★v0.1.1251: 不完全な軽い供給が完全描画を潰すのを止めた回数(72枚→3枚 の実測に対する防御)。
  try {
    const lightLine = String((popupDiag?.popup ?? popupDiag)?.lightSupplyGuard?.line || '');
    if (lightLine) { lines.push(lightLine); lines.push(''); }
  } catch { /* no-op: 計器の失敗は状態速報を壊さない */ }
  /*
   * ★v0.1.1278: 点滅追跡の計器7行(vanishForensics / hostAncestryTrace /
   *   hostStyleTrace / hostHideReason / hostRecoveryDiag / hostVisWatch /
   *   hostFlipCensus)を速報から外した。点滅は Side Panel 移行(v0.1.1275)で
   *   解決済みで、用の済んだ計器が速報を長くしていた。
   * ★styleReattach は残す=計器ではなく【自己修復が働いた回数】(実挙動)。
   */
  try {
    const srLine = String(fastDiag?.content?.styleReattach?.line || '');
    if (srLine) { lines.push(srLine); lines.push(''); }
  } catch { /* no-op: 計器の失敗は状態速報を壊さない */ }
  // 2026-07-20 診断先行: ①POP応援レーン/投げ一覧の「クリック不能な手カーソル」実害を数えるだけの1行。
  try {
    const capLine = String((popupDiag?.popup ?? popupDiag)?.storyUserLaneClickAffordanceParity?.line || '');
    if (capLine) lines.push(capLine);
  } catch {
    /* no-op: 自己診断の失敗は状態速報を壊さない */
  }
  // 2026-07-20 診断先行: ①POP応援レーンの「名前ありゆっくり顔」実害を数えるだけの1行(会場専用だった
  //   計器を①POPにも拡張)。
  try {
    const ynPopupLine = String((popupDiag?.popup ?? popupDiag)?.storyUserLaneYukkuriNamedCensus?.line || '');
    if (ynPopupLine) lines.push(ynPopupLine);
  } catch {
    /* no-op: 自己診断の失敗は状態速報を壊さない */
  }
  // 2026-07-21 診断先行: 北極星鏡publish取りこぼしの実害を数えるだけの1行(多重並行実行によるバッファ
  //   競合仮説の裏取り)。
  try {
    const nsRaceLine = String((popupDiag?.popup ?? popupDiag)?.northStarMirrorPublishRace?.line || '');
    if (nsRaceLine) lines.push(nsRaceLine);
  } catch {
    /* no-op: 自己診断の失敗は状態速報を壊さない */
  }
  // 2026-08-08: サイドパネルの自己診断(黒画面の切り分け)。パネル自身が3層の塗り状態を
  //   storage に書く=ユーザーが DevTools を開かずに原因が分かる。開いていなければ出ない。
  try {
    const spLine = String(sidepanelSelfDiag?.line || '');
    if (spLine) lines.push(spLine);
  } catch {
    /* no-op: 自己診断の失敗は状態速報を壊さない */
  }
  lines.push('### 診断 JSON (fastDiag)');
  lines.push('```json');
  try {
    lines.push(JSON.stringify(fastDiag || {}, null, 2));
  } catch {
    lines.push('{}');
  }
  lines.push('```');

  // 2026-06-18: popup の AI診断コピーにしか無い popup 固有診断を集約(別キー由来)。
  //   popup を開いたときだけ更新される=古いことがあるので persistedAt と経過を明示する。
  if (popupDiag && typeof popupDiag === 'object') {
    lines.push('');
    lines.push('### popup 固有診断 (AI診断コピー由来)');
    const persistedAt = String(popupDiag.persistedAt || '').trim();
    if (persistedAt) {
      const ageMs = Date.now() - Date.parse(persistedAt);
      const ageSec = Number.isFinite(ageMs) ? Math.max(0, Math.round(ageMs / 1000)) : null;
      const ageStr = ageSec != null ? `(約${ageSec}秒前にpopupで取得)` : '';
      lines.push(`取得時刻: ${persistedAt} ${ageStr}`);
      // 2026-08-01(v0.1.1211): 上の「約N秒前」は【速報生成時刻から見た経過】であって
      //   【popup 起動からの経過】ではない。この2つを取り違えると、起動直後で構造的にゼロな
      //   計器(鏡・グリッド)を「不具合」と誤読する。実際に開発者が 362ms のスナップショットを
      //   「22秒経っても鏡が空」と読み違えた。値の"齢"を必ず併記する。
      const uptimeNote = buildPopupDiagUptimeNote(popupDiag?.popup?.loadShadeProbe?.shadeAgeMs);
      if (uptimeNote) lines.push(`↑ ${uptimeNote}`);
      // 第2段(鮮度の正直化): 3分超なら「古い」を明示(根1=1回だけ集約で固着するため)。
      if (Number.isFinite(ageMs) && ageMs > 3 * 60 * 1000) {
        lines.push('⚠ この popup 診断は古いです(3分超)。下の応援レーン描画/北極星 probe は現状と違う可能性があります。watch タブで popup を開き直すと新鮮化します。');
      }
      // liveId 照合: popup 診断の対象配信が現配信と違えば「別配信の古い値」を警告(根=liveId 照合欠如)。
      const popupLid = String(popupDiag?.popup?.watchSnapshotMeta?.liveId || '').trim().toLowerCase();
      const curLid = String(currentLiveId || '').trim().toLowerCase();
      if (popupLid && curLid && popupLid !== curLid) {
        lines.push(`🔴 この popup 診断は別配信(${popupLid})のものです。現在の配信(${curLid})とは一致しません=下の probe を現配信の診断として読まないでください。`);
      }
    } else {
      lines.push('取得時刻: 不明(popup を一度開くと更新されます)');
    }
    lines.push('```json');
    try {
      lines.push(JSON.stringify(popupDiag.popup ?? popupDiag, null, 2));
    } catch {
      lines.push('{}');
    }
    lines.push('```');
  } else {
    lines.push('');
    lines.push('### popup 固有診断 (AI診断コピー由来)');
    lines.push('未取得。ニコ生 watch を開いた状態で拡張ポップアップの「AI診断コピー」を一度押すと、ここに集約されます。');
  }
  return lines.join('\n');
}
