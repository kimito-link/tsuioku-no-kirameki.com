// measure-yt-voice-repeat.mjs — YouTube の会場の読み上げが「最新を読まず、過去の発言を何度も読む」かを計器で確かめる。
//   (2026-11-12 りんく「youtubeが最新の読み上げをどんどんよまず過去の発言を何回も読んでいます」)
//
//   ・普段の Chrome には触らない: 一時プロファイルの Chromium に、拡張の「写し」を読み込む。
//   ・VOICEVOX は偽物(このスクリプトが立てる)。本物の VOICEVOX(50021)を使っている PC でも邪魔しないよう、
//     写しの拡張だけ接続先のポートを書き換える(--port・既定 50121)。偽物は頼まれた文を時刻つきで全部残す。
//   ・チャット欄(iframe)に出ているコメントも1秒ごとに読み、どの声がどのコメントか・何回頼まれたかを突き合わせる。
//
// 使い方:
//   node scripts/measure-yt-voice-repeat.mjs --url "https://www.youtube.com/watch?v=XXXX" --dur 300
//   node scripts/measure-yt-voice-repeat.mjs --fake --dur 60            # 偽の YouTube(ネットに出られない環境)
//   オプション: --synth-ms 1500(偽の VOICEVOX が1件にかける時間)/ --stream(少しずつ受け取りに対応する偽物)
//              --headed(窓を出す)/ --ext <拡張のフォルダ>(既定 extension/)
// 結果: .artifacts/yt-voice-repeat/<時刻>.json と、標準出力の要約(同じ文を何回頼んだか・読んだ時点で何件遅れていたか)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const flag = (name) => argv.includes(`--${name}`);
const FAKE = flag('fake');
const URL_ARG = opt('url', '');
const DUR_S = Number(opt('dur', '120'));
const SYNTH_MS = Number(opt('synth-ms', '1500'));
const PORT = Number(opt('port', FAKE ? '50021' : '50121'));
const STREAM = flag('stream');
const HEADED = flag('headed');
const EXT_SRC = path.resolve(opt('ext', path.join(root, 'extension')));
const FAKE_VID = 'TESTVID0001';
const FAKE_INTERVAL_MS = Number(opt('interval-ms', '1500'));
if (!FAKE && !URL_ARG) {
  console.error('--url か --fake を指定してください');
  process.exit(2);
}

const t0 = Date.now();
const sec = (t) => Math.round((t - t0) / 100) / 10;

// ---- 拡張の写し(接続先のポートだけ書き換える) ----
function copyExtension() {
  if (PORT === 50021) return EXT_SRC;
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-yt-voice-ext-'));
  fs.cpSync(EXT_SRC, dst, { recursive: true });
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(js|json|html)$/.test(ent.name)) {
        const s = fs.readFileSync(p, 'utf8');
        if (s.includes('50021')) fs.writeFileSync(p, s.split('50021').join(String(PORT)));
      }
    }
  };
  walk(dst);
  return dst;
}

