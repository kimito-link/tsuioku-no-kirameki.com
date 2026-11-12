// 視聴ページの中の会場(YouTube ほか)で、ギフト音などを最初の1回目から blob: で鳴らすための先読みの約束。
//   2026-11-12: YouTube の会場で sound/tiers/gift-*.mp3 が「Unsafe attempt to load URL」で弾かれていた。
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EFFECT_SOUND_PATHS, EFFECT_SOUND_VARIANT_PATHS, listBundledEffectSoundPaths } from './effectSoundPlayer.js';
import { YT_LOCAL_ASSET_RE, ytPrefetchLocalAssetsInOrder } from '../../extension-youtube/src/ytLocalAssetUrls.js';

const root = resolve(__dirname, '../..');

describe('listBundledEffectSoundPaths', () => {
  const list = listBundledEffectSoundPaths();

  it('ギフトの金額帯・広告・順位・節目・単一ファイルの音を全部・重複なしで並べる', () => {
    for (const v of Object.values(EFFECT_SOUND_VARIANT_PATHS)) for (const p of v) expect(list).toContain(p);
    for (const p of Object.values(EFFECT_SOUND_PATHS)) expect(list).toContain(p);
    expect(new Set(list).size).toBe(list.length);
    expect(list).toContain('sound/tiers/gift-small-1.mp3');
    expect(list).toContain('sound/tiers/gift-mega-3.mp3');
  });

  it('どれも拡張の中に実在し、blob: に読み替えられる形をしている', () => {
    for (const p of list) {
      expect(existsSync(resolve(root, 'extension', p)), p).toBe(true);
      expect(YT_LOCAL_ASSET_RE.test(p), p).toBe(true);
    }
  });

  it('本体同梱の各サービスの視聴ページから読める(web_accessible_resources)', () => {
    const m = JSON.parse(readFileSync(resolve(root, 'extension/manifest.json'), 'utf8'));
    const hosts = ['https://www.youtube.com/*', 'https://www.twitch.tv/*', 'https://kick.com/*', 'https://twitcasting.tv/*', 'https://abema.tv/*'];
    for (const h of hosts) {
      const entry = m.web_accessible_resources.find((w) => w.matches.includes(h));
      expect(entry, h).toBeTruthy();
      expect(entry.resources).toContain('sound/tiers/*.mp3');
    }
  });
});

describe('ytPrefetchLocalAssetsInOrder', () => {
  it('1本ずつ順に読み、失敗した分を飛ばして残りを読む', async () => {
    const seen = [];
    let running = 0;
    let maxRunning = 0;
    const load = async (rel) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      seen.push(rel);
      await Promise.resolve();
      running--;
      if (rel === 'b') throw new Error('x');
      return rel === 'c' ? '' : `blob:${rel}`;
    };
    const ok = await ytPrefetchLocalAssetsInOrder(['a', 'b', 'c', 'd'], { load, gapMs: 0 });
    expect(seen).toEqual(['a', 'b', 'c', 'd']);
    expect(maxRunning).toBe(1);
    expect(ok).toBe(2);
  });
});

describe('会場の入口の配線', () => {
  it('視聴ページの会場は、出した後に効果音を全部先読みする', () => {
    const src = readFileSync(resolve(root, 'extension-youtube/src/venue-inline-entry.js'), 'utf8');
    expect(src).toMatch(/ytPrefetchLocalAssetsInOrder\(listBundledEffectSoundPaths\(\)\)/);
  });
});
