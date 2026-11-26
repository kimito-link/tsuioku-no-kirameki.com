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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
describe('実測の録画 DOM（2026-11-26・未ログイン）から投稿者を読む (0.1.2239)', () => {
  it('Twitch 録画の再生チャット .vod-message から投稿者を読む。顔画像は無い', () => {
    const html = readFileSync(join(FIX, 'twitch-vod-2940252213-replay-chat.slim.html'), 'utf8');
    const read = readVodWatchDom(docOf(html), { platform: 'twitch' });
    expect(read.commentsFound).toBe(true);
    expect(read.commentsVerified).toBe(true);
    expect(read.authors).toHaveLength(1);
    expect(read.authors[0].id).toBe('tw:minto_vtuber');
    expect(read.authors[0].name).toContain('みんみんついっち');
    expect(read.authors[0].commentCount).toBe(2);
    expect(read.authors[0].avatarUrl).toBe('');
  });

  it('ツイキャス録画プレイヤーの .tw-comment-item から投稿者と顔と新しい順を読む', () => {
    const html = readFileSync(join(FIX, 'twitcasting-movie-843232645-comment-items.slim.html'), 'utf8');
    const read = readVodWatchDom(docOf(html), { platform: 'twitcasting', ownerId: 'c:yuucho311' });
    expect(read.commentsFound).toBe(true);
    expect(read.commentsVerified).toBe(true);
    expect(read.authors.map((a) => a.id)).toEqual(['tc:aqua2207', 'tc:coke_x1', 'tc:c:tw3']);
    expect(read.authors[0].name).toBe('Aqua');
    expect(read.authors[0].postedAtMs).toBe(Date.parse('2026-11-22T10:07:38+09:00'));
    expect(read.authors[0].avatarUrl).toMatch(/^https:\/\/imagegw02\.twitcasting\.tv\//);
    expect(read.authors.find((a) => a.id === 'tc:c:tw3')?.name).toContain('匿名コメント');
    expect(read.authors[0].postedAtMs).toBeGreaterThan(read.authors[1].postedAtMs);
  });

  it('Kick の録画 HTML にチャット投稿者が無ければ 0 人のまま', () => {
    const read = readVodWatchDom(docOf('<title>SirGime VOD on KICK</title>'), { platform: 'kick' });
    expect(read.authors).toEqual([]);
    expect(read.commentsFound).toBe(false);
  });
});
