// @vitest-environment happy-dom
/**
 * v0.1.2259: ニコの公式の灰色の既定アイコン(usericon/defaults/blank.jpg)は「顔が無い」と同じに扱い、
 *   どの欄でも灰色の丸を出さない(正本=avatarFallbackFromUrl.js の isSiteDefaultSilhouetteUrl)。
 */
import { describe, it, expect } from 'vitest';
import {
  isSiteDefaultSilhouetteUrl,
  faceInsteadOfSilhouette,
  avatarFallbackFaceForUrl,
  noAvatarFace,
  faceForRowKey
} from './avatarFallbackFromUrl.js';
import { adLanePicksFromRooms } from './adLanePicksFromRooms.js';
import { buildDedupeKey, faceForCommentRow } from './commentRecord.js';
import { createSupportAvatarLoadGuard } from './supportGrowthAvatarLoad.js';
import {
  NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS,
  pickSupportGrowthFallbackTileSrc,
  pickSupportGrowthTileWithOptionalIdenticon,
  resolveSupportGrowthTileSrc
} from './supportGrowthTileSrc.js';
import { resolveReportUserThumbSrc } from './reportUserThumb.js';
import { topSupportRankLineModels } from './topSupportRankStripLines.js';
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';

const BLANK_A = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg';
const BLANK_B = 'https://img.nicoprofile.nimg.jp/usericon/defaults/blank.jpg';
const BLANK_S = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank_s.jpg';
const REAL = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1234/12345678.jpg';
const TWITCH_DEFAULT = 'https://static-cdn.jtvnw.net/user-default-pictures-uv/cdd517fe-def4-11e9-948e-784f43822e80-profile_image-70x70.png';
const isGrey = (/** @type {string} */ s) => /usericon\/defaults\//i.test(String(s || ''));

describe('isSiteDefaultSilhouetteUrl (v0.1.2259)', () => {
  it('ニコの既定アイコンは両方のホスト・blank_s も灰色の既定アイコン', () => {
    expect(isSiteDefaultSilhouetteUrl(BLANK_A)).toBe(true);
    expect(isSiteDefaultSilhouetteUrl(BLANK_B)).toBe(true);
    expect(isSiteDefaultSilhouetteUrl(BLANK_S)).toBe(true);
  });
  it('本物のアイコン・Twitch の色つき既定・空は対象外', () => {
    expect(isSiteDefaultSilhouetteUrl(REAL)).toBe(false);
    expect(isSiteDefaultSilhouetteUrl(TWITCH_DEFAULT)).toBe(false);
    expect(isSiteDefaultSilhouetteUrl('')).toBe(false);
    expect(isSiteDefaultSilhouetteUrl(null)).toBe(false);
  });
});

describe('faceInsteadOfSilhouette', () => {
  it('灰色の既定アイコンはその人ごとのゆっくり顔(404 の代わりの顔と同じ顔)', () => {
    const face = faceInsteadOfSilhouette(BLANK_B, '12345678');
    expect(face.startsWith('data:image/')).toBe(true);
    expect(face).toBe(anonymousIdenticonDataUrl('12345678', 64));
    expect(faceInsteadOfSilhouette(BLANK_A, '87654321')).not.toBe(face);
  });
  it('誰か分からなくても灰色にしない・本物はそのまま', () => {
    expect(faceInsteadOfSilhouette(BLANK_A, '')).toBe(noAvatarFace());
    expect(isGrey(faceInsteadOfSilhouette(BLANK_A, ''))).toBe(false);
    expect(faceInsteadOfSilhouette(REAL, '12345678')).toBe(REAL);
  });
  it('avatarFallbackFaceForUrl も灰色の既定アイコンに空を返さない', () => {
    expect(avatarFallbackFaceForUrl(BLANK_A)).toBe(noAvatarFace());
  });
});

describe('共有ガード: 灰色の既定アイコンは出さず、確かめもしない', () => {
  const mk = () =>
    createSupportAvatarLoadGuard({ fallbackSrc: NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS, fallbackSrcFor: avatarFallbackFaceForUrl });
  it('pickDisplaySrc は blank.jpg(fallbackSrc と同じでも)を返さない', () => {
    const g = mk();
    for (const u of [BLANK_A, BLANK_B, '']) expect(isGrey(g.pickDisplaySrc(u))).toBe(false);
  });
  it('fallbackSrcFor の無いガードでも灰色にしない', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: BLANK_A });
    expect(isGrey(g.pickDisplaySrc(BLANK_B))).toBe(false);
    expect(isGrey(g.pickDisplaySrc(''))).toBe(false);
  });
  it('noteRemoteAttempt は blank.jpg を読み込まない(通信しない)', () => {
    const g = mk();
    const img = document.createElement('img');
    img.src = g.pickDisplaySrc(BLANK_B);
    expect(g.noteRemoteAttempt(img, BLANK_B)).toBe(null);
    expect(isGrey(img.src)).toBe(false);
  });
  it('本物の URL は従来どおり確かめる', () => {
    const g = mk();
    const img = document.createElement('img');
    expect(g.noteRemoteAttempt(img, REAL)).not.toBe(null);
  });
});

