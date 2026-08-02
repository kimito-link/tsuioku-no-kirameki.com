/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  getStoryLaneRepaintCounts,
  paintStoryUserLaneDomFilled,
  resetStoryUserLaneDom,
  shouldKeepStoryUserLaneTilesOnEmpty,
  shouldKeepStoryUserLaneTilesOnShrink,
  makeLaneShrinkKeepClock,
  laneShrinkKeepExpired,
  STORY_USER_LANE_SHRINK_KEEP_MAX_MS
} from './renderStoryUserLaneDom.js';

/**
 * ★応援レーン(アイコン列)churn 根治(v0.1.1039)の回帰防止。
 *   真因: syncStorySourceEntries が毎 poll で gift/ad picks を [] にリセット→2段paint で fillLaneTier が
 *   無条件 innerHTML='' → 内容同一の段(りんく/こん太/たぬ姉)まで img 破棄→再ロードして churn。
 *   本テストは「同一 items なら段の DOM ノードを温存(=img 破棄しない=churn しない)」を固定する。
 */

const IO = {
  storyAvatarLoadGuard: { pickDisplaySrc: (s) => s, noteRemoteAttempt: () => {} },
  isHttpOrHttpsUrl: (u) => /^https?:/.test(String(u || '')),
  storyTileUsesYukkuriTvStyle: () => false,
  upgradeAnonymousAvatarImage: () => {}
};
const FACES = { faceLink: 'l.png', faceGift: 'g.png', faceAd: 'a.png', faceKonta: 'k.png', faceTanu: 't.png' };

/** 各段の DOM 要素一式(happy-dom で組む)。 */
function makeEls() {
  const mk = () => document.createElement('div');
  const els = {
    stack: mk(), laneLink: mk(), laneGift: mk(), laneAd: mk(), laneKonta: mk(), laneTanu: mk(),
    hintLink: mk(), linkWrap: mk(), giftWrap: mk(), adWrap: mk(),
    guideTop: mk(), guideLinesTop: mk(), guideMidGift: mk(), guideLinesMidGift: mk(),
    guideMidAd: mk(), guideLinesMidAd: mk(), guideMidKonta: mk(), guideLinesMidKonta: mk(),
    guideMidTanu: mk(), guideLinesMidTanu: mk(), guideBottom: mk(), guideLinesBottom: mk()
  };
  els.laneLink.id = 'sceneStoryUserLaneLink';
  return els;
}

const cell = (userId, displaySrc, nameLine) => ({
  displaySrc,
  title: nameLine,
  meta: { idLine: userId ? String(userId) : '匿名', nameLine },
  entry: { userId: userId || '' }
});

const LINK = [cell('12345', 'https://cdn/1.jpg', '太郎')];
const TANU = [cell('a:AAA', 'ident-a.svg', '匿名A'), cell('a:BBB', 'ident-b.svg', '匿名B')];

function paint(els, buckets) {
  paintStoryUserLaneDomFilled(els, FACES, buckets, 3, IO, {});
}

