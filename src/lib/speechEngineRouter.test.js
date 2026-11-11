import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assignVoiceForUser } from './voiceAssignment.js';
import { resetCoeiroStyleCache } from './coeiroinkClient.js';
import { resetYukariStyleCache } from './yukariClient.js';
import {
  decideSpeechRoute,
  listSpeechEngineStyles,
  probeSpeechEngine,
  probeSpeechEngineGpu,
  synthesizeSpeechEngine
} from './speechEngineRouter.js';

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(80) };
}

describe('speechEngineRouter', () => {
  beforeEach(() => {
    resetCoeiroStyleCache();
    resetYukariStyleCache();
  });

  it('落ちていて代わりが ON なら PC の声。OFF なら黙る', () => {
    expect(decideSpeechRoute({ preferred: 'bouyomi', preferredUp: false, fallback: 'os', osUp: true }))
      .toEqual({ active: 'os', viaFallback: true, down: false });
    expect(decideSpeechRoute({ preferred: 'bouyomi', preferredUp: false, fallback: 'off', osUp: true }))
      .toEqual({ active: 'bouyomi', viaFallback: false, down: true });
    expect(decideSpeechRoute({ preferred: 'aivis', preferredUp: true, fallback: 'os', osUp: false }))
      .toEqual({ active: 'aivis', viaFallback: false, down: false });
    expect(decideSpeechRoute({ preferred: 'mystery', preferredUp: false, fallback: 'off', osUp: true }))
      .toEqual({ active: 'voicevox', viaFallback: false, down: true });
  });

  it('AivisSpeech は 10101 の VOICEVOX 互換。GPU は調べない', async () => {
    const urls = [];
    const fetchFn = async (url) => {
      urls.push(String(url));
      if (String(url).includes('/speakers')) {
        return jsonResponse([{ name: '話者', styles: [{ id: 888753760, name: 'ノーマル' }, { id: 4, name: 'ささやき' }] }]);
      }
      return jsonResponse({ version: '1' });
    };
    await expect(probeSpeechEngine('aivis', { fetchFn })).resolves.toMatchObject({ ok: true });
    expect(urls[0]).toContain('127.0.0.1:10101');
    const ids = await listSpeechEngineStyles('aivis', { fetchFn });
    expect(ids).toEqual([888753760]);
    expect(await probeSpeechEngineGpu('aivis', { fetchFn })).toBeNull();
    expect(urls.some((url) => url.includes('supported_devices'))).toBe(false);
  });

  it('エンジンごとの声の一覧で、同じ人は同じ声になる', async () => {
    const fetchFn = async (url) => {
      const u = String(url);
      if (u.includes(':50032')) return jsonResponse([{ speakerUuid: 'u', styles: [{ styleId: 0, styleName: '普通' }, { styleId: 1, styleName: '喜び' }] }]);
      if (u.includes(':11900')) return jsonResponse(['声A', '声B', '声C']);
      if (u.includes('/speakers')) return jsonResponse([{ styles: [{ id: 2, name: 'のーまる' }, { id: 8, name: 'つよつよ' }] }]);
      return jsonResponse({});
    };
    const speaker = { available: () => true, voices: () => [{ name: 'Kyoko' }, { name: 'Otoya' }], speak: async () => true, cancel: () => {} };
    const bouyomi = await listSpeechEngineStyles('bouyomi');
    const coeiro = await listSpeechEngineStyles('coeiroink', { fetchFn });
    const yukari = await listSpeechEngineStyles('yukari', { fetchFn });
    const os = await listSpeechEngineStyles('os', { speaker });
    const voicevox = await listSpeechEngineStyles('voicevox', { fetchFn });
    for (const ids of [bouyomi, coeiro, yukari, os, voicevox]) {
      expect(ids.length).toBeGreaterThan(1);
      const first = assignVoiceForUser('user-1', ids);
      const again = assignVoiceForUser('user-1', ids);
      expect(again).toEqual(first);
      expect(ids).toContain(first.styleId);
    }
  });

  it('PC の声は再生まで話さない。棒読みちゃんが落ちて代わりが ON なら PC の声', async () => {
    let started = 0;
    const speaker = {
      available: () => true,
      voices: () => [{ name: 'Kyoko' }, { name: 'Otoya' }],
      speak: async (_text, _tone, hooks) => { started += 1; hooks?.onStart?.(); return true; },
      cancel: () => {}
    };
    const down = await probeSpeechEngine('bouyomi', { fetchFn: async () => { throw new Error('refused'); } });
    const osUp = await probeSpeechEngine('os', { speaker });
    const route = decideSpeechRoute({ preferred: 'bouyomi', preferredUp: down.ok, fallback: 'os', osUp: osUp.ok });
    expect(route).toEqual({ active: 'os', viaFallback: true, down: false });
    const handle = await synthesizeSpeechEngine('os', 'やあ', { styleId: 1, pitchOffset: 0, speedOffset: 0 }, { speaker, volumePercent: 50 });
    expect(started).toBe(0);
    expect(handle.delegated).toBe(true);
    await handle.speak({});
    expect(started).toBe(1);
  });

  it('VOICEVOX の GPU 確認は VOICEVOX のときだけ URL を叩く', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ cpu: true, cuda: false }));
    expect(await probeSpeechEngineGpu('bouyomi', { fetchFn })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
