// @ts-nocheck — status 速報本文ビルダー: status-entry.js(@ts-nocheck)から挙動同値で切り出し。本文バイト一致のため in-body キャストを避け、元ファイルと同じ @ts-nocheck を踏襲。
// 状態速報(AI共有)本文ビルダー。②応援ライブビュー/③WEB が同一の status-report builder を
//   再利用できるよう、status-entry.js から挙動同値で切り出した純関数。本文はバイト一致。
import {
  buildLiveviewPublishSelfDiag,
  formatLiveviewPublishSelfDiagLines,
  liveviewPublishSelfDiagToActionCards
} from './liveviewPublishSelfDiag.js';
import { summarizeLiveviewPublishOutcome } from './liveviewPublishOutcome.js';
import { summarizeLiveviewPublishOutcomeRecord } from './liveviewPublishOutcomeKey.js';
import { buildDiagnosticsTrust, formatDiagnosticsTrustLines } from './diagnosticsTrust.js';
import { buildParityVerdict, formatParityVerdictLine } from './parityVerdict.js';
import {
  buildStoryUserLaneRenderDiag,
  formatStoryUserLaneRenderDiagLines,
  storyUserLaneRenderDiagToActionCards
} from './storyUserLaneRenderProbe.js';
import {
  formatCommentCountProvenanceLines,
  commentCountProvenanceToActionCards
} from './commentCountProvenance.js';
import { buildHealthCells, summarizeHealthVerdict } from './healthCells.js';
import { buildVoiceDiagLine } from './voiceDiag.js';
import { reportPreviewCtxFromFastDiag } from './reportPreviewCtx.js';
import { buildReportPreviewLines } from './reportPreview.js';
import { buildStatusActions } from './statusActionAdvisor.js';
import { buildLaneStatusLine, buildLiveBlockText } from './statusFormat.js';

/**
 * 状態速報(AI共有)の本文を組み立てる。status-entry.js から挙動同値で切り出し。
 * @param {any} args
 * @returns {string}
 */
export function buildAiShareFullText({ overviewText, livesData, fastDiag, popupDiag, voiceDiag, venueSeatsDiag, laneDiag, reportPreview, trendFindings, jsonBlob, currentLiveId, publishKeys, publishOutcomeRec, previewRenderAck }) {
  const lines = [];
  lines.push('## 君斗りんくの追憶のきらめき 状態速報');
  lines.push(`生成: ${new Date().toISOString()}`);
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
    laneRenderDiag = buildStoryUserLaneRenderDiag(probeSnap);
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
        currentLiveId: String(currentLiveId || ''),
        nowMs: Date.now()
      });
      lines.push(formatParityVerdictLine(parity));
      lines.push('');
    } catch {
      /* no-op: パリティ判定の失敗は状態速報を壊さない */
    }
    const trustLines = formatDiagnosticsTrustLines(trust);
    if (trustLines.length) { for (const l of trustLines) lines.push(l); lines.push(''); }
  } catch {
    /* no-op: 信頼性ブロックの失敗は状態速報を壊さない */
  }
  if (overviewText) {
    lines.push('### 概要');
    lines.push(overviewText);
    // v0.1.846: 総合判定を概要に1行併記。満点=「異常ゼロ」(進行中/対象外は正常扱い)。
    //   ユーザー要望「全部100%になるまで=修復いらないぐらい完全に」への回答=異常が無ければ満点。
    try {
      const verdict = summarizeHealthVerdict(buildHealthCells({ livesData, fastDiag, voiceDiag, venueSeatsDiag, laneDiag }));
      const vmark = verdict.level === 'ok' ? '🟢' : verdict.level === 'warn' ? '🟡' : '🔴';
      lines.push(`総合判定: ${vmark} ${verdict.text}`);
    } catch {
      /* no-op: 判定失敗は概要を壊さない */
    }
    // v0.1.766: 概要に公式値レーン(北極星レーン)の状況も併記(視聴中の配信のみ)。
    const laneStr = buildLaneStatusLine(fastDiag?.content?.giftDiagnostics?.['北極星レーン']);
    if (laneStr) lines.push(laneStr);
    // v0.1.852: 会場モードの読み上げ診断(使用時のみ)。「たまに遅れる」の切り分け材料を AI 共有に載せる。
    try {
      const vStr = buildVoiceDiagLine(voiceDiag, Date.now());
      if (vStr) lines.push(vStr);
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
  // 数字の出どころ(council/comment-count-provenance-question.txt): 「記録>本家コメ」のような食い違いに対し、
  //   各数字が何を・どこから・いつ数えているかを【事実として】出す(判定はしない=誤検知ゼロ)。
  try {
    const provLines = formatCommentCountProvenanceLines(livesData);
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
