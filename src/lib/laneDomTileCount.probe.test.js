/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { paintStoryUserLaneDomFilled } from '../extension/story/renderStoryUserLaneDom.js';

/**
 * ★実配信 lv351120893(2026-08-07)で「供給40件 → 画面0件描画 🔴」という【誤報】が出た件の再現。
 *
 * 実機の症状:
 *   - 画面(スクショ)にはたぬ姉が20件ほど並んでいる
 *   - ③WEB鏡も「たぬ姉17 / 広告5 = 計22」を運んでいる(鏡は paint 結果の写し)
 *   - なのに storyUserLaneRenderProbe は domTilesPainted:0 / laneRepaintCounts 全段0
 *   - 状態速報が「🔴 応援レーンが鏡にはあるのに画面に出ていません」と誤報
 *
 * ここで確かめる仮説:
 *   `countStoryUserLaneDomTiles` は【childElementCount(直下の子)】しか数えない。
 *   会場は wrapTileEl でタイルを席(.nlsb-seat)に包むので直下はタイルではないが、
 *   ①(popup/embed_watch)は包まないので直下に来る=数えられるはず。
 *   → ①側で 0 になるのは別の理由(段el が空 or 別インスタンス)のはず。
 *
 * ★この差は laneDomSelfMeasure(querySelectorAll で子孫を走査)と
 *   countStoryUserLaneDomTiles(childElementCount で直下のみ)の【走査規則の食い違い】。
 *   v0.1.1241 で①採取器と会場採取器はそろえたが、この計器だけ取り残されている。
 */

const IO = {
  storyAvatarLoadGuard: { pickDisplaySrc: (s) => s, noteRemoteAttempt: () => {} },
  isHttpOrHttpsUrl: (u) => /^https?:/.test(String(u || '')),
  storyTileUsesYukkuriTvStyle: () => false,
  upgradeAnonymousAvatarImage: () => {}
};
const FACES = { faceLink: 'l.png', faceGift: 'g.png', faceAd: 'a.png', faceKonta: 'k.png', faceTanu: 't.png' };

function makeEls() {
  const mk = () => document.createElement('div');
  return {
    stack: mk(), laneLink: mk(), laneGift: mk(), laneAd: mk(), laneKonta: mk(), laneTanu: mk(),
    hintLink: mk(), linkWrap: mk(), giftWrap: mk(), adWrap: mk(),
    guideTop: mk(), guideLinesTop: mk(), guideMidGift: mk(), guideLinesMidGift: mk(),
    guideMidAd: mk(), guideLinesMidAd: mk(), guideMidKonta: mk(), guideLinesMidKonta: mk(),
    guideMidTanu: mk(), guideLinesMidTanu: mk(), guideBottom: mk(), guideLinesBottom: mk()
  };
}

const cell = (uid, name) => ({
  displaySrc: 'https://x/a.jpg', title: name,
  meta: { idLine: uid || '匿名', nameLine: name }, entry: { userId: uid }
});

/** popup-entry.js:6697 の countStoryUserLaneDomTiles と同じ実装(直下のみ)。 */
function countByChildElementCount(els) {
  if (!els) return -1;
  const lanes = [els.laneLink, els.laneGift, els.laneAd, els.laneKonta, els.laneTanu];
  let n = 0;
  for (const lane of lanes) {
    if (lane && typeof lane.childElementCount === 'number') n += lane.childElementCount;
  }
  return n;
}

/** 子孫まで走査する数え方(laneDomSelfMeasure / venueDomCensus と同じ規則)。 */
function countByDescendants(els) {
  if (!els) return -1;
  const lanes = [els.laneLink, els.laneGift, els.laneAd, els.laneKonta, els.laneTanu];
  let n = 0;
  for (const lane of lanes) {
    if (lane) n += lane.querySelectorAll('.nl-story-userlane-cell').length;
  }
  return n;
}

describe('★誤報「供給40件 → 画面0件」の再現と切り分け', () => {
  it('①(ラップなし)なら直下カウントでもタイルを数えられる', () => {
    const els = makeEls();
    const buckets = { link: [], gift: [], ad: [], konta: [], tanu: [cell('a:x', '匿名A'), cell('a:y', '匿名B')] };
    paintStoryUserLaneDomFilled(els, FACES, buckets, 2, IO, { guides: false });
    expect(countByChildElementCount(els)).toBe(2);
    expect(countByDescendants(els)).toBe(2);
  });

  /*
   * ★本命: タイルが【ラッパーに包まれる】と直下カウントは「ラッパーの数」を数える。
   *   包んだ結果が1つのコンテナなら、実タイルが何枚あっても 1 になる。
   *   会場は席で包む。①も将来ラップを足せば同じ穴に落ちる。
   */
  it('★ラップされると直下カウントは実タイル数と乖離する(子孫走査は正しく数える)', () => {
    const els = makeEls();
    const buckets = { link: [], gift: [], ad: [], konta: [], tanu: [cell('a:x', 'A'), cell('a:y', 'B'), cell('a:z', 'C')] };
    // 3枚すべてを1つのコンテナに包む(=直下は1個だけになる)
    const container = document.createElement('div');
    paintStoryUserLaneDomFilled(els, FACES, buckets, 3, IO, {
      guides: false,
      wrapTileEl: (tileEl) => { container.appendChild(tileEl); return container; }
    });
    // 直下カウントは「コンテナ1個」しか見えない
    expect(countByChildElementCount(els)).toBe(1);
    // 子孫走査なら実タイル3枚を正しく数える
    expect(countByDescendants(els)).toBe(3);
  });

  it('★段が空なら両方0(=0が常に嘘というわけではない)', () => {
    const els = makeEls();
    expect(countByChildElementCount(els)).toBe(0);
    expect(countByDescendants(els)).toBe(0);
  });
});
