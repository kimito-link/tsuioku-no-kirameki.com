/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { collectLoggedInViewerProfile } from './watchPageViewerProfile.js';

describe('collectLoggedInViewerProfile', () => {
  it('header 内の小さな usericon を絶対 URL で返す', () => {
    document.body.innerHTML = `
      <header>
        <img src="/nicoaccount/usericon/s/1/111.jpg" width="32" height="32" alt="">
      </header>`;
    const { viewerAvatarUrl, viewerNickname, viewerUserId } =
      collectLoggedInViewerProfile(document, 'https://live.nicovideo.jp/watch/lv1');
    expect(viewerAvatarUrl).toBe(
      'https://live.nicovideo.jp/nicoaccount/usericon/s/1/111.jpg'
    );
    expect(viewerNickname).toBe('');
    expect(viewerUserId).toBe('');
  });

  it('button aria-label から表示名', () => {
    document.body.innerHTML = `
      <header>
        <button type="button" aria-label="テストユーザー" />
        <img src="https://x/nicoaccount/usericon/1/2.jpg" width="24" height="24" alt="">
      </header>`;
    const { viewerNickname } = collectLoggedInViewerProfile(
      document,
      'https://live.nicovideo.jp/watch/lv1'
    );
    expect(viewerNickname).toBe('テストユーザー');
  });

  it('ヘッダー内のマイページリンクからユーザーID', () => {
    document.body.innerHTML = `
      <header>
        <a href="https://www.nicovideo.jp/user/12345678">
          <img src="/nicoaccount/usericon/s/1/2.jpg" width="32" height="32" alt="">
        </a>
      </header>`;
    const { viewerUserId, viewerNickname } = collectLoggedInViewerProfile(
      document,
      'https://live.nicovideo.jp/watch/lv1'
    );
    expect(viewerUserId).toBe('12345678');
    expect(viewerNickname).toBe('');
  });

  it('巨大なヘッダー画像はスキップ', () => {
    document.body.innerHTML = `
      <header>
        <img src="https://x/nicoaccount/usericon/1/2.jpg" width="200" height="200" alt="">
      </header>`;
    const img = document.querySelector('img');
    vi.spyOn(/** @type {HTMLElement} */ (img), 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 200,
      top: 0,
      left: 0,
      bottom: 200,
      right: 200,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    const { viewerAvatarUrl } = collectLoggedInViewerProfile(
      document,
      'https://live.nicovideo.jp/watch/lv1'
    );
    expect(viewerAvatarUrl).toBe('');
  });
});
