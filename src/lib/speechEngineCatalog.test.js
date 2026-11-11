import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICE_ENGINE_RETRY_MS } from './voicePlayer.js';
import {
  SPEECH_ENGINE_RETRY_MS,
  SPEECH_ENGINES,
  isAllowedSpeechFetchUrl,
  normalizeSpeechEngineFallback,
  normalizeSpeechEngineId,
  speechEngineAllowsGpuProbe,
  speechEngineHostPermissions,
  stableStyleToken
} from './speechEngineCatalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('speechEngineCatalog', () => {
  it('再接続の間隔は会場の読み上げと同じ', () => {
    expect(SPEECH_ENGINE_RETRY_MS).toBe(VOICE_ENGINE_RETRY_MS);
    expect(SPEECH_ENGINE_RETRY_MS).toBe(8000);
  });

  it('未知の選択は VOICEVOX、代わりは未保存なら PC の声', () => {
    expect(normalizeSpeechEngineId('aivis')).toBe('aivis');
    expect(normalizeSpeechEngineId('nope')).toBe('voicevox');
    expect(normalizeSpeechEngineFallback(undefined)).toBe('os');
    expect(normalizeSpeechEngineFallback('off')).toBe('off');
  });

  it('GPU を調べるのは VOICEVOX だけ', () => {
    expect(speechEngineAllowsGpuProbe('voicevox')).toBe(true);
    for (const engine of SPEECH_ENGINES) {
      if (engine.id !== 'voicevox') expect(speechEngineAllowsGpuProbe(engine.id)).toBe(false);
    }
  });

  it('ホスト権限はカタログのポートだけを 127.0.0.1 に出す', () => {
    const hosts = speechEngineHostPermissions();
    expect(hosts).toEqual([
      'http://127.0.0.1:50021/*',
      'http://127.0.0.1:10101/*',
      'http://127.0.0.1:50032/*',
      'http://127.0.0.1:50080/*',
      'http://127.0.0.1:11900/*'
    ]);
    expect(isAllowedSpeechFetchUrl('http://127.0.0.1:50080/Talk')).toBe(true);
    expect(isAllowedSpeechFetchUrl('http://127.0.0.1:8080/api')).toBe(false);
    expect(isAllowedSpeechFetchUrl('http://localhost:50021/version')).toBe(false);
    expect(isAllowedSpeechFetchUrl('https://127.0.0.1:50021/version')).toBe(false);
  });

  it('manifest と service worker と提出フィルタが同じポートを残す', () => {
    const manifest = readFileSync(join(root, 'extension', 'manifest.json'), 'utf8');
    const background = readFileSync(join(root, 'extension', 'background.js'), 'utf8');
    const stagePy = readFileSync(join(root, 'scripts', 'stage-submission.py'), 'utf8');
    const stageMjs = readFileSync(join(root, 'scripts', 'stage-youtube-submission.mjs'), 'utf8');
    for (const host of speechEngineHostPermissions()) {
      expect(manifest).toContain(host);
    }
    for (const engine of SPEECH_ENGINES) {
      if (!engine.port) continue;
      const port = String(engine.port);
      expect(background).toContain(port);
      expect(stagePy).toContain(`:${port}`);
      expect(stageMjs).toContain(`:${port}`);
    }
  });

  it('声の印は同じキーなら同じ整数', () => {
    expect(stableStyleToken('キャラ/エンジン')).toBe(stableStyleToken('キャラ/エンジン'));
    expect(stableStyleToken('a')).not.toBe(stableStyleToken('b'));
    expect(stableStyleToken('a')).toBeGreaterThan(0);
  });
});
