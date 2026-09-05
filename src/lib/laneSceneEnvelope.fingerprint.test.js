/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';

import { laneDomFingerprint } from './laneSceneEnvelope.js';
import { buildLaneMirrorSnapshot, restoreLaneMirrorBuckets } from './laneMirror.js';
import { sanitizeLaneMirrorForRead } from './laneMirrorContract.js';
import { laneMirrorTierKeySequences } from './venueLaneParity.js';
import { measureLaneDomSelf, perTierKeysOf } from './laneDomSelfMeasure.js';
import { collectVenueLaneDomCensus } from './venueDomCensus.js';
import { paintStoryUserLaneDomFilled } from '../extension/story/renderStoryUserLaneDom.js';

/**
 * ★T-1(venue-exact-parity-SPEC-2026-08-07 §9・最重要): 3起点貫通テスト。
 *
 * なぜ手作りフィクスチャで済ませないか(v0.1.1280 の教訓):
 *   grep の wiring テストは「関所を通していること」は断言できても「関所が正しい形を読んで
 *   いること」は断言できない。手作りフィクスチャは実装者の誤解をフィクスチャ側にも複製する
 *   ので共倒れで緑になる(実際に `snap.buckets` という実在しない形を探して鏡を100%捨てて
 *   いたのに13件全部が緑だった)。
 *   → 原則: 【テストの生産者は本番の書き手・消費者は本番の読み手】。両辺に本物を置く。
 *
 * ここで貫通させる本物の連鎖:
 *   実 buckets → buildLaneMirrorSnapshot(書き手) → sanitizeLaneMirrorForRead(関所)
 *              → restoreLaneMirrorBuckets → paintStoryUserLaneDomFilled(①と会場の共有renderer)
 *              → 実DOM
 *   その実DOMを ①の採取器(measureLaneDomSelf)と 会場の採取器(collectVenueLaneDomCensus)の
 *   【両方】で読み、laneDomFingerprint がどちらも同じ値になることを断言する。
 *   さらに鏡のキー列(laneMirrorTierKeySequences)由来の指紋とも一致することを断言する。
 *
 * これが赤になる条件(=このテストが守っているもの):
 *   - ①採取器と会場採取器の走査規則が乖離した(v0.1.1241 で一度そろえた不変条件)
 *   - 共有renderer の `dataset.userKey = venueLaneParityKey(p)` が別の鍵に変わった
 *   - laneDomFingerprint の canonical 形(段順・区切り)が起点によって変わった
 */

const IO = {
  storyAvatarLoadGuard: { pickDisplaySrc: (s) => s, noteRemoteAttempt: () => {} },
  isHttpOrHttpsUrl: (u) => /^https?:/.test(String(u || '')),
  storyTileUsesYukkuriTvStyle: () => false,
  upgradeAnonymousAvatarImage: () => {}
};
const FACES = { faceLink: 'l.png', faceGift: 'g.png', faceAd: 'a.png', faceKonta: 'k.png', faceTanu: 't.png' };

/** ①/会場が使う段DOM一式(happy-dom)。段el は会場 census が探す class を必ず持たせる。 */
function makeEls() {
  const mk = () => document.createElement('div');
  const lane = () => {
    const el = mk();
    // 会場 census は stack 配下の「5段に属さないタイル」を迷子として数えるため、
    // 段el に .nl-story-userlane を付けておく(会場の実DOMと同じ形)。
    el.className = 'nl-story-userlane';
    return el;
  };
  const stack = mk();
  const els = {
    stack,
    laneLink: lane(), laneGift: lane(), laneAd: lane(), laneKonta: lane(), laneTanu: lane(),
    hintLink: mk(), linkWrap: mk(), giftWrap: mk(), adWrap: mk(),
    guideTop: mk(), guideLinesTop: mk(), guideMidGift: mk(), guideLinesMidGift: mk(),
    guideMidAd: mk(), guideLinesMidAd: mk(), guideMidKonta: mk(), guideLinesMidKonta: mk(),
    guideMidTanu: mk(), guideLinesMidTanu: mk(), guideBottom: mk(), guideLinesBottom: mk()
  };
  for (const key of ['laneLink', 'laneGift', 'laneAd', 'laneKonta', 'laneTanu']) {
    stack.appendChild(els[key]);
  }
  return els;
}

