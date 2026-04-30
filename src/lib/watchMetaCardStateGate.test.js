import { describe, it, expect } from 'vitest';
import { resolveWatchMetaCardState } from './watchMetaCardStateGate.js';

const LOADING = '（接続中…）';
const FETCH_FAILED = '（取得不可）';
const DATA_MISSING = '（数字非公開）';
const PRE_MEASUREMENT = '計測中…';

describe('resolveWatchMetaCardState - loading 状態（snapshot 取得中）', () => {
  it('snapshot=null + inflight=true → loading', () => {
    const r = resolveWatchMetaCardState({
      snapshot: null,
      snapshotFetchInflight: true,
      snapshotFetchError: ''
    });
    expect(r.state).toBe('loading');
    expect(r.viewerLabel).toBe(LOADING);
    expect(r.concurrentLabel).toBe(LOADING);
    expect(r.shouldUseSnapshotForViewer).toBe(false);
    expect(r.shouldUseSnapshotForConcurrent).toBe(false);
  });

  it('snapshot=undefined + inflight=true → loading', () => {
    const r = resolveWatchMetaCardState({
      snapshot: undefined,
      snapshotFetchInflight: true
    });
    expect(r.state).toBe('loading');
    expect(r.viewerLabel).toBe(LOADING);
    expect(r.concurrentLabel).toBe(LOADING);
  });

  it('inflight が true なら error が紛れていても loading を優先', () => {
    const r = resolveWatchMetaCardState({
      snapshot: null,
      snapshotFetchInflight: true,
      snapshotFetchError: 'transient'
    });
    expect(r.state).toBe('loading');
    expect(r.viewerLabel).toBe(LOADING);
  });
});

describe('resolveWatchMetaCardState - fetch_failed 状態（snapshot 取得失敗）', () => {
  it('snapshot=null + inflight=false → fetch_failed', () => {
    const r = resolveWatchMetaCardState({
      snapshot: null,
      snapshotFetchInflight: false,
      snapshotFetchError: 'watch タブが見つからない'
    });
    expect(r.state).toBe('fetch_failed');
    expect(r.viewerLabel).toBe(FETCH_FAILED);
    expect(r.concurrentLabel).toBe(FETCH_FAILED);
    expect(r.shouldUseSnapshotForViewer).toBe(false);
    expect(r.shouldUseSnapshotForConcurrent).toBe(false);
  });

  it('snapshot=null + inflight 未指定 → fetch_failed', () => {
    const r = resolveWatchMetaCardState({ snapshot: null });
    expect(r.state).toBe('fetch_failed');
    expect(r.viewerLabel).toBe(FETCH_FAILED);
    expect(r.concurrentLabel).toBe(FETCH_FAILED);
  });

  it('snapshot=null + inflight=false + error="" → fetch_failed', () => {
    const r = resolveWatchMetaCardState({
      snapshot: null,
      snapshotFetchInflight: false,
      snapshotFetchError: ''
    });
    expect(r.state).toBe('fetch_failed');
  });
});

describe('resolveWatchMetaCardState - ok 状態（来場者・同接ともに表示可能）', () => {
  it('vc 数値 + showConcurrent → ok（両方 snapshot 由来）', () => {
    const r = resolveWatchMetaCardState({
      snapshot: {
        viewerCountFromDom: 1234,
        recentActiveUsers: 5,
        liveId: 'lv1'
      },
      snapshotFetchInflight: false
    });
    expect(r.state).toBe('ok');
    expect(r.viewerLabel).toBe('');
    expect(r.concurrentLabel).toBe('');
    expect(r.shouldUseSnapshotForViewer).toBe(true);
    expect(r.shouldUseSnapshotForConcurrent).toBe(true);
  });

  it('vc=0 でも snapshot 由来扱い（公式 0 人公開ケース）', () => {
    const r = resolveWatchMetaCardState({
      snapshot: {
        viewerCountFromDom: 0,
        recentActiveUsers: 0,
        liveId: 'lv1'
      }
    });
    // vc=0 でも数値として扱う（来場者は 0 人と表示）
    expect(r.shouldUseSnapshotForViewer).toBe(true);
    // recentActive=0 / official 無し / vc=0 でも showConcurrent は true（vc>=0 で）
    expect(r.shouldUseSnapshotForConcurrent).toBe(true);
    expect(r.state).toBe('ok');
  });

  it('officialViewerCount があれば showConcurrent=true で ok', () => {
    const r = resolveWatchMetaCardState({
      snapshot: {
        viewerCountFromDom: 500,
        officialViewerCount: 480,
        recentActiveUsers: 0,
        liveId: 'lv1'
      }
    });
    expect(r.state).toBe('ok');
    expect(r.shouldUseSnapshotForConcurrent).toBe(true);
  });
});

describe('resolveWatchMetaCardState - data_missing 状態（snapshot は取れたが viewer count だけ無い）', () => {
  it('vc=null + recentActiveUsers>0（同接は推定可能） → data_missing', () => {
    const r = resolveWatchMetaCardState({
      snapshot: {
        viewerCountFromDom: null,
        recentActiveUsers: 12,
        liveId: 'lv1'
      }
    });
    expect(r.state).toBe('data_missing');
    expect(r.viewerLabel).toBe(DATA_MISSING);
    expect(r.shouldUseSnapshotForViewer).toBe(false);
    // 同接側は推定値が出るので snapshot 経路に任せる
    expect(r.concurrentLabel).toBe('');
    expect(r.shouldUseSnapshotForConcurrent).toBe(true);
  });

  it('vc=null + officialViewerCount あり → data_missing（同接は出せる）', () => {
    const r = resolveWatchMetaCardState({
      snapshot: {
        viewerCountFromDom: null,
        officialViewerCount: 320,
        recentActiveUsers: 0,
        liveId: 'lv1'
      }
    });
    expect(r.state).toBe('data_missing');
    expect(r.viewerLabel).toBe(DATA_MISSING);
    expect(r.shouldUseSnapshotForConcurrent).toBe(true);
  });

  it('vc=undefined（プロパティ自体無い） + recentActive>0 → data_missing', () => {
    const r = resolveWatchMetaCardState({
      snapshot: {
        recentActiveUsers: 8,
        liveId: 'lv1'
      }
    });
    expect(r.state).toBe('data_missing');
    expect(r.viewerLabel).toBe(DATA_MISSING);
  });
});

