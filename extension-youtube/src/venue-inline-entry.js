// venue-inline-entry.js — ニコ生版の視聴ページの「🏟 会場モード」(content-entry.js が呼ぶ mountVenueBarButton)を、
//   YouTube の視聴ページでそのまま動かす入口(content script・上の枠だけ)。
//   ニコ生版は視聴ページの URL(/watch/lv…)で配信を決める。YouTube の視聴ページは /watch?v=… なので、
//   動画の疑似 lv を venueBar に教えてから(ビルド時に足す __ytSetVenueLiveId)、ニコ生版と同じ呼び方で出す。
//   会場の作り・見た目・席・吹き出し・読み上げはニコ生版の venueBar.js のまま(手を加えない)。
//   ★2026-11-04 りんく「このかたちがいい」(ニコ生版の視聴ページのボタン)・「画面をくろくおおわないで」(0.1.69 の重ね窓は撤去)。
import { pseudoLvForVideoId, ytIsImportantVoiceKey } from './ytNicoShim.js';
import { ytInstallLocalAssetUrls, ytPrefetchLocalAssets } from './ytLocalAssetUrls.js';
import { listCharaLiveImagePaths } from '../../src/lib/charaLiveStage.js';
import { VoicePlayer } from '../../src/lib/voicePlayer.js';
import { ytShouldVoiceWhenCrowded } from '../../src/lib/youtube/ytVoicePriority.js';
import { parseYtVideoIdFromUrl, isYtWatchLikeUrl } from '../../src/lib/youtube/ytPageMeta.js';
// @ts-ignore ビルド時に venueBar.js の末尾へ足す(scripts/build-youtube-ext.mjs の ytVenueLiveIdPlugin)
import { mountVenueBarButton, __ytSetVenueLiveId } from '../../src/extension/venueBar.js';
// ニコ生版の放送ページと同じ見回り: 拡張が入れ替わったあと古い版のまま止まったページを、自分で読み込み直す
//   (content-entry.js の startOrphanTabAutoReloadInPage。2026-11-04 実機: 更新後も古い会場が動き続け、キャラ画像が読めない)。
import { startOrphanTabAutoReloadInPage } from '../../src/extension/orphanTabAutoReloadHost.js';
import { isExtensionContextAlive } from '../../src/lib/reportSilentError.js';

/** @returns {string} 視聴ページ(/watch?v= ・ /live/<id>)の動画 id。視聴ページでなければ '' */
function currentVideoId() {
  const href = String(location.href || '');
  return isYtWatchLikeUrl(href) ? parseYtVideoIdFromUrl(href) : '';
}

// ニコ生版の会場は、ニコ生の視聴ページの文字の大きさ(16px)を受け継ぐ前提で作られている(例: 人の札の幅 26ch)。
//   YouTube の視聴ページは html の文字が 10px なので、札が 140px に細くなり1〜2文字ずつ折り返していた(2026-11-04 実測:
//   ニコ生 224px・YouTube 140px)。会場の根元だけ、ニコ生のページと同じ 16px にする(会場の中の見た目はニコ生版のまま)。
function ensureBaseFontSize() {
  if (document.getElementById('ytNlsbVenueBaseFont')) return;
  const st = document.createElement('style');
  st.id = 'ytNlsbVenueBaseFont';
  st.textContent = '#nlsb-venue-root{font-size:16px;}';
  (document.head || document.documentElement).appendChild(st);
}

