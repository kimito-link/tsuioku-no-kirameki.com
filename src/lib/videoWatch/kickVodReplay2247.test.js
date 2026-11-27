// v0.1.2247: Kick 録画の「Chat Replay」の投稿者を読む(実機 sirgime/01a20e11-… で alnasty・BotRix を確認)。
import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { readVodWatchDom } from './vodCommentsFromDom.js';

const row = (i, name, color = 'rgb(222, 178, 255)') =>
  `<div data-index="${i}" class="absolute inset-x-0 top-0"><div class="group relative px-2"><div class="w-full min-w-0 shrink-0"><div class="inline-flex max-w-full flex-nowrap">` +
  `<span class="text-xs">00:1${i}</span><div class="inline-flex min-w-0 flex-nowrap items-baseline"><div class="flex items-center gap-1 self-center pr-1"><div data-state="closed"><img alt="KICK Founder 22" src="https://ext.cdn.kick.com/chat/badges/x.png"></div></div>` +
  `<button class="inline font-bold truncate" title="${name}" data-prevent-expand="true" style="color: ${color};">${name}</button></div><span>: hello</span></div></div></div></div>`;

describe('Kick 録画の Chat Replay (0.1.2247)', () => {
  it('#chatroom-messages の行から投稿者を読み、ライブと同じ kk:@slug で区別する', () => {
    const win = new Window({ url: 'https://kick.com/sirgime/videos/01a20e11-4ea8-7eba-b3ef-a132654bb4bf' });
    win.document.body.innerHTML = `<div id="chatroom-messages" data-testid="chatroom-messages"><div class="no-scrollbar relative">${row(0, 'alnasty')}${row(1, 'BotRix')}${row(2, 'alnasty')}</div></div>`;
    const r = readVodWatchDom(/** @type {any} */ (win.document), { platform: 'kick' });
    expect(r.authors.map((a) => a.id).sort()).toEqual(['kk:@alnasty', 'kk:@botrix']);
    expect(r.authors.find((a) => a.id === 'kk:@alnasty')?.commentCount).toBe(2);
    expect(r.commentsFound).toBe(true);
    win.close();
  });

  it('Chat Replay が無いページ(年齢確認の壁だけ等)は 0 人のまま', () => {
    const win = new Window({ url: 'https://kick.com/sirgime/videos/x' });
    win.document.body.innerHTML = '<div>This content is for mature viewers only.</div>';
    const r = readVodWatchDom(/** @type {any} */ (win.document), { platform: 'kick' });
    expect(r.authors).toEqual([]);
    expect(r.commentsFound).toBe(false);
    win.close();
  });
});
