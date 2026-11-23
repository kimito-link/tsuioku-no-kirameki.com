import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  OTHER_SERVICE_DIAG_KEYS,
  OTHER_SERVICE_WATCH_TAB_PATTERNS,
  parseOtherServiceTabUrl,
  summarizeOtherServiceTabs,
  pickOtherServiceDiags
} from './mcpDiagDumpServices.js';

const ROOT = resolve(process.cwd());

describe('mcpDiagDumpServices (P2)', () => {
  it('主要 9 サービスの視聴タブ URL を最小識別子へ要約し、非視聴ページは除外する', () => {
    expect(parseOtherServiceTabUrl('https://www.youtube.com/watch?v=abc123XYZ&token=secret')).toEqual({
      service: 'youtube',
      target: 'abc123XYZ'
    });
    expect(parseOtherServiceTabUrl('https://www.youtube.com/live/LiveId99?si=xxx')).toEqual({
      service: 'youtube',
      target: 'LiveId99'
    });
    expect(parseOtherServiceTabUrl('https://www.twitch.tv/streamer_a')).toEqual({
      service: 'twitch',
      target: 'streamer_a'
    });
    expect(parseOtherServiceTabUrl('https://www.twitch.tv/directory/following')).toBeNull();
    expect(parseOtherServiceTabUrl('https://kick.com/kick_ch')).toEqual({
      service: 'kick',
      target: 'kick_ch'
    });
    expect(parseOtherServiceTabUrl('https://whowatch.tv/viewer/123456')).toEqual({
      service: 'whowatch',
      target: '123456'
    });
    expect(parseOtherServiceTabUrl('https://www.showroom-live.com/r/room_x')).toEqual({
      service: 'showroom',
      target: 'room_x'
    });
    expect(parseOtherServiceTabUrl('https://mixch.tv/u/987654/live')).toEqual({
      service: 'mixch',
      target: '987654'
    });
    expect(parseOtherServiceTabUrl('https://twitcasting.tv/tc_user')).toEqual({
      service: 'twitcasting',
      target: 'tc_user'
    });
    expect(parseOtherServiceTabUrl('https://www.tiktok.com/@tt_user/live')).toEqual({
      service: 'tiktok',
      target: '@tt_user'
    });
    expect(parseOtherServiceTabUrl('https://abema.tv/now-on-air/abema-news')).toEqual({
      service: 'abema',
      target: 'abema-news'
    });
    expect(parseOtherServiceTabUrl('https://live.nicovideo.jp/watch/lv123')).toBeNull();
    expect(parseOtherServiceTabUrl('not-a-url')).toBeNull();
  });

  it('summarizeOtherServiceTabs は maxTabs で上限を切り、active/discarded/status を残す', () => {
    const tabs = [
      { url: 'https://www.twitch.tv/ch1', active: true, discarded: false, status: 'complete' },
      { url: 'https://www.twitch.tv/directory', active: false, discarded: false, status: 'complete' },
      { url: 'https://kick.com/ch2', active: false, discarded: true, status: 'complete' },
      { url: 'https://mixch.tv/u/111/live', active: false, discarded: false, status: 'loading' }
    ];
    expect(summarizeOtherServiceTabs(tabs, { maxTabs: 2 })).toEqual([
      { service: 'twitch', target: 'ch1', active: true, discarded: false, status: 'complete' },
      { service: 'kick', target: 'ch2', active: false, discarded: true, status: 'complete' }
    ]);
  });

  it('pickOtherServiceDiags は固定ホワイトリストの計器キーだけを抽出し、未定義・対象外キーを載せない', () => {
    const out = pickOtherServiceDiags({
      yt_diag_tw_chat: { channel: 'foo', count: 3 },
      yt_diag_kk_chat: null,
      yt_diag_mx_chat: undefined,
      nls_secret_token: 'must-not-appear',
      random_key: 123
    });
    expect(out).toEqual({
      yt_diag_tw_chat: { channel: 'foo', count: 3 }
    });
    expect('nls_secret_token' in out).toBe(false);
    expect('random_key' in out).toBe(false);
  });

  it('OTHER_SERVICE_WATCH_TAB_PATTERNS はすべて既存の manifest host_permissions 内に収まる（権限追加なし）', () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, 'extension/manifest.json'), 'utf8'));
    const hostPerms = new Set(manifest.host_permissions || []);
    for (const pat of OTHER_SERVICE_WATCH_TAB_PATTERNS) {
      const originWildcard = new URL(pat.replace(/\*$/, '')).origin + '/*';
      expect(hostPerms.has(originWildcard)).toBe(true);
    }
    expect(OTHER_SERVICE_DIAG_KEYS.every((k) => k.startsWith('yt_diag_'))).toBe(true);
  });

  it('background.js（既定 OFF 維持・全 storage ダンプなし）と status-entry.js に配線されている', () => {
    const bgSrc = readFileSync(resolve(ROOT, 'extension/background.js'), 'utf8');
    const tickStart = bgSrc.indexOf('async function runMcpDiagDumpTick()');
    const tickEnd = bgSrc.indexOf('function shouldSwKickBackfillForLiveLocal', tickStart);
    const tickBody = bgSrc.slice(tickStart, tickEnd);
    expect(tickBody).toContain('isMcpDiagDumpEnabled');
    expect(tickBody).toContain('globalThis.__nlsMcpDiagServices');
    expect(tickBody).toContain('otherServiceTabs');
    expect(tickBody).toContain('otherServiceDiags');
    expect(tickBody).not.toContain('chrome.storage.local.get(null)');

    const ytBgSrc = readFileSync(resolve(ROOT, 'extension-youtube/src/background-entry.js'), 'utf8');
    expect(ytBgSrc).toContain('globalThis.__nlsMcpDiagServices');

    const statusSrc = readFileSync(resolve(ROOT, 'src/extension/status-entry.js'), 'utf8');
    expect(statusSrc).toContain('collectOtherServicesDump');
    const dumpHelperSrc = readFileSync(resolve(ROOT, 'src/extension/statusOtherServicesDump.js'), 'utf8');
    expect(dumpHelperSrc).toContain('mcpDiagDumpServices.js');
    expect(dumpHelperSrc).toContain('otherServiceTabs');
    expect(dumpHelperSrc).toContain('otherServiceDiags');
  });
});
