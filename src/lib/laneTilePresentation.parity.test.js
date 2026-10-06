/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { paintStoryUserLaneDomFilled } from '../extension/story/renderStoryUserLaneDom.js';
import { buildLaneMirrorSnapshot, restoreLaneMirrorBuckets } from './laneMirror.js';
import { composeVenueLaneBuckets } from './venueLaneMirrorSupply.js';
import { attachLaneTileStats, buildLaneTileStatsIndex } from './laneTileStats.js';

/**
 * 3 画面パリティ: 同一 fixture を
 *   ① popup 直描画 / ③ 鏡復元して描画 / ② 会場(composeVenueLaneBuckets + 席ラッパ)で描画
 * した 3 本が、各段のタイル outerHTML(席ラッパは外側なので含まれない)まで【文字列一致】すること。
 * stats(🎁📣💬)は鏡の additive フィールドと composeVenueLaneBuckets の個別列挙を通るので、
 * どこかで落とすとここが赤になる(「①には出るが②③に出ない」を黙って起こす型の再発防止)。
 */

const IO = {
  storyAvatarLoadGuard: { pickDisplaySrc: (s) => s, noteRemoteAttempt: () => {} },
  isHttpOrHttpsUrl: (u) => /^https?:/.test(String(u || '')),
  storyTileUsesYukkuriTvStyle: () => false,
  upgradeAnonymousAvatarImage: () => {}
};
const FACES = { faceLink: 'l.png', faceGift: 'g.png', faceAd: 'a.png', faceKonta: 'k.png', faceTanu: 't.png' };
const TIERS = ['link', 'gift', 'ad', 'konta', 'tanu'];
const LANE_KEY = { link: 'laneLink', gift: 'laneGift', ad: 'laneAd', konta: 'laneKonta', tanu: 'laneTanu' };

function makeEls() {
  const mk = () => document.createElement('div');
  const els = {
    stack: mk(), laneLink: mk(), laneGift: mk(), laneAd: mk(), laneKonta: mk(), laneTanu: mk(),
    hintLink: mk(), linkWrap: mk(), giftWrap: mk(), adWrap: mk(),
    guideTop: mk(), guideLinesTop: mk(), guideMidGift: mk(), guideLinesMidGift: mk(),
    guideMidAd: mk(), guideLinesMidAd: mk(), guideMidKonta: mk(), guideLinesMidKonta: mk(),
    guideMidTanu: mk(), guideLinesMidTanu: mk(), guideBottom: mk(), guideLinesBottom: mk()
  };
  els.laneLink.dataset.laneName = 'link';
  els.laneGift.dataset.laneName = 'gift';
  els.laneAd.dataset.laneName = 'ad';
  els.laneKonta.dataset.laneName = 'konta';
  els.laneTanu.dataset.laneName = 'tanu';
  return els;
}

const cell = (userId, src, nameLine, idLine = userId) => ({
  displaySrc: src,
  title: nameLine,
  meta: { idLine, nameLine },
  entry: { userId }
});

function fixtureBuckets() {
  const base = {
    link: [cell('1001', 'https://cdn/1001.jpg', 'りんく友')],
    gift: [cell('1002', 'https://cdn/1002.jpg', 'ギフトさん')],
    ad: [{ ...cell('', 'https://cdn/ad.jpg', '広告主', '広告'), stats: { commentCount: null, giftPt: null, adPt: 30326 } }],
    konta: [cell('1003', 'https://cdn/1003.jpg', 'こん太友')],
    tanu: [cell('a:AAA111', 'data:image/svg+xml;a', '匿名A', 'a:AAA111'), cell('a:BBB222', 'data:image/svg+xml;b', '匿名B', 'a:BBB222')]
  };
  const idx = buildLaneTileStatsIndex({
    aggregates: [
      { userId: '1001', commentCount: 12 },
      { userId: '1002', commentCount: 3 },
      { userId: 'a:AAA111', commentCount: 40 }
    ],
    kokenRows: [{ name: 'ギフトさん', contribution: 1200, userPageUrl: 'https://www.nicovideo.jp/user/1002' }],
    nicoadRows: []
  });
  return attachLaneTileStats(base, idx);
}

