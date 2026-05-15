import { describe, it, expect } from 'vitest';
import {
  northStarLaneGadgetCharaRelativePath,
  northStarLaneGadgetCharaPathByTier
} from './northStarLaneGadgetChara.js';

describe('northStarLaneGadgetCharaRelativePath (legacy 互換)', () => {
  it('adRanking は konta-72.png を返す', () => {
    expect(northStarLaneGadgetCharaRelativePath('adRanking')).toBe(
      'images/marketing-html-avatars/konta-72.png'
    );
  });

  it('giftHistory は tanu-72.png を返す', () => {
    expect(northStarLaneGadgetCharaRelativePath('giftHistory')).toBe(
      'images/marketing-html-avatars/tanu-72.png'
    );
  });

  it('contributionRanking / eventRank / eventScore / programPoints は rink-72.png を返す', () => {
    for (const laneId of ['contributionRanking', 'eventRank', 'eventScore', 'programPoints']) {
      expect(northStarLaneGadgetCharaRelativePath(laneId)).toBe(
        'images/marketing-html-avatars/rink-72.png'
      );
    }
  });

  it('未知の laneId / 空文字 / null は rink にフォールバック', () => {
    expect(northStarLaneGadgetCharaRelativePath('unknownLane')).toBe(
      'images/marketing-html-avatars/rink-72.png'
    );
    expect(northStarLaneGadgetCharaRelativePath('')).toBe(
      'images/marketing-html-avatars/rink-72.png'
    );
    expect(northStarLaneGadgetCharaRelativePath(null)).toBe(
      'images/marketing-html-avatars/rink-72.png'
    );
  });
});

describe('northStarLaneGadgetCharaPathByTier', () => {
  describe('tier 別の表情', () => {
    it('wait は blink-mouth-closed（目を閉じている）', () => {
      expect(northStarLaneGadgetCharaPathByTier('contributionRanking', 'wait')).toBe(
        'images/yukkuri-charactore-english/link/link-yukkuri-blink-mouth-closed.png'
      );
    });

    it('none も blink-mouth-closed（取得 0 = 寝ている扱い）', () => {
      expect(northStarLaneGadgetCharaPathByTier('contributionRanking', 'none')).toBe(
        'images/yukkuri-charactore-english/link/link-yukkuri-blink-mouth-closed.png'
      );
    });

    it('low は half-eyes-mouth-closed（うとうと）', () => {
      expect(northStarLaneGadgetCharaPathByTier('contributionRanking', 'low')).toBe(
        'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png'
      );
    });

    it('mid は normal-mouth-closed（普通）', () => {
      expect(northStarLaneGadgetCharaPathByTier('contributionRanking', 'mid')).toBe(
        'images/yukkuri-charactore-english/link/link-yukkuri-normal-mouth-closed.png'
      );
    });

    it('high は smile-mouth-closed（にっこり）', () => {
      expect(northStarLaneGadgetCharaPathByTier('contributionRanking', 'high')).toBe(
        'images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-closed.png'
      );
    });

    it('full は smile-mouth-open（満面の笑み）', () => {
      expect(northStarLaneGadgetCharaPathByTier('contributionRanking', 'full')).toBe(
        'images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.png'
      );
    });

    it('未知の tier は wait と同じ blink-mouth-closed にフォールバック', () => {
      expect(northStarLaneGadgetCharaPathByTier('contributionRanking', 'unknown')).toBe(
        'images/yukkuri-charactore-english/link/link-yukkuri-blink-mouth-closed.png'
      );
      expect(northStarLaneGadgetCharaPathByTier('contributionRanking', '')).toBe(
        'images/yukkuri-charactore-english/link/link-yukkuri-blink-mouth-closed.png'
      );
      expect(northStarLaneGadgetCharaPathByTier('contributionRanking', null)).toBe(
        'images/yukkuri-charactore-english/link/link-yukkuri-blink-mouth-closed.png'
      );
    });
  });

  describe('laneId 別のキャラ割当（既存マッピング維持）', () => {
    it('adRanking は kitsune (konta dir) を使う', () => {
      expect(northStarLaneGadgetCharaPathByTier('adRanking', 'full')).toBe(
        'images/yukkuri-charactore-english/konta/kitsune-yukkuri-smile-mouth-open.png'
      );
    });

    it('giftHistory は tanuki (tanunee dir) を使う', () => {
      expect(northStarLaneGadgetCharaPathByTier('giftHistory', 'full')).toBe(
        'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-smile-mouth-open.png'
      );
    });

    it('contributionRanking / eventRank / eventScore / programPoints は link を使う', () => {
      for (const laneId of ['contributionRanking', 'eventRank', 'eventScore', 'programPoints']) {
        expect(northStarLaneGadgetCharaPathByTier(laneId, 'full')).toBe(
          `images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.png`
        );
      }
    });

    it('未知 laneId / 空 / null は link にフォールバック', () => {
      expect(northStarLaneGadgetCharaPathByTier('unknownLane', 'full')).toBe(
        'images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.png'
      );
      expect(northStarLaneGadgetCharaPathByTier('', 'full')).toBe(
        'images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.png'
      );
      expect(northStarLaneGadgetCharaPathByTier(null, 'full')).toBe(
        'images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.png'
      );
    });
  });

  describe('konta(kitsune) 専用フォールバック', () => {
    it('mid tier は normal-mouth-closed が無いので kitsune-yukkuri-mouth-closed.png にフォールバック', () => {
      expect(northStarLaneGadgetCharaPathByTier('adRanking', 'mid')).toBe(
        'images/yukkuri-charactore-english/konta/kitsune-yukkuri-mouth-closed.png'
      );
    });

    it('他の tier はフォールバック対象外（通常マッピングを使う）', () => {
      expect(northStarLaneGadgetCharaPathByTier('adRanking', 'low')).toBe(
        'images/yukkuri-charactore-english/konta/kitsune-yukkuri-half-eyes-mouth-closed.png'
      );
      expect(northStarLaneGadgetCharaPathByTier('adRanking', 'high')).toBe(
        'images/yukkuri-charactore-english/konta/kitsune-yukkuri-smile-mouth-closed.png'
      );
    });
  });
});
