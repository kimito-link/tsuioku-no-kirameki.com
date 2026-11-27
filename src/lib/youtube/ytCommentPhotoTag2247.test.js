// v0.1.2247: YouTube 動画のコメント欄で、画面に出ていない投稿者の顔(img が空・遅延読み込み)も本物の URL で拾う。
//   実機 kKl0E22tU78: コメント 20 件のうち img に URL があるのは 3 件だけ(17 件は yt-img-shadow.empty)。
//   ページの世界の yt-img-shadow.thumbnail には 20 件とも yt3.ggpht.com の URL が入っていた。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import {
  askPageToTagYtCommentPhotos,
  installYtCommentPhotoTagger,
  tagYtCommentPhotos,
  ytImgShadowThumbnailUrl,
  YT_COMMENT_PHOTO_ATTR,
} from './ytCommentPhotoTag.js';
import { ytVideoCommentAuthorsFromDom, ytVideoCommentsFromDom, YT_COMMENT_TAGGED_PHOTO_ATTR } from './ytVideoWatchMeta.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const url = (n) => `https://yt3.ggpht.com/photo${n}=s88-c-k-c0x00ffffff-no-rj`;

function page(n, loaded = new Set([0])) {
  const win = new Window({ url: 'https://www.youtube.com/watch?v=kKl0E22tU78' });
  const doc = win.document;
  let html = '';
  for (let i = 0; i < n; i += 1) {
    const src = loaded.has(i) ? ` src="${url(i)}"` : '';
    html += `<ytd-comment-thread-renderer><ytd-comment-view-model><div id="body"><div id="author-thumbnail"><button id="author-thumbnail-button"><yt-img-shadow class="${loaded.has(i) ? '' : 'empty'}"><img id="img"${src}></yt-img-shadow></button></div>` +
      `<div id="main"><a id="author-text" href="/@user${i}"><span>@user${i}</span></a></div></div></ytd-comment-view-model></ytd-comment-thread-renderer>`;
  }
  doc.body.innerHTML = html;
  // ページの世界のデータ(Polymer の thumbnail)を再現
  doc.querySelectorAll('yt-img-shadow').forEach((el, i) => { /** @type {any} */ (el).thumbnail = { thumbnails: [{ url: url(i), width: 88, height: 88 }] }; });
  return { win, doc };
}

