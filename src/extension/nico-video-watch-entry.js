/**
 * ニコニコ動画の通常動画（sm / so / nm）向けの小さい入口。
 * 記録エンジン（content.js・約1.5MB）は載せない。新しい通信・Observer・タイマーは使わない。
 */
import {
  KEY_NICO_CHANNEL_COMMENTERS,
  KEY_NICO_VIDEO_WATCH_CARD,
} from '../lib/storageKeys.js';
import {
  nicoVideoIdFromUrl,
  parseNicoVideoWatchMeta,
  viewCountFromNicoJsonLd,
  unpackNicoVideoCommentersAttr,
  nicoVideoCommentersFromDomRoot,
  mergeNicoVideoCommenters,
} from '../lib/niconico/nicoVideoWatchMeta.js';
import { applyNicoCommentsToChannelIndex, peopleInNicoChannelCommenterIndex } from '../lib/niconico/nicoChannelCommenterIndex.js';
import { buildNicoVideoWatchCardModel, nicoVideoWatchCardInnerHtml } from '../lib/niconico/nicoVideoWatchCard.js';

const CARD_ID = 'nlsb-video-watch-card';
const STYLE_ID = 'nlsb-video-watch-card-style';

const CARD_STYLE =
  '#' + CARD_ID + '{' +
    'position:fixed;z-index:2147483646;right:12px;bottom:72px;max-width:320px;max-height:70vh;overflow:auto;' +
    'font:14px/1.55 system-ui,sans-serif;color:#1b1b1b;background:rgba(255,252,245,.96);' +
    'border:1px solid rgba(80,60,20,.28);border-radius:10px;padding:10px 12px;' +
    'box-shadow:0 4px 16px rgba(0,0,0,.14);pointer-events:auto;' +
  '}' +
  '#' + CARD_ID + ' .nlsb-viewer-behavior__title,' +
  '#' + CARD_ID + ' .nlsb-video-watch-card__title{margin:0 0 6px;font-size:13px;font-weight:700;}' +
  '#' + CARD_ID + ' p{margin:0 0 6px;}' +
  '#' + CARD_ID + ' p:last-child{margin-bottom:0;}' +
  '#' + CARD_ID + ' .nlsb-viewer-behavior{margin-bottom:10px;}' +
  '#' + CARD_ID + ' .nlsb-viewer-behavior__list{margin:0;padding:0;list-style:none;}' +
  '#' + CARD_ID + ' .nlsb-viewer-behavior__row{margin:0 0 6px;padding:0 0 6px;border-bottom:1px solid rgba(80,60,20,.12);}' +
  '#' + CARD_ID + ' .nlsb-viewer-behavior__row:last-child{margin-bottom:0;padding-bottom:0;border-bottom:0;}' +
  '#' + CARD_ID + ' .nlsb-viewer-behavior__name{font-weight:700;margin-right:6px;}' +
  '#' + CARD_ID + ' .nlsb-viewer-behavior__rel{font-weight:600;margin-right:6px;}' +
  '#' + CARD_ID + ' .nlsb-viewer-behavior__facts{display:block;font-size:12px;line-height:1.45;}';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = CARD_STYLE;
  (document.head || document.documentElement).appendChild(st);
}

function currentVideoId() {
  return nicoVideoIdFromUrl(String(location.href || ''));
}

