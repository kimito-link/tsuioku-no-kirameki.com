import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMediaKitHtml } from '../mediaKitHtml.js';
import { FOLLOWER_NOUN, followerKpiLabels } from './followerCountSample.js';
import {
  PLATFORM_METRIC_IDS,
  followerNotationOf,
  mediaKitServiceCopy,
  mediaKitWordingPlatformId,
} from './platformMetrics.js';
import { STREAM_PLATFORMS, platformOfStreamKey } from './streamPlatform.js';

/**
 * 同時に残っている別サービスの配信キー。言葉は、書き出す lv のキーだけを見る。
 * @type {Record<string, string>}
 */
const RECORDED_KEYS = {
  youtube: 'dQw4w9WgxcQ',
  twitch: STREAM_PLATFORMS.twitch.buildStreamKey('sasatikk', { streamId: '42' }),
  kick: STREAM_PLATFORMS.kick.buildStreamKey('testkick', { streamId: '9001' }),
  showroom: STREAM_PLATFORMS.showroom.buildStreamKey('room.a', { liveId: '5' }),
  mixch: STREAM_PLATFORMS.mixch.buildStreamKey('5', { sessionId: 77 }),
  whowatch: STREAM_PLATFORMS.whowatch.buildStreamKey('555', { userId: 42 }),
  tiktok: STREAM_PLATFORMS.tiktok.buildStreamKey('some.user', { roomId: '7571234567890123456' }),
  abema: STREAM_PLATFORMS.abema.buildStreamKey('n-abema-news', { chatId: 'abm1.chat.chat.program1' }),
  twitcasting: STREAM_PLATFORMS.twitcasting.buildStreamKey('C:Abc', { movieId: '842033018' }),
};

const UNIQUE_PAID = ['スーパーチャット', 'Bits', 'Kicks', 'アイテム'];

/** @param {string} platformId */
function kitHtml(platformId) {
  const noun = /** @type {Record<string, string>} */ (FOLLOWER_NOUN)[platformId] || '';
  const labels = followerNotationOf(platformId) && noun ? followerKpiLabels(noun) : null;
  return buildMediaKitHtml(
    {
      windows: [{ days: 30, liveCount: 1, followers: 10, followersGained: 1, comments: 3 }],
      broadcaster: { name: '配信者', userId: 'caster', iconUrl: '' },
      supporters: { giftTop: [{ userId: 'u1', name: '応援者', points: 2, count: 1 }], commentTop: [] },
      followerLabels: labels,
    },
    { platformId, maskSupporters: true, generatedAtMs: 1_700_000_000_000 }
  );
}

describe('メディアキットは書き出す配信のサービスだけ', () => {
  it('能力表の全サービスを、同時に記録したキーとして持っている', () => {
    for (const id of PLATFORM_METRIC_IDS) {
      if (id === 'niconico') continue;
      expect(RECORDED_KEYS[id], id).toBeTruthy();
      const plat = platformOfStreamKey(RECORDED_KEYS[id]);
      if (id === 'youtube') expect(plat).toBeNull();
      else expect(plat && plat.id).toBe(id);
    }
  });

  it('書き出す lv 以外の配信が残っていても、そのサービスの言葉になる', () => {
    for (const id of Object.keys(RECORDED_KEYS)) {
      const got = mediaKitWordingPlatformId({
        exportLv: `lv-${id}`,
        videoIdForLv: (lv) => RECORDED_KEYS[String(lv).slice(3)] || '',
        platformOfKey: (key) => platformOfStreamKey(key),
      });
      expect(got).toBe(id);
    }
    expect(mediaKitWordingPlatformId({
      exportLv: 'lv-unknown',
      videoIdForLv: () => '',
      platformOfKey: () => ({ id: 'twitch' }),
    })).toBe('');
  });

  for (const id of PLATFORM_METRIC_IDS) {
    it(`${id} のキットに他のサービス名が出ない`, () => {
      const html = kitHtml(id);
      const copy = mediaKitServiceCopy(id);
      expect(html).toContain(copy.channelPrefix.trim());
      expect(html).toContain(copy.supportLead);
      expect(html).toContain(copy.awardSource);
      if (copy.followerSource) {
        expect(html).toContain(copy.followerSource);
        expect(html).toContain(`${copy.countLabel}は、`);
      } else {
        expect(html).not.toContain('から配信時に取得したスナップショットです。');
      }
      for (const other of PLATFORM_METRIC_IDS) {
        if (other === id) continue;
        const otherName = mediaKitServiceCopy(other).name;
        if (!otherName || otherName === copy.name) continue;
        expect(html).not.toContain(otherName);
      }
      if (id !== 'niconico') {
        expect(html).not.toContain('ニコ生');
        expect(html).not.toContain('ニコニコ');
      }
      for (const paid of UNIQUE_PAID) {
        if (paid && paid === copy.paid) expect(html).toContain(paid);
        else expect(html).not.toContain(paid);
      }
      if (id === 'youtube') {
        expect(html).toContain('チャンネル登録者数は、YouTube の公開ページから配信時に取得したスナップショットです。');
        expect(html).not.toContain('フォロワー数');
        expect(html).toContain('YouTube チャンネル:');
        expect(html).toContain('YouTube 上で公開されている応援(コメント・スーパーチャット)');
      }
      if (id === 'twitch') {
        expect(html).toContain('フォロワー数は、Twitch の公開ページから配信時に取得したスナップショットです。');
        expect(html).toContain('Twitch 上で公開されている応援(コメント・Bits)');
      }
      if (id === 'whowatch') {
        expect(html).toContain('ふわっち チャンネル:');
        expect(html).toContain('ふわっち 上で公開されている応援(コメント・アイテム)');
      }
      if (id === 'showroom') {
        expect(html).toContain('SHOWROOM チャンネル:');
        expect(html).toContain('SHOWROOM 上で公開されている応援(コメント・ギフト)');
      }
    });
  }
});

describe('分析レポートの言葉は最後に読んだ配信を見ない', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const shim = readFileSync(path.join(repoRoot, 'extension-youtube/src/ytNicoShim.js'), 'utf8');

  it('マーケティングページは書き出す lv のサービスだけを使う', () => {
    const pick = shim.slice(shim.indexOf('function marketingWordingPick'), shim.indexOf('function screenPlatformBase'));
    expect(pick).toContain('mediaKitWordingPlatformId(');
    expect(pick).not.toContain('lastAskedLv');
    expect(pick).not.toContain('newestVideoIdOf');
    const wording = shim.slice(shim.indexOf('function screenWording'), shim.indexOf('function fixUidLabelAttr'));
    const marketingBranch = wording.slice(0, wording.indexOf('const p = screenPlatform()'));
    expect(marketingBranch).toContain('IS_MARKETING_PAGE');
    expect(marketingBranch).toContain('marketingWordingPick()');
    expect(marketingBranch).not.toContain('lastAskedLv');
  });
});
