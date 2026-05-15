/**
 * AI共有・不具合調査向け Markdown（先頭要約 + JSON）。
 */

import { safeJsonForDiagnostic } from './diagnosticRedact.js';

/**
 * @param {Record<string, unknown>} payload
 * @returns {string[]}
 */
export function buildAiShareSummaryLines(payload) {
  const lines = [];
  try {
    lines.push('【読み方】要約を先に。lv 不一致・content 取得元・fast-only 警告・truncated を優先。');
    const meta = /** @type {Record<string, unknown>|undefined} */ (
      payload.meta && typeof payload.meta === 'object'
        ? payload.meta
        : undefined
    );
    if (meta && meta.ok === false) {
      lines.push(`meta 取得失敗: ${String(meta.error || '')}`);
    } else if (meta && typeof meta === 'object') {
      if (meta.truncated === true) {
        lines.push(
          `JSON 省略: meta.truncated（概算 ${String(meta.approxSerializedCharsBeforeTruncate || '')} 字）`
        );
      }
      const st = String(
        meta.popupSurfaceState || meta.surfaceState || ''
      ).trim();
      if (st) lines.push(`状態: ${st}`);
      if (meta.extensionVersion)
        lines.push(`拡張: v${String(meta.extensionVersion)}`);
      if (meta.buildId) lines.push(`ビルドID: ${String(meta.buildId)}`);
      if (meta.popupMode) lines.push(`POP モード: ${String(meta.popupMode)}`);
      const cds = String(meta.contentDiagSource || '').trim();
      if (cds) lines.push(`content 診断取得元: ${cds}`);
      if (meta.fastOnlyStaleIncomplete === true) {
        lines.push(
          '警告: content は fast キャッシュのみ。スキーマ欠落の可能性（ニコ生 watch 表示で再試行するとライブ診断とマージ）'
        );
      }
    }

    const wc = /** @type {Record<string, unknown>|undefined} */ (
      payload.watchContext && typeof payload.watchContext === 'object'
        ? payload.watchContext
        : undefined
    );
    if (wc && wc.ok === false) {
      lines.push(`watchContext: ${String(wc.error || '')}`);
    } else if (wc) {
      if (wc.liveId) lines.push(`liveId: ${String(wc.liveId)}`);
      if (wc.watchUrlSource)
        lines.push(`URL 解決元: ${String(wc.watchUrlSource)}`);
      if (wc.openWatchTabsCount != null)
        lines.push(`開いている watch タブ数: ${String(wc.openWatchTabsCount)}`);
      if (wc.resolvedVsStorageLiveIdMatch === false) {
        lines.push(
          `storage lv と解決 lv が不一致（storage=${String(wc.storageLastWatchLiveId || '')} / resolved=${String(wc.liveId || '')}）`
        );
      }
      if (wc.mismatchReasons && Array.isArray(wc.mismatchReasons)) {
        const m = /** @type {unknown[]} */ (wc.mismatchReasons).slice(0, 3);
        if (m.length) lines.push(`不一致メモ: ${m.join(' / ')}`);
      }
    }

    const uiB = /** @type {Record<string, unknown>|undefined} */ (
      payload.UI && typeof payload.UI === 'object' ? payload.UI : undefined
    );
    const lo =
      uiB &&
      typeof uiB.popupLayout === 'object' &&
      uiB.popupLayout !== null &&
      !Array.isArray(uiB.popupLayout)
        ? /** @type {Record<string, unknown>} */ (uiB.popupLayout)
        : null;
    if (lo) {
      const vw = lo.viewportInnerWidth;
      const vh = lo.viewportInnerHeight;
      const oh = lo.likelyHorizontalOverflow === true;
      if (vw != null || vh != null) {
        lines.push(
          `POP viewport: ${String(vw ?? '?')}×${String(vh ?? '?')}${
            oh ? '（横はみ出し疑い）' : ''
          }`
        );
      }
      const pres =
        lo.officialStatsPresence &&
        typeof lo.officialStatsPresence === 'object' &&
        lo.officialStatsPresence !== null &&
        !Array.isArray(lo.officialStatsPresence)
          ? /** @type {Record<string, unknown>} */ (lo.officialStatsPresence)
          : null;
      if (pres && pres.hasAnyEventCampaignHud === false) {
        lines.push(
          '本家イベント帯: 未取得（NDGR field5 なし・未参加・DOM 失敗の可能性。UI.popupLayout / content.giftDiagnostics）'
        );
      }
      const nlm = lo.nlMain;
      if (
        nlm &&
        typeof nlm === 'object' &&
        nlm !== null &&
        /** @type {{ verticalOverflow?: boolean }} */ (nlm).verticalOverflow === true
      ) {
        lines.push('レイアウト: .nl-main 縦オーバーフロー（パネル高さ要確認）');
      }
    }

    const pr = /** @type {Record<string, unknown>|undefined} */ (
      payload.popupRefresh && typeof payload.popupRefresh === 'object'
        ? payload.popupRefresh
        : undefined
    );
    if (pr && pr.ok !== false) {
      if (pr.watchPopupRefreshGeneration != null)
        lines.push(`refresh generation: ${String(pr.watchPopupRefreshGeneration)}`);
      if (pr.refreshDurationMs != null)
        lines.push(
          `refresh 所要: ${String(pr.refreshDurationMs)}ms（diagGen=${String(pr.refreshDiagGeneration ?? '')}）`
        );
      const snapInf = pr.snapshotInflight;
      const snapEx = pr.snapshotCacheExists;
      if (snapInf !== undefined || snapEx !== undefined) {
        lines.push(
          `snapshot: inflight=${String(snapInf)} cacheExists=${String(snapEx)}`
        );
      }
    }

    const messaging = /** @type {Record<string, unknown>|undefined} */ (
      payload.messaging && typeof payload.messaging === 'object'
        ? payload.messaging
        : undefined
    );
    const msg = /** @type {unknown[]} */ (
      messaging && Array.isArray(messaging.recent) ? messaging.recent : []
    );
    if (msg.length) {
      const last = /** @type {Record<string, unknown>} */ (msg[msg.length - 1]);
      lines.push(
        `直近 messaging: ${String(last.type || '')} ok=${String(last.ok)} (${String(last.durationMs || '')}ms)`
      );
    }

    const gp = /** @type {Record<string, unknown>|undefined} */ (
      payload.giftPipeline && typeof payload.giftPipeline === 'object'
        ? payload.giftPipeline
        : undefined
    );
    if (gp && gp.ok !== false) {
      const sum = /** @type {Record<string, unknown>|undefined} */ (
        gp.giftRowsSummary && typeof gp.giftRowsSummary === 'object'
          ? /** @type {Record<string, unknown>} */ (gp.giftRowsSummary)
          : undefined
      );
      const rows = sum && typeof sum.rowCount === 'number' ? sum.rowCount : null;
      const shape = sum && typeof sum.shape === 'string' ? sum.shape : '';
      const cq = /** @type {Record<string, unknown>|undefined} */ (
        gp.consistencyQuickChecks &&
        typeof gp.consistencyQuickChecks === 'object'
          ? /** @type {Record<string, unknown>} */ (gp.consistencyQuickChecks)
          : undefined
      );
      const ng = cq && typeof cq.ndgrGiftsCounterOnPage === 'number' ? cq.ndgrGiftsCounterOnPage : null;
      if (rows != null || ng != null) {
        lines.push(
          `ギフト: ストレージ行=${String(rows ?? '?')} shape=${shape || '?'} / NDGRページ側 g=${ng ?? '?'}`
        );
      }
      const gh = /** @type {unknown[]} */ (
        gp.errorsGiftRelated && Array.isArray(gp.errorsGiftRelated)
          ? gp.errorsGiftRelated
          : []
      );
      if (gh.length) {
        lines.push(`ギフト関連エラー: ${String(gh.length)} 件（JSON の giftPipeline.errorsGiftRelated を参照）`);
      }
    }

    const reBag =
      payload.recentErrors && typeof payload.recentErrors === 'object'
        ? /** @type {{ entries?: unknown }} */ (payload.recentErrors).entries
        : undefined;
    const re = /** @type {unknown[]} */ (
      Array.isArray(reBag)
        ? reBag
        : Array.isArray(payload.recentErrors)
          ? /** @type {unknown[]} */ (payload.recentErrors)
          : []
    );
    if (re.length) {
      const tail = re.slice(-5);
      lines.push(
        `直近エラー(末尾5): ${tail
          .map((e) => {
            const o = /** @type {Record<string, unknown>} */ (
              e && typeof e === 'object' ? e : {}
            );
            return `${String(o.context || '?')}:${String(o.message || '').slice(0, 80)}`;
          })
          .join(' | ')}`
      );
    }

    const eh = /** @type {Record<string, unknown>|undefined} */ (
      payload.extensionHealth && typeof payload.extensionHealth === 'object'
        ? payload.extensionHealth
        : undefined
    );
    if (eh && eh.ok !== false && eh.ringEntryCount != null) {
      lines.push(
        `エラーリング集計: ${String(eh.ringEntryCount)} 件・最新時刻=${String(eh.latestErrorAt ?? '')}`
      );
    }

    const cp = /** @type {Record<string, unknown>|undefined} */ (
      payload.commentPipeline && typeof payload.commentPipeline === 'object'
        ? payload.commentPipeline
        : undefined
    );
    const hist = cp?.tailSourceHistogram;
    if (hist && typeof hist === 'object' && !Array.isArray(hist)) {
      const o = /** @type {Record<string, unknown>} */ (hist);
      const parts = Object.keys(o)
        .sort()
        .map((k) => {
          const n = o[k];
          return `${k}:${Number.isFinite(Number(n)) ? Number(n) : '?'}`;
        });
      if (parts.length) {
        lines.push(`取り込み経路(直近lvの末尾ログ・source内訳): ${parts.join(', ')}`);
      }
    }

    lines.push(
      `次に疑う領域: watch URL → sendMessage → refresh generation → storage・IDB → ギフトは giftPipeline・content.giftDiagnostics・エラー ring（ギフト関連）`
    );
  } catch {
    lines.push('要約生成で例外（payload は JSON ブロックを参照）');
  }
  return lines;
}

