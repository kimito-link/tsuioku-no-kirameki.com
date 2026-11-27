import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { avatarFallbackFaceForUrl, identiconFallbackForAvatarUrl } from './avatarFallbackFromUrl.js';
import { createSupportAvatarLoadGuard } from './supportGrowthAvatarLoad.js';

const ROOT = join(__dirname, '../..');
const BLANK = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg';
const TW = 'https://static-cdn.jtvnw.net/jtv_user_pictures/umi3yama4-profile_image-12dac713b5bd6b4e-70x70.jpeg';

describe('v0.1.2248 失敗したアイコンは、どのサービスでもゆっくり顔(白い丸にしない)', () => {
  it('ニコの usericon は従来どおり uid のゆっくり顔', () => {
    const u = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1234/12345678.jpg';
    expect(avatarFallbackFaceForUrl(u)).toBe(identiconFallbackForAvatarUrl(u));
    expect(avatarFallbackFaceForUrl(u)).toMatch(/^data:image\/svg/);
  });
  it('Twitch・YouTube の失敗は URL ごとのゆっくり顔(実機で白丸だった umi3yama4)', () => {
    expect(identiconFallbackForAvatarUrl(TW)).toBe('');
    const a = avatarFallbackFaceForUrl(TW);
    expect(a).toMatch(/^data:image\/svg/);
    expect(avatarFallbackFaceForUrl(TW)).toBe(a);
    expect(avatarFallbackFaceForUrl('https://yt3.ggpht.com/ytc/abc=s88')).not.toBe(a);
  });
  it('空・公式の既定アイコンは空(呼び出し側の既定に任せる)', () => {
    expect(avatarFallbackFaceForUrl('')).toBe('');
    expect(avatarFallbackFaceForUrl(BLANK)).toBe('');
  });
  it('ガード経由: Twitch の失敗 URL は blank.jpg ではなくゆっくり顔を選ぶ', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: BLANK, fallbackSrcFor: avatarFallbackFaceForUrl });
    expect(g.pickDisplaySrc(TW)).not.toBe(BLANK);
  });
  it('ライブ POP・会場・状態ページ・動画の列が同じ関数を配線している', () => {
    for (const f of ['src/extension/popup-entry.js', 'src/extension/venueBar.js', 'src/extension/status-entry.js', 'src/extension/viewerBehaviorLiveLayout.js']) {
      expect(readFileSync(join(ROOT, f), 'utf8')).toContain('avatarFallbackFaceForUrl');
    }
  });
});
