import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createPhoneNative } from '../../app/live-view-native.js';
import { createDemoSource } from '../../app/live-view-demo.js';

const liveView = readFileSync(new URL('../../app/live-view.js', import.meta.url), 'utf8');
const voice = readFileSync(new URL('../../app/live-view-voice.js', import.meta.url), 'utf8');

const gift = (at, point = 100) => ({ kind: 'gift', at, name: 'そら', itemName: '花火', point, userId: 'a:x' });

function fakeCap() {
  const LocalNotifications = {
    checkPermissions: vi.fn(async () => ({ display: 'prompt' })),
    requestPermissions: vi.fn(async () => ({ display: 'granted' })),
    schedule: vi.fn(async () => ({}))
  };
  const Haptics = { impact: vi.fn(async () => {}) };
  const Share = { share: vi.fn(async () => {}) };
  return { cap: { isNativePlatform: () => true, Plugins: { LocalNotifications, Haptics, Share } }, LocalNotifications, Haptics, Share };
}

describe('iPhone アプリだけの機能(live-view-native.js)', () => {
  it('★アプリの外(Capacitor が無い)では何もしない', async () => {
    const n = createPhoneNative({ cap: null });
    expect(n.isNative()).toBe(false);
    expect(await n.toggle()).toBe(false);
    expect(n.onRows([gift(1)])).toBe(0);
    expect(n.keepAliveInBackground()).toBe(false);
  });

  it('★ON にするときに許可を聞く。画面を閉じている間は通知、見ている間は振動', async () => {
    const f = fakeCap();
    let hidden = false;
    const n = createPhoneNative({ cap: f.cap, isHidden: () => hidden });
    expect(await n.toggle()).toBe(true);
    expect(f.LocalNotifications.requestPermissions).toHaveBeenCalledTimes(1);
    n.onRows([gift(1)]); // 最初の分は覚えるだけ
    expect(f.Haptics.impact).not.toHaveBeenCalled();
    n.onRows([gift(1), gift(2)]);
    expect(f.Haptics.impact).toHaveBeenCalledTimes(1);
    hidden = true;
    n.onRows([gift(1), gift(2), gift(3, 500)]);
    expect(f.LocalNotifications.schedule).toHaveBeenCalledTimes(1);
    expect(f.LocalNotifications.schedule.mock.calls[0][0].notifications[0].body).toBe('そら さんから 花火(500pt)');
  });

  it('許可を断られたら OFF のまま。OFF の間は知らせない', async () => {
    const f = fakeCap();
    f.LocalNotifications.requestPermissions.mockResolvedValueOnce({ display: 'denied' });
    const n = createPhoneNative({ cap: f.cap, isHidden: () => true });
    expect(await n.toggle()).toBe(false);
    n.onRows([gift(1)]);
    n.onRows([gift(1), gift(2)]);
    expect(f.LocalNotifications.schedule).not.toHaveBeenCalled();
  });

  it('★読み上げが ON の間だけ、画面を閉じても取りに行き続ける', () => {
    const f = fakeCap();
    let on = false;
    const n = createPhoneNative({ cap: f.cap, voiceOn: () => on });
    expect(n.keepAliveInBackground()).toBe(false);
    on = true;
    expect(n.keepAliveInBackground()).toBe(true);
  });

  it('配線: 鏡の行を通知の係へ渡し、裏でも止めない判定を読み上げ・ポーリング・新着の3つに使う', () => {
    expect(liveView).toContain('_native.onRows(restoreCommentTimelineRows(jsonBlob.commentTimelineMirror || null));');
    expect(liveView).toContain("_voice = createPhoneVoice({ token, keepWhenHidden: () => _native.keepAliveInBackground()");
    expect(liveView).toContain('if (isPausedInBackground()) return;');
    expect(liveView).toContain('isHidden: isPausedInBackground }).start();');
    expect(voice).toContain("document.hidden && !keepWhenHidden()");
  });
});

describe('デモの配線(live-view-demo.js)', () => {
  it('★デモではサーバーに取りに行かない(見本と声のファイルだけ)', async () => {
    const urls = [];
    const fetchImpl = vi.fn(async (u) => {
      urls.push(u);
      if (u === '/app/demo/snapshot.json') return { ok: true, json: async () => ({ lives: [{ lv: 'lv1' }] }) };
      if (u === '/app/demo/voice/index.json') return { ok: true, json: async () => [{ file: 'a.ogg' }] };
      return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    });
    let t = 0;
    const d = createDemoSource({ fetchImpl, now: () => t });
    const snap = await d.snapshot();
    expect(snap.lives[0].lv).toBe('lv900000000001');
    const first = await (await d.voiceFetch()).json();
    expect(first.clips).toEqual([]); // 最初は覚えるだけ
    t = 10_000;
    const next = await (await d.voiceFetch()).json();
    expect(next.clips).toEqual([{ no: '1', ogg: 'AQID' }]);
    expect(urls.every((u) => u.startsWith('/app/demo/'))).toBe(true);
    expect(liveView).toContain('if (_demo) return applyPhoneBlocklist(await _demo.snapshot(), readBlocklist());');
    expect(liveView).toContain('if (!_demo) createPhoneRealtime(');
  });
});
