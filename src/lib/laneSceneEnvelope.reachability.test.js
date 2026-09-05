/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';

import { buildVenueSceneReceipts, compareRenderReceipts, laneDomFingerprint } from './laneSceneEnvelope.js';
import { buildLaneMirrorSnapshot, restoreLaneMirrorBuckets } from './laneMirror.js';
import { sanitizeLaneMirrorForRead } from './laneMirrorContract.js';
import { measureLaneDomSelf, perTierKeysOf } from './laneDomSelfMeasure.js';
import { collectVenueLaneDomCensus } from './venueDomCensus.js';
import { paintStoryUserLaneDomFilled } from '../extension/story/renderStoryUserLaneDom.js';

/**
 * ★到達可能性テスト(reality-checker の指摘への回答・2026-08-07)。
 *
 * 「fail-closed で安全」と「永久に判定不能で計器として無価値」は紙一重。
 * ⚪(指紋未計測)を足した以上、【✅に実際に到達する経路が存在すること】を
 * 本物のモジュールだけで通しで証明しておかないと、実機で常時 ⚪ のまま
 * 「壊れた計器の値を信じて誤診する」([[zero-count-may-mean-unmeasured-2026-08-04]])
 * を繰り返す。
 *
 * ここでは①の1tick(publish→paint)と会場の1tick(受理→描画→census→判定)を
 * 実コードの順序どおりに再現し、✅ が出ることと、各故障が正しい色に落ちることを見る。
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
  const lane = () => { const el = mk(); el.className = 'nl-story-userlane'; return el; };
  const stack = mk();
  const els = {
    stack,
    laneLink: lane(), laneGift: lane(), laneAd: lane(), laneKonta: lane(), laneTanu: lane(),
    hintLink: mk(), linkWrap: mk(), giftWrap: mk(), adWrap: mk(),
    guideTop: mk(), guideLinesTop: mk(), guideMidGift: mk(), guideLinesMidGift: mk(),
    guideMidAd: mk(), guideLinesMidAd: mk(), guideMidKonta: mk(), guideLinesMidKonta: mk(),
    guideMidTanu: mk(), guideLinesMidTanu: mk(), guideBottom: mk(), guideLinesBottom: mk()
  };
  for (const k of ['laneLink', 'laneGift', 'laneAd', 'laneKonta', 'laneTanu']) stack.appendChild(els[k]);
  return els;
}

const BUCKETS = {
  link: [
    { entry: { userId: '4046119' }, displaySrc: 'https://x/a.jpg', title: '太郎', meta: { idLine: '4046119', nameLine: '太郎' } },
    { entry: { userId: '124272691' }, displaySrc: 'https://x/b.jpg', title: '次郎', meta: { idLine: '124272691', nameLine: '次郎' } }
  ],
  gift: [{ entry: { userId: '' }, displaySrc: 'https://x/g.jpg', title: 'ギフト主', meta: { idLine: 'gift-1', nameLine: 'ギフト主' } }],
  ad: [],
  konta: [{ entry: { userId: '77777' }, displaySrc: 'https://x/k.jpg', title: 'こん太', meta: { idLine: '77777', nameLine: 'こん太' } }],
  tanu: [{ entry: { userId: 'a:abc' }, displaySrc: '', title: '匿名', meta: { idLine: '匿名', nameLine: '匿名' } }]
};

/**
 * ①の1tick を実コードの順序で再現する。
 *   v0.1.1281 以降 publish は paint より【前】。よって paint が測る DOM は
 *   「直前に publish した内容」であり、その contentHash が fingerprintFor になる。
 * @returns {{ published: object, domSelfForNextPublish: object }}
 */
function popTick(buckets, nowMs, prevDomSelf) {
  // 1) publish(描画より前・無条件)
  const published = buildLaneMirrorSnapshot(
    { liveId: 'lv1', buckets, pickedLength: 5, totalCandidates: 5, domSelf: prevDomSelf },
    { cap: 48, nowMs }
  );
  // 2) paint(共有renderer で実DOMを作る)
  const els = makeEls();
  paintStoryUserLaneDomFilled(els, FACES, buckets, 5, IO, { guides: false });
  // 3) paint 直後に実DOMを測り、指紋と内容アドレスを控える
  const measured = measureLaneDomSelf(els);
  const domSelfForNextPublish = {
    ...measured,
    measuredAt: nowMs,
    fingerprint: laneDomFingerprint(perTierKeysOf(measured)),
    fingerprintFor: published.contentHash
  };
  return { published, domSelfForNextPublish };
}

/**
 * 会場の1tick を実コードの順序で再現する。
 * @returns {{ match: boolean, line: string }}
 */
function venueTick({ acceptedRaw, paintedRaw }) {
  // 1) 受理(関所を通す)
  const accepted = sanitizeLaneMirrorForRead(acceptedRaw).snap;
  const painted = sanitizeLaneMirrorForRead(paintedRaw).snap;
  // 2) 会場が描く(復元 → 共有renderer)
  const paintedBuckets = restoreLaneMirrorBuckets(painted);
  const els = makeEls();
  const total = Object.values(paintedBuckets).reduce((a, arr) => a + arr.length, 0);
  paintStoryUserLaneDomFilled(els, FACES, paintedBuckets, total, IO, { guides: false });
  // 3) census(diagDue のとき)→ 会場実DOMの指紋
  const census = collectVenueLaneDomCensus({
    laneEls: { link: els.laneLink, gift: els.laneGift, ad: els.laneAd, konta: els.laneKonta, tanu: els.laneTanu },
    stackEl: els.stack
  });
  const venueDomFingerprint = laneDomFingerprint({
    link: census.perSection.link.keys, gift: census.perSection.gift.keys, ad: census.perSection.ad.keys,
    konta: census.perSection.konta.keys, tanu: census.perSection.tanu.keys
  });
  // 4) 受領証を組んで判定
  const receipts = buildVenueSceneReceipts({
    acceptedSnap: accepted, paintedSnap: painted, paintedBuckets, venueDomFingerprint
  });
  return compareRenderReceipts(receipts.popReceipt, receipts.venueReceipt);
}