/**
 * @param {{
 *   extensionName?: string,
 *   extensionVersion?: string,
 *   watchUrlNote?: string,
 *   lastSendMessageError?: string,
 *   payload: Record<string, unknown>
 * }} parts
 */
export function formatAiShareDiagnosticsMarkdown(parts) {
  const lines = [];
  lines.push('## nicolivelog 診断バンドル（不具合調査・最大情報・ローカルのみ）');
  lines.push('');
  lines.push(
    '次の JSON は **コメント本文・URL の query/# は含みません**。外部送信はしません。'
  );
  lines.push('');
  lines.push('### 要約');
  for (const s of buildAiShareSummaryLines(parts.payload)) {
    lines.push(`- ${s}`);
  }
  const pl = parts.payload && typeof parts.payload === 'object' ? parts.payload : null;
  const dsv = pl && 'diagSchemaVersion' in pl ? String(/** @type {Record<string, unknown>} */ (pl).diagSchemaVersion || '') : '';
  lines.push(
    `- 診断スキーマ: \`${dsv || '（未付与）'}\`（LLM への再現用バージョン）`
  );
  if (parts.extensionName || parts.extensionVersion) {
    lines.push(
      `- 拡張名: ${parts.extensionName || ''} ${parts.extensionVersion ? `v${parts.extensionVersion}` : ''}`
    );
  }
  if (parts.watchUrlNote) {
    lines.push(`- タブ選択メモ: ${parts.watchUrlNote}`);
  }
  if (parts.lastSendMessageError) {
    lines.push(`- content への lastSendMessage エラー: \`${parts.lastSendMessageError}\``);
  }
  lines.push('');
  lines.push('### 完全 JSON');
  lines.push('');
  lines.push('```json');
  try {
    lines.push(JSON.stringify(parts.payload, null, 2));
  } catch {
    lines.push(safeJsonForDiagnostic(parts.payload, 8, 120_000));
  }
  lines.push('```');
  return lines.join('\n');
}
