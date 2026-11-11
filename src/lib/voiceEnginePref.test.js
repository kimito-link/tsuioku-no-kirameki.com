import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  normalizeVoiceEnginePref,
  voiceEngineConnectionLines,
  voiceEngineConnectionText,
  voiceEnginePrefOrDefault
} from './voiceEnginePref.js';

const nudge = /速く|おすすめ|動作中|切り替えて/;

describe('voiceEnginePref', () => {
  it('未保存は CPU。gpu 以外は CPU に戻す', () => {
    expect(normalizeVoiceEnginePref(undefined)).toBe(null);
    expect(normalizeVoiceEnginePref('cpu')).toBe('cpu');
    expect(normalizeVoiceEnginePref('gpu')).toBe('gpu');
    expect(voiceEnginePrefOrDefault(null)).toBe('cpu');
    expect(voiceEnginePrefOrDefault('nope')).toBe('cpu');
  });

  it('希望と実際が CPU で一致したら CPU で接続中。注記は付けない', () => {
    const lines = voiceEngineConnectionLines({ pref: 'cpu', actual: 'cpu', cpuOnly: true });
    expect(lines).toEqual({ status: 'VOICEVOX：CPUで接続中', note: '' });
    expect(nudge.test(voiceEngineConnectionText({ pref: 'cpu', actual: 'cpu' }))).toBe(false);
  });

  it('希望が GPU で版が CPU だけのときは、違っていることと VOICEVOX 側で決まることを出す', () => {
    const text = voiceEngineConnectionText({ pref: 'gpu', actual: 'cpu', cpuOnly: true });
    expect(text).toContain('VOICEVOX：CPUで接続中（選択はGPU）');
    expect(text).toContain('このエンジンはGPUを使えません');
    expect(text).toContain('「設定」→「オプション」→「エンジンモード」');
    expect(nudge.test(text)).toBe(false);
  });

  it('今のモードが不明なときは希望だけ出して、違いとは言わない', () => {
    const text = voiceEngineConnectionText({ pref: 'gpu', actual: 'unknown' });
    expect(text).toBe('VOICEVOX：GPUを選択中（今のモードは不明）');
    expect(text).not.toContain('エンジンモード');
    expect(text).not.toContain('GPUで接続中');
  });

  it('未接続は空。明示の GPU 一致は GPU で接続中', () => {
    expect(voiceEngineConnectionText({ pref: 'gpu', actual: null })).toBe('');
    expect(voiceEngineConnectionLines({ pref: 'gpu', actual: 'gpu' }).status).toBe('VOICEVOX：GPUで接続中');
    expect(voiceEngineConnectionLines({ pref: 'cpu', actual: 'gpu' }).note).toContain('エンジンモード');
  });
});

describe('GPU への切り替え案内は画面に残さない', () => {
  const files = [
    'src/extension/venueBar.js',
    'src/extension/comeview-entry.js',
    'src/extension/popup-entry.js',
    'extension/popup.html',
    'extension/comeview.html',
    'src/lib/voiceLagNotice.js'
  ];
  it('案内の文言と橙色の置き場が無い', () => {
    const blob = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(blob).not.toContain('読み上げを速くするには');
    expect(blob).not.toContain('id="voiceGpuTip"');
    expect(blob).not.toContain('id="cvVoiceGpuTip"');
    expect(blob).not.toContain('nlsb-voice-gpu-tip');
  });
});
