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

describe('0.1.1953: 見ていない配信の記録は組み立てない', () => {
  const shim = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
  it('記録の更新の知らせは、この画面が最近聞いた配信だけ(探り読みは入れない)', () => {
    expect(shim).toContain('if (!isWatchedByThisScreen(lvOf)) {');
    const probeAt = shim.indexOf('if (isProbe) {');
    const setAt = shim.indexOf('recentlyAskedLvs.set(lv, Date.now());');
    expect(setAt).toBeGreaterThan(probeAt);
  });
  it('計器は built / skipped を数える', () => {
    const d = make();
    d.notify(true);
    d.notify(false);
    d.notify(false);
    expect(d.snapshot().recordNotify).toEqual({ built: 1, skipped: 2 });
  });
});

describe('0.1.1955: 行が多いときに横の欄が全行を読み直し続けない', () => {
  const shim = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
  it('拡張の画面も、あいだは新しく記録された分だけ読む(全件は初回と30秒ごと)', () => {
    expect(shim).toContain('getYtStreamCommentsSince(vid, afterRecordedAt)');
    expect(shim).toContain('const items = await getCommentsViaBackground(vid);');
    expect(shim).not.toContain('YT_SHIM_IN_PAGE ? await getCommentsViaBackground(vid) : await getYtStreamCommentsByVideoId(vid)');
  });
  it('同じ配信の組み立て中に来た知らせは、終わってから1回にまとめる', () => {
    expect(shim).toContain('const notifyRunning = new Map();');
    expect(shim).toMatch(/do \{\s*st\.again = false;\s*await notifyLvOnce\(lv, st\.summary\);[\s\S]*while \(st\.again\)/);
  });
});

describe('0.1.1958: 切り替わる直前の古い横の欄は、次の配信を組み立てない', () => {
  const shim = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
  it('コメントとギフトの読みで、外枠と違うサービスなら待ってから答える', () => {
    const waits = shim.match(/await staleFrameHold\.wait\(isOtherServiceThanPanel\(lv\)\)/g) || [];
    expect(waits.length).toBe(2);
  });
  it('待つのは「聞かれた配信」を lastAskedLv に入れる前(言葉のサービスを先に変えない)', () => {
    const i = shim.indexOf('await staleFrameHold.wait(isOtherServiceThanPanel(lv))');
    const j = shim.indexOf('lastAskedLv = lv;');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
  });
});

describe('0.1.1962: 1回の読みでギフトのキーを5つ聞かれても、重い読みと組み立ては1回', () => {
  const shim = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
  it('配信の一覧は1回の読みにつき1回だけ読む', () => {
    expect(shim).toContain('if (!sumsOnce) sumsOnce = summariesBag();');
  });
  it('同じ組み立て結果・同じ開始時刻ならギフトの袋を使い回す', () => {
    expect(shim).toContain('const giftBagsMemo = new WeakMap();');
    expect(shim).toMatch(/if \(memo && memo\.lv === lv && memo\.startedAt === startedAt\) return memo\.bags;/);
  });
  it('組み立ての時間と行数を計器に残す', () => {
    expect(shim).toContain('shimDiag.buildMsMax = Math.max(');
  });
});

describe('0.1.1964: 記録の組み立てを重ねて走らせない', () => {
  const shim = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
  const body = shim.slice(shim.indexOf('function buildCommentsForLv(lv) {'), shim.indexOf('async function buildGiftBagsForLv('));
  it('組み立て中なら新しく始めずに、それを待つ(1.5秒の使い回しの後でも)', () => {
    const ttl = body.indexOf('if (hit && Date.now() - hit.at < 1500) return hit.p;');
    const join = body.indexOf('if (hit && !hit.done) {');
    const start = body.indexOf('buildCommentsForLvUncached(lv)');
    expect(ttl).toBeGreaterThan(0);
    expect(join).toBeGreaterThan(ttl);
    expect(start).toBeGreaterThan(join);
  });
  it('使い回しの1.5秒は終わった時刻から数える', () => {
    expect(body).toMatch(/slot\.done = true;\s*\/\/[^\n]*\n\s*slot\.at = Date\.now\(\);/);
    expect(body).toContain('void p.then(finish, finish);');
  });
  it('新着の知らせで作り直すときも、組み立て中のものが終わってから', () => {
    const once = shim.slice(shim.indexOf('const notifyLvOnce = async (lv, summary) => {'));
    const wait = once.indexOf('if (running && !running.done) await running.p.catch(() => undefined);');
    const del = once.indexOf('commentsCache.delete(lv);');
    expect(wait).toBeGreaterThan(0);
    expect(del).toBeGreaterThan(wait);
  });
});

describe('0.1.1965: りんく段の札の付け直しでタイルごとのレイアウト計算をしない', () => {
  const shim = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
  const body = shim.slice(shim.indexOf('function rewriteLaneFirstLines(byShown) {'), shim.indexOf('function fixTextNode('));
  it('innerText を読まない(文字の部品で札の有無を見る)', () => {
    expect(body.length).toBeGreaterThan(100);
    expect(body).not.toContain('.innerText');
    expect(body).toContain("LANE_KIND_WORD_SET.has(String(n.nodeValue || '').trim())");
  });
  it('札が付いていたタイルにも済みの印を付ける(次から読まない)', () => {
    expect(body).toMatch(/LANE_KIND_WORD_SET\.has[\s\S]{0,80}tile\.setAttribute\('data-yt-kind-done', '1'\);\s*continue;/);
  });
});

describe('0.1.1966: 記録の組み立ての読み出しを同時に始め、段ごとの時間を計器に残す', () => {
  const shim = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
  const body = shim.slice(shim.indexOf('async function buildCommentsForLvUncached(lv) {'), shim.indexOf('const out = list.map('));
  it('顔の控え3つの読み出しは記録の読み出しを待つ前に始める', () => {
    const side = body.indexOf('const sidePromise = Promise.all(');
    const fetch = body.indexOf('await getCommentsViaBackground(vid)');
    expect(side).toBeGreaterThan(0);
    expect(fetch).toBeGreaterThan(side);
    expect(body).not.toMatch(/await real\?\.storage\?\.local\?\.get\?\./);
  });
  it('段ごとの時間(最初の1回・最長・最後)を残す', () => {
    expect(shim).toContain('recordBuildPhases({ fetchMs: tFetchDone - tStart,');
    expect(shim).toContain('if (!shimDiag.buildPhaseFirst) shimDiag.buildPhaseFirst =');
  });
});
