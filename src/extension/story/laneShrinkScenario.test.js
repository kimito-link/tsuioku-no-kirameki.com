/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  shouldKeepStoryUserLaneTilesOnShrink,
  shouldKeepStoryUserLaneTilesOnEmpty,
  makeLaneShrinkKeepClock,
  laneShrinkKeepExpired,
  STORY_USER_LANE_SHRINK_KEEP_MAX_MS
} from './renderStoryUserLaneDom.js';
import { applyLaneRosterKeeper, makeLaneRosterKeeperState } from '../../lib/laneRosterKeeper.js';

/**
 * 応援レーン「サムネが減る」根治の台本テスト(v0.1.1233)。
 *
 * ★本テストの存在意義: 相反する2つの要求を**同時に**守れているかを固定する。
 *   (1) 減らない  — ユーザー確定の不変条件「一度出た人はずっと出る」
 *   (2) 固着しない — commit 27cf7b30「大配信backfillのアバター暫定固着」の再発防止
 *   片方だけを見ると、もう片方を壊す方向に倒れる(閾値を厳しくすれば固着し、
 *   緩くすれば消える)。両方を1ファイルで縛る。
 *
 * 呼び出し側(popup-entry.js renderStoryUserLane)の判定順序を純関数だけで再現する:
 *   nextTileCount 算出 → rawKeep 判定 → 非常口判定 → keep なら paint しない
 *
 * 正本: lane-tiles-vanish-SPEC.md §5 T-3 / 地図: lane-tiles-vanish-MAP.md
 */

/** 5段に prev 枚のタイルを持つ els(段は分散させる=本番と同じ形)。 */
function makeEls() {
  const mk = () => document.createElement('div');
  return { laneLink: mk(), laneGift: mk(), laneAd: mk(), laneKonta: mk(), laneTanu: mk() };
}
function elsWithTiles(prev) {
  const els = makeEls();
  const lanes = [els.laneLink, els.laneGift, els.laneAd, els.laneKonta, els.laneTanu];
  for (let i = 0; i < prev; i += 1) lanes[i % lanes.length].appendChild(document.createElement('div'));
  return els;
}
/** DOM のタイル総数(countStoryUserLaneDomTiles 相当)。 */
function domTiles(els) {
  return [els.laneLink, els.laneGift, els.laneAd, els.laneKonta, els.laneTanu]
    .reduce((n, l) => n + (l?.childElementCount || 0), 0);
}
/** paint(実際に DOM を next 枚へ書き換える)。 */
function paint(els, next) {
  const lanes = [els.laneLink, els.laneGift, els.laneAd, els.laneKonta, els.laneTanu];
  for (const l of lanes) l.innerHTML = '';
  for (let i = 0; i < next; i += 1) lanes[i % lanes.length].appendChild(document.createElement('div'));
}

/**
 * 本番の1 paint を再現する。
 * @returns {{ painted: boolean, tiles: number }}
 */
function tick(state, { liveId, nextTileCount, provisional, nowMs }) {
  const rawKeep = shouldKeepStoryUserLaneTilesOnShrink(
    state.els, liveId, state.lastTiledLid, nextTileCount, provisional
  );
  const expired = laneShrinkKeepExpired(state.clock, { liveId, wouldKeep: rawKeep, nowMs });
  const guardHit = rawKeep && !expired;
  if (guardHit) return { painted: false, tiles: domTiles(state.els) };
  paint(state.els, nextTileCount);
  if (nextTileCount > 0) state.lastTiledLid = String(liveId || '').trim().toLowerCase();
  return { painted: true, tiles: domTiles(state.els) };
}

function makeState(initialTiles, lid = 'lv1') {
  return {
    els: elsWithTiles(initialTiles),
    lastTiledLid: lid,
    clock: makeLaneShrinkKeepClock()
  };
}

