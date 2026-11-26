// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSupportAvatarLoadGuard, sharedAvatarLoadMemory } from './supportGrowthAvatarLoad.js';

const ROOT = join(__dirname, '../..');
const FB = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg';
const URL1 = 'https://static-cdn.jtvnw.net/jtv_user_pictures/a-profile_image-70x70.png';

describe('v0.1.2251 顔の読み込みガードは、ページで1つの覚えを共有する', () => {
  it('共有指定のガードどうしは、片方で失敗した URL をもう片方も知っている', () => {
    const a = createSupportAvatarLoadGuard({ fallbackSrc: FB, fallbackSrcFor: () => 'data:face', sharedMemory: true });
    const b = createSupportAvatarLoadGuard({ fallbackSrc: FB, sharedMemory: true });
    sharedAvatarLoadMemory().failedKeys.set(URL1, { kind: 'error', failCount: 1, lastFailAt: Date.now() });
    expect(a.pickDisplaySrc(URL1)).toBe('data:face');
    expect(b.pickDisplaySrc(URL1)).toBe(FB);
    sharedAvatarLoadMemory().failedKeys.delete(URL1);
    sharedAvatarLoadMemory().succeededKeys.add(URL1);
    expect(a.pickDisplaySrc(URL1)).toBe(URL1);
    expect(b.pickDisplaySrc(URL1)).toBe(URL1);
  });
  it('共有を指定しないガードは従来どおり別(テストや他の呼び出し元は変わらない)', () => {
    const c = createSupportAvatarLoadGuard({ fallbackSrc: FB });
    expect(c.pickDisplaySrc(URL1)).toBe(FB);
  });
  it('配線: 横の欄(POP)・会場・状態ページ・動画の顔の列の4つが共有の覚えを使う', () => {
    for (const f of ['src/extension/popup-entry.js', 'src/extension/venueBar.js', 'src/extension/status-entry.js', 'src/extension/viewerBehaviorLiveLayout.js']) {
      expect(readFileSync(join(ROOT, f), 'utf8')).toMatch(/sharedMemory: true/);
    }
  });
});
