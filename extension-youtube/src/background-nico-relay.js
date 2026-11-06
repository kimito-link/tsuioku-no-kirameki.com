// background-nico-relay.js — ニコ生版 extension/background.js の、会場とコメビュが頼る受け口の写し(手を加えない)。
//   視聴ページの会場(content script)とコメビュは、VOICEVOX への中継・読み手の取り合い・コメビュ/会場の窓を開く を
//   service worker に頼む。YouTube 版の background にはこれが無く、返事の無い頼みになっていた(2026-11-04)。
//   写し元: extension/background.js の NLS_OPEN_COMEVIEW・NLS_OPEN_VENUE・NLS_VOICEVOX_STREAM・NLS_VOICE_ENGINE_*・NLS_VOICE_READER_*・NLS_FETCH_PROXY。
/* global chrome, fetch, AbortController, URL, NL_YT_MERGED */

// 本体に同梱したとき(scripts/youtube-build.mjs の本体向け束): 声の中継・読み手の取り合い・取り寄せの代行は
//   本体の background.js に同じ受け口がある(写し元)ので、ここでは受けない(二重に答えない)。
//   会場・コメビュを開く頼みは名前を YT_OPEN_… に変えて受け(画面の入口 ytMergedIsolation.js が名前を変える)、
//   YouTube 版の画面(yt-….html)を開く。
const YT_MERGED = typeof NL_YT_MERGED !== 'undefined' && NL_YT_MERGED === true;

/* ------------------------------------------------------------------ */
/* v0.1.716: 会場モード(content script)から「コメビュを開く」要求を受けて、SW が  */
/*   comeview.html を別ウィンドウ popup で開く。content script は chrome.windows を  */
/*   直接呼べない(会議 Codex 指摘)ので SW 経由。status.html の btnComeview と同型。 */
/*   ?lv= を付けて配信を固定(comeview 側は無指定なら nls_last_watch_url で自己解決)。*/
/* ------------------------------------------------------------------ */
const OPEN_COMEVIEW_MESSAGE_TYPE = YT_MERGED ? 'YT_OPEN_COMEVIEW' : 'NLS_OPEN_COMEVIEW';
const COMEVIEW_LV_RE = /^lv\d{1,15}$/;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== OPEN_COMEVIEW_MESSAGE_TYPE) return undefined;
  if (!sender || sender.id !== chrome.runtime.id) {
    try {
      sendResponse({ ok: false });
    } catch {
      /* no-op */
    }
    return false;
  }
  const reply = (v) => {
    try {
      sendResponse(v);
    } catch {
      /* port closed */
    }
  };
  // lv は content から渡る生値。固定リテラル path に正規化済み lv だけ載せる(injection 面遮断)。
  const lv = COMEVIEW_LV_RE.test(String(msg.liveId || '')) ? String(msg.liveId) : '';
  const base = chrome.runtime.getURL(YT_MERGED ? 'yt-comeview.html' : 'comeview.html');
  const url = lv ? `${base}?lv=${lv}` : base;
  (async () => {
    try {
      await chrome.windows.create({ url, type: 'popup', width: 400, height: 640 });
      reply({ ok: true });
    } catch (err) {
      reply({ ok: false, error: String(err && err.message) });
    }
  })();
  return true; // 非同期 sendResponse
});

const OPEN_VENUE_MESSAGE_TYPE = YT_MERGED ? 'YT_OPEN_VENUE' : 'NLS_OPEN_VENUE';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== OPEN_VENUE_MESSAGE_TYPE) return undefined;
  if (!sender || sender.id !== chrome.runtime.id) {
    try {
      sendResponse({ ok: false });
    } catch {
      /* no-op */
    }
    return false;
  }
  const reply = (v) => {
    try {
      sendResponse(v);
    } catch {
      /* port closed */
    }
  };
  const lv = COMEVIEW_LV_RE.test(String(msg.liveId || '')) ? String(msg.liveId) : '';
  const base = chrome.runtime.getURL(YT_MERGED ? 'yt-venue.html' : 'venue.html');
  const url = lv ? `${base}?lv=${lv}` : base;
  (async () => {
    try {
      // 映像セーフエリア＋ひな壇を確保するため、少し広めのウィンドウで開く
      await chrome.windows.create({ url, type: 'popup', width: 1000, height: 720 });
      reply({ ok: true });
    } catch (err) {
      reply({ ok: false, error: String(err && err.message) });
    }
  })();
  return true; // 非同期 sendResponse
});

