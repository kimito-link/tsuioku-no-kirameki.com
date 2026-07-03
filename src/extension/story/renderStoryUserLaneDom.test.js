/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  getStoryLaneRepaintCounts,
  paintStoryUserLaneDomFilled,
  resetStoryUserLaneDom,
  shouldKeepStoryUserLaneTilesOnEmpty
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