/** 本番の書き手が実際に吐く snapshot(★ここに手書き snapshot リテラルを足さないこと)。 */
function realSnapshot() {
  return buildLaneMirrorSnapshot(
    {
      liveId: 'lv351092763',
      buckets: {
        link: [
          { entry: { userId: '4046119' }, displaySrc: 'https://x/a.jpg', title: '太郎', meta: { idLine: '4046119', nameLine: '太郎' } },
          { entry: { userId: '124272691' }, displaySrc: 'https://x/b.jpg', title: '次郎', meta: { idLine: '124272691', nameLine: '次郎' } }
        ],
        // uid 無しセル(広告主/ギフト送り主)=パリティ鍵が `c:idLine|title` になる経路も通す。
        gift: [{ entry: { userId: '' }, displaySrc: 'https://x/g.jpg', title: 'ギフト主', meta: { idLine: 'gift-1', nameLine: 'ギフト主' } }],
        ad: [{ entry: { userId: '' }, displaySrc: 'https://x/d.jpg', title: '広告主', meta: { idLine: 'ad-1', nameLine: '広告主' } }],
        konta: [{ entry: { userId: '77777' }, displaySrc: 'https://x/k.jpg', title: 'こん太', meta: { idLine: '77777', nameLine: 'こん太' } }],
        tanu: [
          { entry: { userId: 'a:abc' }, displaySrc: '', title: 'たぬ姉匿名', meta: { idLine: '匿名', nameLine: 'たぬ姉匿名' } },
          { entry: { userId: 'a:def' }, displaySrc: '', title: 'たぬ姉匿名2', meta: { idLine: '匿名', nameLine: 'たぬ姉匿名2' } }
        ]
      },
      pickedLength: 7,
      totalCandidates: 7
    },
    { cap: 48, nowMs: 1754500000000 }
  );
}

/** 本番の書き手→関所→復元→共有renderer で実DOMを作る(全部本物)。 */
function paintRealDom() {
  const snap = realSnapshot();
  const accepted = sanitizeLaneMirrorForRead(snap);
  expect(accepted.snap).not.toBeNull();
  const buckets = restoreLaneMirrorBuckets(accepted.snap);
  const els = makeEls();
  const total = Object.values(buckets).reduce((a, arr) => a + arr.length, 0);
  paintStoryUserLaneDomFilled(els, FACES, buckets, total, IO, { guides: false });
  return { snap, acceptedSnap: accepted.snap, els };
}

