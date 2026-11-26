import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  niconicoDefaultUserIconUrl,
  pickSupportGrowthTileWithOptionalIdenticon,
  resolveSupportGrowthTileSrc,
  setNicoUidAvatarGuessEnabled,
} from './supportGrowthTileSrc.js';
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';

const ROOT = join(__dirname, '../..');
const TW_ID = '8328376983'; // 実機: Twitch ライブの数字 ID(ニコの ID と同じ形)

afterEach(() => setNicoUidAvatarGuessEnabled(true));

describe('v0.1.2250 数字 ID からニコの顔 URL を組むのはニコ生の画面だけ', () => {
  it('既定(ニコ生版)は従来どおり組む', () => {
    expect(niconicoDefaultUserIconUrl('12345678')).toMatch(/usericon\/s\/1234\/12345678\.jpg$/);
  });
  it('ニコ生以外の画面では組まない(Twitch・Kick の数字 ID を 404 の白丸にしない)', () => {
    setNicoUidAvatarGuessEnabled(false);
    expect(niconicoDefaultUserIconUrl(TW_ID)).toBe('');
    expect(resolveSupportGrowthTileSrc({ userId: TW_ID, defaultSrc: '' })).toBe('');
  });
  it('顔の URL が無い数字 ID の人は、その人ごとのゆっくり顔', () => {
    setNicoUidAvatarGuessEnabled(false);
    const src = pickSupportGrowthTileWithOptionalIdenticon(TW_ID, '', 'yukkuri.png', 'blank.jpg', { anonymousIdenticonEnabled: true, anonymousIdenticonDataUrl: '' });
    expect(src).toBe(anonymousIdenticonDataUrl(TW_ID));
  });
  it('以前の版が記録に残したニコの usericon URL も、ニコ生以外では使わない(ゆっくり顔へ)', () => {
    setNicoUidAvatarGuessEnabled(false);
    const nico = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/832837/8328376983.jpg';
    expect(pickSupportGrowthTileWithOptionalIdenticon(TW_ID, nico, 'y', 't', {})).toBe(anonymousIdenticonDataUrl(TW_ID));
    expect(resolveSupportGrowthTileSrc({ userId: TW_ID, entryAvatarUrl: nico, defaultSrc: '' })).toBe('');
    setNicoUidAvatarGuessEnabled(true);
    expect(pickSupportGrowthTileWithOptionalIdenticon(TW_ID, nico, 'y', 't', {})).toBe(nico);
  });
  it('本物の URL があればそれを使う', () => {
    setNicoUidAvatarGuessEnabled(false);
    const u = 'https://static-cdn.jtvnw.net/jtv_user_pictures/x-profile_image-70x70.png';
    expect(pickSupportGrowthTileWithOptionalIdenticon(TW_ID, u, 'y', 't', {})).toBe(u);
  });
  it('配線: ニコ生以外の全サービス共通の入口(ytNicoShim)が最初に切る', () => {
    const shim = readFileSync(join(ROOT, 'extension-youtube/src/ytNicoShim.js'), 'utf8');
    expect(shim).toContain('setNicoUidAvatarGuessEnabled(false);');
    for (const e of ['sidepanel-nico-entry.js', 'venue-nico-entry.js', 'comeview-nico-entry.js', 'marketing-export-nico-entry.js']) {
      expect(readFileSync(join(ROOT, 'extension-youtube/src', e), 'utf8')).toMatch(/^import '\.\/ytNicoShim\.js';/m);
    }
    for (const e of ['src/extension/popup-entry.js', 'src/extension/venue-entry.js']) {
      expect(readFileSync(join(ROOT, e), 'utf8')).not.toContain('setNicoUidAvatarGuessEnabled');
    }
  });
});