describe('resolveWatchMetaCardState - pre_measurement 状態（計測ウィンドウ未到達）', () => {
  it('vc=null + recentActive=0 + official 無し + liveId 無し → pre_measurement（両方 計測中…）', () => {
    const r = resolveWatchMetaCardState({
      snapshot: {
        viewerCountFromDom: null,
        recentActiveUsers: 0,
        liveId: ''
      }
    });
    expect(r.state).toBe('pre_measurement');
    expect(r.viewerLabel).toBe(PRE_MEASUREMENT);
    expect(r.concurrentLabel).toBe(PRE_MEASUREMENT);
    expect(r.shouldUseSnapshotForViewer).toBe(false);
    expect(r.shouldUseSnapshotForConcurrent).toBe(false);
  });

  it('vc あり + recentActive=0 + official 無し + liveId 空 → vc は数値表示・concurrent は計測中', () => {
    const r = resolveWatchMetaCardState({
      snapshot: {
        viewerCountFromDom: 200,
        recentActiveUsers: 0,
        liveId: ''
      }
    });
    // vc>=0 で showConcurrent=true なので実は ok
    expect(r.state).toBe('ok');
    expect(r.shouldUseSnapshotForConcurrent).toBe(true);
  });

  it('vc=null + recentActive=0 + officialなし + liveId空 → 来場者も同接も pre_measurement', () => {
    const r = resolveWatchMetaCardState({
      snapshot: {
        viewerCountFromDom: null,
        recentActiveUsers: 0,
        liveId: ''
      }
    });
    expect(r.state).toBe('pre_measurement');
    expect(r.viewerLabel).toBe(PRE_MEASUREMENT);
    expect(r.concurrentLabel).toBe(PRE_MEASUREMENT);
  });
});

describe('resolveWatchMetaCardState - 引数耐性', () => {
  it('引数なし → fetch_failed（既定の安全側）', () => {
    const r = resolveWatchMetaCardState({});
    expect(r.state).toBe('fetch_failed');
    expect(r.viewerLabel).toBe(FETCH_FAILED);
    expect(r.concurrentLabel).toBe(FETCH_FAILED);
  });

  it('null 引数自体 → fetch_failed', () => {
    const r = resolveWatchMetaCardState(null);
    expect(r.state).toBe('fetch_failed');
  });

  it('undefined 引数自体 → fetch_failed', () => {
    const r = resolveWatchMetaCardState(undefined);
    expect(r.state).toBe('fetch_failed');
  });

  it('snapshot が文字列など想定外型 → fetch_failed として扱う（防御的）', () => {
    const r = resolveWatchMetaCardState({
      snapshot: /** @type {any} */ ('garbage'),
      snapshotFetchInflight: false
    });
    expect(r.state).toBe('fetch_failed');
  });

  it('viewerCountFromDom が NaN/負/無限 → null 扱い', () => {
    for (const bad of [NaN, -1, Infinity, -Infinity]) {
      const r = resolveWatchMetaCardState({
        snapshot: {
          viewerCountFromDom: bad,
          recentActiveUsers: 5,
          liveId: 'lv1'
        }
      });
      expect(r.state).toBe('data_missing');
      expect(r.viewerLabel).toBe(DATA_MISSING);
    }
  });

  it('recentActiveUsers が文字列 → 0 扱い', () => {
    const r = resolveWatchMetaCardState({
      snapshot: {
        viewerCountFromDom: null,
        recentActiveUsers: /** @type {any} */ ('5'),
        liveId: ''
      }
    });
    // recentActive が数値で来ない・liveId 空・他も空 → pre_measurement
    expect(r.state).toBe('pre_measurement');
  });
});

describe('resolveWatchMetaCardState - snapshot 由来の concurrent 表示判定', () => {
  it('vc 数値あり / liveId のみ / recentActive=0 / official=null → ok（vc が showConcurrent を true にする）', () => {
    const r = resolveWatchMetaCardState({
      snapshot: {
        viewerCountFromDom: 100,
        recentActiveUsers: 0,
        officialViewerCount: null,
        liveId: 'lv1'
      }
    });
    expect(r.state).toBe('ok');
    expect(r.shouldUseSnapshotForConcurrent).toBe(true);
  });

  it('vc=null + recentActive=0 + official=null + liveId="lv1" → 来場者は pre_measurement / 同接は snapshot 経路（liveIdのみで showConcurrent=true）', () => {
    // showConcurrent は liveId だけでも true になる（popupConcurrentEstimateGate.js の挙動）
    // ただし viewer count が無いので「来場者」の数字は出せない → state=data_missing
    const r = resolveWatchMetaCardState({
      snapshot: {
        viewerCountFromDom: null,
        recentActiveUsers: 0,
        officialViewerCount: null,
        liveId: 'lv1'
      }
    });
    expect(r.state).toBe('data_missing');
    expect(r.viewerLabel).toBe(DATA_MISSING);
    expect(r.shouldUseSnapshotForConcurrent).toBe(true);
  });
});