// 2026-10-26: VOICEVOX の声を少しずつ中継する(会場モードの content script 用・/streaming_synthesis)。
//   sendMessage は1往復で丸ごとしか返せないので、ポートで届いた分ずつ送る。宛先は VOICEVOX だけ。
chrome.runtime.onConnect.addListener((port) => {
  if (YT_MERGED) return;
  if (!port || port.name !== 'NLS_VOICEVOX_STREAM') return;
  if (!port.sender || port.sender.id !== chrome.runtime.id) {
    try { port.disconnect(); } catch { /* no-op */ }
    return;
  }
  const controller = new AbortController();
  let closed = false;
  const send = (m) => {
    if (closed) return;
    try { port.postMessage(m); } catch { closed = true; controller.abort(); }
  };
  port.onDisconnect.addListener(() => { closed = true; controller.abort(); });
  port.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'start') return;
    let targetUrl;
    try { targetUrl = new URL(String(msg.url || '')); } catch { send({ type: 'error', error: 'Invalid URL' }); return; }
    if (!(targetUrl.hostname === '127.0.0.1' && targetUrl.port === '50021' && targetUrl.pathname === '/streaming_synthesis')) {
      send({ type: 'error', error: 'URL not allowed' });
      return;
    }
    const init = { ...(msg.init || {}), signal: controller.signal };
    fetch(targetUrl.toString(), init)
      .then(async (res) => {
        send({ type: 'head', ok: res.ok, status: res.status });
        if (!res.ok || !res.body) { send({ type: 'end' }); return; }
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done || closed) break;
          send({ type: 'chunk', data: Array.from(value) });
        }
        send({ type: 'end' });
      })
      .catch((err) => send({ type: 'error', error: String(err && err.message || err) }));
  });
});

// v0.1.1781: 会場とコメビュで VOICEVOX の使用中を分け合う(src/lib/voiceEngineActivity.js)。
//   裏の声読み込みは「どちらのページも静か」な時だけ始める。SW が落ちて値が消えても「静か」扱いで止まらない。
let voiceEngineLastActivityAt = 0;
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (YT_MERGED) return undefined;
  if (!msg || (msg.type !== 'NLS_VOICE_ENGINE_ACTIVITY' && msg.type !== 'NLS_VOICE_ENGINE_QUIET')) return undefined;
  if (!sender || sender.id !== chrome.runtime.id) return undefined;
  if (msg.type === 'NLS_VOICE_ENGINE_ACTIVITY') voiceEngineLastActivityAt = Date.now();
  sendResponse({ quietMs: voiceEngineLastActivityAt > 0 ? Date.now() - voiceEngineLastActivityAt : 1e9 });
  return false;
});

// v0.1.1794: 同じ配信を会場とコメビュの両方で開いた時、読み上げるのは片方だけ(src/lib/voiceReaderLease.js と同じ規則)。
//   配信ごとに「いま読んでいるページ」を1つ持つ。合図が 6秒途切れたら、もう片方が引き継ぐ。
//   SW が落ちて表が消えても、次の名乗りから作り直す(どちらも読める状態から始まる)。
const voiceReaderByLive = new Map();
const VOICE_READER_LEASE_TTL_MS = 6000;
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (YT_MERGED) return undefined;
  if (!msg || (msg.type !== 'NLS_VOICE_READER_CLAIM' && msg.type !== 'NLS_VOICE_READER_RELEASE')) return undefined;
  if (!sender || sender.id !== chrome.runtime.id) return undefined;
  const holder = String(msg.holder || '');
  if (msg.type === 'NLS_VOICE_READER_RELEASE') {
    for (const [lv, cur] of voiceReaderByLive) if (cur.holder === holder) voiceReaderByLive.delete(lv);
    sendResponse({ ok: true });
    return false;
  }
  const lv = String(msg.liveId || '').trim().toLowerCase();
  const now = Date.now();
  const cur = voiceReaderByLive.get(lv);
  let granted = true;
  if (lv && holder) {
    if (!cur || cur.holder === holder || now - cur.at > VOICE_READER_LEASE_TTL_MS) voiceReaderByLive.set(lv, { holder, at: now });
    else granted = false;
  }
  sendResponse({ granted });
  return false;
});

// v0.1.723: Proxy fetch for VOICEVOX to bypass CSP/mixed-content in content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (YT_MERGED) return undefined;
  if (!msg || msg.type !== 'NLS_FETCH_PROXY') return undefined;
  // セキュリティ: 自拡張のみ許可(他の onMessage handler と同じガード)
  if (!sender || sender.id !== chrome.runtime.id) return undefined;
  // SSRF 防止: VOICEVOX ローカルホスト(host_permissions に列挙済み)のみ通す
  let targetUrl;
  try {
    targetUrl = new URL(String(msg.url || ''));
  } catch {
    sendResponse({ error: 'Invalid URL' });
    return true;
  }
  const allowed =
    (targetUrl.hostname === '127.0.0.1' && targetUrl.port === '50021') ||
    (targetUrl.hostname === '127.0.0.1' && targetUrl.port === '3456') ||
    (targetUrl.hostname === 'localhost' && targetUrl.port === '3456');
  if (!allowed) {
    sendResponse({ error: 'URL not allowed' });
    return true;
  }
  fetch(msg.url, msg.init)
    .then(res => {
      if (msg.wantBuffer) {
        return res.arrayBuffer().then(buf => ({
          ok: res.ok,
          status: res.status,
          buffer: Array.from(new Uint8Array(buf))
        }));
      } else {
        return res.text().then(text => ({
          ok: res.ok,
          status: res.status,
          text
        }));
      }
    })
    .then(data => sendResponse(data))
    .catch(err => sendResponse({ error: err.message }));
  return true; // async
});

