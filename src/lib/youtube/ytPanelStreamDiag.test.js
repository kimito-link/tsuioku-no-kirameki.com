import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { callerNameFromStack, createPanelStreamDiag, hostOfUrl, normalizeStorageKeyName, panelStreamDiagContext, serviceOfStreamKey } from './ytPanelStreamDiag.js';

const keys = /** @type {Record<string, string>} */ ({ lv1: 'dQw4w9WgXcQ', lv2: 'kk.someone.123', lv3: 'sr.room.456' });
const make = () => {
  let t = 1000;
  const d = createPanelStreamDiag({ now: () => (t += 10), lvToKey: (lv) => keys[lv] || '' });
  return d;
};

describe('ytPanelStreamDiag(横の欄の配信選びの計器)', () => {
  it('配信キーからサービスを出す', () => {
    expect(serviceOfStreamKey('dQw4w9WgXcQ')).toBe('youtube');
    expect(serviceOfStreamKey('kk.someone.123')).toBe('kick');
    expect(serviceOfStreamKey('')).toBe('');
  });

  it('URL はホストだけ残す(パス・クエリは残さない)', () => {
    expect(hostOfUrl('https://kick.com/someone?x=1')).toBe('kick.com');
    expect(hostOfUrl('not a url')).toBe('');
  });

  it('画面ごとに書き先を分ける', () => {
    expect(panelStreamDiagContext('/yt-sidepanel.html')).toBe('sidepanel');
    expect(panelStreamDiagContext('/comeview.html')).toBe('comeview');
    expect(panelStreamDiagContext('/yt-comeview.html')).toBe('comeview');
    expect(panelStreamDiagContext('/watch')).toBe('page');
  });

  it('聞かれた配信の切り替わりを数える(探り読みは数えない・同じ配信の連続は1件)', () => {
    const d = make();
    d.asked('lv2', false);
    d.asked('lv2', false);
    d.asked('lv1', true);
    d.asked('lv1', false);
    d.asked('lv2', false);
    const s = d.snapshot();
    expect(s.askedSwitches).toBe(2);
    expect(s.askedLvHistory.map((/** @type {any} */ h) => `${h.service}:${h.probe}`)).toEqual([
      'kick:false',
      'youtube:true',
      'youtube:false',
      'kick:false',
    ]);
  });

  it('知らせ・最後に見た配信の出どころ・popup の書き込みを数える', () => {
    const d = make();
    d.lastWatch('newest', 'lv1');
    d.announce('lv1', 'summaries');
    d.popupLastWatchWrite('https://live.nicovideo.jp/watch/lv3');
    d.popupLastWatchWrite('https://live.nicovideo.jp/watch/lv999');
    const s = d.snapshot();
    expect(s.lastWatch).toMatchObject({ source: 'newest', service: 'youtube' });
    expect(s.lastWatch.counts.newest).toBe(1);
    expect(s.announceCounts.summaries).toBe(1);
    expect(s.popupLastWatchWrites).toMatchObject({ count: 2, pseudo: 1, lastService: 'niconico' });
  });

  it('前面タブの問い合わせ: 遅い・空・写せない を数える', () => {
    const d = make();
    d.activeQuery({ url: 'https://www.showroom-live.com/r/room', mappedKey: '', ms: 1500, empty: false });
    d.activeQuery({ url: '', mappedKey: '', ms: 5, empty: true });
    d.activeQuery({ url: 'https://kick.com/someone', mappedKey: 'kk.someone.123', ms: 5, empty: false });
    const s = d.snapshot();
    expect(s.tabsQuery).toEqual({ calls: 3, slowOver1100ms: 1, emptyActive: 1 });
    expect(s.activeQuery.map((/** @type {any} */ q) => `${q.host}:${q.mapped}:${q.service}`)).toEqual([
      'www.showroom-live.com:false:',
      ':false:',
      'kick.com:true:kick',
    ]);
  });

  it('履歴は10件まで', () => {
    const d = make();
    for (let i = 0; i < 25; i++) d.announce(i % 2 ? 'lv1' : 'lv2', 'summaries');
    expect(d.snapshot().announceHistory.length).toBe(10);
  });

  it('★名前・本文・URL 全体を残さない(残すのはホスト・サービス・疑似 lv だけ)', () => {
    const d = make();
    d.activeQuery({ url: 'https://kick.com/secret-name?token=abc', mappedKey: '', ms: 1, empty: false });
    d.unmappedWatchTab('https://www.tiktok.com/@secret-name/live');
    const json = JSON.stringify(d.snapshot());
    expect(json).not.toContain('secret-name');
    expect(json).not.toContain('token');
  });
});

describe('配線: shim が計器を呼び、この版では画面の動きを変えない', () => {
  const shim = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
  it('計器の呼び出しがある', () => {
    for (const call of ['panelDiag.asked(', 'panelDiag.announce(', 'panelDiag.lastWatch(', 'panelDiag.popupLastWatchWrite(', 'panelDiag.activeQuery(', 'panelDiag.probe(', 'panelDiag.lastFocused(', 'panelDiag.unmappedWatchTab(']) {
      expect(shim).toContain(call);
    }
  });
  it('★再発明だった案(前面タブ探し・自前の読み込み直し)は入れない(SPEC §3)', () => {
    expect(shim).not.toContain('frontWatchKey');
    expect(shim).not.toContain('reloadIfWordingPlatformChanged');
  });
});

