// 混雑した会場の「読み上げONなのに無音」を、偽VOICEVOX(50121)と新しいPlaywright contextで実測する。
// 本物の50021・普段のChrome・実配信には触らない。
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const nativeAudio = argv.includes('--native-audio');
const durationSec = Math.max(10, Number(opt('dur', '600')) || 600);
const enginePort = Number(opt('port', '50121'));
const pagePort = Number(opt('page-port', '50122'));
if (enginePort === 50021) throw new Error('本物のVOICEVOX 50021は禁止');

const engineStats = {
  slow: { query: 0, synthesis: 0 },
  fast: { query: 0, synthesis: 0 }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function wav(ms = 180) {
  const samples = Math.floor(16000 * ms / 1000);
  const b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples * 2, 40);
  if (nativeAudio) for (let i = 0; i < samples; i += 1) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / 16000) * 4000), 44 + i * 2);
  return b;
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
const engine = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  const u = new URL(req.url || '/', `http://127.0.0.1:${enginePort}`);
  const profile = u.searchParams.get('profile') === 'fast' ? 'fast' : 'slow';
  const json = (v) => { res.writeHead(200, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
  if (u.pathname === '/version') return json('fake-0.26.1');
  if (u.pathname === '/audio_query') {
    const n = ++engineStats[profile].query;
    await sleep(profile === 'fast' ? 80 : 2000 + (n % 6) * 1000); // slow: 2〜7秒
    return json({ speedScale: 1, outputSamplingRate: 16000, outputStereo: false });
  }
  if (u.pathname === '/synthesis') {
    const n = ++engineStats[profile].synthesis;
    await sleep(profile === 'fast' ? 100 : 4000 + (n % 7) * 1000); // slow: 4〜10秒
    res.writeHead(200, { ...cors, 'content-type': 'audio/wav' }); res.end(wav()); return;
  }
  res.writeHead(404, cors); res.end();
});

const pageServer = http.createServer((req, res) => {
  const u = new URL(req.url || '/', `http://127.0.0.1:${pagePort}`);
  if (u.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>voice workload</title>');
    return;
  }
  const target = path.resolve(root, `.${decodeURIComponent(u.pathname)}`);
  if (!target.startsWith(root) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'content-type': target.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/plain; charset=utf-8' });
  fs.createReadStream(target).pipe(res);
});

await Promise.all([
  new Promise((r) => engine.listen(enginePort, '127.0.0.1', r)),
  new Promise((r) => pageServer.listen(pagePort, '127.0.0.1', r))
]);

const browser = await chromium.launch({ headless: true, ...(nativeAudio ? { channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] } : {}) });