function unescapeMetaContent(raw) {
  return String(raw || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function readServerResponse() {
  try {
    const el = document.querySelector('meta[name="server-response"]');
    const raw = el?.getAttribute('content') || '';
    if (!raw) return null;
    return JSON.parse(unescapeMetaContent(raw));
  } catch {
    return null;
  }
}

function readJsonLd() {
  /** @type {any[]} */
  const out = [];
  try {
    const nodes = document.querySelectorAll('script[type="application/ld+json"]');
    for (let i = 0; i < nodes.length; i += 1) {
      try {
        out.push(JSON.parse(nodes[i].textContent || 'null'));
      } catch {
        /* 壊れた JSON-LD は飛ばす */
      }
    }
  } catch {
    /* 無くても視聴データから読む */
  }
  return out;
}

function readPageMeta(videoId) {
  const server = readServerResponse();
  const jsonLd = readJsonLd();
  const meta = parseNicoVideoWatchMeta(server, jsonLd);
  if (!meta.viewCount) {
    const fromLd = viewCountFromNicoJsonLd(jsonLd);
    if (fromLd != null) meta.viewCount = fromLd;
  }
  if (!meta.videoId) meta.videoId = videoId;
  return meta;
}

function readVisibleCommenters() {
  let fromAttr = [];
  try {
    fromAttr = unpackNicoVideoCommentersAttr(document.documentElement?.getAttribute('data-nlsb-nico-video-commenters') || '');
  } catch {
    fromAttr = [];
  }
  const fromDom = nicoVideoCommentersFromDomRoot(document);
  return mergeNicoVideoCommenters(fromAttr, fromDom);
}

function paintHtml(html) {
  const existing = document.getElementById(CARD_ID);
  if (!html) {
    existing?.remove();
    return;
  }
  ensureStyle();
  if (existing) {
    if (existing.innerHTML === html) return;
    existing.innerHTML = html;
    return;
  }
  const box = document.createElement('div');
  box.id = CARD_ID;
  box.innerHTML = html;
  (document.body || document.documentElement).appendChild(box);
}

/** @type {string} */
let rememberVideoId = '';
/** @type {Set<string>} */
const rememberedIds = new Set();

function rememberVideoCommenters(ownerId, videoId, authors) {
  const owner = String(ownerId || '').trim();
  const vid = String(videoId || '').trim();
  const list = Array.isArray(authors) ? authors : [];
  if (vid !== rememberVideoId) {
    rememberVideoId = vid;
    rememberedIds.clear();
  }
  const fresh = list.filter((a) => {
    const id = String(a?.userId || '').trim();
    if (!id || rememberedIds.has(id)) return false;
    rememberedIds.add(id);
    return true;
  });
  if (!owner || !fresh.length) return;
  void (async () => {
    try {
      const bag = await chrome.storage.local.get(KEY_NICO_CHANNEL_COMMENTERS);
      const next = applyNicoCommentsToChannelIndex(
        bag?.[KEY_NICO_CHANNEL_COMMENTERS],
        owner,
        fresh,
        Date.now(),
        { streamId: videoId, contentKind: 'video' },
      );
      await chrome.storage.local.set({ [KEY_NICO_CHANNEL_COMMENTERS]: next });
    } catch {
      /* 索引は記録の正本ではない */
    }
  })();
}

let lastPaintSig = '';

function refresh() {
  const videoId = currentVideoId();
  if (!videoId) {
    paintHtml('');
    lastPaintSig = '';
    return;
  }
  const meta = readPageMeta(videoId);
  const authors = readVisibleCommenters();
  void (async () => {
    try {
      const bag = await chrome.storage.local.get(KEY_NICO_CHANNEL_COMMENTERS);
      const index = bag?.[KEY_NICO_CHANNEL_COMMENTERS];
      const livePeople = peopleInNicoChannelCommenterIndex(index, meta.ownerId);
      const histCount = Object.keys(livePeople).length;
      const itemCount = Object.values(livePeople).reduce((n, p) => n + (Number(p?.c) || 0), 0);
      const streamCount = Number(index?.[meta.ownerId]?.streamCount) || 0;
      const card = buildNicoVideoWatchCardModel({
        videoId,
        title: meta.title,
        viewCount: meta.viewCount,
        ownerId: meta.ownerId,
        ownerName: meta.ownerName,
        recorded: { streamCount, itemCount },
        videoAuthors: authors,
        livePeople,
        historyReady: streamCount > 0 || histCount > 0,
        nowMs: Date.now(),
      });
      const html = nicoVideoWatchCardInnerHtml(card);
      const sig = `${videoId}:${html.length}:${authors.length}:${card.viewCountText}:${histCount}`;
      if (sig !== lastPaintSig) {
        lastPaintSig = sig;
        paintHtml(html);
      }
      try {
        await chrome.storage.local.set({
          [KEY_NICO_VIDEO_WATCH_CARD]: { videoId, at: Date.now(), card },
        });
      } catch {
        /* 横の欄が読めなくてもページのカードは出す */
      }
      rememberVideoCommenters(meta.ownerId, videoId, authors);
    } catch {
      /* カードが出せなくても視聴は続く */
    }
  })();
}

refresh();
try {
  document.addEventListener('nlsb-nico-video-tick', () => refresh());
} catch { /* 入口の合図が無くても初回は読む */ }
try {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
} catch { /* 同上 */ }
try {
  document.addEventListener('click', () => refresh(), { passive: true });
} catch { /* 同上 */ }
try {
  window.addEventListener('pageshow', () => refresh());
} catch { /* 同上 */ }
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes?.[KEY_NICO_CHANNEL_COMMENTERS]) return;
    refresh();
  });
} catch {
  /* 監視できなくても初回と合図で塗る */
}
