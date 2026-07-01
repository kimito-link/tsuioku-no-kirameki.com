import { describe, it, expect } from 'vitest';
import { KEY_PREVIEW_RENDER_ACK, buildPreviewRenderAck } from './previewRenderAckKey.js';

describe('previewRenderAckKey', () => {
  it('キーは固定値', () => {
    expect(KEY_PREVIEW_RENDER_ACK).toBe('nls_preview_render_ack_v1');
  });
  it('ready/ts/liveId を正規化(件数は既定0)', () => {
    expect(buildPreviewRenderAck({ ready: true, liveId: 'LV123', nowMs: 5000 })).toEqual({
      ready: true, ts: 5000, liveId: 'lv123', laneTiles: 0, supporterRows: 0
    });
  });
  it('未指定は安全な既定(ready:false/ts:0/liveId:空/件数0)', () => {
    expect(buildPreviewRenderAck()).toEqual({ ready: false, ts: 0, liveId: '', laneTiles: 0, supporterRows: 0 });
    expect(buildPreviewRenderAck({ ready: 'yes' })).toEqual({ ready: false, ts: 0, liveId: '', laneTiles: 0, supporterRows: 0 });
  });
  it('v0.1.1025: laneTiles/supporterRows(②の実描画件数)を正規化', () => {
    expect(buildPreviewRenderAck({ ready: true, laneTiles: 48, supporterRows: 10 })).toMatchObject({
      laneTiles: 48, supporterRows: 10
    });
    // 負値・非数は 0 に丸める。
    expect(buildPreviewRenderAck({ laneTiles: -5, supporterRows: 'x' })).toMatchObject({
      laneTiles: 0, supporterRows: 0
    });
  });
});
