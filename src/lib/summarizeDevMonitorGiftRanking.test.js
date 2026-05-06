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

  it('ギフトサイドバー履歴: 0 件は ❌ で iframe 数も含む', () => {
    const rows = summarizeDevMonitorGiftRanking(buildRealisticFastCache());
    const v = rows.find((r) => r[0] === 'ギフトサイドバー履歴')?.[1];
    expect(v).toBe('❌ 0 件 / iframe 2 / scrape 可能 0');
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