async function runScenario(config) {
  const context = await browser.newContext(); // scenarioごとに新しい一時プロファイル
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${pagePort}/`);
  const result = await page.evaluate(async ({ config, enginePort }) => {
    const { VoicePlayer } = await import('/src/lib/voicePlayer.js');
    let startedAt = Date.now();
    const audible = [];
    const inputs = [];
    const synthStyles = [];
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const stageFetch = async (url, timeoutMs, signal, stage, onFailure) => {
      const ac = new AbortController();
      let timedOut = false;
      const onAbort = () => ac.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => { timedOut = true; ac.abort(); }, timeoutMs);
      try {
        return await fetch(url, { method: 'POST', signal: ac.signal });
      } catch {
        if (timedOut) onFailure?.({ stage, error: new Error('voicevox_timeout') });
        return null;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    };
    const fetchSynthesizeVoice = async (text, voice, opts = {}) => {
      synthStyles.push(Number(voice?.styleId) || 0);
      // Promise自体がAbortSignalを無視する候補c。VoicePlayer側の世代破棄がこれを待ち続けないかを見る。
      if (config.profile === 'stuck') return await new Promise(() => {});
      const q = await stageFetch(
        `http://127.0.0.1:${enginePort}/audio_query?profile=${config.profile}&text=${encodeURIComponent(text)}`,
        Number(opts.audioQueryTimeoutMs) || 3000, opts.signal, 'query', opts.onFailure
      );
      if (!q?.ok) return null;
      await q.json();
      const s = await stageFetch(
        `http://127.0.0.1:${enginePort}/synthesis?profile=${config.profile}`,
        Number(opts.synthesisTimeoutMs) || 8000, opts.signal, 'synth', opts.onFailure
      );
      if (!s?.ok) return null;
      opts.onTiming?.({ queryMs: 1, synthMs: 1 });
      return await s.arrayBuffer();
    };
    class FakeAudio extends EventTarget {
      constructor() { super(); this.duration = 0.18; this.currentTime = 0; this.playbackRate = 1; this.preservesPitch = true; }
      play() {
        setTimeout(() => this.dispatchEvent(new Event('playing')), 5);
        setTimeout(() => this.dispatchEvent(new Event('ended')), 185);
        return Promise.resolve();
      }
      pause() {}
    }
    let lightSpeaker = {
      available: () => true,
      voices: () => [{ name: 'PC日本語', lang: 'ja-JP' }],
      cancel: () => {},
      lastError: () => '',
      async speak(_text, _tone, hooks = {}) { await delay(5); hooks.onStart?.(); await delay(90); return true; }
    };
    if (config.nativeAudio) {
      const { createLightSpeaker } = await import('/src/lib/voiceLightSpeaker.js');
      for (let i = 0; i < 30 && !speechSynthesis.getVoices().length; i += 1) await delay(100);
      lightSpeaker = createLightSpeaker();
      if (!lightSpeaker?.available()) throw new Error('native PC voice unavailable');
    }
    const player = new VoicePlayer({
      storage: null,
      isObsMode: () => false,
      audioConstructor: config.nativeAudio ? Audio : FakeAudio,
      unlockAudioConstructor: null,
      createObjectURL: config.nativeAudio ? (blob) => URL.createObjectURL(blob) : () => 'blob:fake',
      revokeObjectURL: config.nativeAudio ? (url) => URL.revokeObjectURL(url) : () => {},
      fetchVoicevoxAlive: async () => true,
      probeVoicevoxAlive: async () => ({ ok: true, reason: '' }),
      fetchVoiceStyleIds: async () => [1, 2, 3],
      fetchSynthesizeVoice,
      resolveVoice: (userKey) => ({ styleId: 1 + Math.abs([...String(userKey)].reduce((a, c) => a + c.charCodeAt(0), 0)) % 3, speedOffset: 0 }),
      lightSpeaker
    });
    await player.enable({ persist: false });
    startedAt = Date.now();
    const total = Math.floor(config.durationMs / config.intervalMs);
    for (let i = 0; i < total; i += 1) {
      const due = startedAt + i * config.intervalMs;
      const wait = due - Date.now();
      if (wait > 0) await delay(wait);
      inputs.push(Date.now());
      const userId = `u${i % (config.busy ? 20 : 5)}`;
      const importantGift = config.busy && i > 0 && i % 25 === 0;
      const item = importantGift
        ? { kind: 'gift', userId, nickname: `人${i % 20}`, gift: { name: '応援', count: 1 }, liveId: config.name }
        : {
            kind: 'comment', userId, nickname: `人${i % 20}`,
            text: config.busy && i % 17 === 0 ? `質問${i}ですか？` : `コメント${i}`,
            liveId: config.name, broadcasterUid: config.busy && i % 31 === 0 ? userId : 'caster'
          };
      item.onAudible = () => audible.push(Date.now());
      if (!config.closedGate) player.enqueue([item]);
    }
    await delay(Math.max(0, startedAt + config.durationMs - Date.now()));
    const endedAt = Date.now();
    // 観測窓の先頭と末尾を必ず含める。最後の入力で切ると末尾無音を過小計上する。
    const points = [startedAt, ...audible, endedAt].sort((a, b) => a - b);
    let maxSilentMs = 0;
    for (let i = 1; i < points.length; i += 1) maxSilentMs = Math.max(maxSilentMs, points[i] - points[i - 1]);
    const diag = JSON.parse(JSON.stringify(player.diag));
    player.disable({ persist: false });
    return {
      name: config.name,
      playback: config.nativeAudio ? 'native-audio-and-pc-voice' : 'simulated',
      durationSec: Math.round((endedAt - startedAt) / 100) / 10,
      inputTotal: inputs.length,
      audibleCallbackTotal: audible.length,
      maxSilentMs,
      maxSilentUnder20s: maxSilentMs < 20000,
      voicevoxSpoken: Math.max(0, (Number(diag.spokenTotal) || 0) - (Number(diag.lightSpokenTotal) || 0)),
      lightSpoken: Number(diag.lightSpokenTotal) || 0,
      uniqueVoiceStyles: [...new Set(synthStyles)].filter(Boolean).length,
      drops: {
        gate: config.closedGate ? inputs.length : 0,
        busy: Number(diag.busySkipTotal) || 0,
        count: Number(diag.dropCountGateTotal) || 0,
        staleHead: Number(diag.dropHeadStaleTotal) || 0,
        staleSweep: Number(diag.dropSweepStaleTotal) || 0,
        synthNull: Number(diag.synthNullTotal) || 0,
        playbackTimeout: Number(diag.playbackTimeoutTotal) || 0
      },
      silenceRecoveryTotal: Number(diag.silenceRecoveryTotal) || 0,
      silenceRecoveryReasons: diag.silenceRecoveryReasons || {},
      finalPlaying: player.playing,
      finalQueue: player.queue.length
    };
  }, { config, enginePort });
  await context.close();
  return result;
}

