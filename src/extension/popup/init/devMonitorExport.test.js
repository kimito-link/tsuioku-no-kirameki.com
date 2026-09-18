/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCalibrationData,
  downloadCalibrationData,
  downloadMcpSnapshotJson,
  wireDevMonitorExport
} from './devMonitorExport.js';

/**
 * ★refactor Phase 4 Track B の 4-2(開発モニタのエクスポート/DL)の回帰。
 *
 * 抽出前は popup-entry 内の私有関数で呼べず、テストが無かった。
 * 切り出したことで「データが無ければ DL しない」「消去で storage.set が呼ばれる」
 * 「ボタンが無くても落ちない」「busy 中は session summary を DL しない」を固定できる。
 */

const revoke = () => ({ enqueue: vi.fn() });

beforeEach(() => {
  globalThis.chrome = {
    storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
    downloads: { download: vi.fn(async () => 1) }
  };
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
  document.body.innerHTML = '';
});

afterEach(() => vi.restoreAllMocks());

describe('downloadMcpSnapshotJson', () => {
  it('★snapshot が無ければ downloads.download を呼ばない', async () => {
    chrome.storage.local.get = vi.fn(async () => ({}));
    await downloadMcpSnapshotJson(revoke());
    expect(chrome.downloads.download).not.toHaveBeenCalled();
  });

  it('★snapshot があれば nicolivelog-mcp/<lid>.json を保存し url を revoke する', async () => {
    const q = revoke();
    chrome.storage.local.get = vi.fn(async () => ({
      nls_mcp_live_latest_v1: { liveId: 'lv999', snapshot: { a: 1 } }
    }));
    await downloadMcpSnapshotJson(q);
    expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
    const arg = chrome.downloads.download.mock.calls[0][0];
    expect(arg.filename).toBe('nicolivelog-mcp/lv999.json');
    expect(q.enqueue).toHaveBeenCalledWith('blob:x');
  });
});

describe('downloadCalibrationData', () => {
  it('★較正データが空なら DL しない', async () => {
    chrome.storage.local.get = vi.fn(async () => ({}));
    await downloadCalibrationData('json', revoke());
    expect(chrome.downloads.download).not.toHaveBeenCalled();
  });
});

describe('clearCalibrationData', () => {
  it('★リングを空にする storage.set を呼ぶ', async () => {
    await clearCalibrationData();
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      nls_concurrent_calibration_ring_v1: { v: 1, items: [] }
    });
  });
});

describe('wireDevMonitorExport', () => {
  const makeDom = () => {
    const els = new Map();
    const mk = (id) => {
      const el = document.createElement('button');
      el.id = id;
      els.set(id, el);
      return el;
    };
    return { mk, getEl: (id) => els.get(id) || null };
  };

  it('★対象ボタンが無くても落ちない', () => {
    const dom = makeDom();
    expect(() =>
      wireDevMonitorExport({
        getEl: dom.getEl,
        objectUrlRevokeQueue: revoke(),
        refreshAutopatrolStatusLine: () => {},
        getExportLiveId: () => '',
        isExportBusy: () => false
      })
    ).not.toThrow();
  });

  it('★較正クリアボタンで確認OKなら clear と状態行更新が走る', async () => {
    const dom = makeDom();
    const clearBtn = dom.mk('calibrationClearBtn');
    const refresh = vi.fn();
    vi.stubGlobal('confirm', () => true);
    window.confirm = () => true;
    wireDevMonitorExport({
      getEl: dom.getEl,
      objectUrlRevokeQueue: revoke(),
      refreshAutopatrolStatusLine: refresh,
      getExportLiveId: () => '',
      isExportBusy: () => false
    });
    clearBtn.dispatchEvent(new Event('click'));
    await Promise.resolve();
    await Promise.resolve();
    expect(chrome.storage.local.set).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it('★session summary は liveId が空だと DL しない', async () => {
    const dom = makeDom();
    const btn = dom.mk('exportSessionSummaryJsonBtn');
    wireDevMonitorExport({
      getEl: dom.getEl,
      objectUrlRevokeQueue: revoke(),
      refreshAutopatrolStatusLine: () => {},
      getExportLiveId: () => '',
      isExportBusy: () => false
    });
    btn.dispatchEvent(new Event('click'));
    await Promise.resolve();
    expect(chrome.downloads.download).not.toHaveBeenCalled();
  });
});
