/**
 * v0.1.202 A-0: summarizeDevMonitorGiftRanking 純関数のテスト。
 *
 * AI 診断 payload と popup「詳しい状況」表示を 1 つの raw data から生成する
 * 整合の core 関数。実 payload（lv350471922 / lv350471471）を fixture に近い形で
 * 用意し、各分岐を cover する。
 */

import { describe, it, expect } from 'vitest';
import { summarizeDevMonitorGiftRanking } from './summarizeDevMonitorGiftRanking.js';

/**
 * lv350471922 の実 payload（v0.1.201 反映後の診断 JSON）から要点を抽出した fixture。
 * @returns {any}
 */
function buildRealisticFastCache() {
  return {
    popup: {
      watchSnapshotMeta: {
        liveId: 'lv350471922',
        broadcasterUserId: '143172392',
        broadcasterName: 'まめ。２',
        viewerUserId: ''
      }
    },
    content: {
      giftDiagnostics: {
        avatarNicknameMatchDiag: {
          avAndNick: 6,
          avNoNick: 1,
          avatarMapSize: 7,
          nickNoAv: 39,
          nicknameMapSize: 45
        },
        rankingDiag: {
          collectAttempts: 12,
          contributionRanking: { foundCount: 0, lastFoundAgoMs: null },
          autoOpen: {
            attemptCount: 2,
            lastStatus: 'opened-but-no-banner',
            lastFailureReason: 'banner_not_rendered_sidebar_has_hints',
            lastSidebarHints: {
              hintCount: 1,
              hints: [{ text: 'お困りの方はこちら' }]
            }
          }
        },
        multiTabDiag: {
          hasSnapshot: true,
          eventDomLvCount: 49,
          currentLiveIdInEventDom: true,
          currentLiveIdInNicoad: false,
          staleDomBundleSuspected: true
        },
        'ギフトサマリ': {
          'NDGRギフトevent数': 1,
          'ギフトポイント観測': 1920,
          'コメントDOM由来ギフト観測数': 1,
          'コメントDOM由来ギフトpt合計': 300
        }
      },
      giftSubAppDiag: {
        historyCount: 0,
        iframeCount: 2,
        scrapableFrameCount: 0
      },
      networkErrorProbe: {
        ndgrConnectStatus: 'connected',
        nicoadFetchStatus: 'empty',
        serviceWorkerInactive: false
      }
    }
  };
}