describe('★T-1 3起点貫通: ①実DOM・会場実DOM・鏡キー列が同じ指紋に到達する', () => {
  it('①の採取器(measureLaneDomSelf)と会場の採取器(census)が【同じ指紋】を出す', () => {
    const { els } = paintRealDom();

    // ①側: paint と同じ同期フレームで測る採取器。
    const popKeys = perTierKeysOf(measureLaneDomSelf(els));
    const popFingerprint = laneDomFingerprint(popKeys);

    // 会場側: 実DOM census(数えるだけ)。keys 列は summarize の【前】の生値から取る。
    const census = collectVenueLaneDomCensus({
      laneEls: {
        link: els.laneLink, gift: els.laneGift, ad: els.laneAd, konta: els.laneKonta, tanu: els.laneTanu
      },
      stackEl: els.stack
    });
    const venueFingerprint = laneDomFingerprint({
      link: census.perSection.link.keys,
      gift: census.perSection.gift.keys,
      ad: census.perSection.ad.keys,
      konta: census.perSection.konta.keys,
      tanu: census.perSection.tanu.keys
    });

    // ★空同士のまぐれ一致で緑にならないこと(件数0の緑を却下する)。
    expect(popKeys.link.length).toBe(2);
    expect(popKeys.tanu.length).toBe(2);
    expect(census.perSection.link.keys.length).toBe(2);
    expect(popFingerprint).toBe(venueFingerprint);
  });

  it('鏡のキー列(laneMirrorTierKeySequences)由来の指紋とも一致する', () => {
    const { acceptedSnap, els } = paintRealDom();
    const mirrorFingerprint = laneDomFingerprint(laneMirrorTierKeySequences(acceptedSnap));
    const popFingerprint = laneDomFingerprint(perTierKeysOf(measureLaneDomSelf(els)));
    // = 共有renderer の dataset.userKey が venueLaneParityKey と同じ鍵を刻んでいる証明。
    expect(mirrorFingerprint).toBe(popFingerprint);
  });

  it('uid 無しセル(gift/ad)も `c:idLine|title` 鍵で3起点そろって載る', () => {
    const { acceptedSnap, els } = paintRealDom();
    const mirrorSeq = laneMirrorTierKeySequences(acceptedSnap);
    const popKeys = perTierKeysOf(measureLaneDomSelf(els));
    expect(mirrorSeq.gift).toEqual(['c:gift-1|ギフト主']);
    expect(popKeys.gift).toEqual(['c:gift-1|ギフト主']);
    expect(popKeys.ad).toEqual(['c:ad-1|広告主']);
  });

  it('★顔ぶれが1人違えば指紋も違う(同人数の別人を検出できる=恒真でない)', () => {
    const { els } = paintRealDom();
    const before = laneDomFingerprint(perTierKeysOf(measureLaneDomSelf(els)));
    // link 段の1人だけを別人に差し替えて再描画(件数は同じ2人のまま)。
    const swapped = restoreLaneMirrorBuckets(
      sanitizeLaneMirrorForRead(realSnapshot()).snap
    );
    swapped.link[1] = { ...swapped.link[1], entry: { userId: '999999' } };
    const els2 = makeEls();
    paintStoryUserLaneDomFilled(els2, FACES, swapped, 7, IO, { guides: false });
    const after = laneDomFingerprint(perTierKeysOf(measureLaneDomSelf(els2)));
    expect(after).not.toBe(before);
  });

  it('順序が違えば指紋も違う(集合だけでなく並びまで見る)', () => {
    expect(laneDomFingerprint({ link: ['u:1', 'u:2'] })).not.toBe(
      laneDomFingerprint({ link: ['u:2', 'u:1'] })
    );
  });

  it('段が違えば指紋も違う(段順は固定・段をまたいだ移動を検出する)', () => {
    expect(laneDomFingerprint({ link: ['u:1'] })).not.toBe(laneDomFingerprint({ tanu: ['u:1'] }));
  });

  /*
   * ★canonical 形そのものを固定する(黄金値)。
   *
   *   なぜ「3起点が一致する」だけでは足りないか(2026-08-07 の変異で実証):
   *   laneDomFingerprint は3起点すべてが呼ぶ【共有の1関数】なので、canonical 形を壊す変異
   *   (段順のソート等)を入れても3起点は仲良く同じ間違った値へ動き、貫通テストは緑のまま通る。
   *   ＝「両辺が同じ起点なら恒真」(この仕様が潰した C1〜C3)と同型の穴がテスト側に開いていた。
   *   → 実装から独立した黄金値で形を釘付けにする。段順・区切り・tier接頭辞が変わったら赤。
   *
   *   期待する canonical: `link:k,k;gift:...;ad:...;konta:...;tanu:...` を djb2 して 8桁hex。
   */
  it('★canonical 形の黄金値(段順 link,gift,ad,konta,tanu と区切りを釘付けにする)', () => {
    /** 実装から独立した参照実装(仕様どおりに手で書いた djb2)。 */
    const referenceDjb2Hex = (str) => {
      let hash = 5381;
      for (let i = 0; i < str.length; i += 1) hash = (hash * 33) ^ str.charCodeAt(i);
      return (hash >>> 0).toString(16).padStart(8, '0');
    };
    const sample = { link: ['u:1', 'u:2'], gift: ['c:g|G'], ad: [], konta: ['u:3'], tanu: ['u:a:x'] };
    const expected = referenceDjb2Hex('link:u:1,u:2;gift:c:g|G;ad:;konta:u:3;tanu:u:a:x');
    expect(laneDomFingerprint(sample)).toBe(expected);
    // ★段順を入れ替えた別の canonical(例: ad を先頭にする)とは必ず違う値になること。
    expect(laneDomFingerprint(sample)).not.toBe(
      referenceDjb2Hex('ad:;gift:c:g|G;konta:u:3;link:u:1,u:2;tanu:u:a:x')
    );
  });

  it('空キーは除外する(無鍵タイルは census の unkeyed の縄張り)', () => {
    expect(laneDomFingerprint({ link: ['u:1', '', '  '] })).toBe(laneDomFingerprint({ link: ['u:1'] }));
  });
});