describe('0.1.1949: 外枠の配信と中身の食い違い', () => {
  it('外枠が Kick なのに画面が YouTube を聞いたら数える(探り読みは数えない)', () => {
    let t = 0;
    const d = createPanelStreamDiag({ now: () => ++t, lvToKey: (lv) => keys[lv] || '', panelService: 'kick' });
    d.asked('lv2', false);
    d.asked('lv1', true);
    d.asked('lv1', false);
    const s = d.snapshot();
    expect(s.panelStreamService).toBe('kick');
    expect(s.contentPlatformMismatch).toBe(1);
  });
});

describe('0.1.1950: 探り読みには答えない(SPEC §4-C3)', () => {
  const shim = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
  it('探り読みの判定(comments を2配信以上)が lastAskedLv の更新と全件の組み立てより先にある', () => {
    const probeAt = shim.indexOf('if (isProbe) {');
    const askedAt = shim.indexOf('lastAskedLv = lv;', probeAt);
    const buildAt = shim.indexOf('await buildCommentsForLv(lv)', probeAt);
    expect(probeAt).toBeGreaterThan(-1);
    expect(askedAt).toBeGreaterThan(probeAt);
    expect(buildAt).toBeGreaterThan(askedAt);
    expect(shim).toContain('const isProbe = askedCommentLvs.size >= 2;');
  });
  it('popup 自身の表示用の読みは1配信ずつ(探り読みだけが複数配信を1回で聞く)', () => {
    const popup = readFileSync(new URL('../../../src/extension/popup-entry.js', import.meta.url), 'utf8');
    const fn = popup.slice(popup.indexOf('async function collectDataBackedWatchLvs'));
    expect(fn.slice(0, 3000)).toContain('keys.push(commentsStorageKey(lv));');
  });
});

describe('0.1.1951: 前面タブの問い合わせの多さの内訳', () => {
  it('呼び出し元は関数名だけ(包み・URL は残さない)', () => {
    const stack = [
      'Error',
      '    at measuredTabsQuery (chrome-extension://abc/dist/yt-popup.js:1:100)',
      '    at Object.query (chrome-extension://abc/dist/yt-popup.js:1:200)',
      '    at async refresh (chrome-extension://abc/dist/yt-popup.js:1:300)',
    ].join('\n');
    expect(callerNameFromStack(stack)).toBe('refresh');
    expect(callerNameFromStack('Error\n    at chrome-extension://abc/x.js:1:1')).toBe('(anonymous)');
  });
  it('呼び出し元ごとに数え、1秒あたりの最大を残す(種類は12まで)', () => {
    let t = 5000;
    const d = createPanelStreamDiag({ now: () => t, lvToKey: () => '' });
    for (let i = 0; i < 5; i++) d.activeQuery({ url: '', mappedKey: '', ms: 1, empty: true, caller: 'refresh' });
    t = 6500;
    d.activeQuery({ url: '', mappedKey: '', ms: 1, empty: true, caller: 'collectWatchTabCandidates' });
    for (let i = 0; i < 20; i++) d.activeQuery({ url: '', mappedKey: '', ms: 1, empty: true, caller: `f${i}` });
    const s = d.snapshot();
    expect(s.tabsQueryPeakPerSec).toBe(21);
    expect(s.tabsQueryCallers.refresh).toBe(5);
    expect(Object.keys(s.tabsQueryCallers).length).toBe(13);
    expect(s.tabsQueryCallers['(other)']).toBe(10);
    expect(JSON.stringify(s)).not.toContain('chrome-extension');
  });
});

describe('0.1.1951: 層 B の写し漏れ(windows.getLastFocused)', () => {
  const shim = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
  it('getLastFocused の tabs を mapTab で写す', () => {
    expect(shim).toContain('{ ...w, tabs: w.tabs.map(mapTab) }');
  });
});

describe('0.1.1951: 読み込み直しを越えた累計・storage の変化の内訳', () => {
  it('前の iframe の累計を引き継ぎ、食い違いのときは true を返す(すぐ書く合図)', () => {
    const d = createPanelStreamDiag({ now: () => 1, lvToKey: (lv) => keys[lv] || '', panelService: 'kick' });
    d.seedLifetime({ lifetime: { frames: 3, contentPlatformMismatch: 2, askedSwitches: 5 } });
    expect(d.asked('lv2', false)).toBe(false);
    expect(d.asked('lv1', false)).toBe(true);
    const s = d.snapshot();
    expect(s.lifetime).toEqual({ frames: 4, contentPlatformMismatch: 3, askedSwitches: 6 });
    d.seedLifetime(null);
    d.seedLifetime({ lifetime: { frames: 'x' } });
    expect(d.snapshot().lifetime.frames).toBe(4);
  });
  it('storage のキー名は数字を N にまとめて数える', () => {
    const d = make();
    d.storageChanged(['nls_comments_lv123', 'nls_comments_lv456', 'yt_diag_sr_chat']);
    const s = d.snapshot();
    expect(normalizeStorageKeyName('nls_panel_summary_lv9')).toBe('nls_panel_summary_lvN');
    expect(s.storageChangedKeys).toEqual({ nls_comments_lvN: 2, yt_diag_sr_chat: 1 });
    expect(s.storageChangedEvents).toBe(1);
  });
});
