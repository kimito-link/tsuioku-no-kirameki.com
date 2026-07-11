import { describe, expect, it } from 'vitest';
import {
  buildVenueMirrorAvatarMap,
  enrichVenueRowsWithMirrorAvatars
} from './venueMirrorAvatarEnrich.js';
import { niconicoDefaultUserIconUrl } from './supportGrowthTileSrc.js';

const PERSONAL = 'https://cdn.example/av/11111.png';

function snap() {
  return {
    liveId: 'lv1',
    capturedAt: 1000,
    link: [
      { userId: '11111', displaySrc: PERSONAL }, // 個人サムネ(score2)=採用
      { userId: '22222', displaySrc: niconicoDefaultUserIconUrl('22222') }, // 合成(score1)=除外
      { userId: 'a:anon', displaySrc: 'data:image/svg+xml;base64,xxx' }, // identicon=除外
      { entry: { userId: '33333' }, displaySrc: 'https://cdn.example/av/33333.png' } // entry.userId でも拾う
    ],
    gift: [],
    ad: [],
    konta: [],
    tanu: []
  };
}

describe('buildVenueMirrorAvatarMap', () => {
  it('鏡から uid→個人サムネURL(score2のみ)を作る(合成/identiconは除外)', () => {
    const map = buildVenueMirrorAvatarMap(snap());
    expect(map.get('11111')).toBe(PERSONAL);
    expect(map.get('33333')).toBe('https://cdn.example/av/33333.png');
    expect(map.has('22222')).toBe(false);
    expect(map.has('a:anon')).toBe(false);
  });

  it('snap が無ければ空マップ', () => {
    expect(buildVenueMirrorAvatarMap(null).size).toBe(0);
  });
});

describe('enrichVenueRowsWithMirrorAvatars', () => {
  const map = buildVenueMirrorAvatarMap(snap());

  it('avatar が空/合成(score<2)の行へ鏡の個人URLを注入し、未知フィールドは保持する', () => {
    const rows = [
      { userId: '11111', name: 'A', avatar: '', preCount: 5 },
      { userId: '11111', name: 'A2', avatar: niconicoDefaultUserIconUrl('11111') }
    ];
    const out = enrichVenueRowsWithMirrorAvatars(rows, map);
    expect(out[0].avatar).toBe(PERSONAL);
    expect(out[0].avatarObserved).toBe(true);
    expect(out[0].preCount).toBe(5); // VIP契約フィールドを落とさない(v0.1.734の轍)
    expect(out[1].avatar).toBe(PERSONAL); // 合成URLは個人URLで上書きしてよい
  });

  it('行が既に個人サムネ(score2)なら上書きしない=captured個人URLを鏡で潰さない・冪等', () => {
    const captured = 'https://cdn.example/av/other-11111.png';
    const rows = [{ userId: '11111', avatar: captured }];
    const once = enrichVenueRowsWithMirrorAvatars(rows, map);
    expect(once[0].avatar).toBe(captured);
    const twice = enrichVenueRowsWithMirrorAvatars(once, map);
    expect(twice).toEqual(once); // 冪等
  });

  it('鏡に居ない uid・uid無し行はそのまま', () => {
    const rows = [{ userId: '99999', avatar: '' }, { name: 'no-uid', avatar: '' }];
    const out = enrichVenueRowsWithMirrorAvatars(rows, map);
    expect(out[0].avatar).toBe('');
    expect(out[1].avatar).toBe('');
  });

  it('マップ空なら行をそのまま返す', () => {
    const rows = [{ userId: '11111', avatar: '' }];
    expect(enrichVenueRowsWithMirrorAvatars(rows, new Map())[0].avatar).toBe('');
  });
});
