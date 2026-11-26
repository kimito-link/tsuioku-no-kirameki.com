import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { readVodWatchDom } from './vodCommentsFromDom.js';

/** 既存 tcPageInfo.test.js と同じ実測コメント一覧の形（2026-11-16） */
const TC_MOVIE_COMMENTS = `<div class="tw-comment-history">
<div class="tw-comment-history-item" data-comment-id="33994278190">
  <div class="tw-comment-history-item__content"><div class="tw-comment-history-item__content__text"> もう依存やん </div></div>
  <div class="tw-comment-history-item__info"><div class="tw-comment-history-item__info__user">
    <a href="/___a01desu"><img src="https://imagegw02.twitcasting.tv/image3s/pbs.twimg.com/profile_images/2108300423996256256/IXlWsKzf_bigger.jpg" class="tw-comment-history-item__user__icon"></a>
    <div class="tw-comment-history-item__details"><div class="tw-comment-history-item__details__user">
      <a class="tw-comment-history-item__details__user-link" href="/___a01desu"> ﾆｼ </a></div></div></div>
    <div><time datetime="Mon, 16 Nov 2026 18:46:03 +0900">2026/11/16 18:46</time></div>
  </div>
</div>
<div class="tw-comment-history-item" data-comment-id="33994154292">
  <div class="tw-comment-history-item__content"><div class="tw-comment-history-item__content__text"> なんでキャス </div></div>
  <div class="tw-comment-history-item__info"><div class="tw-comment-history-item__info__user">
    <a href="/c:tw1"><img src="//s01.twitcasting.tv/img/twitcas_guest1_64.jpg" class="tw-comment-history-item__user__icon"></a>
    <div class="tw-comment-history-item__details"><div class="tw-comment-history-item__details__user">
      <a class="tw-comment-history-item__details__user-link" href="/c:tw1"> 匿名コメント </a></div></div></div>
  </div>
</div>
</div>`;

function docOf(html) {
  const win = new Window();
  win.document.documentElement.innerHTML = `<head></head><body>${html}</body>`;
  return win.document;
}

describe('VOD ページの DOM から題とコメント投稿者を読む', () => {
  it('ツイキャスは、既に描かれているコメント一覧（実測の形）から投稿者を読む', () => {
    const doc = docOf(
      `<meta property="og:title" content="Romi の録画">` +
      `<div id="comment-list-app" data-broadcaster-name="Romi" data-broadcaster-screen-name="romi_lele" data-movie-id="843382496"></div>` +
      TC_MOVIE_COMMENTS,
    );
    const read = readVodWatchDom(doc, { platform: 'twitcasting', ownerId: 'romi_lele' });
    expect(read.title).toBe('Romi の録画');
    expect(read.ownerName).toBe('Romi');
    expect(read.commentsVerified).toBe(true);
    expect(read.authors.map((a) => a.id).sort()).toEqual(['tc:___a01desu', 'tc:c:tw1']);
    expect(read.authors.find((a) => a.id === 'tc:___a01desu')?.name).toContain('ﾆｼ');
  });

  it('ツイキャスの録画ページ初回 HTML のようにコメント欄が空なら、投稿者は 0 人', () => {
    const doc = docOf(
      `<meta property="og:title" content="Romi (@Romi_lele) 's Live - Twitcast">` +
      `<div id="comment-container"><div id="comment-root"></div><div id="comment-list-app" data-movie-id="843382496" data-broadcaster-name="Romi" data-account-type="not_logged_in"></div></div>`,
    );
    const read = readVodWatchDom(doc, { platform: 'twitcasting', ownerId: 'romi_lele' });
    expect(read.authors).toEqual([]);
    expect(read.commentsFound).toBe(false);
  });

  it('ABEMA の公開 JSON-LD から題を読み、コメントは無い', () => {
    const doc = docOf(
      `<script type="application/ld+json">${JSON.stringify({
        '@type': 'VideoObject',
        name: '異世界食堂２ - 第1話 「チーズケーキ」',
        '@id': 'https://abema.tv/video/episode/194-25_s2_p1',
      })}</script>`,
    );
    const read = readVodWatchDom(doc, { platform: 'abema' });
    expect(read.title).toContain('異世界食堂');
    expect(read.authors).toEqual([]);
    expect(read.commentsVerified).toBe(false);
  });

  it('Twitch / Kick の初回 HTML にコメントが無ければ投稿者は 0 人（未確認）', () => {
    const twitch = readVodWatchDom(docOf('<title>Twitch</title>'), { platform: 'twitch' });
    const kick = readVodWatchDom(docOf('<meta property="og:title" content="xQc VOD on KICK">'), { platform: 'kick' });
    expect(twitch.authors).toEqual([]);
    expect(kick.title).toContain('xQc VOD');
    expect(kick.authors).toEqual([]);
  });
});
