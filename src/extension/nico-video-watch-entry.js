/**
 * ニコニコ動画の通常動画（sm / so / nm）向けの小さい入口。
 * 記録エンジン（content.js・約1.5MB）は載せない。新しい通信・Observer・タイマーは使わない。
 */
import {
  KEY_NICO_CHANNEL_COMMENTERS,
  KEY_NICO_VIDEO_WATCH_CARD,
} from '../lib/storageKeys.js';
import {
  parseNicoVideoWatchMeta,
  viewCountFromNicoJsonLd,
  unpackNicoVideoCommentersAttr,
  nicoVideoCommentersFromDomRoot,
  mergeNicoVideoCommenters,
} from '../lib/niconico/nicoVideoWatchMeta.js';
import { applyNicoCommentsToChannelIndex, peopleInNicoChannelCommenterIndex } from '../lib/niconico/nicoChannelCommenterIndex.js';
import { buildNicoVideoWatchCardModel, nicoVideoWatchCardInnerHtml } from '../lib/niconico/nicoVideoWatchCard.js';
import { videoIdentityFromUrl } from '../lib/videoWatch/videoIdentity.js';

/** 横の欄(viewerBehaviorBoardPaint.js)が既存の見回りで送る「読み直して」の合図 */
const VIDEO_WATCH_REREAD_MESSAGE = 'NLS_VIDEO_WATCH_REREAD';

const CARD_ID = 'nlsb-video-watch-card';
const STYLE_ID = 'nlsb-video-watch-card-style';

function currentVideoId() {
  // 横の欄と同じ関数で作った身元の鍵(sm9 など)。書く鍵と探す鍵を 1 つにする(v0.1.2241)
  const identity = videoIdentityFromUrl(String(location.href || ''));
  return identity && identity.service === 'niconico' ? identity.key : '';
}

/** @param {unknown} raw */
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

/** @param {string} videoId */
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
  /** @type {any} */
  let fromAttr = [];
  try {
    fromAttr = unpackNicoVideoCommentersAttr(document.documentElement?.getAttribute('data-nlsb-nico-video-commenters') || '');
  } catch {
    fromAttr = [];
  }
  const fromDom = nicoVideoCommentersFromDomRoot(document);
  return mergeNicoVideoCommenters(fromAttr, fromDom);
}

/**
 * v0.1.2241: 視聴ページの右下には何も浮かせない(カードは横の欄にだけ出す・YouTube の venue-inline-entry.js と同じ)。
 *   0.1.2239 実機(sm9)で、古い文字だけのカードがページの右下に重なっていた。前の版が残した枠も消す。
 * @param {string} [_html]
 */
function paintHtml(_html) {
  try {
    document.getElementById(CARD_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
  } catch {
    /* 消せなくても視聴は続く */
  }
}

/** @type {string} */
let rememberVideoId = '';
/** @type {Set<string>} */
const rememberedIds = new Set();

/**
 * @param {string} ownerId
 * @param {string} videoId
 * @param {any[]} authors
 */
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
        /** @type {any} */ (bag?.[KEY_NICO_CHANNEL_COMMENTERS]),
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
      /** @type {any} */
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
        facts: meta.facts,
        livePeople,
        historyReady: streamCount > 0 || histCount > 0,
        nowMs: Date.now(),
      });
      const html = nicoVideoWatchCardInnerHtml(card);
      const sig = `${videoId}:${html.length}:${authors.length}:${card.viewCountText}:${histCount}`;
      paintHtml('');
      // 中身が変わったときだけ書く(クリックや読み直しの合図のたびに横の欄を塗り直させない)
      if (sig !== lastPaintSig) {
        lastPaintSig = sig;
        try {
          await chrome.storage.local.set({
            [KEY_NICO_VIDEO_WATCH_CARD]: { videoId, at: Date.now(), card },
          });
        } catch {
          lastPaintSig = '';
        }
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
  // 横の欄が開いている間だけ届く(既存の見回りに乗る)。DOM を読み直し、変化が無ければ書かない。
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== VIDEO_WATCH_REREAD_MESSAGE) return;
    refresh();
  });
} catch { /* 合図が無くてもクリック・可視復帰で読む */ }
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes?.[KEY_NICO_CHANNEL_COMMENTERS]) return;
    refresh();
  });
} catch {
  /* 監視できなくても初回と合図で塗る */
}
