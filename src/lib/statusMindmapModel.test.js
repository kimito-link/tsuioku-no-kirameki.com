import { describe, it, expect } from 'vitest';
import { buildStatusMindmapModel } from './statusMindmapModel.js';

/** ツリーから label でノードを探す(浅い再帰) */
function find(node, label) {
  if (!node) return null;
  if (node.label === label) return node;
  for (const c of node.children || []) {
    const hit = find(c, label);
    if (hit) return hit;
  }
  return null;
}

describe('buildStatusMindmapModel', () => {
  it('空入力でも根と主要枝が出る(未取得を明示)', () => {
    const m = buildStatusMindmapModel({});
    expect(m.label).toContain('マインドマップ');
    // 主要7枝
    for (const branch of [
      '概要', '視聴中の配信', 'コメント取得', '北極星レーン(公式値)',
      '過去ログ取得(backfill)', '取得経路の健全性', 'popup 固有診断(AI診断コピー由来)'
    ]) {
      expect(find(m, branch), branch).toBeTruthy();
    }
    // 視聴中なしは warn
    expect(find(m, '視聴中の配信').badge).toBe('warn');
    // popup 未取得は warn + 案内文
    const pop = find(m, 'popup 固有診断(AI診断コピー由来)');
    expect(find(pop, '未取得').value).toContain('AI診断コピー');
  });

  it('取得率で badge が変わる(93%→ok)', () => {
    const m = buildStatusMindmapModel({
      livesData: [{ liveId: 'lv1', recordedCount: 25, officialCommentCount: 27, officialRatePct: 93, recording: true }]
    });
    const ov = find(m, '取得率(累計)');
    expect(ov.value).toContain('93%');
    expect(ov.badge).toBe('ok');
    const live = find(m, '[lv1]');
    expect(live.badge).toBe('ok');
  });

  it('低取得率は bad', () => {
    const m = buildStatusMindmapModel({
      livesData: [{ liveId: 'lv1', recordedCount: 2, officialCommentCount: 100, officialRatePct: 2, recording: true }]
    });
    expect(find(m, '取得率(累計)').badge).toBe('bad');
  });

  it('コメント取得: visible=0 を info で注記・userId率100%は ok', () => {
    const fastDiag = {
      content: {
        giftDiagnostics: {
          commentObservability: {
            commentIngestBySource: { backfill: 24, ndgr: 5, visible: 0 },
            savedCommentsUidStats: { withUid: 19, withoutUid: 0, withUidPercent: 100 },
            ndgrMessageIdDedupe: { accepted: 5, droppedDuplicate: 4 }
          }
        }
      }
    };
    const m = buildStatusMindmapModel({ fastDiag });
    expect(find(m, 'userId 付き保存率').badge).toBe('ok');
    expect(find(m, 'DOM観測コメント').value).toContain('visible=0');
    expect(find(m, 'DOM観測コメント').badge).toBe('info');
  });

  it('北極星レーン: state=ok だが count=0 は warn(空)・値ありは ok', () => {
    const fastDiag = {
      content: {
        giftDiagnostics: {
          '北極星レーン': {
            '1_貢献度ランキング': { state: 'ok', count: 0 },
            '4_番組累計ポイント': { state: 'ok', value: 0, ndgrValue: 110 },
            '3_イベント累計スコア': { state: 'no_event', value: null }
          }
        }
      }
    };
    const m = buildStatusMindmapModel({ fastDiag });
    expect(find(m, '1_貢献度ランキング').badge).toBe('warn'); // ok だが空
    expect(find(m, '4_番組累計ポイント').badge).toBe('ok');    // ndgr=110
    expect(find(m, '3_イベント累計スコア').badge).toBe('info'); // 対象外
  });

  it('backfill: reached_start は ok', () => {
    const fastDiag = { content: { romiDebug: { backfill: { stopReason: 'reached_start', done: 1, rows: 24, seg: 3 } } } };
    const m = buildStatusMindmapModel({ fastDiag });
    const bf = find(m, '過去ログ取得(backfill)');
    expect(bf.badge).toBe('ok');
    expect(find(bf, '停止理由').value).toBe('reached_start');
  });

  it('popup 診断あり: 北極星描画が開始>0/完了0 は bad(詰まり)', () => {
    const popupDiag = {
      persistedAt: '2026-06-18T00:00:00.000Z',
      popup: {
        avatarLoadDiag: { ok: 1, failed: 3 },
        northStarRenderProbe: { refreshAllStarted: 2, refreshAllCompleted: 0, lastError: 'boom' }
      }
    };
    const m = buildStatusMindmapModel({ popupDiag });
    const pop = find(m, 'popup 固有診断(AI診断コピー由来)');
    expect(find(pop, '取得時刻').value).toBe('2026-06-18T00:00:00.000Z');
    expect(find(pop, '応援レーン描画経路').badge).toBe('bad');
    expect(find(pop, 'アバター読み込み').value).toContain('failed');
  });
});
