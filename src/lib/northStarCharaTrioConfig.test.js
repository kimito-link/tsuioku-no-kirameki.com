/**
 * northStarCharaTrioConfig.js のテスト。
 *
 * 目的（v0.1.290）:
 *   §6.4 本実装（v0.1.291 予定）の前に、3 キャラ trio の slot ↔ laneId ↔ image
 *   src の対応を構造的に固定する。3 年後に slot 追加・並び替え・キャラ差し替え
 *   をしても本 test が落ちて即検出できる。
 */

import { describe, it, expect } from 'vitest';
import {
  NORTH_STAR_CHARA_TRIO_SLOTS,
  findCharaTrioSlotByLaneId,
  findCharaTrioSlotById,
  tierToTrioCharaSrc,
  buildCharaTrioRenderModel,
  describeCharaTrioTier,
  buildCharaTrioSlotTitle,
  resolveCharaTrioSlotScrollTargetLaneId,
  resolveCharaTrioSlotScrollLaneIdCandidates
} from './northStarCharaTrioConfig.js';

describe('NORTH_STAR_CHARA_TRIO_SLOTS 不変条件', () => {
  it('frozen array で 3 件持つ（rink / konta / tanu）', () => {
    expect(Array.isArray(NORTH_STAR_CHARA_TRIO_SLOTS)).toBe(true);
    expect(Object.isFrozen(NORTH_STAR_CHARA_TRIO_SLOTS)).toBe(true);
    expect(NORTH_STAR_CHARA_TRIO_SLOTS).toHaveLength(3);
    for (const s of NORTH_STAR_CHARA_TRIO_SLOTS) {
      expect(Object.isFrozen(s)).toBe(true);
    }
  });

  it('slotId は rink / konta / tanu の 3 種で重複しない', () => {
    const ids = NORTH_STAR_CHARA_TRIO_SLOTS.map((s) => s.slotId);
    expect(new Set(ids)).toEqual(new Set(['rink', 'konta', 'tanu']));
  });

  it('既存 northStarLaneGadgetChara.js の characterForLane と整合（rink←contrib / konta←ad / tanu←gift）', () => {
    const slotByLane = Object.fromEntries(
      NORTH_STAR_CHARA_TRIO_SLOTS.map((s) => [s.laneId, s.slotId])
    );
    expect(slotByLane.contributionRanking).toBe('rink');
    expect(slotByLane.adRanking).toBe('konta');
    expect(slotByLane.giftHistory).toBe('tanu');
  });

  it('charaDir / charaPrefix が yukkuri-charactore-english アセット規約に合う', () => {
    const map = Object.fromEntries(
      NORTH_STAR_CHARA_TRIO_SLOTS.map((s) => [s.slotId, s])
    );
    expect(map.rink.charaDir).toBe('link');
    expect(map.rink.charaPrefix).toBe('link');
    expect(map.konta.charaDir).toBe('konta');
    expect(map.konta.charaPrefix).toBe('kitsune');
    expect(map.tanu.charaDir).toBe('tanunee');
    expect(map.tanu.charaPrefix).toBe('tanuki');
  });

  it('displayName は日本語表記', () => {
    const names = NORTH_STAR_CHARA_TRIO_SLOTS.map((s) => s.displayName);
    expect(names).toEqual(['りんく', 'こん太', 'たぬ姉']);
  });

  it('laneJaName は各レーンの利用者向け正式名と一致', () => {
    const map = Object.fromEntries(
      NORTH_STAR_CHARA_TRIO_SLOTS.map((s) => [s.slotId, s.laneJaName])
    );
    expect(map.rink).toBe('貢献度ランキング');
    expect(map.konta).toBe('広告ランキング');
    expect(map.tanu).toBe('この番組のギフト履歴');
  });
});

