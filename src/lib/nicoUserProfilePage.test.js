/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  extractNicoUserIdFromProfileUrl,
  extractNicoUserProfilePageProfile
} from './nicoUserProfilePage.js';

describe('extractNicoUserIdFromProfileUrl', () => {
  it('www.nicovideo.jp/user/<id> から数値IDを取り出す', () => {
    expect(
      extractNicoUserIdFromProfileUrl('https://www.nicovideo.jp/user/142312460')
    ).toBe('142312460');
  });

  it('user ページ以外は空', () => {
    expect(
      extractNicoUserIdFromProfileUrl('https://www.nicovideo.jp/watch/sm9')
    ).toBe('');
  });

  it('nicovideo.jp ではない紛らわしいホストは空', () => {
    expect(
      extractNicoUserIdFromProfileUrl('https://evilnicovideo.jp/user/142312460')
    ).toBe('');
  });
});

describe('extractNicoUserProfilePageProfile', () => {
  it('プロフィールページの h1 / usericon から表示名とアイコンを拾う', () => {
    document.title = 'いちこ - ニコニコ';
    document.body.innerHTML = `
      <main>
        <section>
          <img
            alt="いちこ"
            src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14231/142312460.jpg"
          >
          <h1>いちこ <button aria-label="閉じる">×</button></h1>
          <p>ID : 142312460 (to i) プレミアム会員</p>
        </section>
      </main>
    `;

    const profile = extractNicoUserProfilePageProfile(
      document,
      'https://www.nicovideo.jp/user/142312460'
    );

    expect(profile).toEqual({
      userId: '142312460',
      nickname: 'いちこ',
      avatarUrl:
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14231/142312460.jpg'
    });
  });

  it('og:title と og:image からも補完できる', () => {
    document.head.innerHTML = `
      <meta property="og:title" content="いちこ | ニコニコ">
      <meta property="og:image" content="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14231/142312460.jpg">
    `;
    document.body.innerHTML = '';

    const profile = extractNicoUserProfilePageProfile(
      document,
      'https://www.nicovideo.jp/user/142312460?ref=watch_user_information'
    );

    expect(profile?.nickname).toBe('いちこ');
    expect(profile?.avatarUrl).toContain('/142312460.jpg');
  });

  it('URL上の userId と違うアイコンは採用しない', () => {
    document.head.innerHTML = '';
    document.body.innerHTML = `
      <h1>いちこ</h1>
      <img src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/404/4046119.jpg">
    `;

    const profile = extractNicoUserProfilePageProfile(
      document,
      'https://www.nicovideo.jp/user/142312460'
    );

    expect(profile?.nickname).toBe('いちこ');
    expect(profile?.avatarUrl).toBe('');
  });
});
