// content-chat-main.js — YouTube のチャット欄(ページ自身の世界)で動く小さな手伝い。
// チャット欄の行は、画面に出るまで送り主の顔の img に 1×1 の透明な絵しか入れない(画面の外のギフトで実例)。
// 本物の顔の URL は行のデータ(rawProps.data() / data)に最初から入っているが、拡張の content script(隔離された世界)からは
// そのデータを読めない。ここ(ページの世界)で読んで、行の属性 data-nl-author-photo に書いておく。content-chat.js がそれを読む。
// 読むだけで、YouTube の画面には何も足さない・変えない(属性を1つ置くだけ)。
// 同時視聴者数は、同じページ世界の束（content-chat-main-entry.js）が ytInitialData と
// updated_metadata から読み、html の data-nl-yt-viewers に置く。画面の文字は変えない。
(() => {
  if (!/\/live_chat(_replay)?/.test(location.pathname)) return;
  const SEL =
    'yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-paid-sticker-renderer, ' +
    'yt-live-chat-membership-item-renderer, ytd-sponsorships-live-chat-gift-purchase-announcement-renderer, ' +
    'ytd-sponsorships-live-chat-gift-redemption-announcement-renderer, yt-gift-message-view-model';
  /** @param {any} v */
  const pickUrl = (v) => {
    try {
      const srcs =
        v?.authorAvatar?.avatarViewModel?.image?.sources ||
        v?.authorPhoto?.thumbnails ||
        v?.header?.liveChatSponsorshipsHeaderRenderer?.authorPhoto?.thumbnails ||
        null;
      if (!Array.isArray(srcs) || !srcs.length) return '';
      const last = srcs[srcs.length - 1];
      let u = String(last?.url || '');
      if (u.startsWith('//')) u = `https:${u}`;
      return /^https:\/\//.test(u) ? u : '';
    } catch {
      return '';
    }
  };
  /** @param {Element} el */
  const tag = (el) => {
    if (el.hasAttribute('data-nl-author-photo')) return;
    /** @type {any} */
    const any = el;
    let d = null;
    try {
      d = typeof any.rawProps?.data === 'function' ? any.rawProps.data() : any.data || any.__data?.data || null;
    } catch {
      d = null;
    }
    const url = pickUrl(d);
    if (url) el.setAttribute('data-nl-author-photo', url);
  };
  const scan = (/** @type {ParentNode} */ root) => {
    try {
      root.querySelectorAll(SEL).forEach(tag);
    } catch {
      /* no-op */
    }
  };
  const start = () => {
    scan(document);
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (!(n instanceof Element)) continue;
          if (n.matches(SEL)) tag(n);
          scan(n);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
