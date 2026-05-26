import { describe, it, expect } from 'vitest';
import {
  collectInterceptSignalsFromObject,
  extractLearnUsersFromNicoUserIconUrlsInString,
  walkJsonForInterceptSignals,
  normalizeInterceptAvatarUrl,
  INTERCEPT_AVATAR_KEYS
} from './niconicoInterceptLearn.js';
import sample from './fixtures/interceptLearn.sample.json';

describe('extractLearnUsersFromNicoUserIconUrlsInString', () => {
  it('文字列内の公式 usericon URL から uid と av を返す', () => {
    const blob =
      '{"x":"https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/8625/86255751.jpg"}';
    const out = extractLearnUsersFromNicoUserIconUrlsInString(blob);
    expect(out).toEqual([
      {
        uid: '86255751',
        name: '',
        av: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/8625/86255751.jpg'
      }
    ]);
  });
});

describe('normalizeInterceptAvatarUrl', () => {
  it('https のみ通す', () => {
    expect(normalizeInterceptAvatarUrl('https://x/a.jpg')).toBe('https://x/a.jpg');
    expect(normalizeInterceptAvatarUrl('//x/a.jpg')).toBe('');
    expect(normalizeInterceptAvatarUrl('data:image/png;base64,xx')).toBe('');
  });
});

describe('collectInterceptSignalsFromObject', () => {
  it('フラットな comment + user + icon で enqueue', () => {
    const { enqueues, learnUsers } = collectInterceptSignalsFromObject({
      commentNo: '42',
      userId: '10000111',
      displayName: 'Tester',
      iconUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/10000111.jpg'
    });
    expect(learnUsers).toHaveLength(0);
    expect(enqueues).toEqual([
      {
        no: '42',
        uid: '10000111',
        name: 'Tester',
        av: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/10000111.jpg'
      }
    ]);
  });

  it('commentNo 無し・userId+displayName+thumbnailUrl なら learnUser', () => {
    const { enqueues, learnUsers } = collectInterceptSignalsFromObject({
      userId: '22334455',
      displayName: 'profile_only',
      thumbnailUrl: 'https://cdn.example/p.png'
    });
    expect(enqueues).toHaveLength(0);
    expect(learnUsers).toEqual([
      {
        uid: '22334455',
        name: 'profile_only',
        av: 'https://cdn.example/p.png'
      }
    ]);
  });

  it('advertiserUserId+advertiserName+iconUrl で learnUser', () => {
    const { enqueues, learnUsers } = collectInterceptSignalsFromObject({
      advertiserUserId: '55667788',
      advertiserName: 'gift_sender',
      iconUrl: 'https://cdn.example/gift.png'
    });
    expect(enqueues).toHaveLength(0);
    expect(learnUsers).toEqual([
      {
        uid: '55667788',
        name: 'gift_sender',
        av: 'https://cdn.example/gift.png'
      }
    ]);
  });

  it('commentNo 無し・userId+iconUrl のみ（name なし）でも learnUser（avatar 蓄積用）', () => {
    const { enqueues, learnUsers } = collectInterceptSignalsFromObject({
      userId: '99887766',
      iconUrl: 'https://cdn.example/only-icon.jpg'
    });
    expect(enqueues).toHaveLength(0);
    expect(learnUsers).toEqual([
      {
        uid: '99887766',
        name: '',
        av: 'https://cdn.example/only-icon.jpg'
      }
    ]);
  });

  it('広告・ランキングを示すキー（score, advertiserUserId 等）があれば enqueue は行わず learnUser のみ生成する', () => {
    const { enqueues, learnUsers } = collectInterceptSignalsFromObject({
      no: '6',
      advertiserUserId: '15412541',
      advertiserName: '太ももちゃん',
      iconUrl: 'https://cdn.example/ad.png',
      score: 27285
    });
    expect(enqueues).toHaveLength(0);
    expect(learnUsers).toEqual([
      {
        uid: '15412541',
        name: '太ももちゃん',
        av: 'https://cdn.example/ad.png'
      }
    ]);
  });

  it('ネストした子オブジェクトに広告キーが含まれている場合も enqueue をブロックする', () => {
    const { enqueues, learnUsers } = collectInterceptSignalsFromObject({
      no: '6',
      chat: {
        userId: '15412541',
        name: '太ももちゃん',
        iconUrl: 'https://cdn.example/ad.png',
        advertiserUserId: '15412541'
      }
    });
    expect(enqueues).toHaveLength(0);
    expect(learnUsers).toEqual([
      {
        uid: '15412541',
        name: '太ももちゃん',
        av: 'https://cdn.example/ad.png'
      }
    ]);
  });
});

describe('walkJsonForInterceptSignals', () => {
  it('フィクスチャ JSON（ネスト chat）から enqueue を拾う', () => {
    const { enqueues, learnUsers } = walkJsonForInterceptSignals(sample);
    expect(learnUsers).toHaveLength(0);
    expect(enqueues.length).toBeGreaterThanOrEqual(1);
    const hit = enqueues.find((e) => e.no === '501');
    expect(hit).toEqual({
      no: '501',
      uid: '88776655',
      name: 'fixture_user',
      av: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/8877/88776655.jpg'
    });
  });
});

describe('INTERCEPT_AVATAR_KEYS', () => {
  it('thumbnailUrl を含む（intercept 網羅の退行防止）', () => {
    expect(INTERCEPT_AVATAR_KEYS).toContain('thumbnailUrl');
    expect(INTERCEPT_AVATAR_KEYS).toContain('thumbnail_url');
  });
});
