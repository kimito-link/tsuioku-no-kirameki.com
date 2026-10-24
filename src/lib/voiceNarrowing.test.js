import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  isVoiceNarrowActive,
  isWeakVoicePc,
  narrowVoiceStyleIds,
  normalizeVoiceNarrowMode,
  prepareVoiceStyleIds,
  rememberWeakVoicePc,
  VOICE_NARROW_STYLE_IDS
} from './voiceNarrowing.js';
import { assignVoiceForUser } from './voiceAssignment.js';
import { initializeVoicevoxSpeaker } from './voicevoxClient.js';

describe('isWeakVoicePc', () => {
  it('まだ測れていなければ弱いとみなさない(今のまま)', () => {
    expect(isWeakVoicePc({ warmSynthEmaMs: -1, coldSynthMaxMs: 0 })).toBe(false);
    expect(isWeakVoicePc({})).toBe(false);
  });
  it('自宅PC(150ms)は弱くない・ノートPC(700ms/初回7.7秒)は弱い', () => {
    expect(isWeakVoicePc({ warmSynthEmaMs: 150, coldSynthMaxMs: 900 })).toBe(false);
    expect(isWeakVoicePc({ warmSynthEmaMs: 700 })).toBe(true);
    expect(isWeakVoicePc({ warmSynthEmaMs: 300, coldSynthMaxMs: 7700 })).toBe(true);
  });
});

describe('narrowVoiceStyleIds', () => {
  const engine = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 20, 21, 23, 29, 42, 46, 47];

  it('速いPCは今の割り当てのまま(エンジンの全スタイル)', () => {
    expect(narrowVoiceStyleIds(engine, false)).toEqual(engine);
  });

  it('弱いPCは固定表の声だけ・表の順番のまま', () => {
    expect(narrowVoiceStyleIds(engine, true)).toEqual([...VOICE_NARROW_STYLE_IDS]);
  });

  it('★エンジンに声が増えても、絞った人の声は変わらない(版をまたいで固定)', () => {
    const more = [...engine, 50, 51, 52, 60, 61, 70];
    for (const user of ['a:anon1', '12345678', 'u:99', 'りんく']) {
      expect(assignVoiceForUser(user, narrowVoiceStyleIds(more, true)))
        .toEqual(assignVoiceForUser(user, narrowVoiceStyleIds(engine, true)));
    }
  });

  it('固定表の声が2つ未満しか無いエンジンでは絞らない', () => {
    expect(narrowVoiceStyleIds([3, 50, 51], true)).toEqual([3, 50, 51]);
  });

  it('固定表は変えない(変えると絞った人全員の声が変わる)', () => {
    expect(VOICE_NARROW_STYLE_IDS).toEqual([3, 2, 8, 10, 13, 14]);
    expect(Object.isFrozen(VOICE_NARROW_STYLE_IDS)).toBe(true);
  });
});

describe('initializeVoicevoxSpeaker', () => {
  it('/initialize_speaker を skip_reinit 付きで POST し、失敗しても投げない', async () => {
    const calls = [];
    const ok = await initializeVoicevoxSpeaker(8, {
      fetchFn: async (url, init) => { calls.push([url, init.method]); return { ok: true }; }
    });
    expect(ok).toBe(true);
    expect(calls).toEqual([['http://127.0.0.1:50021/initialize_speaker?speaker=8&skip_reinit=true', 'POST']]);
    expect(await initializeVoicevoxSpeaker(8, { fetchFn: async () => { throw new Error('down'); } })).toBe(false);
    expect(await initializeVoicevoxSpeaker(-1, { fetchFn: async () => ({ ok: true }) })).toBe(false);
  });
});

describe('設定(しない/遅いPCと分かったら/いつも)', () => {
  it('既定と壊れた値は「しない」', () => {
    expect(normalizeVoiceNarrowMode(undefined)).toBe('off');
    expect(normalizeVoiceNarrowMode('weird')).toBe('off');
  });
  it('auto は「遅いPC」と記録されたときだけ絞る', () => {
    expect(isVoiceNarrowActive('off', true)).toBe(false);
    expect(isVoiceNarrowActive('auto', false)).toBe(false);
    expect(isVoiceNarrowActive('auto', true)).toBe(true);
    expect(isVoiceNarrowActive('on', false)).toBe(true);
  });
});

