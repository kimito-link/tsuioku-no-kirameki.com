import { describe, expect, it } from 'vitest';
import { decidePrearm, judgePrearmSpec } from './sidePanelPrearm.js';

/**
 * ★この検査が守っているのは「速くすること」ではなく
 *   【速さのために既存機能を壊さないこと】。
 *   openPanelOnActionClick:true にすれば確かに速いが、
 *   埋め込み派のツールバーが死ぬ(過去に撤退済み・既存テストが禁止)。
 */

const tab = (url, id = 1) => ({ id, url });

describe('decidePrearm — watchページだけ事前用意する', () => {
  it('watchタブなら用意する(押される前にpathを確定)', () => {
    expect(decidePrearm(tab('https://live.nicovideo.jp/watch/lv351201716'))).toEqual({
      prearm: true, lv: 'lv351201716', path: 'sidepanel.html?lv=lv351201716', reason: 'ok'
    });
  });

  it('スマホ版の watch も対象', () => {
    expect(decidePrearm(tab('https://sp.live.nicovideo.jp/watch/lv999')).lv).toBe('lv999');
  });

  it('クエリ/ハッシュ付きでも正しく抜く', () => {
    expect(decidePrearm(tab('https://live.nicovideo.jp/watch/lv123?a=1#b')).lv).toBe('lv123');
  });

  it('★watch以外では何もしない(空のパネルを出す事故を避ける)', () => {
    expect(decidePrearm(tab('https://live.nicovideo.jp/ranking')).reason).toBe('not-watch');
    expect(decidePrearm(tab('https://www.google.com/')).reason).toBe('not-watch');
    expect(decidePrearm(tab('chrome-extension://x/sidepanel.html')).reason).toBe('not-watch');
  });

  it('タブIDが無ければ何もしない', () => {
    expect(decidePrearm({ url: 'https://live.nicovideo.jp/watch/lv1' }).reason).toBe('no-tab');
    expect(decidePrearm(null).reason).toBe('no-tab');
  });

  it('★不正な配信IDは path に載せない(生値を埋めない)', () => {
    expect(decidePrearm(tab('https://live.nicovideo.jp/watch/lv1234567890123456')).reason)
      .toBe('not-watch');
    expect(decidePrearm(tab('https://live.nicovideo.jp/watch/abc')).reason).toBe('not-watch');
  });

  it('★pathは必ず sidepanel.html?lv=<正規化済み> の形', () => {
    const d = decidePrearm(tab('https://live.nicovideo.jp/watch/lv42'));
    expect(d.path).toBe('sidepanel.html?lv=lv42');
    expect(d.path).not.toMatch(/[<>"'\s]/);
  });

  it('壊れた入力でも落ちない', () => {
    expect(() => decidePrearm(undefined)).not.toThrow();
    expect(() => decidePrearm({ id: 'x', url: 123 })).not.toThrow();
  });
});

describe('judgePrearmSpec — 既存を壊す形に退化していないか', () => {
  it('既定は OK', () => {
    expect(judgePrearmSpec({})).toEqual({ ok: true, reason: 'ok' });
  });

  it('★openPanelOnActionClick を奪う形は不可(埋め込み派のツールバーが死ぬ)', () => {
    expect(judgePrearmSpec({ opensOnActionClick: true }))
      .toEqual({ ok: false, reason: 'steals-action-click' });
  });

  it('★watch以外に手を出す形は不可', () => {
    expect(judgePrearmSpec({ touchesNonWatch: true }).reason).toBe('touches-non-watch');
  });

  it('壊れた入力でも落ちない', () => {
    expect(() => judgePrearmSpec(null)).not.toThrow();
    expect(judgePrearmSpec(null).ok).toBe(true);
  });
});
