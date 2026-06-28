import { describe, it, expect } from 'vitest';
import { KEY_PREVIEW_RENDER_ACK, buildPreviewRenderAck } from './previewRenderAckKey.js';

describe('previewRenderAckKey', () => {
  it('キーは固定値', () => {
    expect(KEY_PREVIEW_RENDER_ACK).toBe('nls_preview_render_ack_v1');
  });
  it('ready/ts/liveId を正規化', () => {
    expect(buildPreviewRenderAck({ ready: true, liveId: 'LV123', nowMs: 5000 })).toEqual({
      ready: true, ts: 5000, liveId: 'lv123'
    });
  });
  it('未指定は安全な既定(ready:false/ts:0/liveId:空)', () => {
    expect(buildPreviewRenderAck()).toEqual({ ready: false, ts: 0, liveId: '' });
    expect(buildPreviewRenderAck({ ready: 'yes' })).toEqual({ ready: false, ts: 0, liveId: '' });
  });
});