describe('prepareVoiceStyleIds', () => {
  const engine = [0, 1, 2, 3, 8, 10, 13, 14, 20];
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('しない: 全部の声のまま・先読みしない', async () => {
    const init = [];
    const r = await prepareVoiceStyleIds(engine, {
      readSettings: async () => ({ mode: 'off', weak: true }),
      initSpeaker: async (id) => { init.push(id); }
    });
    await flush();
    expect(r).toEqual({ styleIds: engine, narrowed: false });
    expect(init).toEqual([]);
  });

  it('遅いPCと記録済みなら固定表に絞り、順番に1つずつ先読みする', async () => {
    const log = [];
    let busy = false;
    const r = await prepareVoiceStyleIds(engine, {
      readSettings: async () => ({ mode: 'auto', weak: true }),
      initSpeaker: async (id) => {
        expect(busy).toBe(false); // 並べて投げない
        busy = true;
        await flush();
        log.push(id);
        busy = false;
      }
    });
    expect(r.styleIds).toEqual([3, 2, 8, 10, 13, 14]);
    expect(r.narrowed).toBe(true);
    for (let i = 0; i < 20; i++) await flush();
    expect(log).toEqual([3, 2, 8, 10, 13, 14]);
  });

  it('設定が読めない・先読みが失敗しても、全部の声で続ける', async () => {
    const r = await prepareVoiceStyleIds(engine, { readSettings: async () => { throw new Error('x'); } });
    expect(r.styleIds).toEqual(engine);
    const r2 = await prepareVoiceStyleIds(engine, {
      readSettings: async () => ({ mode: 'on' }),
      initSpeaker: async () => { throw new Error('down'); }
    });
    await flush();
    expect(r2.narrowed).toBe(true);
  });
});

describe('rememberWeakVoicePc', () => {
  it('遅いと分かったら1回だけ書く・速いPCでは書かない', async () => {
    const writes = [];
    const state = { saved: false };
    rememberWeakVoicePc({ warmSynthEmaMs: 150 }, state, () => writes.push(1));
    rememberWeakVoicePc({ warmSynthEmaMs: 700 }, state, () => writes.push(2));
    rememberWeakVoicePc({ warmSynthEmaMs: 900 }, state, () => writes.push(3));
    await new Promise((r) => setTimeout(r, 0));
    expect(writes).toEqual([2]);
  });
  it('書き込みが失敗しても投げない', async () => {
    expect(() => rememberWeakVoicePc({ coldSynthMaxMs: 8000 }, { saved: false }, async () => { throw new Error('x'); })).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe('配線(会場・コメビュ・ポップアップ)', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const read = (...p) => readFileSync(join(HERE, ...p), 'utf8');
  const vp = read('voicePlayer.js');
  const vb = read('..', 'extension', 'venueBar.js');
  const cv = read('..', 'extension', 'comeview-entry.js');
  const pe = read('..', 'extension', 'popup-entry.js');
  const html = read('..', '..', 'extension', 'popup.html');

  it('会場とコメビュの両方が、読み上げ ON のときに同じ判定で声を決め、遅いPCを記録する', () => {
    for (const src of [vp, cv]) {
      expect(src).toMatch(/prepareVoiceStyleIds\(/);
      expect(src).toMatch(/rememberWeakVoicePc\(/);
    }
    expect(vb).toMatch(/initVoiceSpeaker:\s*\(/);
    expect(cv).toMatch(/initSpeaker:\s*\(id\)\s*=>\s*initializeVoicevoxSpeaker\(id\)/);
  });

  it('ポップアップの設定は既定「しない」で、詳細設定の中にある(スマホでは隠れる)', () => {
    expect(pe).toMatch(/wireVoiceNarrowSelect\(document/);
    const at = html.indexOf('id="voiceNarrowSelect"');
    expect(at).toBeGreaterThan(html.indexOf('id="nlPopupSettings"'));
    expect(html.indexOf('<option value="off">', at)).toBeLessThan(html.indexOf('<option value="auto">', at));
  });
});
