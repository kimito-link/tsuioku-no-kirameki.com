import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  COMEVIEW_LIVE_PORT_NAME,
  COMEVIEW_LIVE_PUSH_MAX_ROWS,
  COMEVIEW_LIVE_ROWS_TYPE,
  parseComeviewLiveMessage,
  pickComeviewPushRows,
  pickWatchTabIdForLive,
  takeUnreadVoiceItems
} from './comeviewLivePush.js';

describe('pickComeviewPushRows', () => {
  it('commentNo のある行だけ・多すぎたら新しい方だけ', () => {
    expect(pickComeviewPushRows(null)).toEqual([]);
    expect(pickComeviewPushRows([{ commentNo: '1' }, { commentNo: '' }, null, { text: 'x' }])).toEqual([{ commentNo: '1' }]);
    const many = Array.from({ length: COMEVIEW_LIVE_PUSH_MAX_ROWS + 5 }, (_, i) => ({ commentNo: String(i + 1) }));
    const picked = pickComeviewPushRows(many);
    expect(picked.length).toBe(COMEVIEW_LIVE_PUSH_MAX_ROWS);
    expect(picked[0].commentNo).toBe('6');
  });
});

describe('parseComeviewLiveMessage', () => {
  it('形が違うものは null', () => {
    expect(parseComeviewLiveMessage(null)).toBeNull();
    expect(parseComeviewLiveMessage({ type: 'x', liveId: 'lv1', rows: [] })).toBeNull();
    expect(parseComeviewLiveMessage({ type: COMEVIEW_LIVE_ROWS_TYPE, liveId: 'abc', rows: [] })).toBeNull();
    expect(parseComeviewLiveMessage({ type: COMEVIEW_LIVE_ROWS_TYPE, liveId: 'lv1', rows: 'x' })).toBeNull();
  });
  it('正しいものは liveId を小文字にして行を通す', () => {
    const r = parseComeviewLiveMessage({ type: COMEVIEW_LIVE_ROWS_TYPE, liveId: 'LV123', rows: [{ commentNo: '5' }, { text: 'no' }] });
    expect(r).toEqual({ liveId: 'lv123', rows: [{ commentNo: '5' }] });
  });
});

describe('takeUnreadVoiceItems', () => {
  const noOf = (/** @type {any} */ it) => it.no;
  it('近道で読んだ番号は storage 経由で二度読まない・番号なしは通す', () => {
    const seen = new Set();
    expect(takeUnreadVoiceItems([{ no: '1' }, { no: '2' }], seen, noOf).map(noOf)).toEqual(['1', '2']);
    expect(takeUnreadVoiceItems([{ no: '2' }, { no: '3' }, { no: '' }], seen, noOf).map(noOf)).toEqual(['3', '']);
  });
  it('覚える件数は上限まで(古い方から忘れる)', () => {
    const seen = new Set();
    takeUnreadVoiceItems([{ no: '1' }, { no: '2' }, { no: '3' }], seen, noOf, 2);
    expect([...seen]).toEqual(['2', '3']);
  });
});

describe('pickWatchTabIdForLive', () => {
  it('その配信の watch タブのうち最後に使ったもの', () => {
    const tabs = [
      { id: 1, url: 'https://live.nicovideo.jp/watch/lv100', lastAccessed: 10 },
      { id: 2, url: 'https://live.nicovideo.jp/watch/lv100?ref=x', lastAccessed: 20 },
      { id: 3, url: 'https://live.nicovideo.jp/watch/lv200', lastAccessed: 30 },
      { id: 4, url: 'https://live.nicovideo.jp/timeshift/lv100', lastAccessed: 40 }
    ];
    expect(pickWatchTabIdForLive(tabs, 'lv100')).toBe(2);
    expect(pickWatchTabIdForLive(tabs, 'lv999')).toBeNull();
    expect(pickWatchTabIdForLive(tabs, '')).toBeNull();
  });
});

describe('配線(watch タブ → コメビュの読み上げ)', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const read = (/** @type {string} */ p) => readFileSync(join(HERE, '..', 'extension', p), 'utf8');
  const content = read('content-entry.js');
  const host = read('comeviewLivePushHost.js');
  const client = read('comeviewLivePushClient.js');
  const cv = read('comeview-entry.js');

  it('content: 保存待ちに入れた直後にコメビュへも流す(失敗は握る)', () => {
    expect(content).toMatch(/try \{ pushLiveCommentsToComeview\(liveId \|\| '', filtered\); \} catch/);
    expect(host).toMatch(/port\.name !== COMEVIEW_LIVE_PORT_NAME/);
  });

  it('コメビュ: 読み上げ ON で繋ぎ、OFF で切る・配信が変わったら繋ぎ直す', () => {
    expect(client).toMatch(/chrome\.tabs\.connect\(tabId, \{ name: COMEVIEW_LIVE_PORT_NAME \}\)/);
    expect(cv).toMatch(/if \(persist\) persistVoiceReadingEnabled\(true\);\n\s*void _livePush\.ensure\(\);/);
    expect(cv).toMatch(/_voiceToggleBusy = false;\n\s*_livePush\.close\(\);/);
    expect(cv).toMatch(/_voiceReadNos\.clear\(\);\n\s*void _livePush\.ensure\(\);/);
  });

  it('コメビュ: 近道と storage 経由の両方を、同じ番号の表で1回だけ読む', () => {
    expect(cv).toMatch(/items = takeUnreadVoiceItems\(items, _voiceReadNos, commentNoOfComeviewRow\);/);
    expect(COMEVIEW_LIVE_PORT_NAME).toBe('nls-comeview-live-v1');
  });
});