describe('★✅への到達可能性(定常状態で緑になることを実コードで証明する)', () => {
  it('★定常状態(①が2tick回り、会場が最新を描く)で ✅ に到達する', () => {
    // tick1: 起動直後は domSelf が無い(=指紋なし)
    const t1 = popTick(BUCKETS, 1000, null);
    // tick2: t1 の paint で採れた domSelf を載せて publish=ここから指紋が乗る
    const t2 = popTick(BUCKETS, 2000, t1.domSelfForNextPublish);

    // 会場は t2 を受理し、同じ t2 を描く(定常状態)
    const out = venueTick({ acceptedRaw: t2.published, paintedRaw: t2.published });

    expect(out.match).toBe(true);
    expect(out.line).toContain('✅');
    expect(out.line).toContain('指紋');
  });

  it('★起動直後の1tick目は ⚪(指紋未計測)止まり=一過性であることを明示', () => {
    const t1 = popTick(BUCKETS, 1000, null);
    const out = venueTick({ acceptedRaw: t1.published, paintedRaw: t1.published });
    expect(out.match).toBe(false);
    expect(out.line).toContain('指紋未計測');
    // ★「永久に⚪」ではないことは上のテストが示す(2tick目で緑)。
  });

  it('★会場が古い世代を描いていれば 🔴(遅れ)=陳腐化として名指しされる', () => {
    const t1 = popTick(BUCKETS, 1000, null);
    const t2 = popTick(BUCKETS, 2000, t1.domSelfForNextPublish);
    const t3 = popTick(BUCKETS, 3000, t2.domSelfForNextPublish);
    // 会場は t3 を受理済みなのに、まだ t2 を描いている
    const out = venueTick({ acceptedRaw: t3.published, paintedRaw: t2.published });
    expect(out.match).toBe(false);
    expect(out.line).toContain('🔴');
    expect(out.line).toContain('遅れ');
  });

  it('★①の顔ぶれが変われば内容アドレスが外れて ⚪ へ逃げる(偽🔴を出さない)', () => {
    const t1 = popTick(BUCKETS, 1000, null);
    const t2 = popTick(BUCKETS, 2000, t1.domSelfForNextPublish);
    // t3 で1人増える=publish の内容が変わるので、t2 由来の指紋は「旧内容のもの」になる。
    // ★uid は【記名扱いになる桁数】にすること(短い数値IDは isAnonymousStyleNicoUserId が
    //   匿名と判定し、link 段では関所に落とされて別のケース(下のテスト)になる)。
    const grown = {
      ...BUCKETS,
      link: [...BUCKETS.link, { entry: { userId: '98765432' }, displaySrc: 'https://x/c.jpg', title: '三郎', meta: { idLine: '98765432', nameLine: '三郎' } }]
    };
    const t3 = popTick(grown, 3000, t2.domSelfForNextPublish);
    const out = venueTick({ acceptedRaw: t3.published, paintedRaw: t3.published });
    // ★時計ではなく内容アドレスで弾くので、🔴(バグ)ではなく ⚪(未計測)に落ちる
    expect(out.line).toContain('指紋未計測');
    expect(out.line).not.toContain('🔴');
    // そして次の tick では追いつく=永久に⚪ではない
    const t4 = popTick(grown, 4000, t3.domSelfForNextPublish);
    expect(venueTick({ acceptedRaw: t4.published, paintedRaw: t4.published }).match).toBe(true);
  });

  /*
   * ★関所が①の契約違反セルを落としたときの 🔴 は【嘘の赤ではない】(SPEC §3-4 の検出表)。
   *
   *   ①が焼いた contentHash は「落とす前」の値なので、関所が落とせば会場側の再計算とは
   *   必ず食い違う。これは【書き手(①)の契約違反の名指し】であり、設計意図どおり。
   *   状態速報では同時に出る `鏡除外N` がその件数を示す。
   *
   *   ★このテストは 2026-08-07 に私(実装者)が実際に踏んで初めて気づいた挙動を固定するもの。
   *     短い数値uid(555)を link 段に入れたフィクスチャで「⚪のはず」と誤って断言し、
   *     🔴 が出た理由を追って初めて「関所が落としていた」と分かった。
   */
  it('★関所が①の違反セルを落としたら 🔴(書き手の名指し・嘘の赤ではない)', () => {
    const t1 = popTick(BUCKETS, 1000, null);
    // link 段に匿名uid を混ぜる=①側の契約違反(linkPolicy は匿名を弾くのが正)
    const violating = {
      ...BUCKETS,
      link: [...BUCKETS.link, { entry: { userId: 'a:violator' }, displaySrc: 'https://x/v.jpg', title: '違反', meta: { idLine: '匿名', nameLine: '違反' } }]
    };
    const t2 = popTick(violating, 2000, t1.domSelfForNextPublish);
    // 前提: 関所が実際に落としていること(落としていなければこのテストは無意味)
    expect(sanitizeLaneMirrorForRead(t2.published).droppedLinkAnon).toBe(1);

    const out = venueTick({ acceptedRaw: t2.published, paintedRaw: t2.published });
    expect(out.match).toBe(false);
    expect(out.line).toContain('🔴');
    // revision ではなく contentHash の差として出る(=世代の遅れではなく中身の違い)
    expect(out.line).toContain('hash①');
  });
});
