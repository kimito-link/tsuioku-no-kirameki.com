import { describe, it, expect } from 'vitest';
import {
  classifyFeatureCategory,
  FEATURE_CATEGORIES
} from './classifyFeatureCategory.js';

describe('classifyFeatureCategory', () => {
  // ① ファイル名で確実に分類されるもの(誤分類の境界を固定)
  it('voice* → 読み上げ', () => {
    expect(classifyFeatureCategory('src/lib/voiceReadQueue.js')).toBe('🔊 読み上げ');
    expect(classifyFeatureCategory('src/lib/voicePlayer.js')).toBe('🔊 読み上げ');
    expect(classifyFeatureCategory('src/lib/voiceAgeGate.js')).toBe('🔊 読み上げ');
  });

  it('venue/吹き出し/群衆 → 表示・演出', () => {
    expect(classifyFeatureCategory('src/lib/venueBubbleLifecycle.js')).toBe('🪟 表示・演出');
    expect(classifyFeatureCategory('src/lib/venueSeats.js')).toBe('🪟 表示・演出');
    expect(classifyFeatureCategory('src/lib/crowdRasterizer.js')).toBe('🪟 表示・演出');
    expect(classifyFeatureCategory('src/lib/giftThrowProjectile.js')).toBe('🪟 表示・演出');
  });

  it('🔴 voiceReadQueue を gift と誤分類しない(境界・会議の懸念)', () => {
    // 名前に voice を含む=読み上げが先に当たる。gift ルールは後段なので誤らない。
    expect(classifyFeatureCategory('src/lib/voiceReadQueue.js')).not.toBe('🪟 表示・演出');
  });

  it('backfill/ndgr → 取得', () => {
    expect(classifyFeatureCategory('src/lib/ndgrBackfillCrawl.js')).toBe('📥 取得');
    expect(classifyFeatureCategory('src/lib/ndgrChatRows.js')).toBe('📥 取得');
    expect(classifyFeatureCategory('src/lib/commentHarvest.js')).toBe('📥 取得');
  });

  it('record/storage/chunk → 記録', () => {
    expect(classifyFeatureCategory('src/lib/storageKeys.js')).toBe('💾 記録');
    expect(classifyFeatureCategory('src/lib/monotonicCommentCount.js')).toBe('💾 記録');
  });

  it('集計系 → 集計', () => {
    expect(classifyFeatureCategory('src/lib/userLaneCandidatesFromStorage.js')).toBe('🧮 集計');
    expect(classifyFeatureCategory('src/lib/kiramekiAwards.js')).toBe('🧮 集計');
  });

  it('report系 → レポート', () => {
    expect(classifyFeatureCategory('src/lib/reportNextMemoSectionHtml.js')).toBe('📊 レポート');
  });

  it('diag/status系 → 診断・地図', () => {
    expect(classifyFeatureCategory('src/lib/statusFormat.js')).toBe('🩺 診断・地図');
    expect(classifyFeatureCategory('src/lib/diagWarnings.js')).toBe('🩺 診断・地図');
  });

  // ② 名前が中立で役割テキストで分類されるもの
  it('名前が曖昧でも役割テキストで分類', () => {
    expect(classifyFeatureCategory('src/lib/foo.js', 'コメントを声で読み上げる係')).toBe('🔊 読み上げ');
    expect(classifyFeatureCategory('src/lib/bar.js', '会場の吹き出しを描画する')).toBe('🪟 表示・演出');
  });

  // ③ 未分類
  it('名前も役割も当たらねば その他', () => {
    expect(classifyFeatureCategory('src/lib/zzz.js')).toBe('その他');
    expect(classifyFeatureCategory('src/lib/zzz.js', '謎の処理')).toBe('その他');
  });

  it('返り値は必ず FEATURE_CATEGORIES のいずれか', () => {
    const samples = ['src/lib/voicePlayer.js', 'src/lib/zzz.js', 'src/extension/popup-entry.js'];
    for (const s of samples) {
      expect(FEATURE_CATEGORIES).toContain(classifyFeatureCategory(s));
    }
  });

  it('空/非文字列でも落ちない', () => {
    expect(classifyFeatureCategory('')).toBe('その他');
    expect(classifyFeatureCategory(undefined)).toBe('その他');
    expect(classifyFeatureCategory(null, null)).toBe('その他');
  });
});
