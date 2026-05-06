/**
 * v0.1.201: diagWarnings の純関数テスト。
 *
 * 「診断見せれば説明不要」のための reason / warning 導出ロジックを
 * 全分岐 cover する。
 */

import { describe, it, expect } from 'vitest';
import {
  deriveAutoOpenFailureReason,
  deriveStaleDomBundleSuspected
} from './diagWarnings.js';

describe('deriveAutoOpenFailureReason', () => {
  it('null/undefined/{} → null（判定不能）', () => {
    expect(deriveAutoOpenFailureReason(null)).toBeNull();
    expect(deriveAutoOpenFailureReason(undefined)).toBeNull();
    expect(deriveAutoOpenFailureReason(/** @type {any} */ ({}))).toBe(
      'never_attempted'
    );
  });

  it('attemptCount=0 → never_attempted', () => {
    expect(
      deriveAutoOpenFailureReason({ attemptCount: 0, lastStatus: '' })
    ).toBe('never_attempted');
  });

  it('lastStatus=opened-with-banner → null（成功）', () => {
    expect(
      deriveAutoOpenFailureReason({
        attemptCount: 1,
        lastStatus: 'opened-with-banner'
      })
    ).toBeNull();
  });

  it('lastStatus=success → null', () => {
    expect(
      deriveAutoOpenFailureReason({ attemptCount: 1, lastStatus: 'success' })
    ).toBeNull();
  });

  it('opened-but-no-banner + hint 0 → sidebar_empty', () => {
    expect(
      deriveAutoOpenFailureReason({
        attemptCount: 1,
        lastStatus: 'opened-but-no-banner',
        lastSidebarHints: { hintCount: 0 }
      })
    ).toBe('banner_not_rendered_sidebar_empty');
  });

  it('opened-but-no-banner + hintCount>0 → sidebar_has_hints', () => {
    expect(
      deriveAutoOpenFailureReason({
        attemptCount: 1,
        lastStatus: 'opened-but-no-banner',
        lastSidebarHints: { hintCount: 3 }
      })
    ).toBe('banner_not_rendered_sidebar_has_hints');
  });

  it('opened-but-no-banner + lastSidebarHints が null → sidebar_empty', () => {
    expect(
      deriveAutoOpenFailureReason({
        attemptCount: 1,
        lastStatus: 'opened-but-no-banner',
        lastSidebarHints: null
      })
    ).toBe('banner_not_rendered_sidebar_empty');
  });

  it('lastStatus=sidebar_button_not_found → 同名トークン', () => {
    expect(
      deriveAutoOpenFailureReason({
        attemptCount: 1,
        lastStatus: 'sidebar_button_not_found'
      })
    ).toBe('sidebar_button_not_found');
  });

  it('lastStatus=closed → closed', () => {
    expect(
      deriveAutoOpenFailureReason({ attemptCount: 1, lastStatus: 'closed' })
    ).toBe('closed');
  });

  it('未知の lastStatus → 文字列素通し', () => {
    expect(
      deriveAutoOpenFailureReason({
        attemptCount: 1,
        lastStatus: 'unexpected-state'
      })
    ).toBe('unexpected-state');
  });

  it('attemptCount>0 + lastStatus 空 → unknown', () => {
    expect(
      deriveAutoOpenFailureReason({ attemptCount: 1, lastStatus: '' })
    ).toBe('unknown');
  });
});

describe('deriveStaleDomBundleSuspected', () => {
  it('null/undefined → false', () => {
    expect(deriveStaleDomBundleSuspected(null)).toBe(false);
    expect(deriveStaleDomBundleSuspected(undefined)).toBe(false);
  });

  it('hasSnapshot=false → false（snapshot なしは判定対象外）', () => {
    expect(
      deriveStaleDomBundleSuspected({
        hasSnapshot: false,
        eventDomLvCount: 100
      })
    ).toBe(false);
  });

  it('eventDomLvCount > 30 → true（過去残骸大量）', () => {
    expect(
      deriveStaleDomBundleSuspected({
        hasSnapshot: true,
        eventDomLvCount: 46,
        currentLiveIdInEventDom: true,
        currentLiveIdInNicoad: true
      })
    ).toBe(true);
  });

  it('eventDomLvCount = 30（境界） → false', () => {
    expect(
      deriveStaleDomBundleSuspected({
        hasSnapshot: true,
        eventDomLvCount: 30,
        currentLiveIdInEventDom: true,
        currentLiveIdInNicoad: true
      })
    ).toBe(false);
  });

  it('currentLiveIdInEventDom=false → true（古い snapshot）', () => {
    expect(
      deriveStaleDomBundleSuspected({
        hasSnapshot: true,
        eventDomLvCount: 5,
        currentLiveIdInEventDom: false,
        currentLiveIdInNicoad: true
      })
    ).toBe(true);
  });

  it('currentLiveIdInNicoad=false かつ eventCount>5 → true', () => {
    expect(
      deriveStaleDomBundleSuspected({
        hasSnapshot: true,
        eventDomLvCount: 6,
        currentLiveIdInEventDom: true,
        currentLiveIdInNicoad: false
      })
    ).toBe(true);
  });

  it('currentLiveIdInNicoad=false かつ eventCount<=5 → false', () => {
    expect(
      deriveStaleDomBundleSuspected({
        hasSnapshot: true,
        eventDomLvCount: 5,
        currentLiveIdInEventDom: true,
        currentLiveIdInNicoad: false
      })
    ).toBe(false);
  });

  it('全部正常（current 一致 + 残骸少） → false', () => {
    expect(
      deriveStaleDomBundleSuspected({
        hasSnapshot: true,
        eventDomLvCount: 1,
        currentLiveIdInEventDom: true,
        currentLiveIdInNicoad: true
      })
    ).toBe(false);
  });

  it('実データ再現（lv350471264 セッション: count=46 / nicoad mismatch）→ true', () => {
    expect(
      deriveStaleDomBundleSuspected({
        hasSnapshot: true,
        eventDomLvCount: 46,
        currentLiveIdInEventDom: true,
        currentLiveIdInNicoad: false
      })
    ).toBe(true);
  });
});