describe('summarizeDevMonitorGiftRanking', () => {
  it('null/undefined/{} → 空配列（crash しない）', () => {
    expect(summarizeDevMonitorGiftRanking(null)).toEqual([]);
    expect(summarizeDevMonitorGiftRanking(undefined)).toEqual([]);
    expect(summarizeDevMonitorGiftRanking({})).toEqual([]);
    expect(summarizeDevMonitorGiftRanking({ content: null })).toEqual([]);
  });

  it('実 payload（lv350471922）から 8 行が出る', () => {
    const rows = summarizeDevMonitorGiftRanking(buildRealisticFastCache());
    const labels = rows.map((r) => r[0]);
    expect(labels).toEqual([
      'ギフト観測（NDGR / DOM コメント由来）',
      'ギフトサイドバー履歴',
      '応援ランキング自動オープン',
      '貢献度ランキング',
      'multi-tab race 警告',
      'avatar / nickname 取得率',
      'viewer ログイン状態',
      'network 接続'
    ]);
  });

  it('ギフト観測行: NDGR と DOM 由来の両方を出す', () => {
    const rows = summarizeDevMonitorGiftRanking(buildRealisticFastCache());
    const v = rows.find((r) => r[0].startsWith('ギフト観測'))?.[1];
    expect(v).toBe('NDGR: 1 件 / 1920pt、DOM由来: 1 件 / 300pt');
  });

  it('ギフトサイドバー履歴: 0 件は ❌ で iframe 数も含む（failureReason なし fixture）', () => {
    const rows = summarizeDevMonitorGiftRanking(buildRealisticFastCache());
    const v = rows.find((r) => r[0] === 'ギフトサイドバー履歴')?.[1];
    expect(v).toBe('❌ 0 件 / iframe 2 / scrape 可能 0');
  });

  it('v0.1.203: failureReason=cross_origin_iframe_only 時は「仕様」注記つき', () => {
    const c = buildRealisticFastCache();
    c.content.giftSubAppDiag.failureReason = 'cross_origin_iframe_only';
    const rows = summarizeDevMonitorGiftRanking(c);
    const v = rows.find((r) => r[0] === 'ギフトサイドバー履歴')?.[1];
    expect(v).toBe(
      '❌ 0 件 / iframe 2 / scrape 可能 0 — cross_origin_iframe_only（仕様、NDGR 経路で代替予定）'
    );
  });

  it('v0.1.203: failureReason=no_iframe_found のときは reason をそのまま表示', () => {
    const c = buildRealisticFastCache();
    c.content.giftSubAppDiag = {
      historyCount: 0,
      iframeCount: 0,
      scrapableFrameCount: 0,
      failureReason: 'no_iframe_found'
    };
    const rows = summarizeDevMonitorGiftRanking(c);
    const v = rows.find((r) => r[0] === 'ギフトサイドバー履歴')?.[1];
    expect(v).toBe(
      '❌ 0 件 / iframe 0 / scrape 可能 0 — no_iframe_found'
    );
  });

  it('v0.1.226/227: giftSubAppRelayDiag 受信 0 + heartbeat 0 → 起動なし行', () => {
    const c = buildRealisticFastCache();
    c.content.giftDiagnostics.giftSubAppRelayDiag = {
      messagesReceivedTotal: 0,
      messagesByFrameUrl: {},
      lastReceivedAgoMs: null,
      heartbeatsByFrameUrl: {},
      heartbeatFrameCount: 0,
      crossOriginThrows: 6,
      sameOriginAccess: 1,
      hasReceivedAny: false,
      hasHeartbeatAny: false
    };
    const rows = summarizeDevMonitorGiftRanking(c);
    const v = rows.find((r) => r[0] === 'iframe relay 経路')?.[1];
    expect(v).toContain('起動なし');
    expect(v).toContain('6');
  });

  it('v0.1.227: heartbeat あり + relay 0 → 起動済 / scrape 0 件行', () => {
    const c = buildRealisticFastCache();
    c.content.giftDiagnostics.giftSubAppRelayDiag = {
      messagesReceivedTotal: 0,
      messagesByFrameUrl: {},
      lastReceivedAgoMs: null,
      heartbeatsByFrameUrl: {
        'https://audition.nicovideo.jp/x': {
          count: 5,
          lastAgoMs: 500,
          lastScrapeAttempts: 5,
          lastItemsCount: 0,
          lastContribCount: 0,
          lastEventBannerPresent: false
        }
      },
      heartbeatFrameCount: 1,
      crossOriginThrows: 0,
      sameOriginAccess: 0,
      hasReceivedAny: false,
      hasHeartbeatAny: true
    };
    const rows = summarizeDevMonitorGiftRanking(c);
    const v = rows.find((r) => r[0] === 'iframe relay 経路')?.[1];
    expect(v).toContain('iframe relay 起動 1 frame');
    expect(v).toContain('scrape 0');
  });

  it('v0.1.226/227: giftSubAppRelayDiag 受信あり → 受信件数行を出す', () => {
    const c = buildRealisticFastCache();
    c.content.giftDiagnostics.giftSubAppRelayDiag = {
      messagesReceivedTotal: 12,
      messagesByFrameUrl: { a: 6, b: 6 },
      lastReceivedAgoMs: 3500,
      heartbeatsByFrameUrl: {
        a: { count: 6, lastAgoMs: 100, lastScrapeAttempts: 6, lastItemsCount: 6, lastContribCount: 0, lastEventBannerPresent: false },
        b: { count: 6, lastAgoMs: 100, lastScrapeAttempts: 6, lastItemsCount: 6, lastContribCount: 0, lastEventBannerPresent: false }
      },
      heartbeatFrameCount: 2,
      crossOriginThrows: 2,
      sameOriginAccess: 0,
      hasReceivedAny: true,
      hasHeartbeatAny: true
    };
    const rows = summarizeDevMonitorGiftRanking(c);
    const v = rows.find((r) => r[0] === 'iframe relay 経路')?.[1];
    expect(v).toContain('iframe relay 受信 12 件');
  });

  it('v0.1.226: giftSubAppRelayDiag が無い fixture では行を出さない（後方互換）', () => {
    const rows = summarizeDevMonitorGiftRanking(buildRealisticFastCache());
    const v = rows.find((r) => r[0] === 'iframe relay 経路');
    expect(v).toBeUndefined();
  });

  it('応援ランキング自動オープン: lastFailureReason + hint テキスト', () => {
    const rows = summarizeDevMonitorGiftRanking(buildRealisticFastCache());
    const v = rows.find((r) => r[0] === '応援ランキング自動オープン')?.[1];
    expect(v).toBe(
      '❌ banner_not_rendered_sidebar_has_hints（hint: お困りの方はこちら）'
    );
  });

  it('応援ランキング: 成功状態（reason なし、attemptCount>0） → ✅', () => {
    const c = buildRealisticFastCache();
    c.content.giftDiagnostics.rankingDiag.autoOpen = {
      attemptCount: 1,
      lastStatus: 'opened-with-banner',
      lastFailureReason: null
    };
    const rows = summarizeDevMonitorGiftRanking(c);
    const v = rows.find((r) => r[0] === '応援ランキング自動オープン')?.[1];
    expect(v).toBe('✅ opened-with-banner');
  });

  it('応援ランキング: attemptCount=0 → 試行なし', () => {
    const c = buildRealisticFastCache();
    c.content.giftDiagnostics.rankingDiag.autoOpen = {
      attemptCount: 0,
      lastStatus: '',
      lastFailureReason: null
    };
    const rows = summarizeDevMonitorGiftRanking(c);
    const v = rows.find((r) => r[0] === '応援ランキング自動オープン')?.[1];
    expect(v).toBe('— 試行なし');
  });

  it('貢献度ランキング: 0 件 + 試行回数を出す', () => {
    const rows = summarizeDevMonitorGiftRanking(buildRealisticFastCache());
    const v = rows.find((r) => r[0] === '貢献度ランキング')?.[1];
    expect(v).toBe('❌ 0 件（試行 12 回）');
  });

  it('貢献度ランキング: 取れている場合は ✅ + 件数', () => {
    const c = buildRealisticFastCache();
    c.content.giftDiagnostics.rankingDiag.contributionRanking.foundCount = 5;
    const rows = summarizeDevMonitorGiftRanking(c);
    const v = rows.find((r) => r[0] === '貢献度ランキング')?.[1];
    expect(v).toBe('✅ 5 件取得');
  });

  it('multi-tab race 警告: stale=true で複数条件をまとめて出す', () => {
    const rows = summarizeDevMonitorGiftRanking(buildRealisticFastCache());
    const v = rows.find((r) => r[0] === 'multi-tab race 警告')?.[1];
    expect(v).toBe('⚠️ 過去 lv 残骸 49 件 / nicoad 不一致');
  });

  it('multi-tab race 警告: stale=false で ✅ を出す', () => {
    const c = buildRealisticFastCache();
    c.content.giftDiagnostics.multiTabDiag = {
      hasSnapshot: true,
      eventDomLvCount: 1,
      currentLiveIdInEventDom: true,
      currentLiveIdInNicoad: true,
      staleDomBundleSuspected: false
    };
    const rows = summarizeDevMonitorGiftRanking(c);
    const v = rows.find((r) => r[0] === 'multi-tab race 警告')?.[1];
    expect(v).toBe('✅ 残骸なし（lv 履歴 1 件）');
  });

  it('multi-tab race 警告: hasSnapshot=false なら警告行自体を出さない', () => {
    const c = buildRealisticFastCache();
    c.content.giftDiagnostics.multiTabDiag = {
      hasSnapshot: false,
      staleDomBundleSuspected: false
    };
    const rows = summarizeDevMonitorGiftRanking(c);
    const v = rows.find((r) => r[0] === 'multi-tab race 警告');
    expect(v).toBeUndefined();
  });

  it('avatar / nickname 取得率: 3 区分の数を出す', () => {
    const rows = summarizeDevMonitorGiftRanking(buildRealisticFastCache());
    const v = rows.find((r) => r[0] === 'avatar / nickname 取得率')?.[1];
    expect(v).toBe('両方 6、nick のみ 39、avatar のみ 1');
  });

  it('viewer ログイン状態: viewerUid 空 → ❌', () => {
    const rows = summarizeDevMonitorGiftRanking(buildRealisticFastCache());
    const v = rows.find((r) => r[0] === 'viewer ログイン状態')?.[1];
    expect(v).toBe('❌ viewerUid 空（未ログイン or hook 不全）');
  });

  it('viewer ログイン状態: viewerUid あり → ✅ + 先頭 8 文字', () => {
    const c = buildRealisticFastCache();
    c.popup.watchSnapshotMeta.viewerUserId = '12345678901234';
    const rows = summarizeDevMonitorGiftRanking(c);
    const v = rows.find((r) => r[0] === 'viewer ログイン状態')?.[1];
    expect(v).toBe('✅ uid 取得済（12345678…）');
  });

  it('network 接続: NDGR ✅ / nicoad ❌ empty / SW ✅', () => {
    const rows = summarizeDevMonitorGiftRanking(buildRealisticFastCache());
    const v = rows.find((r) => r[0] === 'network 接続')?.[1];
    expect(v).toBe('NDGR ✅ / nicoad ❌ empty / SW ✅');
  });

  it('network 接続: NDGR disconnected / nicoad success / SW inactive', () => {
    const c = buildRealisticFastCache();
    c.content.networkErrorProbe = {
      ndgrConnectStatus: 'disconnected',
      nicoadFetchStatus: 'success',
      serviceWorkerInactive: true
    };
    const rows = summarizeDevMonitorGiftRanking(c);
    const v = rows.find((r) => r[0] === 'network 接続')?.[1];
    expect(v).toBe('NDGR ❌ disconnected / nicoad ✅ / SW ❌');
  });

  it('部分 payload（giftDiagnostics 欠落）でも crash せず空配列に近い rows を返す', () => {
    const r = summarizeDevMonitorGiftRanking({
      popup: { watchSnapshotMeta: { viewerUserId: '' } },
      content: {
        giftSubAppDiag: { historyCount: 0, iframeCount: 1, scrapableFrameCount: 0 },
        networkErrorProbe: { ndgrConnectStatus: 'connected', nicoadFetchStatus: 'never', serviceWorkerInactive: false }
      }
    });
    expect(r.map((x) => x[0])).toEqual([
      'ギフトサイドバー履歴',
      'viewer ログイン状態',
      'network 接続'
    ]);
  });
});