describe('fillLaneTier 段単位 diff-skip — churn 根治', () => {
  it('wrapTileEl 未指定なら従来どおり cell が段直下に入る', () => {
    const els = makeEls();
    paint(els, { link: LINK, gift: [], ad: [], konta: [], tanu: [] });

    expect(els.laneLink.children.length).toBe(1);
    expect(els.laneLink.firstElementChild?.classList.contains('nl-story-userlane-cell')).toBe(true);
    expect(els.laneLink.firstElementChild?.classList.contains('nlsb-seat')).toBe(false);
  });

  it('wrapTileEl 指定時は生成済み人物タイルを外側ラッパーに入れられる', () => {
    const els = makeEls();
    /** @type {Array<{ userId: string, index: number }>} */
    const calls = [];
    paintStoryUserLaneDomFilled(
      els,
      FACES,
      { link: LINK, gift: [], ad: [], konta: [], tanu: [] },
      1,
      IO,
      {
        wrapTileEl: (tileEl, item, index) => {
          const wrap = document.createElement('div');
          wrap.className = 'nlsb-seat';
          wrap.dataset.seatIndex = String(index);
          wrap.appendChild(tileEl);
          calls.push({ userId: String(item.entry?.userId || ''), index });
          return wrap;
        }
      }
    );

    const wrap = els.laneLink.firstElementChild;
    expect(calls).toEqual([{ userId: '12345', index: 0 }]);
    expect(wrap?.classList.contains('nlsb-seat')).toBe(true);
    expect(wrap?.querySelector('.nl-story-userlane-cell')).toBeTruthy();
  });

  it('data-thumb: 実サムネ(http)は "1"・匿名(identicon)は "0"(サムネ持ち=大/匿名=小の出し分け)', () => {
    const els = makeEls();
    // link=http displaySrc / tanu=identicon(非http) displaySrc
    paint(els, { link: LINK, gift: [], ad: [], konta: [], tanu: TANU });
    const linkCell = els.laneLink.firstElementChild;
    expect(linkCell?.getAttribute('data-thumb')).toBe('1');
    for (const tanuCell of Array.from(els.laneTanu.children)) {
      expect(tanuCell.getAttribute('data-thumb')).toBe('0');
    }
  });

  it('id の無い会場段でも data-lane-name で repaint 計器を分類する', () => {
    const els = makeEls();
    els.laneLink.id = '';
    els.laneLink.dataset.laneName = 'link';
    const before = getStoryLaneRepaintCounts();
    paint(els, { link: LINK, gift: [], ad: [], konta: [], tanu: [] });
    const after = getStoryLaneRepaintCounts();

    expect(after.link).toBe(before.link + 1);
    expect(after.unknown).toBe(before.unknown);
  });

  it('同一 items で2回描いても各段の cell ノードを温存する(img 破棄しない=churn しない)', () => {
    const els = makeEls();
    paint(els, { link: LINK, gift: [], ad: [], konta: [], tanu: TANU });
    const tanuCellsBefore = Array.from(els.laneTanu.children);
    const linkCellBefore = els.laneLink.firstChild;
    expect(tanuCellsBefore.length).toBe(2);

    // 同一 items でもう一度(poll 再入相当)。
    paint(els, { link: LINK, gift: [], ad: [], konta: [], tanu: TANU });
    const tanuCellsAfter = Array.from(els.laneTanu.children);
    // ★同一ノード=DOM を触っていない(img 再ロードなし)。
    expect(tanuCellsAfter.length).toBe(2);
    expect(tanuCellsAfter[0]).toBe(tanuCellsBefore[0]);
    expect(tanuCellsAfter[1]).toBe(tanuCellsBefore[1]);
    expect(els.laneLink.firstChild).toBe(linkCellBefore);
  });

  it('★巻き添えなし: gift 段だけ []→[1件] に変わっても他段(りんく/たぬ姉)の cell は温存', () => {
    const els = makeEls();
    paint(els, { link: LINK, gift: [], ad: [], konta: [], tanu: TANU });
    const linkBefore = els.laneLink.firstChild;
    const tanuBefore = Array.from(els.laneTanu.children);

    // gift 段だけ充填(2段paint の Phase-1→2 相当)。
    paint(els, { link: LINK, gift: [cell('999', 'https://cdn/g.jpg', 'ギフト太郎')], ad: [], konta: [], tanu: TANU });
    // りんく段・たぬ姉段は温存(巻き添え全消しが起きない=churn 根治の核)。
    expect(els.laneLink.firstChild).toBe(linkBefore);
    expect(Array.from(els.laneTanu.children)).toEqual(tanuBefore);
    // gift 段だけ新たに描かれる。
    expect(els.laneGift.children.length).toBe(1);
  });

  it('データが実際に変わったら その段だけ差し替える(過剰 skip 回帰ガード)', () => {
    const els = makeEls();
    paint(els, { link: LINK, gift: [], ad: [], konta: [], tanu: TANU });
    const tanuBefore = els.laneTanu.firstChild;
    // たぬ姉の nameLine を変える。
    const TANU2 = [cell('a:AAA', 'ident-a.svg', '匿名A-改'), cell('a:BBB', 'ident-b.svg', '匿名B')];
    paint(els, { link: LINK, gift: [], ad: [], konta: [], tanu: TANU2 });
    expect(els.laneTanu.firstChild).not.toBe(tanuBefore); // 差し替わった
  });

  it('resetStoryUserLaneDom 後は cache が無効化され、同一 items でも再描画される', () => {
    const els = makeEls();
    paint(els, { link: LINK, gift: [], ad: [], konta: [], tanu: TANU });
    resetStoryUserLaneDom(els); // 直接 innerHTML='' で消す経路
    expect(els.laneTanu.children.length).toBe(0);
    // reset 後に同一 items を描くと、cache 無効化で確実に再描画される(空のまま残らない)。
    paint(els, { link: LINK, gift: [], ad: [], konta: [], tanu: TANU });
    expect(els.laneTanu.children.length).toBe(2);
  });
});

