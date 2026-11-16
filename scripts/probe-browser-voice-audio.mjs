// 新規Playwrightプロファイルで非ゼロWAVの実再生とPC音声の開始/終了を確認する。
// node scripts/probe-browser-voice-audio.mjs --chrome でChromeを使用。普段のプロファイルには触れない。
import { chromium } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const profile = await mkdtemp(path.join(tmpdir(), 'nl-voice-audio-'));
const artifactDir = path.resolve('.artifacts/voice-silent-busy');
await mkdir(artifactDir, { recursive: true });
let context;
let result = { capturedAt: new Date().toISOString(), freshProfile: profile, audio: null, lightVoice: null };
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    ...(process.argv.includes('--chrome') ? { channel: 'chrome' } : {}),
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  const page = await context.newPage();
  await page.setContent('<button id="run">音声を実測</button>');
  result = await page.evaluate(async () => {
    const makeTone = () => {
      const rate = 24000, seconds = 0.35, samples = Math.floor(rate * seconds);
      const out = new ArrayBuffer(44 + samples * 2), v = new DataView(out);
      const word = (at, s) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
      word(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); word(8, 'WAVE'); word(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      word(36, 'data'); v.setUint32(40, samples * 2, true);
      let peak = 0;
      for (let i = 0; i < samples; i++) {
        const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000);
        peak = Math.max(peak, Math.abs(sample)); v.setInt16(44 + i * 2, sample, true);
      }
      return { out, peak, samples, rate };
    };
    const tone = makeTone();
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(tone.out.slice(0));
    const channel = decoded.getChannelData(0);
    let decodedPeak = 0;
    for (const x of channel) decodedPeak = Math.max(decodedPeak, Math.abs(x));
    const url = URL.createObjectURL(new Blob([tone.out], { type: 'audio/wav' }));
    const audio = new Audio(url);
    const events = [];
    for (const name of ['playing', 'ended', 'error']) audio.addEventListener(name, () => events.push({ name, at: performance.now() }));
    let playError = '';
    try {
      await audio.play();
      await Promise.race([
        new Promise((resolve) => audio.addEventListener('ended', resolve, { once: true })),
        new Promise((resolve) => setTimeout(resolve, 3000))
      ]);
    } catch (e) { playError = String(e?.name || e?.message || e); }
    URL.revokeObjectURL(url);
    await ctx.close();

    const speech = { supported: 'speechSynthesis' in globalThis && 'SpeechSynthesisUtterance' in globalThis, voices: 0, started: false, ended: false, error: '', timedOut: false };
    if (speech.supported) {
      const readVoices = async () => {
        const voices = speechSynthesis.getVoices();
        if (voices.length) return voices;
        await Promise.race([new Promise((r) => speechSynthesis.addEventListener('voiceschanged', r, { once: true })), new Promise((r) => setTimeout(r, 1500))]);
        return speechSynthesis.getVoices();
      };
      const voices = await readVoices(); speech.voices = voices.length;
      if (voices.length) {
        const u = new SpeechSynthesisUtterance('読み上げ確認'); u.voice = voices[0];
        await Promise.race([
          new Promise((resolve) => {
            u.onstart = () => { speech.started = true; };
            u.onend = () => { speech.ended = true; resolve(); };
            u.onerror = (e) => { speech.error = String(e?.error || 'error'); resolve(); };
            speechSynthesis.speak(u);
          }),
          new Promise((resolve) => setTimeout(() => { speech.timedOut = true; speechSynthesis.cancel(); resolve(); }, 5000))
        ]);
      }
    }
    return {
      capturedAt: new Date().toISOString(),
      audio: { wavBytes: tone.out.byteLength, pcmSamples: tone.samples, sourcePeak: tone.peak, decodedPeak, events, playing: events.some((e) => e.name === 'playing'), ended: events.some((e) => e.name === 'ended'), playError },
      lightVoice: speech
    };
  });
  result.freshProfile = true;
} catch (e) {
  result.error = String(e?.stack || e);
} finally {
  await context?.close().catch(() => {});
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
const out = path.join(artifactDir, `browser-audio-${Date.now()}.json`);
await writeFile(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ artifact: out, ...result }, null, 2));
