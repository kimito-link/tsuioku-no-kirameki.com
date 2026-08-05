import { describe, it, expect } from 'vitest';
import {
  extractLiveIdForSidePanel,
  resolveSidePanelPath,
  shouldEnableSidePanelForTab
} from './sidePanelWatchTarget.js';

const WATCH = 'https://live.nicovideo.jp/watch/lv351107725';
const OTHER = 'https://live.nicovideo.jp/watch/lv999999999';

describe('extractLiveIdForSidePanel', () => {
  it('watch URL から配信IDを取り出す', () => {
    expect(extractLiveIdForSidePanel(WATCH)).toBe('lv351107725');
  });

  it('クエリや末尾が付いていても取り出せる', () => {
    expect(extractLiveIdForSidePanel(`${WATCH}?ref=x`)).toBe('lv351107725');
    expect(extractLiveIdForSidePanel(`${WATCH}/`)).toBe('lv351107725');
  });

  it('watch でないURLからは取り出さない', () => {
    for (const u of [
      'https://www.nicovideo.jp/',
      'https://live.nicovideo.jp/',
      'https://example.com/watch/lv1',
      'chrome://extensions',
      '', null, undefined, 123, {}
    ]) {
      expect(extractLiveIdForSidePanel(u)).toBe('');
    }
  });

  it('★ドメインを検証する(テストで実際に見つけた穴。無関係なサイトの /watch/lv1 を拾わない)', () => {
    // サイドパネルは既定で全タブ共有＝無関係なタブのURLが渡りうる。
    expect(extractLiveIdForSidePanel('https://example.com/watch/lv1')).toBe('');
    expect(extractLiveIdForSidePanel('https://nicovideo.jp.evil.com/watch/lv1')).toBe('');
    expect(extractLiveIdForSidePanel('https://evil.com/?x=https://live.nicovideo.jp/watch/lv1')).toBe('');
    // 正規のサブドメインは通す。
    expect(extractLiveIdForSidePanel('https://live.nicovideo.jp/watch/lv1')).toBe('lv1');
    expect(extractLiveIdForSidePanel('https://nicovideo.jp/watch/lv1')).toBe('lv1');
  });

  it('★lv でない/桁が異常なものを弾く(誤った配信を掴まない)', () => {
    expect(extractLiveIdForSidePanel('https://live.nicovideo.jp/watch/ch12345')).toBe('');
    expect(extractLiveIdForSidePanel('https://live.nicovideo.jp/watch/lv1234567890123456')).toBe('');
  });
});

describe('resolveSidePanelPath — 過去の「空に見える」事故を防ぐ', () => {
  it('★このタブが watch なら、そのタブの配信を使う(全タブ共有による取り違えを防ぐ)', () => {
    const r = resolveSidePanelPath({ tabUrl: WATCH, lastWatchUrl: OTHER });
    expect(r.liveId).toBe('lv351107725');
    expect(r.path).toBe('sidepanel.html?lv=lv351107725');
    expect(r.source).toBe('tab');
  });

  it('★タブのURLが最優先(最後に見た配信より、いま開いているタブを尊重)', () => {
    // 複数タブで別配信を見ている状況の再現。
    const r = resolveSidePanelPath({ tabUrl: OTHER, lastWatchUrl: WATCH });
    expect(r.liveId).toBe('lv999999999');
    expect(r.source).toBe('tab');
  });

  it('タブが watch でなければ、最後に見た配信へ落ちる(comeview と同型)', () => {
    const r = resolveSidePanelPath({ tabUrl: 'https://www.nicovideo.jp/', lastWatchUrl: WATCH });
    expect(r.liveId).toBe('lv351107725');
    expect(r.source).toBe('lastWatch');
  });

  it('★どちらも無ければ推測で埋めない(既定パスのまま返す)', () => {
    const r = resolveSidePanelPath({ tabUrl: 'https://example.com', lastWatchUrl: '' });
    expect(r.path).toBe('sidepanel.html');
    expect(r.liveId).toBe('');
    expect(r.source).toBe('none');
  });

  it('引数が空でも落ちない', () => {
    expect(resolveSidePanelPath(undefined)).toMatchObject({ path: 'sidepanel.html', source: 'none' });
  });

  it('basePath を差し替えられる(パス変更に追随できる)', () => {
    const r = resolveSidePanelPath({ tabUrl: WATCH, basePath: 'x/panel.html' });
    expect(r.path).toBe('x/panel.html?lv=lv351107725');
  });
});

describe('shouldEnableSidePanelForTab — 空のパネルを出さない', () => {
  it('★watch タブでのみ有効(過去の撤退理由=中身が無く空に見える、を防ぐ)', () => {
    expect(shouldEnableSidePanelForTab(WATCH)).toBe(true);
  });

  it('watch でないタブでは有効にしない', () => {
    for (const u of ['https://www.nicovideo.jp/', 'chrome://newtab', '', null]) {
      expect(shouldEnableSidePanelForTab(u)).toBe(false);
    }
  });
});