/**
 * ★v0.1.1041「タイル出入り」根治: 同一配信 backfill 谷間で picked/entries が一瞬空になっても、
 *   既にタイルがあれば畳まない判定。配信切替や真の空では畳む。
 */
describe('shouldKeepStoryUserLaneTilesOnEmpty', () => {
  function elsWithTanu(n) {
    const els = makeEls();
    for (let i = 0; i < n; i += 1) els.laneTanu.appendChild(document.createElement('div'));
    return els;
  }
  it('同一 liveId でタイルがあれば keep=true(畳まない)', () => {
    expect(shouldKeepStoryUserLaneTilesOnEmpty(elsWithTanu(2), 'lv1', 'lv1')).toBe(true);
  });
  it('配信切替(liveId 不一致)なら keep=false(畳む=古い配信を残さない)', () => {
    expect(shouldKeepStoryUserLaneTilesOnEmpty(elsWithTanu(2), 'lv2', 'lv1')).toBe(false);
  });
  // ★v0.1.1233(穴3): lid='' は「切替」ではなく「URL不明」。
  //   popup-entry.js の `if (!hasWatch) syncStorySourceEntries('', [])` で空になる窓が実在し、
  //   ここで畳むと「同一配信なのにサムネが減る」(lane-tiles-vanish-MAP.md §1.4 穴3)。
  it("lid空('')は切替扱いしない: タイルがあれば keep=true(no-url谷間で畳まない)", () => {
    expect(shouldKeepStoryUserLaneTilesOnEmpty(elsWithTanu(2), '', 'lv1')).toBe(true);
  });
  it("lid空('')でも実タイルが無ければ keep=false(真の空は畳む)", () => {
    expect(shouldKeepStoryUserLaneTilesOnEmpty(makeEls(), '', 'lv1')).toBe(false);
  });
  it("一度も描いていない(last空)なら keep=false(守るものが無い)", () => {
    expect(shouldKeepStoryUserLaneTilesOnEmpty(elsWithTanu(2), 'lv1', '')).toBe(false);
  });
  it('タイルが1つも無ければ keep=false(真の空は畳む)', () => {
    expect(shouldKeepStoryUserLaneTilesOnEmpty(makeEls(), 'lv1', 'lv1')).toBe(false);
  });
  it('一度も描いていない(lastTiledLid 空)なら keep=false', () => {
    expect(shouldKeepStoryUserLaneTilesOnEmpty(elsWithTanu(2), 'lv1', '')).toBe(false);
  });
  it('大文字小文字/前後空白を正規化して比較', () => {
    expect(shouldKeepStoryUserLaneTilesOnEmpty(elsWithTanu(1), ' LV1 ', 'lv1')).toBe(true);
  });
});

/**
 * ★heavyRace再発(大配信+backfill)の即効対策(HANDOFF-heavyrace-backfill-IMPL.md A)。
 *   heavy未settleの暫定描画(短い候補)が、一度出た完全な描画(多タイル)を上書き退化させるのを防ぐ。
 */