let mountedVid = '';
/** 視聴ページ以外(ホーム・検索など)へ移ったら、会場をしまって隠す。ニコ生の視聴ページは移るとページごと消えるのと同じに見せる */
function setRootShown(/** @type {boolean} */ shown) {
  const root = /** @type {HTMLElement|null} */ (document.getElementById('nlsb-venue-root'));
  if (!root) return;
  if (!shown && document.documentElement.classList.contains('nlsb-venue-open')) {
    root.querySelector('.nlsb-close-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
  root.style.display = shown ? '' : 'none';
}
function sync() {
  const vid = currentVideoId();
  if (!vid) {
    setRootShown(false);
    return;
  }
  setRootShown(true);
  if (vid === mountedVid) return;
  __ytSetVenueLiveId(pseudoLvForVideoId(vid));
  mountedVid = vid;
  ensureBaseFontSize();
  if (!document.getElementById('nlsb-venue-root')) mountVenueBarButton();
}

// 会場の画像はネットワークを通さず blob: で読む(ytLocalAssetUrls.js・YouTube のページの見張りがエラー一覧に積もるため)。
//   キャラの絵と案内の顔は先に読んでから会場を出す(最長2.5秒・読めた分から効く)。
ytInstallLocalAssetUrls();
const PREFETCH = [
  ...listCharaLiveImagePaths(),
  'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png',
  'images/yukkuri-charactore-english/konta/kitsune-yukkuri-half-eyes-mouth-closed.png',
  'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.png',
  'images/toumeilink.png',
];

// YouTube はページを読み直さずに動画を移る。1秒ごとに見て、動画が変わったら会場の配信を切り替える。
void ytPrefetchLocalAssets(PREFETCH).then(() => {
  setInterval(sync, 1000);
  sync();
});

if (window.top === window) startOrphanTabAutoReloadInPage(() => isExtensionContextAlive());

// 計器(2026-11-04): 会場の画像の読み込み失敗を記録する。りんくの拡張のエラー一覧に「Unsafe attempt to load URL … from frame」が
//   YouTube 版だけ出る(ニコ生版には出ない)。画面の画像は出ているので、どの画像が・いつ・どんな状態で失敗しているかを数える。
//   保存先 yt_diag_img_errors(最新40件)。見た目は変えない。
(() => {
  /** @type {any[]} */
  let buf = [];
  let total = 0;
  let timer = 0;
  const flush = () => {
    timer = 0;
    try {
      if (!isExtensionContextAlive()) return;
      void chrome.storage.local.set({ yt_diag_img_errors: { at: Date.now(), total, items: buf.slice(-40) } }).catch(() => {});
    } catch {
      /* 計器は本体を止めない */
    }
  };
  document.addEventListener(
    'error',
    (ev) => {
      const el = /** @type {any} */ (ev.target);
      if (!(el instanceof HTMLImageElement)) return;
      const root = document.getElementById('nlsb-venue-root');
      if (!root || !root.contains(el)) return;
      total += 1;
      let dom = '';
      try {
        dom = String(document.domain);
      } catch {
        dom = '?';
      }
      buf.push({
        at: Date.now(),
        src: String(el.getAttribute('src') || '').slice(0, 160),
        cur: String(el.currentSrc || '').slice(0, 160),
        cls: String(el.className || '').slice(0, 60),
        parentCls: String(el.parentElement?.className || '').slice(0, 60),
        connected: el.isConnected,
        ownerIsDoc: el.ownerDocument === document,
        ready: document.readyState,
        vis: document.visibilityState,
        dom,
        href: String(location.href).slice(0, 80),
        open: document.documentElement.classList.contains('nlsb-venue-open'),
      });
      if (buf.length > 80) buf = buf.slice(-40);
      if (!timer) timer = window.setTimeout(flush, 2000);
    },
    true,
  );
})();

// 混んだら大事なものだけ読む(2026-11-04 りんく決定)。ニコ生版の会場の読み上げ(VoicePlayer)はそのままで、
//   YouTube 版の中だけ、列に入れる手前で選ぶ: 読み上げの待ちが2件以上なら、スパチャ・メンバー・ギフト・配信者/モデレーター・
//   その配信で初めてのコメント以外は読まない(吹き出しは出る)。大事なものは古くなっても飛ばさない(ニコ生のギフトと同じ扱い)。
//   計器: diag.ytCrowdSkipTotal(読まずに吹き出しだけにした数)・diag.ytImportantTotal(大事なものとして列に入れた数)。
(() => {
  const proto = /** @type {any} */ (VoicePlayer.prototype);
  if (proto.__ytCrowdWrapped) return;
  proto.__ytCrowdWrapped = true;
  const realEnqueue = proto.enqueue;
  let lastCrowdDiagAt = 0;
  proto.enqueue = function (/** @type {any[]} */ items) {
    if (!Array.isArray(items)) return realEnqueue.call(this, items);
    /** @type {any[]} */
    const keep = [];
    /** @type {any[]} */
    const importantItems = [];
    for (const it of items) {
      if (!it || it.kind !== 'comment') {
        keep.push(it);
        continue;
      }
      const important = ytIsImportantVoiceKey(it.key);
      const queueLength = (Array.isArray(this.queue) ? this.queue.length : 0) + keep.length;
      if (!ytShouldVoiceWhenCrowded({ important, queueLength })) {
        this.diag.ytCrowdSkipTotal = (Number(this.diag.ytCrowdSkipTotal) || 0) + 1;
        try {
          it.onDropped?.();
        } catch {
          /* 吹き出しの後始末の失敗で読み上げを止めない */
        }
        continue;
      }
      if (important) {
        this.diag.ytImportantTotal = (Number(this.diag.ytImportantTotal) || 0) + 1;
        importantItems.push(it);
      }
      keep.push(it);
    }
    const r = realEnqueue.call(this, keep);
    // 計器は別のキーに書く(ニコ生版の読み上げ計器の保存は決まった項目だけを写すので、ここで足した数は残らない)
    const now = Date.now();
    if (now - lastCrowdDiagAt > 3000) {
      lastCrowdDiagAt = now;
      try {
        if (isExtensionContextAlive()) {
          void chrome.storage.local.set({
            yt_diag_voice_crowd: { at: now, crowdSkipTotal: Number(this.diag.ytCrowdSkipTotal) || 0, importantTotal: Number(this.diag.ytImportantTotal) || 0, queueNow: Array.isArray(this.queue) ? this.queue.length : 0 },
          }).catch(() => {});
        }
      } catch {
        /* 計器は読み上げを止めない */
      }
    }
    // 大事なものは古くなっても飛ばさない(列の中の印をギフトと同じ high にする)
    if (importantItems.length && Array.isArray(this.queue)) {
      const drops = new Set(importantItems.map((x) => x.onDropped).filter(Boolean));
      for (const q of this.queue) if (q && drops.has(q.onDropped)) q.priority = 'high';
    }
    return r;
  };
})();
