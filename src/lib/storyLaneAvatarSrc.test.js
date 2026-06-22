import { describe, it, expect } from 'vitest';
import { resolveStoryLaneAvatarSrc } from './storyLaneAvatarSrc.js';

/**
 * characterization test: 元 popup-entry.js storyGrowthAvatarSrcCandidate の分岐を固定する。
 * 抽出(state 注入化)の前後で挙動が1mm 変わらないことを保証する。会場と popup の顔ぶれ・順序が
 * 一致するための avatar 解決の正本。
 */

const HTTP_AV = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/123/123456.jpg';
const HTTP_AV_OTHER = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/999/999999.jpg';

describe('resolveStoryLaneAvatarSrc', () => {
  it('個人 avatar(uid 一致)はそのまま http で返す', () => {
    const out = resolveStoryLaneAvatarSrc(
      { userId: '123456', avatarUrl: HTTP_AV },
      { snapshot: {}, isOwnPosted: false, rememberedAvatar: '' }
    );
    expect(out).toBe(HTTP_AV);
  });

  it('avatar が他人 uid 由来(uid 不一致)なら弾いて数値ID由来等にフォールバック(元 avatar は返さない)', () => {
    const out = resolveStoryLaneAvatarSrc(
      { userId: '123456', avatarUrl: HTTP_AV_OTHER },
      { snapshot: {}, isOwnPosted: false, rememberedAvatar: '' }
    );
    // 取り違えガードで HTTP_AV_OTHER は採用されない。
    expect(out).not.toBe(HTTP_AV_OTHER);
  });

  it('配信者 uid と一致する他人コメ(own でない)は mistakenBroadcaster=avatar を userId 無しで解決', () => {
    const out = resolveStoryLaneAvatarSrc(
      { userId: '777', avatarUrl: HTTP_AV },
      {
        snapshot: { broadcasterUserId: '777', broadcasterIconUrl: HTTP_AV },
        isOwnPosted: false,
        rememberedAvatar: ''
      }
    );
    // mistakenBroadcaster: entryAvatarUrl は空に倒れ、userId も null=配信者アイコンの誤貼りを防ぐ。
    expect(out).not.toBe(HTTP_AV);
  });

  it('viewer の avatar と同じ(own でない)なら自分のアイコンの他人への誤貼りを防いで除外', () => {
    const out = resolveStoryLaneAvatarSrc(
      { userId: '123456', avatarUrl: HTTP_AV },
      {
        snapshot: { viewerAvatarUrl: HTTP_AV },
        isOwnPosted: false,
        rememberedAvatar: ''
      }
    );
    expect(out).not.toBe(HTTP_AV);
  });

  it('own-posted(自分)なら viewer avatar 一致でも除外しない', () => {
    const out = resolveStoryLaneAvatarSrc(
      { userId: '123456', avatarUrl: HTTP_AV },
      {
        snapshot: { viewerAvatarUrl: HTTP_AV },
        isOwnPosted: true,
        rememberedAvatar: ''
      }
    );
    expect(out).toBe(HTTP_AV);
  });

  it('entry avatar が空でも remembered avatar(uid 一致)があれば fallback で使う', () => {
    const out = resolveStoryLaneAvatarSrc(
      { userId: '123456', avatarUrl: '' },
      { snapshot: {}, isOwnPosted: false, rememberedAvatar: HTTP_AV }
    );
    expect(out).toBe(HTTP_AV);
  });

  it('userId が無ければ avatar 解決不能で空', () => {
    const out = resolveStoryLaneAvatarSrc(
      { userId: '', avatarUrl: HTTP_AV },
      { snapshot: {}, isOwnPosted: false, rememberedAvatar: '' }
    );
    expect(out).toBe('');
  });

  it('ctx 欠落(null)でも例外を投げず空寄りに振る舞う', () => {
    const out = resolveStoryLaneAvatarSrc({ userId: '123456', avatarUrl: '' }, {
      snapshot: null,
      isOwnPosted: false,
      rememberedAvatar: ''
    });
    expect(typeof out).toBe('string');
  });
});