const tilesHtml = (els) =>
  Object.fromEntries(
    TIERS.map((t) => [t, Array.from(els[LANE_KEY[t]].querySelectorAll('.nl-story-userlane-cell')).map((n) => n.outerHTML)])
  );

describe('stats は ①直描画 / ③鏡復元 / ②会場 で同一 DOM になる', () => {
  const buckets = fixtureBuckets();

  const paint1 = () => {
    const els = makeEls();
    paintStoryUserLaneDomFilled(els, FACES, buckets, 6, IO, {});
    return els;
  };
  const paint3 = () => {
    const els = makeEls();
    const snap = buildLaneMirrorSnapshot({ liveId: 'lv1', buckets, pickedLength: 6, totalCandidates: 6 }, { nowMs: 1 });
    paintStoryUserLaneDomFilled(els, FACES, restoreLaneMirrorBuckets(snap), 6, IO, {});
    return els;
  };
  const paint2 = () => {
    const els = makeEls();
    const snap = buildLaneMirrorSnapshot({ liveId: 'lv1', buckets, pickedLength: 6, totalCandidates: 6 }, { nowMs: 1 });
    const composed = composeVenueLaneBuckets({
      mirrorBuckets: restoreLaneMirrorBuckets(snap),
      seatIndexByUid: new Map([['1001', 0], ['1002', 1]])
    });
    paintStoryUserLaneDomFilled(els, FACES, composed.buckets, 6, IO, {
      guides: true,
      wrapTileEl: (t) => {
        const w = document.createElement('div');
        w.className = 'nlsb-seat';
        w.append(t);
        return w;
      }
    });
    return els;
  };

  it('件数で断言する(0 件の緑を許さない): 各段の cell 数が fixture と一致', () => {
    const h = tilesHtml(paint1());
    expect(h.link).toHaveLength(1);
    expect(h.gift).toHaveLength(1);
    expect(h.ad).toHaveLength(1);
    expect(h.konta).toHaveLength(1);
    expect(h.tanu).toHaveLength(2);
  });

  it('fixture の期待値が実際に data-stats として出ている(比較が空振りでない証拠)', () => {
    const els = paint1();
    const stat = (lane, i = 0) =>
      els[lane].querySelectorAll('.nl-story-userlane-cell')[i].querySelector('.nl-story-userlane-meta').getAttribute('data-stats');
    expect(stat('laneLink')).toBe('💬12');
    expect(stat('laneGift')).toBe('🎁1,200 💬3');
    expect(stat('laneAd')).toBe('📣30,326');
    expect(stat('laneTanu', 0)).toBe('💬40');
    expect(stat('laneTanu', 1)).toBeNull();
  });

  it('各段タイルの outerHTML が 3 経路で文字列一致する', () => {
    const a = tilesHtml(paint1());
    const b = tilesHtml(paint3());
    const c = tilesHtml(paint2());
    for (const t of TIERS) {
      expect(b[t], `③鏡復元 ${t}`).toEqual(a[t]);
      expect(c[t], `②会場 ${t}`).toEqual(a[t]);
    }
  });

  it('脚注の注記も 3 経路で一致する', () => {
    const legend = (els) => els.guideLinesBottom.querySelector('.nl-story-userlane-guide__legend')?.outerHTML ?? null;
    const a = legend(paint1());
    expect(a).not.toBeNull();
    expect(legend(paint3())).toBe(a);
    expect(legend(paint2())).toBe(a);
  });

  it('案内帯の人数(v0.1.1563)も 3 経路で一致し、fixture の枚数と一致する', () => {
    const guides = (els) => ['guideLinesTop', 'guideLinesMidGift', 'guideLinesMidAd', 'guideLinesMidKonta', 'guideLinesMidTanu']
      .map((k) => els[k].querySelector('.nl-story-userlane-guide__count')?.textContent ?? null);
    const a = guides(paint1());
    expect(a).toEqual(['1人', '1人', '1人', '1人', '2人']);
    expect(guides(paint3())).toEqual(a);
    expect(guides(paint2())).toEqual(a);
  });
});