describe('describeCharaTrioTier', () => {
  it('6 tier 全てに日本語ラベルがある', () => {
    expect(describeCharaTrioTier('wait')).toBe('取得待ち');
    expect(describeCharaTrioTier('none')).toBe('未取得');
    expect(describeCharaTrioTier('low')).toBe('取得率 低');
    expect(describeCharaTrioTier('mid')).toBe('取得率 中');
    expect(describeCharaTrioTier('high')).toBe('取得率 高');
    expect(describeCharaTrioTier('full')).toBe('完全取得');
  });

  it('未知 tier / 空文字 / null → "取得待ち" に倒れる（落ちない）', () => {
    expect(describeCharaTrioTier('mystery')).toBe('取得待ち');
    expect(describeCharaTrioTier('')).toBe('取得待ち');
    // @ts-expect-error 不正入力の防御
    expect(describeCharaTrioTier(null)).toBe('取得待ち');
    // @ts-expect-error 不正入力の防御
    expect(describeCharaTrioTier(undefined)).toBe('取得待ち');
  });
});

describe('buildCharaTrioSlotTitle', () => {
  const rinkSlot = NORTH_STAR_CHARA_TRIO_SLOTS[0];

  it('pct 数値 + tier ラベル付きの title を組み立てる', () => {
    expect(buildCharaTrioSlotTitle(rinkSlot, 'high', 78)).toBe(
      'りんく（貢献度ランキング） · 取得率 78% · 取得率 高'
    );
  });

  it('pct=null → 「取得待ち」を中央位置に出す（SR 用に明示表現）', () => {
    expect(buildCharaTrioSlotTitle(rinkSlot, 'wait', null)).toBe(
      'りんく（貢献度ランキング） · 取得待ち · 取得待ち'
    );
  });

  it('full tier の表現が正しい', () => {
    expect(buildCharaTrioSlotTitle(rinkSlot, 'full', 100)).toBe(
      'りんく（貢献度ランキング） · 取得率 100% · 完全取得'
    );
  });

  it('pct=0 も "取得率 0%" として明示（隠さない）', () => {
    expect(buildCharaTrioSlotTitle(rinkSlot, 'none', 0)).toBe(
      'りんく（貢献度ランキング） · 取得率 0% · 未取得'
    );
  });

  it('pct=NaN / 非数値は「取得待ち」表示', () => {
    expect(buildCharaTrioSlotTitle(rinkSlot, 'wait', NaN)).toBe(
      'りんく（貢献度ランキング） · 取得待ち · 取得待ち'
    );
    // @ts-expect-error 不正入力の防御
    expect(buildCharaTrioSlotTitle(rinkSlot, 'wait', 'bogus')).toBe(
      'りんく（貢献度ランキング） · 取得待ち · 取得待ち'
    );
  });

  it('slot 自体が壊れていても fallback で落ちない', () => {
    // @ts-expect-error 不正入力の防御
    expect(buildCharaTrioSlotTitle({}, 'mid', 50)).toBe(
      'キャラ（レーン） · 取得率 50% · 取得率 中'
    );
    // @ts-expect-error 不正入力の防御
    expect(buildCharaTrioSlotTitle(null, 'mid', 50)).toBe(
      'キャラ（レーン） · 取得率 50% · 取得率 中'
    );
  });

  it('小数 pct は四捨五入', () => {
    expect(buildCharaTrioSlotTitle(rinkSlot, 'high', 77.6)).toBe(
      'りんく（貢献度ランキング） · 取得率 78% · 取得率 高'
    );
    expect(buildCharaTrioSlotTitle(rinkSlot, 'low', 12.3)).toBe(
      'りんく（貢献度ランキング） · 取得率 12% · 取得率 低'
    );
  });
});

