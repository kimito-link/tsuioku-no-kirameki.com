/**
 * 【この箱の仕事】YouTube 動画のコメント欄で、まだ画面に出ていない投稿者の顔の URL を、ページの世界から属性に写す。
 * 【理由】YouTube は顔の img を画面に近づくまで空にしておく(遅延読み込み)。本物の URL は yt-img-shadow の
 *   thumbnail(ページの世界のデータ)に最初から入っているが、拡張の content script(隔離された世界)からは読めない。
 *   チャット欄の顔と同じやり方(content-chat-main.js の data-nl-author-photo)で、属性を1つ置くだけにする。
 * 【動くとき】隔離された世界の動画コメントの読み取り(既存の見回り)が、読む直前に合図の DOM イベントを1回送ったときだけ。
 *   見張り(MutationObserver)・タイマー・通信は使わない。画面の見た目は変えない。ライブでは合図が来ないので何もしない。
 */
export const YT_COMMENT_PHOTO_EVENT = 'nl-yt-tag-comment-photos';
export const YT_COMMENT_PHOTO_ATTR = 'data-nl-author-photo';
const SHADOW_SEL =
  'ytd-comment-view-model #author-thumbnail yt-img-shadow, ytd-comment-renderer #author-thumbnail yt-img-shadow';

/** @param {any} shadow @returns {string} */
export function ytImgShadowThumbnailUrl(shadow) {
  try {
    const t = shadow?.thumbnail || shadow?.__data?.thumbnail || shadow?.data?.thumbnail || null;
    const list = Array.isArray(t?.thumbnails) ? t.thumbnails : [];
    const last = list[list.length - 1];
    let u = String(last?.url || '').trim();
    if (u.startsWith('//')) u = `https:${u}`;
    return /^https:\/\//.test(u) ? u : '';
  } catch {
    return '';
  }
}

/**
 * @param {Document | null | undefined} doc
 * @returns {number} 属性を書いた(書き換えた)数
 */
export function tagYtCommentPhotos(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return 0;
  let n = 0;
  try {
    const list = doc.querySelectorAll(SHADOW_SEL);
    for (let i = 0; i < list.length; i += 1) {
      const el = list[i];
      const url = ytImgShadowThumbnailUrl(el);
      // 要素は使い回されることがあるので、毎回いまのデータに合わせる(違うときだけ書く)
      if (!url) {
        if (el.hasAttribute(YT_COMMENT_PHOTO_ATTR)) el.removeAttribute(YT_COMMENT_PHOTO_ATTR);
        continue;
      }
      if (el.getAttribute(YT_COMMENT_PHOTO_ATTR) === url) continue;
      el.setAttribute(YT_COMMENT_PHOTO_ATTR, url);
      n += 1;
    }
  } catch {
    /* 読めないときは何もしない(ページは止めない) */
  }
  return n;
}

/** v0.1.2252: ページの世界が持っているコメントのデータ(投稿者の UC… ID・顔・投稿時刻)を写す属性(html 要素に1つ) */
export const YT_COMMENT_ENTITIES_ATTR = 'data-nl-yt-comment-entities';
const ENTITY_MAX = 200;

/**
 * 各コメント(ytd-comment-view-model)の polymerController.__data.commentEntity から、投稿者を読むのに要る分だけを
 * innertube と同じ形({ commentEntityPayload })で JSON にして html に置く。本文は写さない。通信はしない。
 * @param {Document | null | undefined} doc
 * @returns {number} 写したコメント数
 */
export function tagYtCommentEntities(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return 0;
  try {
    const list = doc.querySelectorAll('ytd-comment-view-model');
    /** @type {any[]} */
    const out = [];
    for (let i = 0; i < list.length && out.length < ENTITY_MAX; i += 1) {
      const el = /** @type {any} */ (list[i]);
      const e = el?.polymerController?.__data?.commentEntity || el?.__data?.commentEntity || null;
      const a = e?.author;
      const p = e?.properties;
      if (!a || typeof a !== 'object') continue;
      out.push({
        commentEntityPayload: {
          author: {
            channelId: String(a.channelId || ''),
            displayName: String(a.displayName || ''),
            avatarThumbnailUrl: String(a.avatarThumbnailUrl || ''),
            isCreator: a.isCreator === true,
          },
          properties: {
            commentId: String(p?.commentId || ''),
            publishedTime: String(p?.publishedTime || ''),
            replyLevel: Number(p?.replyLevel) || 0,
          },
        },
      });
    }
    const root = doc.documentElement;
    const json = out.length ? JSON.stringify(out) : '';
    if (root && (root.getAttribute(YT_COMMENT_ENTITIES_ATTR) || '') !== json) {
      if (json) root.setAttribute(YT_COMMENT_ENTITIES_ATTR, json);
      else root.removeAttribute(YT_COMMENT_ENTITIES_ATTR);
    }
    return out.length;
  } catch {
    return 0; /* 読めないときは DOM だけで読む */
  }
}

/**
 * 隔離された世界側: 写されたデータを読む(無ければ null)。
 * @param {Document | null | undefined} doc
 * @returns {any[] | null}
 */
export function readYtCommentEntities(doc) {
  try {
    const raw = doc?.documentElement?.getAttribute(YT_COMMENT_ENTITIES_ATTR) || '';
    if (!raw) return null;
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.length ? v : null;
  } catch {
    return null;
  }
}

/** @param {Window | null | undefined} win */
export function installYtCommentPhotoTagger(win) {
  const doc = win?.document;
  if (!doc || typeof doc.addEventListener !== 'function') return;
  const w = /** @type {any} */ (win);
  if (w.__NLS_YT_COMMENT_PHOTO_TAGGER__) return;
  w.__NLS_YT_COMMENT_PHOTO_TAGGER__ = true;
  doc.addEventListener(YT_COMMENT_PHOTO_EVENT, () => {
    tagYtCommentPhotos(doc);
    tagYtCommentEntities(doc); // v0.1.2252: 同じ合図で、投稿者のデータも写す
  });
}

/**
 * 隔離された世界から、読む直前に1回だけ合図を送る(DOM イベントは同期で両方の世界に届く)。
 * @param {Document | null | undefined} doc
 */
export function askPageToTagYtCommentPhotos(doc) {
  try {
    const Ev = doc?.defaultView?.CustomEvent || (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
    if (!doc || !Ev) return;
    doc.dispatchEvent(new Ev(YT_COMMENT_PHOTO_EVENT));
  } catch {
    /* 合図が送れなくても、今までどおり img の src だけで読む */
  }
}