describe('台本: 減らない × 固着しない(両立)', () => {
  it('台本A(今回の症状): 完全描画36 → 暫定26 は keep → 供給回復37で描く=減らない', () => {
    const st = makeState(36);

    // 取り込み途中の短い供給(26)が来る。旧実装(0.6)ではこれが素通りして26枚に減っていた。
    const r1 = tick(st, { liveId: 'lv1', nextTileCount: 26, provisional: true, nowMs: 1000 });
    expect(r1.painted).toBe(false);
    expect(r1.tiles).toBe(36); // ★1枚も減っていない

    // 取り込みが進んで供給が回復すれば、当然描く(出口3)。
    const r2 = tick(st, { liveId: 'lv1', nextTileCount: 37, provisional: true, nowMs: 2000 });
    expect(r2.painted).toBe(true);
    expect(r2.tiles).toBe(37);
  });

  it('台本B(27cf7b30の固着): 暫定74連発は keep → settle後74は必ず描ける=固着しない', () => {
    const st = makeState(200);

    // 暫定の短い候補が何度来ても完全描画を守る。
    for (let i = 0; i < 5; i += 1) {
      const r = tick(st, { liveId: 'lv1', nextTileCount: 74, provisional: true, nowMs: 1000 + i * 100 });
      expect(r.painted).toBe(false);
      expect(r.tiles).toBe(200);
    }

    // ★settle したら必ず通る(出口1)。ここが塞がると「たぬ姉段固着」が再発する。
    const settled = tick(st, { liveId: 'lv1', nextTileCount: 74, provisional: false, nowMs: 2000 });
    expect(settled.painted).toBe(true);
    expect(settled.tiles).toBe(74);
  });

  it('台本C(出口4): 暫定縮小keepが10分続いたら描く=永久staleにならない', () => {
    const st = makeState(100);

    const kept = tick(st, { liveId: 'lv1', nextTileCount: 10, provisional: true, nowMs: 0 });
    expect(kept.painted).toBe(false);
    expect(kept.tiles).toBe(100);

    // 10分を超えても settle しない病理ケース → 非常口が開く。
    const expired = tick(st, {
      liveId: 'lv1',
      nextTileCount: 10,
      provisional: true,
      nowMs: STORY_USER_LANE_SHRINK_KEEP_MAX_MS + 1
    });
    expect(expired.painted).toBe(true);
    expect(expired.tiles).toBe(10);
  });

  it('台本D(穴3): lid=\'\'のrenderを挟んでも名簿・タイルが消えない', () => {
    const keeper = makeLaneRosterKeeperState();
    const row = (uid) => ({
      entryIndex: 0, profileTier: 3, thumbScore: 0,
      displaySrc: `https://example.test/${uid}.jpg`, title: `u${uid}`,
      entry: { userId: uid }, recentTexts: [], meta: { idLine: uid, nameLine: uid }
    });

    // 通常の paint で30人が乗る。
    const first = applyLaneRosterKeeper(keeper, {
      liveId: 'lv1', candidates: Array.from({ length: 30 }, (_, i) => row(`u${i}`))
    });
    expect(first.merged).toHaveLength(30);
    const st = makeState(30);

    // ★watch タブが取れず syncStorySourceEntries('', []) が走る窓。
    //   旧実装ではここで名簿が全消去され、DOM も畳まれていた。
    const gap = applyLaneRosterKeeper(keeper, { liveId: '', candidates: [] });
    expect(gap.merged).toHaveLength(30); // 名簿は生きている

    // DOM も畳まれない(空供給でも既存タイルを守る)。
    expect(shouldKeepStoryUserLaneTilesOnEmpty(st.els, '', st.lastTiledLid)).toBe(true);

    // 谷間のあと fallback が取り込み途中の少ない供給(5人)を持ってきても…
    const after = applyLaneRosterKeeper(keeper, {
      liveId: 'lv1', candidates: Array.from({ length: 5 }, (_, i) => row(`u${i}`))
    });
    expect(after.merged).toHaveLength(30); // ★名簿が全員を復活させる

    // 描画側でも減らない。
    const r = tick(st, { liveId: 'lv1', nextTileCount: 5, provisional: true, nowMs: 1000 });
    expect(r.painted).toBe(false);
    expect(r.tiles).toBe(30);
  });

  // ★reality-checker(v0.1.1233検証)の指摘1を固定するテスト。
  //   nextTileCount = picked + gift + ad であり、名簿が単調増加を保証するのは picked だけ。
  //   gift/ad 段(広告主・ギフト投げ主)は公式ランキング由来で**正当に減りうる**。
  //   閾値を「1枚でも減ったら守る」に変えた副作用として、その正当な減少も
  //   最大10分(非常口が開くまで)反映されない。これは意図した trade-off であり、
  //   「永久に反映されない」ではないことをここで固定する。
  it('台本F(指摘1・gift/adの正当な減少): 暫定中は守るが、非常口で必ず反映される', () => {
    const st = makeState(40); // picked 38 + ad 2 のイメージ

    // 広告主が1人減った(39)。暫定中は守られる=すぐには反映されない。
    const kept = tick(st, { liveId: 'lv1', nextTileCount: 39, provisional: true, nowMs: 0 });
    expect(kept.painted).toBe(false);
    expect(kept.tiles).toBe(40);

    // ★settle すれば即座に反映される(出口1)。実運用ではこちらが主経路。
    const settled = tick(st, { liveId: 'lv1', nextTileCount: 39, provisional: false, nowMs: 1000 });
    expect(settled.painted).toBe(true);
    expect(settled.tiles).toBe(39);
  });

  it('台本G(指摘1の最悪ケース): settleしなくても10分で反映される=永久に古いままにならない', () => {
    const st = makeState(40);

    const kept = tick(st, { liveId: 'lv1', nextTileCount: 39, provisional: true, nowMs: 0 });
    expect(kept.tiles).toBe(40);

    // settle しない病理ケースでも、非常口が開いて正当な減少が反映される。
    const expired = tick(st, {
      liveId: 'lv1',
      nextTileCount: 39,
      provisional: true,
      nowMs: STORY_USER_LANE_SHRINK_KEEP_MAX_MS + 1
    });
    expect(expired.painted).toBe(true);
    expect(expired.tiles).toBe(39);
  });

  it('台本E(正当な配信切替): lv2へ移ったら古い配信は残さない', () => {
    const st = makeState(50, 'lv1');
    const r = tick(st, { liveId: 'lv2', nextTileCount: 3, provisional: true, nowMs: 1000 });
    expect(r.painted).toBe(true); // 切替は守らない
    expect(r.tiles).toBe(3);
  });
});