describe('resolveCharaTrioSlotScrollTargetLaneId', () => {
  it('3 slot を laneId に解決する', () => {
    expect(resolveCharaTrioSlotScrollTargetLaneId('rink')).toBe('contributionRanking');
    expect(resolveCharaTrioSlotScrollTargetLaneId('konta')).toBe('adRanking');
    expect(resolveCharaTrioSlotScrollTargetLaneId('tanu')).toBe('giftHistory');
  });

  it('未知 / 空 / null は null', () => {
    expect(resolveCharaTrioSlotScrollTargetLaneId('hoge')).toBe(null);
    expect(resolveCharaTrioSlotScrollTargetLaneId('')).toBe(null);
    // @ts-expect-error 不正入力の防御
    expect(resolveCharaTrioSlotScrollTargetLaneId(null)).toBe(null);
    // @ts-expect-error 不正入力の防御
    expect(resolveCharaTrioSlotScrollTargetLaneId(undefined)).toBe(null);
  });
});

describe('resolveCharaTrioSlotScrollLaneIdCandidates', () => {
  it('konta: 広告→ギフト→貢献度（補助 hidden 時のフォールバック）', () => {
    expect(resolveCharaTrioSlotScrollLaneIdCandidates('konta')).toEqual([
      'adRanking',
      'giftHistory',
      'contributionRanking'
    ]);
  });

  it('rink: 貢献度→ギフト（コア同士は重複なし）', () => {
    expect(resolveCharaTrioSlotScrollLaneIdCandidates('rink')).toEqual([
      'contributionRanking',
      'giftHistory'
    ]);
  });

  it('tanu: ギフト→貢献度', () => {
    expect(resolveCharaTrioSlotScrollLaneIdCandidates('tanu')).toEqual([
      'giftHistory',
      'contributionRanking'
    ]);
  });

  it('未知 slot は空配列', () => {
    expect(resolveCharaTrioSlotScrollLaneIdCandidates('hoge')).toEqual([]);
    expect(resolveCharaTrioSlotScrollLaneIdCandidates('')).toEqual([]);
    // @ts-expect-error 不正入力の防御
    expect(resolveCharaTrioSlotScrollLaneIdCandidates(null)).toEqual([]);
  });
});

describe('findCharaTrioSlotByLaneId', () => {
  it('既知の 3 レーンを slot に解決する', () => {
    expect(findCharaTrioSlotByLaneId('contributionRanking')?.slotId).toBe('rink');
    expect(findCharaTrioSlotByLaneId('adRanking')?.slotId).toBe('konta');
    expect(findCharaTrioSlotByLaneId('giftHistory')?.slotId).toBe('tanu');
  });

  it('trio に含まれないレーンは null（eventRank / eventScore / programPoints / 未知）', () => {
    expect(findCharaTrioSlotByLaneId('eventRank')).toBe(null);
    expect(findCharaTrioSlotByLaneId('eventScore')).toBe(null);
    expect(findCharaTrioSlotByLaneId('programPoints')).toBe(null);
    expect(findCharaTrioSlotByLaneId('unknown')).toBe(null);
  });

  it('空 / null / 前後空白を正しく扱う', () => {
    expect(findCharaTrioSlotByLaneId('')).toBe(null);
    expect(findCharaTrioSlotByLaneId(/** @type {any} */ (null))).toBe(null);
    expect(findCharaTrioSlotByLaneId(/** @type {any} */ (undefined))).toBe(null);
    expect(findCharaTrioSlotByLaneId('  adRanking  ')?.slotId).toBe('konta');
  });
});

describe('findCharaTrioSlotById', () => {
  it('3 種の slotId を解決する', () => {
    expect(findCharaTrioSlotById('rink')?.laneId).toBe('contributionRanking');
    expect(findCharaTrioSlotById('konta')?.laneId).toBe('adRanking');
    expect(findCharaTrioSlotById('tanu')?.laneId).toBe('giftHistory');
  });

  it('未知の slotId は null', () => {
    expect(findCharaTrioSlotById('hoge')).toBe(null);
    expect(findCharaTrioSlotById('')).toBe(null);
  });
});