describe('shouldKeepStoryUserLaneTilesOnShrink', () => {
  /** 5段合計で prev タイルを持つ els(段は分散させる)。 */
  function elsWithTiles(prev) {
    const els = makeEls();
    const lanes = [els.laneLink, els.laneGift, els.laneAd, els.laneKonta, els.laneTanu];
    for (let i = 0; i < prev; i += 1) lanes[i % lanes.length].appendChild(document.createElement('div'));
    return els;
  }

  it('同一lv+暫定+大幅減(200→74)は keep=true(前回の完全描画を守る)', () => {
    expect(shouldKeepStoryUserLaneTilesOnShrink(elsWithTiles(200), 'lv1', 'lv1', 74, true)).toBe(true);
  });

  it('settled(provisional=false)なら同条件でも keep=false(正当な減少は描く)', () => {
    expect(shouldKeepStoryUserLaneTilesOnShrink(elsWithTiles(200), 'lv1', 'lv1', 74, false)).toBe(false);
  });

  it('配信切替(lv不一致)なら keep=false(古い配信を残さない)', () => {
    expect(shouldKeepStoryUserLaneTilesOnShrink(elsWithTiles(200), 'lv2', 'lv1', 74, true)).toBe(false);
  });

  it('前回タイル0(初回)なら keep=false(守るものが無い)', () => {
    expect(shouldKeepStoryUserLaneTilesOnShrink(makeEls(), 'lv1', 'lv1', 0, true)).toBe(false);
  });

  // ★v0.1.1233 契約変更(lane-tiles-vanish-SPEC.md §2-B):
  //   旧「微減(200→190=95%)は keep=false(60%以上は描く)」を反転する。
  //   根拠: 名簿キーパー(v0.1.1232)でユーザー段 picked は同一配信内で単調増加になった。
  //   暫定供給の縮小は「正当な減少」ではなく常に「供給が不完全」を意味する。
  //   ユーザー確定の不変条件では 95% は「微減だから許す」ではなく「5%の人が消えた」。
  it('微減(200→199)でも暫定中は keep=true(名簿導入後は1枚の減も供給不完全のしるし)', () => {
    expect(shouldKeepStoryUserLaneTilesOnShrink(elsWithTiles(200), 'lv1', 'lv1', 199, true)).toBe(true);
  });

  it('同数(200→200)は keep=false(減っていないので描く=内容更新を止めない)', () => {
    expect(shouldKeepStoryUserLaneTilesOnShrink(elsWithTiles(200), 'lv1', 'lv1', 200, true)).toBe(false);
  });

  it('増加(200→260)は keep=false(増える方向は当然描く)', () => {
    expect(shouldKeepStoryUserLaneTilesOnShrink(elsWithTiles(200), 'lv1', 'lv1', 260, true)).toBe(false);
  });

  it("lid空('')は切替扱いしない: 暫定+縮小なら keep=true(リセット窓でタイルを守る)", () => {
    expect(shouldKeepStoryUserLaneTilesOnShrink(elsWithTiles(200), '', 'lv1', 10, true)).toBe(true);
  });

  // ★v0.1.1233: 旧「境界(prev=100・ratio0.6): next=59→keep true / next=60→false」は削除した。
  //   STORY_USER_LANE_SHRINK_KEEP_RATIO 定数そのものを廃止したため、そのテストは
  //   存在しない定数を検証する形になり維持できない(削除理由の記録)。
  //   新しい境界(1枚差)は直上の「微減(200→199)」「同数(200→200)」が担保する。
  it('境界(1枚差): next=prev-1→keep true / next=prev→false', () => {
    expect(shouldKeepStoryUserLaneTilesOnShrink(elsWithTiles(100), 'lv1', 'lv1', 99, true)).toBe(true);
    expect(shouldKeepStoryUserLaneTilesOnShrink(elsWithTiles(100), 'lv1', 'lv1', 100, true)).toBe(false);
  });

  it('lv正規化(前後空白/大小)して比較', () => {
    expect(shouldKeepStoryUserLaneTilesOnShrink(elsWithTiles(100), ' LV1 ', 'lv1', 10, true)).toBe(true);
  });
});

