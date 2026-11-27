/** @vitest-environment happy-dom */
/**
 * v0.1.2263 計器(りんく 11-27「ちゃんと反映されるように計器もいれて」)。ここが赤なら、動画ページの約束が崩れている。
 *   1. 動画ページはライブの形にしない(同時視聴者数・応援 0・「まだ記録していません」を出さない)
 *   2. サムネイルは新しい順(YouTube / Twitch / Kick / ニコ動 / ツイキャス / TikTok / ABEMA の動画カード)
 *   3. タップで、書いた本文・いいね・返信(投稿者の返信・視聴者の返信・未読み込み)が出る(データがあるときだけ)
 *   4. 会場モード・マーケHTML は、記録が無い動画でも、カードと同じページの行を読む(「コメントが0件です」にしない)
 *   5. 版のお知らせ・横の欄の一言は、いま見ているサービスに合う
 *   6. ページを読み直さずに動画を移っても(ミックス・検索・関連動画)、移った先の動画の印を読む
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildViewerBehaviorBoard,
  buildViewerBehaviorPersonDetail,
  compareVideoRows,
  viewerBehaviorPersonDetailInnerHtml,
} from '../viewerBehavior.js';
import { buildYtVideoWatchCardModel, ytVideoWatchCardInnerHtml } from '../youtube/ytVideoWatchCard.js';
import {
  classifyYtWatchContentKind,
  concurrentViewersIsViewCountLeak,
  summarizeChannelRecordedLives,
  ytVideoCommentAuthorsFromDom,
  ytVideoCommentsFromDom,
} from '../youtube/ytVideoWatchMeta.js';
import { buildVodVideoWatchCardModel, vodVideoWatchCardInnerHtml } from './videoWatchCard.js';
import { buildNicoVideoWatchCardModel, nicoVideoWatchCardInnerHtml } from '../niconico/nicoVideoWatchCard.js';
import { readVodWatchDom } from './vodCommentsFromDom.js';
import { recordedRowsOrVideoRows, videoCommentRowsForStore } from './videoCommentRows.js';
import { exportCommentsFromStoredRows } from '../youtube/exportStoredComments.js';
import { whatsNewSiteOfLocation, whatsNewSummaryForSite, WHATS_NEW_GENERIC_SUMMARY } from '../whatsNewNotice.js';
import { startYtPageViewerReader } from '../youtube/ytPageViewerReader.js';
import { venueItemsForPlatform } from '../platform/platformMetrics.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '../youtube/fixtures/real-dom');
const NOW = Date.parse('2026-11-26T11:37:20+09:00');
const LIVE_WORDS = /同時視聴者数|同時接続|応援 ?0|まだ応援コメントがない|まだ記録していません|記録していません/;

function docOf(html, url = 'https://www.youtube.com/watch?v=kKl0E22tU78') {
  const win = new Window({ url });
  win.document.write(`<!DOCTYPE html><html><body>${html}</body></html>`);
  return win.document;
}
const ytDoc = () => docOf(
  readFileSync(join(FIX, 'kKl0E22tU78-thread-pinned-hikakin.slim.html'), 'utf8') +
  readFileSync(join(FIX, 'kKl0E22tU78-thread-kvibaba.slim.html'), 'utf8'),
);
const ytCard = () => {
  const doc = ytDoc();
  return buildYtVideoWatchCardModel({
    videoId: 'kKl0E22tU78',
    viewCount: 4754603,
    videoAuthors: ytVideoCommentAuthorsFromDom(doc, { nowMs: NOW }),
    videoComments: ytVideoCommentsFromDom(doc, { nowMs: NOW }),
    nowMs: NOW,
  });
};
const textOf = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('1. 動画ページはライブの形にしない', () => {
  it('YouTube の動画カードにライブの言葉が無く、再生が出る', () => {
    const html = ytVideoWatchCardInnerHtml(ytCard());
    expect(textOf(html)).not.toMatch(LIVE_WORDS);
    expect(textOf(html)).toMatch(/再生/);
    const empty = ytVideoWatchCardInnerHtml(buildYtVideoWatchCardModel({ videoId: 'kKl0E22tU78' }));
    expect(textOf(empty)).not.toMatch(LIVE_WORDS);
  });
  it('Twitch・Kick・ツイキャス・TikTok・ABEMA・ニコ動の動画カードにもライブの言葉が無い', () => {
    for (const platform of ['twitch', 'kick', 'twitcasting', 'tiktok', 'abema']) {
      for (const authors of [[], [{ id: 'tw:a', name: 'a' }]]) {
        const html = vodVideoWatchCardInnerHtml(buildVodVideoWatchCardModel({ platform, videoId: 'v1', videoAuthors: authors }));
        expect(textOf(html), platform).not.toMatch(LIVE_WORDS);
      }
    }
    const nico = nicoVideoWatchCardInnerHtml(buildNicoVideoWatchCardModel({ videoId: 'sm9', viewCount: 10, videoAuthors: [] }));
    expect(textOf(nico)).not.toMatch(LIVE_WORDS);
  });
  it('YouTube の動画の会場の数字は、再生とコメントだけ(ライブの会場は今までどおり)', () => {
    const base = { records: { text: '100', isPlaceholder: false }, concurrent: { text: '1,234', isPlaceholder: false }, streamAge: { text: '1時間', isPlaceholder: false } };
    const video = venueItemsForPlatform('youtube', { ...base, facts: { contentKind: 'video', viewCount: 4904932, slotCommentCount: 2506 } });
    expect(video.map((i) => `${i.label} ${i.text}${i.unit}`)).toEqual(['再生 4,904,932回', 'コメント 2,506件']);
    const live = venueItemsForPlatform('youtube', { ...base, facts: { contentKind: 'live', viewers: 1234, isLive: true } });
    expect(live.map((i) => i.key)).toEqual(expect.arrayContaining(['records', 'concurrent', 'streamAge']));
    expect(live.find((i) => i.key === 'concurrent').label).not.toBe('再生');
  });
  it('同時視聴の欄に丸めた再生数(678万→6,780,000)が入っても、動画をライブにしない', () => {
    expect(concurrentViewersIsViewCountLeak(6_780_000, 6_781_234)).toBe(true);
    expect(concurrentViewersIsViewCountLeak(6_781_234, 6_780_000)).toBe(true);
    // ライブのふつうの同時視聴者数は取り違えない
    expect(concurrentViewersIsViewCountLeak(1234, 6_781_234)).toBe(false);
    expect(concurrentViewersIsViewCountLeak(6_790_000, 6_781_234)).toBe(false);
    expect(classifyYtWatchContentKind({ concurrentViewers: null, viewCount: 6_781_234 })).toBe('video');
    // 公式の印が両方「配信ではない」なら、残ったチャット枠・画面の「視聴中」の数でもライブにしない
    expect(classifyYtWatchContentKind({ isLive: false, isLiveContent: false, hasLiveChat: true, concurrentViewers: 6_780_000 })).toBe('video');
    // チャンネルが分からないとき、全チャンネルの記録を数えない(@名前 があればそれで照合)
    const sums = { aaaaaaaaaaa: { broadcasterChannelId: 'UCx', broadcasterHandle: '@foo', itemCount: 10, contentKind: 'live' }, bbbbbbbbbbb: { broadcasterChannelId: 'UCy', itemCount: 5, contentKind: 'live' } };
    expect(summarizeChannelRecordedLives(sums, '').streamCount).toBe(0);
    expect(summarizeChannelRecordedLives(sums, '', '@foo').streamCount).toBe(1);
    expect(summarizeChannelRecordedLives(sums, 'UCy').itemCount).toBe(5);
    // ライブはライブのまま
    expect(classifyYtWatchContentKind({ isLive: true, concurrentViewers: 1234, viewCount: 99 })).toBe('live');
  });
});

describe('2. サムネイルは新しい順(どのサービスの動画カードでも)', () => {
  const people = [
    { id: 'old', name: '古い人', at: NOW - 5 * 86400e3, commentCount: 5 },
    { id: 'new', name: '新しい人', at: NOW - 60e3, commentCount: 1 },
    { id: 'tieA', name: 'ん同時A', at: NOW - 3600e3 },
    { id: 'tieB', name: 'あ同時B', at: NOW - 3600e3 },
  ];
  it('時刻の新しい順。同じ時刻はページに出ている順(名前順にしない)', () => {
    const board = buildViewerBehaviorBoard({ visiblePeople: people, contentKind: 'video', nowMs: NOW });
    expect(board.rows.map((r) => r.id)).toEqual(['new', 'tieA', 'tieB', 'old']);
    expect(compareVideoRows({ id: 'x', at: 2, pageAt: 2 }, { id: 'y', at: 1, pageAt: 1 })).toBeLessThan(0);
  });
  it('YouTube の実測 DOM・VOD・ニコ動のカードも同じ並び', () => {
    const yt = ytCard().behavior.rows.map((r) => Number(r.pageAt) || 0);
    expect([...yt].sort((a, b) => b - a)).toEqual(yt);
    for (const platform of ['twitch', 'kick', 'twitcasting', 'tiktok', 'abema']) {
      const m = buildVodVideoWatchCardModel({ platform, videoId: 'v', videoAuthors: people.map((p) => ({ ...p, postedAtMs: p.at })), nowMs: NOW });
      expect(m.behavior.rows.map((r) => r.id), platform).toEqual(['new', 'tieA', 'tieB', 'old']);
    }
    const nico = buildNicoVideoWatchCardModel({ videoId: 'sm9', videoAuthors: people.map((p) => ({ userId: p.id, name: p.name, postedAtMs: p.at })), nowMs: NOW });
    expect(nico.behavior.rows.map((r) => r.id)).toEqual(['new', 'tieA', 'tieB', 'old']);
  });
  it('Twitch・Kick の再生チャット(時刻が無い)は DOM の下ほど新しい', () => {
    const tw = docOf(['a', 'b', 'a', 'c'].map((n, i) => `<div class="vod-message"><div class="vod-message__header">0:0${i}:10</div><a class="video-chat__message-author"><span class="chat-author__display-name" data-a-user="${n}">${n}</span></a><div class="video-chat__message"><span>:</span><span><span class="text-fragment" data-a-target="chat-message-text">msg${i}</span></span></div></div>`).join(''), 'https://www.twitch.tv/videos/1');
    const read = readVodWatchDom(tw, { platform: 'twitch' });
    expect(read.authors.map((a) => a.name)).toEqual(['c', 'a', 'b']);
    expect(read.authors.find((a) => a.name === 'a').comments.map((c) => c.text)).toEqual(['msg2', 'msg0']);
    const kk = docOf(['x', 'y'].map((n, i) => `<div id="chatroom-messages"><div data-index="${i}"><span class="text-neutral whitespace-nowrap">00:2${i}</span><button data-prevent-expand="true" title="${n}">${n}</button><span aria-hidden="true">:&nbsp;</span><span class="leading-[1.55] font-normal">hi${i}</span></div></div>`).join(''), 'https://kick.com/a/videos/1');
    const kr = readVodWatchDom(kk, { platform: 'kick' }).authors;
    expect(kr.map((a) => a.name)).toEqual(['y', 'x']);
    expect(kr[0].comments[0]).toMatchObject({ text: 'hi1', timeText: '00:21' });
    expect(read.authors.find((a) => a.name === 'c').comments[0].timeText).toBe('0:03:10');
  });
});

describe('3. タップで書いたこと・いいね・返信が出る', () => {
  it('YouTube: 本文・いいね(ページの表示どおり)・ハート・固定・返信(未読み込み)', () => {
    const rows = ytCard().behavior.rows;
    const hk = rows.find((r) => /HikakinTV/.test(r.name));
    const t = textOf(viewerBehaviorPersonDetailInnerHtml(buildViewerBehaviorPersonDetail(hk)));
    expect(t).toContain('200万再生ありがとう');
    expect(t).toContain('👍 4597');
    expect(t).toContain('投稿者がハート');
    expect(t).toContain('固定');
    expect(t).toMatch(/返信 54件/);
    expect(t).toMatch(/視聴者の返信 KviBaba/);
    expect(t).toMatch(/あと53件は未読み込み/);
    // 返信だけ書いた人も、書いたことが出る
    const kvi = rows.find((r) => /KviBaba/.test(r.name));
    const k = textOf(viewerBehaviorPersonDetailInnerHtml(buildViewerBehaviorPersonDetail(kvi)));
    expect(k).toContain('ヒカキンさん、皆さん');
    expect(k).toContain('HikakinTV への返信');
    expect(k).not.toMatch(/記録がまだない/);
  });
  it('投稿者の返信は、ある・(全部読めていて)無い・(読めていないので)言わない、を分ける', () => {
    const mk = (replies, replyCount) => {
      const b = buildViewerBehaviorBoard({
        contentKind: 'video',
        nowMs: NOW,
        visiblePeople: [{ id: 'p', name: 'p', at: NOW, comments: [{ commentId: 'c1', text: 'こんにちは', replyCount, replies }] }],
      });
      return textOf(viewerBehaviorPersonDetailInnerHtml(buildViewerBehaviorPersonDetail(b.rows[0])));
    };
    expect(mk([{ name: '@owner', isCreator: true, text: 'ありがとう' }], 1)).toMatch(/投稿者の返信 あり/);
    expect(mk([{ name: '@v', isCreator: false, text: 'わかる' }], 1)).toMatch(/投稿者の返信 なし/);
    const unread = mk([], 2);
    expect(unread).toMatch(/返信 2件/);
    expect(unread).toMatch(/未読み込み/);
    expect(unread).not.toMatch(/投稿者の返信/);
    // データが無ければ何も作らない
    const none = mk([], null);
    expect(none).not.toMatch(/返信|👍/);
  });
  it('Twitch の再生チャットの本文もタップで出る', () => {
    const tw = docOf('<div class="vod-message"><a><span class="chat-author__display-name" data-a-user="aa">aa</span></a><div class="video-chat__message"><span>:</span><span class="text-fragment">GG</span><img alt="Kappa" src="x"></div></div>', 'https://www.twitch.tv/videos/1');
    const m = buildVodVideoWatchCardModel({ platform: 'twitch', videoId: '1', videoAuthors: readVodWatchDom(tw, { platform: 'twitch' }).authors });
    const t = textOf(viewerBehaviorPersonDetailInnerHtml(buildViewerBehaviorPersonDetail(m.behavior.rows[0])));
    expect(t).toContain('GGKappa');
  });
});

describe('4. 会場モード・マーケHTML は動画の行を読む', () => {
  it('記録が無い動画はカードの行を返し、記録があれば記録を返す', () => {
    const card = ytCard();
    expect(card.videoRows.length).toBeGreaterThan(0);
    const wrap = { videoId: 'kKl0E22tU78', card };
    const rows = recordedRowsOrVideoRows([], wrap, 'kKl0E22tU78');
    expect(rows.length).toBe(card.videoRows.length);
    expect(rows.every((r) => r.skipVoice === true && r.text)).toBe(true);
    // 別の動画のカードは使わない
    expect(recordedRowsOrVideoRows([], wrap, 'zzzzzzzzzzz')).toEqual([]);
    // 記録があれば記録のまま(ライブは変えない)
    const rec = [{ pk: 'r1', text: 'live' }];
    expect(recordedRowsOrVideoRows(rec, wrap, 'kKl0E22tU78')).toBe(rec);
  });
  it('マーケHTML の書き出しは、行があれば 0 件にしない', async () => {
    const card = ytCard();
    const out = await exportCommentsFromStoredRows(recordedRowsOrVideoRows([], { videoId: 'kKl0E22tU78', card }, 'kKl0E22tU78'), 'lv1');
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((c) => /200万再生ありがとう/.test(c.text))).toBe(true);
  });
  it('行は古い順・重ならない pk・本文の無い行は作らない', () => {
    const rows = videoCommentRowsForStore([{ commentId: 'a', text: 'x', postedAtMs: 2000 }, { commentId: 'b', text: '', postedAtMs: 3000 }, { commentId: 'c', text: 'y', postedAtMs: 1000 }], { videoId: 'v', nowMs: NOW });
    expect(rows.map((r) => r.text)).toEqual(['y', 'x']);
    expect(new Set(rows.map((r) => r.pk)).size).toBe(rows.length);
  });
});

describe('5. 版のお知らせは、いまのサービスに合う', () => {
  it('ほかのサービスだけの一言は出さず、一般の一言にする', () => {
    expect(whatsNewSummaryForSite('Kick の録画で、ライブで見た人の顔が出るようにした', 'youtube')).toBe(WHATS_NEW_GENERIC_SUMMARY);
    expect(whatsNewSummaryForSite('YouTube の動画で新しい順にした', 'youtube')).toBe('YouTube の動画で新しい順にした');
    expect(whatsNewSummaryForSite('動画ページの表示を直した', 'youtube')).toBe('動画ページの表示を直した');
    expect(whatsNewSummaryForSite('Kick の録画で直した', 'kick')).toBe('Kick の録画で直した');
    expect(whatsNewSummaryForSite('ニコ生で直した', 'youtube')).toBe(WHATS_NEW_GENERIC_SUMMARY);
    // 版の印(platforms)があれば、それで決める
    expect(whatsNewSummaryForSite('録画の顔を直した', 'youtube', ['kick'])).toBe(WHATS_NEW_GENERIC_SUMMARY);
    expect(whatsNewSummaryForSite('録画の顔を直した', 'kick', ['kick'])).toBe('録画の顔を直した');
  });
  it('横の欄の URL からサービスを読む', () => {
    expect(whatsNewSiteOfLocation({ pathname: '/yt-sidepanel.html', search: '?stream=yt:kKl0E22tU78' })).toBe('youtube');
    expect(whatsNewSiteOfLocation({ pathname: '/yt-sidepanel.html', search: '?site=twitch' })).toBe('twitch');
    expect(whatsNewSiteOfLocation({ pathname: '/sidepanel.html', search: '' })).toBe('niconico');
    expect(whatsNewSiteOfLocation({ pathname: '/', search: '' })).toBe('');
  });
});

describe('6. ページを読み直さずに動画を移っても、移った先の印を読む', () => {
  const root = () => document.documentElement;
  afterEach(() => {
    for (const a of [...root().getAttributeNames()]) if (a.startsWith('data-nl-yt')) root().removeAttribute(a);
  });
  it('yt-navigate-finish の中身(新しい動画)で通常動画と書き、前のライブの player を使わない', async () => {
    const w = /** @type {any} */ (window);
    history.replaceState(null, '', '/watch?v=LIVEaaaaaaa');
    w.ytInitialData = { currentVideoEndpoint: { watchEndpoint: { videoId: 'LIVEaaaaaaa' } } };
    w.ytInitialPlayerResponse = { videoDetails: { videoId: 'LIVEaaaaaaa', isLive: true, isLiveContent: true } };
    startYtPageViewerReader();
    await new Promise((r) => setTimeout(r, 0));
    expect(root().getAttribute('data-nl-yt-is-live')).toBe('1');
    history.pushState(null, '', '/watch?v=VIDEObbbbbb&list=RDxx&index=2');
    window.dispatchEvent(Object.assign(new Event('yt-navigate-finish'), {
      detail: {
        response: {
          response: { currentVideoEndpoint: { watchEndpoint: { videoId: 'VIDEObbbbbb' } } },
          playerResponse: { videoDetails: { videoId: 'VIDEObbbbbb', isLive: false, isLiveContent: false, viewCount: '6781234' } },
        },
      },
    }));
    await new Promise((r) => setTimeout(r, 5));
    expect(root().getAttribute('data-nl-yt-is-live')).toBe('0');
    expect(root().getAttribute('data-nl-yt-is-live-content')).toBe('0');
    expect(root().getAttribute('data-nl-yt-content-kind')).toBe('video');
  });
});