describe('tierToTrioCharaSrc', () => {
  it('rink + full → smile-mouth-open', () => {
    expect(tierToTrioCharaSrc('rink', 'full')).toBe(
      'images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.png'
    );
  });

  it('rink + wait → blink-mouth-closed', () => {
    expect(tierToTrioCharaSrc('rink', 'wait')).toBe(
      'images/yukkuri-charactore-english/link/link-yukkuri-blink-mouth-closed.png'
    );
  });

  it('konta + normal-mouth-closed は専用 fallback（kitsune-yukkuri-mouth-closed.png）', () => {
    expect(tierToTrioCharaSrc('konta', 'mid')).toBe(
      'images/yukkuri-charactore-english/konta/kitsune-yukkuri-mouth-closed.png'
    );
  });

  it('tanu + low → half-eyes-mouth-closed', () => {
    expect(tierToTrioCharaSrc('tanu', 'low')).toBe(
      'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.png'
    );
  });

  it('tier 未知 → wait と同じ blink-mouth-closed', () => {
    expect(tierToTrioCharaSrc('rink', 'mystery')).toBe(
      'images/yukkuri-charactore-english/link/link-yukkuri-blink-mouth-closed.png'
    );
    expect(tierToTrioCharaSrc('rink', '')).toBe(
      'images/yukkuri-charactore-english/link/link-yukkuri-blink-mouth-closed.png'
    );
  });

  it('slotId 未知は null', () => {
    expect(tierToTrioCharaSrc('hoge', 'full')).toBe(null);
    expect(tierToTrioCharaSrc('', 'full')).toBe(null);
  });

  it('全 tier × 全 slot で path が生成できる（NULL を返さない）', () => {
    const tiers = ['wait', 'none', 'low', 'mid', 'high', 'full'];
    const slots = ['rink', 'konta', 'tanu'];
    for (const s of slots) {
      for (const t of tiers) {
        const path = tierToTrioCharaSrc(s, t);
        expect(typeof path).toBe('string');
        expect(path).toMatch(/^images\/yukkuri-charactore-english\//);
        expect(path).toMatch(/\.png$/);
      }
    }
  });
});

describe('buildCharaTrioRenderModel', () => {
  it('全 slot に対して tier と charaSrc を埋めた配列を返す（順序は SLOTS 定義順）', () => {
    const model = buildCharaTrioRenderModel({
      contributionRanking: 'full',
      adRanking: 'low',
      giftHistory: 'mid'
    });
    expect(model).toHaveLength(3);
    expect(model[0].slot.slotId).toBe('rink');
    expect(model[0].tier).toBe('full');
    expect(model[1].slot.slotId).toBe('konta');
    expect(model[1].tier).toBe('low');
    expect(model[2].slot.slotId).toBe('tanu');
    expect(model[2].tier).toBe('mid');
    for (const m of model) {
      expect(m.charaSrc).toMatch(/^images\/yukkuri-charactore-english\//);
    }
  });

  it('一部レーンの tier 欠落 → 該当 slot は wait に倒れる（描画上「未取得」演出）', () => {
    const model = buildCharaTrioRenderModel({ contributionRanking: 'full' });
    expect(model[0].tier).toBe('full');
    expect(model[1].tier).toBe('wait');
    expect(model[2].tier).toBe('wait');
  });

  it('入力 null / undefined / 非 object → 全 slot wait に倒れる（落ちない）', () => {
    // @ts-expect-error 不正入力の防御
    const a = buildCharaTrioRenderModel(null);
    // @ts-expect-error 不正入力の防御
    const b = buildCharaTrioRenderModel(undefined);
    // @ts-expect-error 不正入力の防御
    const c = buildCharaTrioRenderModel('bogus');
    for (const model of [a, b, c]) {
      expect(model).toHaveLength(3);
      for (const m of model) {
        expect(m.tier).toBe('wait');
      }
    }
  });

  it('§6.4 回帰検出: slot 順は rink → konta → tanu で固定（誰かが並び替えても落ちる）', () => {
    const model = buildCharaTrioRenderModel({});
    const ids = model.map((m) => m.slot.slotId);
    expect(ids).toEqual(['rink', 'konta', 'tanu']);
  });
});