describe('laneShrinkKeepExpired(keep の時間上限=出口4・永久staleを防ぐ非常口)', () => {
  it('初回 keep で時計が始まり、MAX_MS 以内は false(まだ守る)', () => {
    const clock = makeLaneShrinkKeepClock();
    expect(laneShrinkKeepExpired(clock, { liveId: 'lv1', wouldKeep: true, nowMs: 1000 })).toBe(false);
    expect(
      laneShrinkKeepExpired(clock, {
        liveId: 'lv1',
        wouldKeep: true,
        nowMs: 1000 + STORY_USER_LANE_SHRINK_KEEP_MAX_MS - 1
      })
    ).toBe(false);
  });

  it('同一lvで keep が MAX_MS 超で連続したら true(縮小でも描く非常口)', () => {
    const clock = makeLaneShrinkKeepClock();
    laneShrinkKeepExpired(clock, { liveId: 'lv1', wouldKeep: true, nowMs: 1000 });
    expect(
      laneShrinkKeepExpired(clock, {
        liveId: 'lv1',
        wouldKeep: true,
        nowMs: 1000 + STORY_USER_LANE_SHRINK_KEEP_MAX_MS + 1
      })
    ).toBe(true);
  });

  it('途中で wouldKeep=false(描けた)なら時計はリセットされる', () => {
    const clock = makeLaneShrinkKeepClock();
    laneShrinkKeepExpired(clock, { liveId: 'lv1', wouldKeep: true, nowMs: 1000 });
    laneShrinkKeepExpired(clock, { liveId: 'lv1', wouldKeep: false, nowMs: 2000 });
    // 描けた時点で仕切り直し=ここから MAX_MS 計り直し。
    expect(
      laneShrinkKeepExpired(clock, {
        liveId: 'lv1',
        wouldKeep: true,
        nowMs: 2000 + STORY_USER_LANE_SHRINK_KEEP_MAX_MS - 1
      })
    ).toBe(false);
  });

  it('lv が変わったら時計は仕切り直し(前配信の経過を持ち込まない)', () => {
    const clock = makeLaneShrinkKeepClock();
    laneShrinkKeepExpired(clock, { liveId: 'lv1', wouldKeep: true, nowMs: 1000 });
    expect(
      laneShrinkKeepExpired(clock, {
        liveId: 'lv2',
        wouldKeep: true,
        nowMs: 1000 + STORY_USER_LANE_SHRINK_KEEP_MAX_MS + 1
      })
    ).toBe(false);
  });

  it('wouldKeep=false のときは常に false(描くべき場面で非常口は関係ない)', () => {
    const clock = makeLaneShrinkKeepClock();
    expect(laneShrinkKeepExpired(clock, { liveId: 'lv1', wouldKeep: false, nowMs: 9_999_999 })).toBe(false);
  });
});

describe('guides:false(v0.1.1120 会場用) — 案内帯/空段ノート/hint/フッターの描画パス除外', () => {
  const BUCKETS = { link: [], gift: [], ad: [], konta: [], tanu: TANU };

  it('guides:false で ガイド帯5種+フッターが hidden かつ innerHTML 空', () => {
    const els = makeEls();
    paintStoryUserLaneDomFilled(els, FACES, BUCKETS, 2, IO, { guides: false });
    for (const g of [els.guideTop, els.guideMidGift, els.guideMidKonta, els.guideMidTanu, els.guideBottom]) {
      expect(g.hidden).toBe(true);
    }
    for (const l of [els.guideLinesTop, els.guideLinesMidGift, els.guideLinesMidKonta, els.guideLinesMidTanu, els.guideLinesBottom]) {
      expect(l.innerHTML).toBe('');
    }
  });

  it('guides:false で 空段説明ノートと りんくヒントも出ない(タイルは従来どおり描く)', () => {
    const els = makeEls();
    document.body.append(els.laneLink, els.laneGift, els.laneKonta, els.laneTanu);
    paintStoryUserLaneDomFilled(els, FACES, BUCKETS, 2, IO, { guides: false });
    expect(document.querySelectorAll('.nl-story-userlane__empty-note').length).toBe(0);
    expect(els.hintLink.hidden).toBe(true);
    expect(els.laneTanu.children.length).toBe(2); // タイル本体は不変
  });

  it('モード遷移: guides:true で描いた帯/ノートが guides:false の再paintで能動的に消える(残骸ゼロ)', () => {
    const els = makeEls();
    document.body.append(els.laneLink, els.laneGift, els.laneKonta, els.laneTanu);
    paintStoryUserLaneDomFilled(els, FACES, BUCKETS, 2, IO, {});
    expect(els.guideTop.hidden).toBe(false);
    expect(document.querySelectorAll('.nl-story-userlane__empty-note').length).toBeGreaterThan(0);
    paintStoryUserLaneDomFilled(els, FACES, BUCKETS, 2, IO, { guides: false });
    expect(els.guideTop.hidden).toBe(true);
    expect(els.guideLinesTop.innerHTML).toBe('');
    expect(document.querySelectorAll('.nl-story-userlane__empty-note').length).toBe(0);
  });

  it('opts 省略(①③status)は従来どおり全ガイドが出る=既存挙動不変', () => {
    const els = makeEls();
    paintStoryUserLaneDomFilled(els, FACES, BUCKETS, 2, IO, {});
    expect(els.guideTop.hidden).toBe(false);
    expect(els.guideLinesTop.innerHTML).not.toBe('');
    expect(els.guideBottom.hidden).toBe(false);
    expect(els.guideLinesBottom.innerHTML).not.toBe('');
  });
});
