// v0.1.2245: 動画ページの横の欄で、前に見ていたライブ配信の札(りんくの一言・記録 0・応援 0)が
//   動画のカードと食い違って見えた件と、YouTube 動画で顔は並ぶのに人数が 0 人扱いだった件の固定。
//   行や枠は足さず、既存の「動画ページの印」で隠すだけ。印はライブのページでは付かない。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { buildYtVideoWatchCardModel, ytVideoWatchCardInnerHtml } from '../youtube/ytVideoWatchCard.js';
import {
  applyVideoWatchRootMark,
  VIDEO_WATCH_HIDE_LIVE_STATS_CSS,
  VIDEO_WATCH_HIDE_STYLE_ID,
  VIDEO_WATCH_ROOT_ATTR,
} from '../../extension/viewerBehaviorBoardPaint.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const MARK = `html[${VIDEO_WATCH_ROOT_ATTR}="1"]`;

describe('動画ページでは前のライブ配信の札を隠す (0.1.2245)', () => {
  it('りんくのイベント順位の一言・記録の札・応援の欄を、印が付いたときだけ隠す', () => {
    for (const sel of ['#watchConcurrentCard', '.nl-official-nico-stats__row', '#liveStatCards', '#nlEventStanding', 'section.nl-stats']) {
      expect(VIDEO_WATCH_HIDE_LIVE_STATS_CSS).toContain(`${MARK} ${sel}`);
    }
    // 印の無い(=ライブの)ページに効く規則は無い
    const rules = VIDEO_WATCH_HIDE_LIVE_STATS_CSS.replace(/\{[^}]*\}/g, '').split(',');
    for (const r of rules) expect(r.trim().startsWith(MARK)).toBe(true);
  });

  it('印を付けると隠す規則が入り、外すと印だけ消える(ライブへ戻ると元どおり)', () => {
    const win = new Window();
    const doc = win.document;
    doc.body.innerHTML = '<div id="liveStatCards"></div><section class="nl-stats"></section>';
    applyVideoWatchRootMark(/** @type {any} */ (doc), true);
    expect(doc.documentElement.getAttribute(VIDEO_WATCH_ROOT_ATTR)).toBe('1');
    expect(doc.getElementById(VIDEO_WATCH_HIDE_STYLE_ID)?.textContent).toBe(VIDEO_WATCH_HIDE_LIVE_STATS_CSS);
    applyVideoWatchRootMark(/** @type {any} */ (doc), false);
    expect(doc.documentElement.hasAttribute(VIDEO_WATCH_ROOT_ATTR)).toBe(false);
    win.close();
  });

  it('隠す枠は横の欄(ニコ生版・YouTube 版)に実在し、動画のカード(人の列)はその外にある', () => {
    for (const f of ['extension/popup.html', 'extension/yt-sidepanel.html']) {
      const html = readFileSync(join(ROOT, f), 'utf8');
      const win = new Window();
      win.document.write(html);
      const d = win.document;
      expect(d.getElementById('liveStatCards')).toBeTruthy();
      expect(d.querySelector('section.nl-stats')).toBeTruthy();
      const primary = d.getElementById('nlPopupPrimary');
      expect(primary).toBeTruthy();
      // カードは #nlPopupPrimary の直下に差し込まれる(隠す枠の中ではない)
      expect(primary?.closest('#liveStatCards, section.nl-stats')).toBeNull();
      win.close();
    }
  });
});

describe('YouTube 動画カードの人数を、並べる顔と同じ数え方にそろえる (0.1.2245)', () => {
  const handleOnly = Array.from({ length: 20 }, (_, i) => ({ handle: `@user${i}`, name: `@user${i}`, avatarUrl: '' }));

  it('未ログイン(@名前 だけ・UC… なし)でも、見えている人数が 0 にならない', () => {
    const m = buildYtVideoWatchCardModel({ videoId: 'kKl0E22tU78', videoAuthors: handleOnly, viewCount: 4754603 });
    expect(m.videoAuthorCount).toBe(20);
    expect(m.matchSummary).toContain('20 人');
    expect(ytVideoWatchCardInnerHtml(m)).toContain('いま見えているコメントの投稿者は 20 人です');
  });

  it('UC… がある人は従来どおり 1 人 1 回(同じ人を二重に数えない)', () => {
    const uc = 'UC' + 'a'.repeat(22);
    const m = buildYtVideoWatchCardModel({
      videoId: 'x',
      videoAuthors: [{ channelId: uc, handle: '@a', name: 'A' }, { channelId: uc, handle: '@a', name: 'A' }, { handle: '@b', name: 'B' }],
    });
    expect(m.videoAuthorCount).toBe(2);
  });

  it('コメントが見えていなければ 0 のまま(数を作らない)', () => {
    const m = buildYtVideoWatchCardModel({ videoId: 'x', videoAuthors: [] });
    expect(m.videoAuthorCount).toBe(0);
  });
});