describe('動画コメントの顔を、遅延読み込みでも拾う (0.1.2247)', () => {
  it('属性の名前は、ページの世界と読み取り側で同じ', () => {
    expect(YT_COMMENT_TAGGED_PHOTO_ATTR).toBe(YT_COMMENT_PHOTO_ATTR);
  });

  it('合図の前: img が空の人は顔の URL が取れない(旧の挙動の再現)', () => {
    const { win, doc } = page(20);
    const a = ytVideoCommentAuthorsFromDom(doc);
    expect(a).toHaveLength(20);
    expect(a.filter((x) => /^https:/.test(x.avatarUrl || '')).length).toBe(1);
    win.close();
  });

  it('合図(DOM イベント)のあと: 20 人とも yt3 の URL', () => {
    const { win, doc } = page(20);
    installYtCommentPhotoTagger(/** @type {any} */ (win));
    askPageToTagYtCommentPhotos(/** @type {any} */ (doc));
    const a = ytVideoCommentAuthorsFromDom(doc);
    expect(a.filter((x) => /^https:\/\/yt3\.ggpht\.com\//.test(x.avatarUrl || '')).length).toBe(20);
    const c = ytVideoCommentsFromDom(doc);
    expect(c.filter((x) => /^https:\/\/yt3\.ggpht\.com\//.test(x.avatarUrl || '')).length).toBe(20);
    expect(a.find((x) => x.handle === '@user5')?.avatarUrl).toBe(url(5));
    win.close();
  });

  it('img に URL があればそちらを使う', () => {
    const { win, doc } = page(2, new Set([0, 1]));
    /** @type {any} */ (doc.querySelectorAll('yt-img-shadow')[1]).thumbnail = { thumbnails: [{ url: 'https://yt3.ggpht.com/other' }] };
    tagYtCommentPhotos(/** @type {any} */ (doc));
    expect(ytVideoCommentAuthorsFromDom(doc).find((x) => x.handle === '@user1')?.avatarUrl).toBe(url(1));
    win.close();
  });

  it('要素が使い回されたら、いまのデータに書き直す/データが無ければ外す', () => {
    const { win, doc } = page(1, new Set());
    const sh = /** @type {any} */ (doc.querySelector('yt-img-shadow'));
    tagYtCommentPhotos(/** @type {any} */ (doc));
    expect(sh.getAttribute(YT_COMMENT_PHOTO_ATTR)).toBe(url(0));
    sh.thumbnail = { thumbnails: [{ url: '//yt3.ggpht.com/next' }] };
    tagYtCommentPhotos(/** @type {any} */ (doc));
    expect(sh.getAttribute(YT_COMMENT_PHOTO_ATTR)).toBe('https://yt3.ggpht.com/next');
    sh.thumbnail = null;
    tagYtCommentPhotos(/** @type {any} */ (doc));
    expect(sh.hasAttribute(YT_COMMENT_PHOTO_ATTR)).toBe(false);
    win.close();
  });

  it('https 以外は使わない', () => {
    expect(ytImgShadowThumbnailUrl({ thumbnail: { thumbnails: [{ url: 'javascript:alert(1)' }] } })).toBe('');
    expect(ytImgShadowThumbnailUrl({ thumbnail: { thumbnails: [{ url: 'http://yt3.ggpht.com/x' }] } })).toBe('');
    expect(ytImgShadowThumbnailUrl(null)).toBe('');
  });

  it('合図は動画のときだけ。ページの世界は合図を待つだけ(見張り・タイマー・通信なし)', () => {
    const entry = readFileSync(join(ROOT, 'extension-youtube/src/content-chat-entry.js'), 'utf8');
    // v0.1.2249: 合図は動画のときだけ通る ytCommentScanGate の読み取りの中(変わらないときは省く)
    expect(entry).toMatch(/contentKind === 'video'\s*\?\s*ytCommentScanGate\.read\(document, videoId, \(\) => \{\s*askPageToTagYtCommentPhotos\(document\);/);
    const src = readFileSync(join(ROOT, 'src/lib/youtube/ytCommentPhotoTag.js'), 'utf8').replace(/^\s*(\*|\/\/).*$/gm, '');
    expect(src).not.toMatch(/MutationObserver|setTimeout|setInterval|fetch\(|XMLHttpRequest/);
    const main = readFileSync(join(ROOT, 'extension-youtube/src/content-chat-main-entry.js'), 'utf8');
    expect(main).toContain('installYtCommentPhotoTagger(');
  });
});

describe('動画の顔の列は、ライブと同じ顔の決め方を通す (0.1.2247)', async () => {
  const { viewerBehaviorLaneFaceSrc, viewerBehaviorRowsToLaneBuckets } = await import('../../extension/viewerBehaviorLiveLayout.js');
  const { anonymousIdenticonDataUrl } = await import('../anonymousIdenticon.js');

  it('本物の URL があればそれ', () => {
    expect(viewerBehaviorLaneFaceSrc({ id: '@a', avatarUrl: 'https://yt3.ggpht.com/x' })).toBe('https://yt3.ggpht.com/x');
  });

  it('顔の URL が無い人(Twitch の録画チャット等)・公式の既定アイコンだけの人は、その人ごとのゆっくり顔(灰色の丸にしない)', () => {
    const tw = viewerBehaviorLaneFaceSrc({ id: 'twvod-user', name: 'gumboy4649', avatarUrl: '' });
    expect(tw.startsWith('data:image/svg+xml')).toBe(true);
    expect(tw).toBe(anonymousIdenticonDataUrl('twvod-user', 64));
    const blank = viewerBehaviorLaneFaceSrc({ id: '@b', avatarUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg' });
    expect(blank.startsWith('data:image/svg+xml')).toBe(true);
    expect(viewerBehaviorLaneFaceSrc({ id: '@b' })).not.toBe(viewerBehaviorLaneFaceSrc({ id: '@c' }));
  });

  it('ニコの数値 ID は推測 URL(読み込みはガードが確かめ、失敗したら uid のゆっくり顔)', () => {
    expect(viewerBehaviorLaneFaceSrc({ id: '12345678' })).toMatch(/usericon\/s\/1234\/12345678\.jpg$/);
  });

  it('列に入る顔は空にならない', () => {
    const b = viewerBehaviorRowsToLaneBuckets({ contentKind: 'video', rows: [{ id: 'x', name: 'x', relation: 'unknown' }, { id: '', name: '匿名', isAnonymous: true, relation: 'unknown' }] });
    for (const it of b.tanu) expect(String(it.displaySrc || '')).not.toBe('');
  });

  it('仮のガードではなく、ライブと同じガード(supportGrowthAvatarLoad)と代替顔(avatarFallbackFromUrl)を使う', () => {
    const src = readFileSync(join(ROOT, 'src/extension/viewerBehaviorLiveLayout.js'), 'utf8');
    expect(src).toContain('createSupportAvatarLoadGuard(');
    expect(src).toContain('fallbackSrcFor: avatarFallbackFaceForUrl'); // v0.1.2248: ライブと同じ1関数
    expect(src).not.toContain('noteRemoteAttempt: () => {}');
  });
});
