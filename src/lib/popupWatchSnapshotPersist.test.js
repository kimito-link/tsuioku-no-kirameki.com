/**
 * popupWatchSnapshotPersist のテスト。
 *
 * 0.1.94 race fix:
 *   popup-entry.js#refresh() の watchMeta fetch 完了直後に
 *   `if (!isFreshRefresh()) return;` で bail-out していたが、その時点で
 *   snapshot のマージが捨てられていた。INLINE モード（10s polling）×
 *   slow fetch（最大 ~11s）で 1st refresh の結果が常に bail-out で消され、
 *   永久に「接続中…」固定になる race が発生。
 *
 *   この helper は "snapshot は generation を超える永続キャッシュ" として
 *   merge 操作を独立化し、isFreshRefresh() より先に呼べるようにする。
 *   関数自体は generation を一切知らない。fetched が null なら現状維持、
 *   非 null なら merge して返す、というだけの薄い純関数。
 */

import { describe, it, expect, vi } from 'vitest';
import { persistFreshlyFetchedSnapshot } from './popupWatchSnapshotPersist.js';

describe('persistFreshlyFetchedSnapshot', () => {
  it('fetchedSnapshot=null なら currentSnapshot をそのまま返し、merge は呼ばれない', () => {
    const merge = vi.fn();
    const current = { liveId: 'lv1', viewerCountFromDom: 100 };
    const result = persistFreshlyFetchedSnapshot({
      currentSnapshot: current,
      fetchedSnapshot: null,
      merge
    });
    expect(result).toBe(current);
    expect(merge).not.toHaveBeenCalled();
  });

  it('fetchedSnapshot=null かつ currentSnapshot=null なら null を返す', () => {
    const merge = vi.fn();
    const result = persistFreshlyFetchedSnapshot({
      currentSnapshot: null,
      fetchedSnapshot: null,
      merge
    });
    expect(result).toBeNull();
    expect(merge).not.toHaveBeenCalled();
  });

  it('fetchedSnapshot が有効・currentSnapshot=null なら merge(null, fetched) を呼んで返す', () => {
    const fetched = { liveId: 'lv2', viewerCountFromDom: 50 };
    const merge = vi.fn((prev, next) => ({ ...next, _merged: true }));
    const result = persistFreshlyFetchedSnapshot({
      currentSnapshot: null,
      fetchedSnapshot: fetched,
      merge
    });
    expect(merge).toHaveBeenCalledWith(null, fetched);
    expect(result).toEqual({ liveId: 'lv2', viewerCountFromDom: 50, _merged: true });
  });

  it('fetchedSnapshot が有効・currentSnapshot も有効なら merge(prev, fetched) を呼ぶ', () => {
    const current = { liveId: 'lv3', broadcasterName: 'old', viewerCountFromDom: 10 };
    const fetched = { liveId: 'lv3', broadcasterName: 'new', viewerCountFromDom: 20 };
    const merge = vi.fn((prev, next) => ({ ...prev, ...next }));
    const result = persistFreshlyFetchedSnapshot({
      currentSnapshot: current,
      fetchedSnapshot: fetched,
      merge
    });
    expect(merge).toHaveBeenCalledWith(current, fetched);
    expect(result).toEqual({
      liveId: 'lv3',
      broadcasterName: 'new',
      viewerCountFromDom: 20
    });
  });

  it('merge が null を返した場合はそのまま null を返す（merge 関数の判断を尊重）', () => {
    const merge = vi.fn(() => null);
    const result = persistFreshlyFetchedSnapshot({
      currentSnapshot: { liveId: 'old' },
      fetchedSnapshot: { liveId: 'new' },
      merge
    });
    expect(result).toBeNull();
  });

  it('純関数: 同じ入力なら何度呼んでも結果が同じ・副作用なし', () => {
    const current = { liveId: 'lv4', viewerCountFromDom: 5 };
    const fetched = { liveId: 'lv4', viewerCountFromDom: 7 };
    const merge = (prev, next) => ({ ...prev, ...next });

    const r1 = persistFreshlyFetchedSnapshot({
      currentSnapshot: current,
      fetchedSnapshot: fetched,
      merge
    });
    const r2 = persistFreshlyFetchedSnapshot({
      currentSnapshot: current,
      fetchedSnapshot: fetched,
      merge
    });
    expect(r1).toEqual(r2);
    // 入力は変更されない
    expect(current).toEqual({ liveId: 'lv4', viewerCountFromDom: 5 });
    expect(fetched).toEqual({ liveId: 'lv4', viewerCountFromDom: 7 });
  });

  it('race 想定: generation を一切知らない（"isFresh" の概念がない）', () => {
    // この helper の重要な設計: 外部の generation/freshness state に依存しない。
    // race condition 中（古い世代の refresh）でも、fetch 結果は捨てずに
    // cache へ persist するのが本 helper の責務。
    //
    // この性質は API シグネチャと「呼び出しに isFresh フラグが無い」事実で担保される。
    // ここでは regression check として「2 回連続呼び出しで両方 merge される」を確認。
    const merge = vi.fn((prev, next) => ({ ...prev, ...next }));

    const r1 = persistFreshlyFetchedSnapshot({
      currentSnapshot: null,
      fetchedSnapshot: { liveId: 'lvA', vc: 1 },
      merge
    });
    expect(merge).toHaveBeenCalledTimes(1);

    const r2 = persistFreshlyFetchedSnapshot({
      currentSnapshot: r1,
      fetchedSnapshot: { liveId: 'lvA', vc: 2 },
      merge
    });
    expect(merge).toHaveBeenCalledTimes(2);
    expect(r2).toEqual({ liveId: 'lvA', vc: 2 });
  });
});