let results;
try {
  const durationMs = durationSec * 1000;
  results = await Promise.all([
    runScenario({ name: 'before-closed', durationMs, intervalMs: 600, profile: 'slow', busy: true, closedGate: true }),
    runScenario({ name: 'after-busy', nativeAudio, durationMs, intervalMs: 600, profile: 'slow', busy: true, closedGate: false }),
    runScenario({ name: 'after-stuck-promise', durationMs, intervalMs: 600, profile: 'stuck', busy: true, closedGate: false }),
    runScenario({ name: 'after-quiet', durationMs, intervalMs: 6000, profile: 'fast', busy: false, closedGate: false })
  ]);
} finally {
  await browser.close();
  await Promise.all([new Promise((r) => engine.close(r)), new Promise((r) => pageServer.close(r))]);
}

const required = results.filter((r) => r.name !== 'before-closed');
const assertions = {
  fixedScenariosHaveCallbacks: required.every((r) => r.audibleCallbackTotal > 0),
  fixedScenariosMaxSilenceUnder20s: required.every((r) => r.maxSilentUnder20s === true),
  quietKeepsVoicevox: results.find((r) => r.name === 'after-quiet')?.voicevoxSpoken > 0
    && results.find((r) => r.name === 'after-quiet')?.lightSpoken === 0
};
const out = { capturedAt: new Date().toISOString(), fakeVoicevoxPort: enginePort, durationSec, metricNote: nativeAudio ? 'after-busy は実Audio/実PC音声の開始。他条件は模擬callback。物理スピーカー出力や音質の比較ではない' : 'audibleCallbackTotal は FakeAudio/軽い声stubの開始callback。実音の証明ではない', engineStats, assertions, results };
const artifactDir = path.join(root, '.artifacts', 'voice-silent-busy');
fs.mkdirSync(artifactDir, { recursive: true });
const outPath = path.join(artifactDir, `measure-${Date.now()}.json`);
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
console.log(`artifact=${outPath}`);
if (!Object.values(assertions).every(Boolean)) process.exitCode = 1;