describe('共通の顔の選び方: 灰色の既定アイコンはその人ごとの顔', () => {
  it('数字 ID の人(推測 URL を組まない)', () => {
    const face = anonymousIdenticonDataUrl('12345678', 64);
    expect(pickSupportGrowthFallbackTileSrc('12345678', BLANK_B, 'y.png', BLANK_A)).toBe(face);
    expect(pickSupportGrowthTileWithOptionalIdenticon('12345678', BLANK_B, 'y.png', BLANK_A, {})).toBe(face);
    expect(resolveSupportGrowthTileSrc({ entryAvatarUrl: BLANK_A, userId: '12345678', defaultSrc: 'd.png' })).toBe(face);
  });
  it('匿名の人: 既定の絵(tvSrc)が blank.jpg でも灰色にしない', () => {
    const s = pickSupportGrowthTileWithOptionalIdenticon('a:abcdefghij', '', 'y.png', BLANK_A, { anonymousIdenticonEnabled: true, anonymousIdenticonDataUrl: '' });
    expect(isGrey(s)).toBe(false);
    expect(isGrey(pickSupportGrowthFallbackTileSrc('a:abcdefghij', BLANK_B, 'y.png', BLANK_A))).toBe(false);
  });
  it('本物のアイコンは変わらない', () => {
    expect(pickSupportGrowthTileWithOptionalIdenticon('12345678', REAL, 'y.png', BLANK_A, {})).toBe(REAL);
    expect(pickSupportGrowthFallbackTileSrc('12345678', TWITCH_DEFAULT, 'y.png', BLANK_A)).toBe(TWITCH_DEFAULT);
  });
  it('ギフト・レポートの顔(resolveReportUserThumbSrc)', () => {
    expect(isGrey(resolveReportUserThumbSrc({ userId: '12345678', avatarUrl: BLANK_B }))).toBe(false);
    expect(isGrey(resolveReportUserThumbSrc({ userId: '', avatarUrl: BLANK_A }))).toBe(false);
    expect(resolveReportUserThumbSrc({ userId: '12345678', avatarUrl: REAL })).toBe(REAL);
  });
  it('応援ランキングの行', () => {
    const models = topSupportRankLineModels(
      [
        { userKey: '12345678', count: 3, avatarUrl: BLANK_B, nickname: 'a' },
        { userKey: '23456789', count: 2, avatarUrl: REAL, nickname: 'b' }
      ],
      { defaultThumbSrc: 'y.png', anonymousFallbackThumbSrc: BLANK_A }
    );
    expect(isGrey(models[0].thumbSrc)).toBe(false);
    expect(models[1].thumbSrc).toBe(REAL);
  });
});

describe('ID の無い行・ギフト/広告の 名無し', () => {
  it('ID の無い行は記録の重なりの鍵ごとに違う顔・同じ鍵なら読み直しても同じ顔', () => {
    const k1 = buildDedupeKey('lv1', { commentNo: '101', text: 'こんにちは' });
    const k2 = buildDedupeKey('lv1', { commentNo: '102', text: 'こんにちは' });
    const a = faceForRowKey(k1);
    expect(a.startsWith('data:image/')).toBe(true);
    expect(faceForRowKey(k1)).toBe(a);
    expect(faceForRowKey(k2)).not.toBe(a);
    expect(faceForRowKey('')).toBe(noAvatarFace());
    expect(faceForCommentRow('LV1', { commentNo: '101', text: 'こんにちは' })).toBe(a);
  });
  it('応援ランキング(公式ランク行・名無し)も灰色の順位札でなくその人ごとのゆっくり顔', () => {
    const models = topSupportRankLineModels(
      [
        { userKey: '__anon_contrib_1', count: 5, avatarUrl: BLANK_B, nickname: '' },
        { userKey: '__anon_contrib_2', count: 4, avatarUrl: BLANK_B, nickname: '' }
      ],
      { defaultThumbSrc: 'y.png', anonymousFallbackThumbSrc: BLANK_A }
    );
    expect(isGrey(models[0].thumbSrc)).toBe(false);
    expect(models[0].thumbSrc).not.toBe(models[1].thumbSrc);
    expect(models[0].thumbSrc).not.toContain('%E6%9C%AA%E5%8F%96%E5%BE%97'); // 「未取得」の灰色の順位札ではない
  });
  it('広告・ギフト列: 公式が blank.jpg を返した人はその人ごとのゆっくり顔', () => {
    const picks = adLanePicksFromRooms(
      [{ userKey: '95696250', nickname: 'つゆ', count: 100, avatarUrl: BLANK_B, hasNoIcon: true }],
      { yukkuriFaceFor: (k) => `data:face:${k}` }
    );
    expect(picks[0].displaySrc).toBe('data:face:95696250');
  });
});