// ---- 偽の VOICEVOX ----
function wav(secLen = 0.8) {
  const n = Math.floor(24000 * secLen);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(24000, 24);
  b.writeUInt32LE(48000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
}
/** @type {{ t: number, text: string }[]} */
const synthLog = [];
const engine = http.createServer((req, res) => {
  const u = new URL(req.url || '/', 'http://x');
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  req.on('data', () => {});
  req.on('end', () => {
    const p = u.pathname;
    const json = (v) => { res.writeHead(200, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
    if (p === '/version') return json('0.25.0');
    if (p === '/speakers') return json([{ name: 'A', speaker_uuid: 'u', styles: [{ id: 1, name: 'n' }, { id: 2, name: 'm' }] }]);
    if (p === '/supported_devices') return json({ cpu: true, cuda: false, dml: false });
    if (p === '/engine_manifest') return json({ supported_features: { streaming_synthesis: STREAM } });
    if (p === '/initialize_speaker') { res.writeHead(204, cors); res.end(); return; }
    if (p === '/is_initialized_speaker') return json(true);
    if (p === '/audio_query') {
      synthLog.push({ t: Date.now(), text: u.searchParams.get('text') || '' });
      return json({ accent_phrases: [], speedScale: 1, pitchScale: 0, intonationScale: 1, volumeScale: 1, prePhonemeLength: 0.1, postPhonemeLength: 0.1, outputSamplingRate: 24000, outputStereo: false, kana: '' });
    }
    if (p === '/streaming_synthesis' && STREAM) {
      const w = wav(1.2);
      res.writeHead(200, { ...cors, 'content-type': 'audio/wav' });
      const parts = 6;
      const step = Math.ceil((w.length - 44) / parts);
      let i = 0;
      const tick = () => {
        if (i === 0) res.write(w.subarray(0, 44));
        const a = 44 + i * step;
        res.write(w.subarray(a, Math.min(w.length, a + step)));
        i += 1;
        if (44 + i * step >= w.length) { res.end(); return; }
        setTimeout(tick, SYNTH_MS / parts);
      };
      setTimeout(tick, 100);
      return;
    }
    if (p === '/synthesis') {
      setTimeout(() => { res.writeHead(200, { ...cors, 'content-type': 'audio/wav' }); res.end(wav()); }, SYNTH_MS);
      return;
    }
    res.writeHead(404, cors);
    res.end();
  });
});
await new Promise((r) => engine.listen(PORT, '127.0.0.1', () => r(undefined)));

// ---- 偽の YouTube(--fake) ----
const FAKE_WATCH = `<!doctype html><html><head><meta charset="utf-8"><title>テスト配信 - YouTube</title>
<link rel="canonical" href="https://www.youtube.com/watch?v=${FAKE_VID}"></head><body style="background:#111;color:#eee">
<ytd-watch-flexy><div id="primary"><video class="html5-main-video" style="width:640px;height:360px;background:#000"></video></div>
<div id="chat"><iframe id="chatframe" src="/live_chat?is_popout=1&v=${FAKE_VID}" style="width:400px;height:500px"></iframe></div></ytd-watch-flexy>
</body></html>`;
const FAKE_CHAT = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<yt-live-chat-item-list-renderer><div id="items"></div></yt-live-chat-item-list-renderer>
<script>
const T0 = ${t0};
let n = Math.max(0, Math.floor((Date.now() - T0) / ${FAKE_INTERVAL_MS}) - 20);
const items = document.getElementById('items');
function add() {
  n += 1;
  const el = document.createElement('yt-live-chat-text-message-renderer');
  el.id = 'ChwKGkNNsg' + String(n).padStart(6, '0');
  const who = 'user' + (n % 7);
  el.innerHTML = '<div id="author-photo"><img src="https://yt4.ggpht.com/a/' + who + '=s64"></div><div id="content"><span id="timestamp">7:5' + (n % 10) + '</span><span id="author-name">@' + who + '</span><span id="message">コメント' + n + 'ばん</span></div>';
  items.appendChild(el);
  if (items.children.length > 100) items.removeChild(items.firstElementChild);
}
const target = () => Math.floor((Date.now() - T0) / ${FAKE_INTERVAL_MS}) + 5;
setInterval(() => { while (n < target()) add(); }, 200);
while (n < target()) add();
</script></body></html>`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const extPath = copyExtension();
const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: !HEADED,
  ignoreHTTPSErrors: FAKE,
  viewport: { width: 1400, height: 900 },
  ...(FAKE ? { env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(?:https?|all)_proxy$/i.test(k))) } : {}),
  args: [
    `--disable-extensions-except=${extPath}`,
    `--load-extension=${extPath}`,
    '--autoplay-policy=no-user-gesture-required',
    '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights',
    ...(FAKE ? ['--no-proxy-server'] : []),
  ],
});
if (FAKE) {
  await ctx.route('https://www.youtube.com/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/watch') return route.fulfill({ status: 200, contentType: 'text/html', body: FAKE_WATCH });
    if (u.pathname === '/live_chat') return route.fulfill({ status: 200, contentType: 'text/html', body: FAKE_CHAT });
    return route.fulfill({ status: 404, body: '' });
  });
  await ctx.route(/https:\/\/yt\d\.ggpht\.com\/.*/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
}

const page = await ctx.newPage();
await page.goto(FAKE ? `https://www.youtube.com/watch?v=${FAKE_VID}` : URL_ARG, { waitUntil: 'domcontentloaded' });
let opened = false;
for (let i = 0; i < 60 && !opened; i += 1) {
  opened = await page.evaluate(() => {
    const b = /** @type {HTMLElement|null} */ (document.querySelector('#nlsb-venue-root .nlsb-toggle'));
    if (!b) return false;
    if (!document.documentElement.classList.contains('nlsb-venue-open')) b.click();
    return true;
  }).catch(() => false);
  if (!opened) await page.waitForTimeout(1000);
}
console.log(`会場: ${opened ? '開いた' : '開けなかった'} (${sec(Date.now())}秒)`);

// チャット欄のコメントを1秒ごとに読む(id → 文・初めて見た時刻)
/** @type {Map<string, { id: string, name: string, text: string, firstSeen: number, order: number }>} */
const chat = new Map();
const readChat = async () => {
  const frame = page.frames().find((f) => /\/live_chat(?:_replay)?\b/.test(f.url()));
  if (!frame) return;
  const rows = await frame.evaluate(() =>
    Array.from(document.querySelectorAll('yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer')).map((el) => ({
      id: el.id || '',
      name: String(el.querySelector('#author-name')?.textContent || '').trim(),
      text: String(el.querySelector('#message')?.textContent || '').replace(/\s+/g, ' ').trim(),
    }))
  ).catch(() => []);
  for (const r of rows) {
    if (!r.id || chat.has(r.id)) continue;
    chat.set(r.id, { ...r, firstSeen: Date.now(), order: chat.size });
  }
};
const end = Date.now() + DUR_S * 1000;
while (Date.now() < end) {
  await readChat();
  await page.waitForTimeout(1000);
}

let diag = {};
try {
  const sw = ctx.serviceWorkers().find((w) => w.url().includes('background')) || ctx.serviceWorkers()[0];
  diag = await sw.evaluate(() => chrome.storage.local.get(['yt_diag_voice_crowd', 'yt_diag_live_rows', 'yt_diag_echo_drop', 'yt_ingest_diag', 'yt_diag_chat_frame_vid', 'yt_diag_voice_reads']));
} catch (e) {
  diag = { error: String(e) };
}
await page.screenshot({ path: path.join(root, '.artifacts', 'yt-voice-repeat-last.png') }).catch(() => {});
await ctx.close();
engine.close();

// ---- 突き合わせ ----
const chatRows = [...chat.values()];
const norm = (s) => String(s || '').replace(/\s+/g, '').replace(/、ほか\d+件$/, '');
/** 読み上げの文 → チャット欄の行(文の先頭が一致する最初の行) */
// 同じ文は何人も書く(「こんにちは」等)。依頼の時点までに見えた行のうち、いちばん新しい行に当てる(古い行に当てると遅れを大きく見誤る)。
const matchChat = (text, at = Infinity) => {
  const t = norm(text);
  if (!t) return null;
  let best = null;
  for (const r of chatRows) {
    if (r.firstSeen > at + 1500) continue;
    const c = norm(r.text);
    if (c && (c === t || c.startsWith(t) || t.startsWith(c.slice(0, Math.max(6, t.length - 2))))) best = r;
  }
  return best;
};
const reqs = synthLog.filter((s) => s.text !== 'あ'); // 起動時の温め
const counts = new Map();
for (const s of reqs) counts.set(s.text, (counts.get(s.text) || 0) + 1);
const repeated = [...counts.entries()].filter(([, c]) => c > 1).map(([text, c]) => ({ text, times: c }));
const timeline = reqs.map((s) => {
  const hit = matchChat(s.text, s.t);
  const newestOrder = chatRows.filter((r) => r.firstSeen <= s.t).reduce((m, r) => Math.max(m, r.order), -1);
  return {
    t: sec(s.t),
    text: s.text.slice(0, 40),
    chatOrder: hit ? hit.order : null,
    behind: hit && newestOrder >= 0 ? newestOrder - hit.order : null,
    ageSec: hit ? Math.round((s.t - hit.firstSeen) / 100) / 10 : null,
  };
});
const out = {
  at: new Date().toISOString(),
  mode: FAKE ? 'fake' : 'real',
  url: FAKE ? 'fake' : URL_ARG,
  durSec: DUR_S,
  venueOpened: opened,
  chatSeen: chatRows.length,
  synthRequests: reqs.length,
  repeated,
  timeline,
  diag,
};
const dir = path.join(root, '.artifacts', 'yt-voice-repeat');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`チャット欄で見えたコメント ${chatRows.length} 件 / 読み上げの依頼 ${reqs.length} 件`);
console.log(`同じ文を2回以上頼んだ: ${repeated.length} 種類 ${JSON.stringify(repeated.slice(0, 10))}`);
const behind = timeline.map((x) => x.behind).filter((x) => typeof x === 'number');
if (behind.length) {
  const sorted = [...behind].sort((a, b) => a - b);
  console.log(`読んだ時点の遅れ(件): 中央値 ${sorted[Math.floor(sorted.length / 2)]} / 最大 ${sorted[sorted.length - 1]}`);
}
const unmatched = timeline.filter((x) => x.chatOrder == null).length;
console.log(`チャット欄に見つからない読み上げ: ${unmatched} 件`);
console.log(`結果: ${path.relative(root, file)}`);
