import { describe, it, expect } from 'vitest';
import {
  resolveWhatsNewState,
  shouldSuppressWhatsNewSurface,
  checkUserFacingChangelogNote,
  checkLpWhatsNewSection,
  CHANGELOG_ITEM_MIN,
  WHATS_NEW_SEEN_STORAGE_KEY
} from './whatsNewNotice.js';

const okEntry = {
  version: '0.1.2216',
  summary: '更新したら「この版で変わったこと」が出ます',
  items: [
    '拡張を新しい版に更新したあと、横の欄やポップアップを開くと「この版で変わったこと」が一度だけ出ます。'
  ]
};

describe('resolveWhatsNewState', () => {
  it('初めて開いた（覚えた版が無い）ときは出さず、今の版を覚える', () => {
    expect(resolveWhatsNewState({ currentVersion: '0.1.2216' })).toEqual({
      show: false,
      persistSeenOnLoad: true,
      persistVersion: '0.1.2216'
    });
    expect(
      resolveWhatsNewState({ currentVersion: '0.1.2216', seenVersion: '' })
    ).toEqual({
      show: false,
      persistSeenOnLoad: true,
      persistVersion: '0.1.2216'
    });
  });

  it('覚えた版より新しいときだけ出す', () => {
    expect(
      resolveWhatsNewState({
        currentVersion: '0.1.2216',
        seenVersion: '0.1.2215'
      })
    ).toEqual({
      show: true,
      persistSeenOnLoad: false,
      persistVersion: '0.1.2216'
    });
  });

  it('同じ版・より新しい版を覚えているときは出さない', () => {
    expect(
      resolveWhatsNewState({
        currentVersion: '0.1.2216',
        seenVersion: '0.1.2216'
      }).show
    ).toBe(false);
    expect(
      resolveWhatsNewState({
        currentVersion: '0.1.2215',
        seenVersion: '0.1.2216'
      }).show
    ).toBe(false);
  });

  it('今の版が semver でないときは出さない', () => {
    expect(resolveWhatsNewState({ currentVersion: 'dev' }).show).toBe(false);
    expect(resolveWhatsNewState(null).show).toBe(false);
  });
});

describe('shouldSuppressWhatsNewSurface', () => {
  it('視聴ページへの埋め込みと受動ビューでは出さない', () => {
    expect(shouldSuppressWhatsNewSurface({ embedWatch: true })).toBe(true);
    expect(shouldSuppressWhatsNewSurface({ embedLiveView: true })).toBe(true);
    expect(shouldSuppressWhatsNewSurface({ passive: true })).toBe(true);
  });

  it('横の欄やツールバーでは出す', () => {
    expect(shouldSuppressWhatsNewSurface({ sidePanel: true })).toBe(false);
    expect(shouldSuppressWhatsNewSurface({})).toBe(false);
  });
});

describe('checkUserFacingChangelogNote', () => {
  it('十分な長さの説明なら OK', () => {
    expect(checkUserFacingChangelogNote(okEntry)).toEqual([]);
  });

  it('items が短い・空なら検出', () => {
    expect(
      checkUserFacingChangelogNote({ ...okEntry, items: [] }).some((m) =>
        m.includes('items')
      )
    ).toBe(true);
    const short = checkUserFacingChangelogNote({
      ...okEntry,
      items: ['短い。']
    });
    expect(short.some((m) => m.includes('短すぎる'))).toBe(true);
    expect(CHANGELOG_ITEM_MIN).toBeGreaterThan('短い。'.length);
  });

  it('有料・LINE・紹介・GPU案内・恐れを煽る表現を検出', () => {
    const long = 'あ'.repeat(CHANGELOG_ITEM_MIN);
    expect(
      checkUserFacingChangelogNote({
        ...okEntry,
        items: [`${long}有料プラン`]
      }).some((m) => m.includes('有料'))
    ).toBe(true);
    expect(
      checkUserFacingChangelogNote({
        ...okEntry,
        items: [`${long}LINEで知らせます`]
      }).some((m) => m.includes('LINE'))
    ).toBe(true);
    expect(
      checkUserFacingChangelogNote({
        ...okEntry,
        items: [`${long}紹介コードを入力`]
      }).some((m) => m.includes('紹介'))
    ).toBe(true);
    expect(
      checkUserFacingChangelogNote({
        ...okEntry,
        items: [`${long}ハードウェアアクセラレーションを切って`]
      }).some((m) => m.includes('GPU'))
    ).toBe(true);
    expect(
      checkUserFacingChangelogNote({
        ...okEntry,
        items: [`${long}今すぐやらないと危険です`]
      }).length
    ).toBeGreaterThan(0);
  });

  it('storage キー名が変わっていない', () => {
    expect(WHATS_NEW_SEEN_STORAGE_KEY).toBe('whatsNewSeenVersion');
  });
});

describe('checkLpWhatsNewSection', () => {
  const html = `
    <section id="lp-whats-new" data-whats-new-version="0.1.2216">
      <h2>この版で変わったこと</h2>
      <span data-whats-new-summary>更新したら「この版で変わったこと」が出ます</span>
      <ul><li>${okEntry.items[0]}</li></ul>
    </section>
  `;

  it('版・概要・本文が一致すれば OK', () => {
    expect(
      checkLpWhatsNewSection({
        html,
        version: '0.1.2216',
        summary: okEntry.summary,
        items: okEntry.items
      })
    ).toEqual([]);
  });

  it('欄が無い・版が古い・概要が違うと検出', () => {
    expect(
      checkLpWhatsNewSection({
        html: '<main></main>',
        version: '0.1.2216',
        summary: okEntry.summary,
        items: okEntry.items
      }).some((m) => m.includes('lp-whats-new'))
    ).toBe(true);
    expect(
      checkLpWhatsNewSection({
        html: html.replace('0.1.2216', '0.1.2215'),
        version: '0.1.2216',
        summary: okEntry.summary,
        items: okEntry.items
      }).some((m) => m.includes('v0.1.2215'))
    ).toBe(true);
    expect(
      checkLpWhatsNewSection({
        html,
        version: '0.1.2216',
        summary: '別の概要です',
        items: okEntry.items
      }).some((m) => m.includes('概要'))
    ).toBe(true);
  });
});
