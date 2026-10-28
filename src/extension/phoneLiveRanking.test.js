import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const vercel = JSON.parse(read('vercel.json'));
const liveHtml = read('app/live.html');
const lpLive = read('tsuioku-no-kirameki/live/index.html');
const phoneHtml = read('app/phone.html');
const phoneJs = read('app/phone.js');

describe('PC 無しで見られる応援ランキング(app.tsuioku-no-kirameki.com/live・v0.1.1764)', () => {
  it('★アプリのドメインの /live は app/live.html(LP の /live/ とは別の書き換え)', () => {
    const r = vercel.rewrites.find((x) => x.source === '/live');
    expect(r).toBeTruthy();
    expect(r.destination).toBe('/app/live.html');
    expect(r.has).toEqual([{ type: 'host', value: 'app.tsuioku-no-kirameki.com' }]);
  });

  it('★見た目と描画は LP の /live/ と同じ1本を読む(2箇所目を書かない)', () => {
    expect(liveHtml).toContain('href="/tsuioku-no-kirameki/assets/css/live-ranking.css"');
    expect(lpLive).toContain('href="../assets/css/live-ranking.css"');
    expect(lpLive).not.toContain('<style>');
    expect(liveHtml).toContain('src="/app/dist/live-ranking.js"');
    for (const id of ['id="list"', 'id="meta"', 'id="refreshCountdown"', 'data-refresh']) expect(liveHtml).toContain(id);
  });

  it('アプリの画面には LP のヘッダー/フッターと Chrome 拡張の入手案内を出さない', () => {
    expect(liveHtml).not.toContain('site-chrome-lp.js');
    expect(liveHtml).not.toContain('chromewebstore.google.com');
  });

  it('★開始画面の 🏆 から開ける(前回のリンクを自動で開く前にも選べる)', () => {
    expect(phoneHtml).toContain('id="rankingBtn"');
    expect(phoneHtml).toContain('id="resumeRanking"');
    expect(phoneJs).toContain("$('rankingBtn').addEventListener('click', () => go('/live'));");
    expect(phoneJs).toContain("$('resumeRanking').addEventListener('click', () => { clearTimeout(autoTimer); go('/live'); });");
  });
});

describe('PC が無くても放送の URL を貼れば見られる(v0.1.1819)', () => {
  const entry = read('src/extension/live-ranking-entry.js');
  it('★開始画面はニコ生の放送 URL を拡張のリンクより先に見る(lv だけの文字列はトークンの形にも合うため)', () => {
    const lvAt = phoneJs.indexOf('parseNicoliveWatchLink(raw)');
    const viewerAt = phoneJs.indexOf('parseViewerLink(raw)');
    expect(lvAt).toBeGreaterThan(0);
    expect(lvAt).toBeLessThan(viewerAt);
    expect(phoneJs).toContain('go(`/live?lv=${encodeURIComponent(lv)}`)');
    expect(phoneHtml).toContain('placeholder="https://live.nicovideo.jp/watch/lv…"');
  });
  it('★一覧に無い配信は ?lv= の API で1配信だけ足す(一覧がまだ無くても出す)', () => {
    expect(entry).toContain('.then(withPinnedLive)');
    expect(entry).toContain('/api/live-ranking?lv=${encodeURIComponent(PINNED_LV)}');
    expect(entry).toContain('if (r.status === 404 && PINNED_LV) return null;');
  });
});
