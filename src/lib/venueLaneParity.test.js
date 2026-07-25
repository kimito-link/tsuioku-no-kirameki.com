import { describe, expect, it } from 'vitest';
import {
  buildVenueLaneParity,
  laneMirrorTierKeySequences,
  toVenueLaneParityDiag,
  venueLaneParityKey,
  VENUE_LANE_MIRROR_SOFT_WINDOW_MS,
  VENUE_LANE_TRANSIENT_WINDOW_MS
} from './venueLaneParity.js';

/** @param {string[]} uids */
const cells = (uids) => uids.map((u) => ({ displaySrc: `https://x/${u}.jpg`, title: `n${u}`, idLine: u, nameLine: `n${u}`, userId: u }));
/** @param {string[]} uids */
const keys = (uids) => uids.map((u) => `u:${u}`);

const NOW = 1_700_000_000_000;

/**
 * v3(Tri-Parity): painted と件数一致する実DOM census 要約を作る(3点一致の fixture)。
 *   over で総計/重複/付帯を、over.perSection で段別可視数を上書きできる。
 * @param {Record<string, string[]>} painted
 * @param {Record<string, any>} [over]
 */
function domMatching(painted, over = {}) {
  /** @type {Record<string, any>} */
  const perSection = {};
  for (const t of ['link', 'gift', 'ad', 'konta', 'tanu']) {
    const visible = (painted[t] || []).length;
    perSection[t] = {
      visible,
      tileW: visible > 0 ? 64 : 0,
      tileH: visible > 0 ? 84 : 0,
      ghost: 0,
      bare: 0,
      visibleEmpty: 0,
      unkeyed: 0
    };
  }
  const base = {
    measured: true,
    dpr: 1,
    perSection,
    ghost: 0,
    bare: 0,
    visibleEmpty: 0,
    unkeyed: 0,
    dupIntra: 0,
    dupCross: 0,
    strays: 0,
    charFrame: 0,
    crowdOn: false,
    crowdCount: 0
  };
  const mergedPerSection = { ...perSection };
  for (const [section, value] of Object.entries(over.perSection || {})) {
    mergedPerSection[section] = { ...(perSection[section] || {}), ...value };
  }
  return { ...base, ...over, perSection: mergedPerSection };
}

/** 実機ケースの鏡: link40相当(縮めて4)・ad10相当(縮めて2)。 */
function makeSnap(over = {}) {
  return {
    liveId: 'lv350912687',
    capturedAt: NOW - 3000,
    link: cells(['1', '2', '3', '4']),
    gift: [],
    ad: [
      { displaySrc: 'https://x/ad1.jpg', title: '珍味団', idLine: '#1', nameLine: '広告', userId: '' },
      { displaySrc: 'https://x/ad2.jpg', title: 'ゲスト', idLine: '#2', nameLine: '広告', userId: '' }
    ],
    konta: [],
    tanu: cells(['a1', 'a2']),
    pickedLength: 8,
    domSelf: {
      measured: true,
      dpr: 1,
      perTier: {
        link: { visible: 4, tileW: 64, tileH: 84 },
        gift: { visible: 0, tileW: 0, tileH: 0 },
        ad: { visible: 2, tileW: 64, tileH: 84 },
        konta: { visible: 0, tileW: 0, tileH: 0 },
        tanu: { visible: 2, tileW: 64, tileH: 84 }
      }
    },
    totalCandidates: 8,
    ...over
  };
}

describe('venueLaneParityKey', () => {
  it('uid があれば u:uid、無ければ idLine+title の合成キー', () => {
    expect(venueLaneParityKey({ userId: '42', title: 'x' })).toBe('u:42');
    expect(venueLaneParityKey({ entry: { userId: '42' } })).toBe('u:42');
    expect(venueLaneParityKey({ idLine: '#1', title: '珍味団' })).toBe('c:#1|珍味団');
    expect(venueLaneParityKey({ meta: { idLine: '#1' }, title: '珍味団' })).toBe('c:#1|珍味団');
    expect(venueLaneParityKey({})).toBe('');
  });
});

describe('laneMirrorTierKeySequences', () => {
  it('5段のキー列を鏡から取り出す(uid無し広告セルは合成キー)', () => {
    const seq = laneMirrorTierKeySequences(makeSnap());
    expect(seq.link).toEqual(keys(['1', '2', '3', '4']));
    expect(seq.ad).toEqual(['c:#1|珍味団', 'c:#2|ゲスト']);
    expect(seq.gift).toEqual([]);
  });
});

describe('buildVenueLaneParity', () => {
  it('完全一致(P層のみ)+DOM一致なら ✅ で件数を明記する(v3: dom必須)', () => {
    const snap = makeSnap();
    const painted = {
      link: keys(['1', '2', '3', '4']),
      gift: [],
      ad: ['c:#1|珍味団', 'c:#2|ゲスト'],
      konta: [],
      tanu: keys(['a1', 'a2'])
    };
    const p = buildVenueLaneParity({
      snap,
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: 'mirror',
      painted,
      dom: domMatching(painted)
    });
    expect(p.verdict).toBe('✅');
    expect(p.unexplained.count).toBe(0);
    expect(p.line).toContain('会場一致 ✅');
    expect(p.line).toContain('link4');
    expect(p.line).toContain('ad2');
    expect(p.line).toContain('DOM=データ');
  });

  it('v4(2026-07-14): capあふれ・暫定は段外に混ざらない=会場に表示されない前提なので✅を維持', () => {
    const snap = makeSnap({ totalCandidates: 20 }); // ①はcapで切っている
    const painted = {
      // 段は鏡と厳密同一。
      link: keys(['1', '2', '3', '4']),
      gift: [],
      ad: ['c:#1|珍味団', 'c:#2|ゲスト'],
      konta: [],
      tanu: keys(['a1', 'a2'])
    };
    const p = buildVenueLaneParity({
      snap,
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: 'mirror',
      painted,
      transientKeys: new Set(['u:999']),
      dom: domMatching(painted)
    });
    expect(p.verdict).toBe('✅');
    expect(p.line).not.toContain('+尾'); // mirrorモードの段に尾表記は出ない
  });

  it('v2: 段内の鏡外は capあふれでも暫定でも 🔴 未説明(尾を段に混ぜたら違反=実機の43vs40はこれで🔴に写る)', () => {
    const snap = makeSnap({ totalCandidates: 20 }); // capあふれ有りでも段内の余剰は違反
    const p = buildVenueLaneParity({
      snap,
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: 'mirror',
      painted: {
        link: keys(['1', '2', '3', '4', '13702502']),
        gift: [],
        ad: ['c:#1|珍味団', 'c:#2|ゲスト'],
        konta: [],
        tanu: keys(['a1', 'a2', '999'])
      },
      transientKeys: new Set(['u:999'])
    });
    expect(p.verdict).toBe('🔴');
    expect(p.unexplained.count).toBe(2); // 尾1+暫定1=段内の鏡外は全部未説明
    expect(p.unexplained.sampleKeys.join(',')).toContain('13702502');
    expect(p.perTier.link.tail).toBe(1); // 診断値としての内訳は残す(期待値0)
    expect(p.perTier.tanu.transient).toBe(1);
  });

  it('鏡に居る人が描かれていない(欠落)は 🔴 未説明', () => {
    const snap = makeSnap();
    const p = buildVenueLaneParity({
      snap,
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: 'mirror',
      painted: { link: keys(['1', '2', '4']), gift: [], ad: ['c:#1|珍味団', 'c:#2|ゲスト'], konta: [], tanu: keys(['a1', 'a2']) }
    });
    expect(p.verdict).toBe('🔴');
    expect(p.perTier.link.missing).toBe(1);
    expect(p.unexplained.sampleKeys.join(',')).toContain('欠u:3');
  });

  it('広告段の欠落(実機: pop10 venue0 の同型)も欠落として 🔴 に写る', () => {
    const snap = makeSnap();
    const p = buildVenueLaneParity({
      snap,
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: 'mirror',
      painted: { link: keys(['1', '2', '3', '4']), gift: [], ad: [], konta: [], tanu: keys(['a1', 'a2']) }
    });
    expect(p.verdict).toBe('🔴');
    expect(p.perTier.ad.missing).toBe(2);
  });

  it('並びだけ違う(集合同一)も 🔴(順序も一致の定義に入る)', () => {
    const snap = makeSnap();
    const p = buildVenueLaneParity({
      snap,
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: 'mirror',
      painted: { link: keys(['2', '1', '3', '4']), gift: [], ad: ['c:#1|珍味団', 'c:#2|ゲスト'], konta: [], tanu: keys(['a1', 'a2']) }
    });
    expect(p.verdict).toBe('🔴');
    expect(p.unexplained.sampleKeys.join(',')).toContain('順序@0');
  });

  it('fallback mode は常に ⚪(①一致を主張しない=嘘の緑防止)', () => {
    const p = buildVenueLaneParity({
      snap: makeSnap(),
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: 'fallback',
      painted: { link: keys(['1']), gift: [], ad: [], konta: [], tanu: [] }
    });
    expect(p.verdict).toBe('⚪');
    expect(p.reason).toContain('fallback');
  });

  it('鏡が別配信/stale/無しは ⚪ と理由を言う', () => {
    const base = { liveId: 'lv350912687', nowMs: NOW, mode: /** @type {const} */ ('mirror'), painted: {} };
    expect(buildVenueLaneParity({ ...base, snap: null }).reason).toBe('鏡なし');
    expect(buildVenueLaneParity({ ...base, snap: makeSnap({ liveId: 'lv999' }) }).reason).toBe('鏡は別配信');
    const stale = buildVenueLaneParity({
      ...base,
      snap: makeSnap({ capturedAt: NOW - VENUE_LANE_MIRROR_SOFT_WINDOW_MS - 1000 })
    });
    expect(stale.verdict).toBe('⚪');
    expect(stale.reason).toContain('stale');
  });

  it('鏡縮退(Σセル<pickedLength)は ✅ を出さない(⚪鏡縮退)', () => {
    const snap = makeSnap({ pickedLength: 100 }); // セルは8つしか無い=縮退
    const painted = {
      link: keys(['1', '2', '3', '4']),
      gift: [],
      ad: ['c:#1|珍味団', 'c:#2|ゲスト'],
      konta: [],
      tanu: keys(['a1', 'a2'])
    };
    const p = buildVenueLaneParity({
      snap,
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: 'mirror',
      painted,
      dom: domMatching(painted)
    });
    expect(p.mirrorPruned).toBe(true);
    expect(p.verdict).toBe('⚪');
    expect(p.reason).toContain('縮退');
  });

  it('表示間引き(L6)は不一致でなく 表示n/N の併記になる', () => {
    const snap = makeSnap();
    const painted = {
      link: keys(['1', '2', '3', '4']),
      gift: [],
      ad: ['c:#1|珍味団', 'c:#2|ゲスト'],
      konta: [],
      tanu: keys(['a1', 'a2'])
    };
    const p = buildVenueLaneParity({
      snap,
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: 'mirror',
      painted,
      visibleShown: 6,
      logicalTotal: 8,
      dom: domMatching(painted)
    });
    expect(p.verdict).toBe('✅');
    expect(p.line).toContain('表示6/8');
  });

  // --- v3(Tri-Parity=実DOM census)。実事例: データ一致✅なのに画面のたぬ姉が多い、を🔴に写す ---
  describe('v3 実DOM census', () => {
    /** 実事例に寄せた鏡: tanu 3人(縮小fixture)。 */
    const painted = () => ({
      link: keys(['1', '2', '3', '4']),
      gift: [],
      ad: ['c:#1|珍味団', 'c:#2|ゲスト'],
      konta: [],
      tanu: keys(['a1', 'a2'])
    });
    const base = () => ({
      snap: makeSnap(),
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: /** @type {const} */ ('mirror'),
      painted: painted()
    });

    it('データ一致でも DOM過剰(裸タイル残留)なら 🔴 で主犯を1行に名指し(実事例の再現)', () => {
      const p = buildVenueLaneParity({
        ...base(),
        dom: domMatching(painted(), {
          perSection: { tanu: { visible: 52, ghost: 0, bare: 50, visibleEmpty: 0, unkeyed: 0 } },
          bare: 50
        })
      });
      expect(p.verdict).toBe('🔴');
      expect(p.unexplained.count).toBe(50);
      expect(p.unexplained.sampleKeys.join(',')).toContain('tanu:DOM余50');
      expect(p.line).toContain('DOM≠ tanu:可視52(データ2 裸50)');
      expect(p.line).toContain('重複0 迷子0');
    });

    it('DOM欠落(データより画面が少ない)も 🔴 DOM欠', () => {
      const p = buildVenueLaneParity({
        ...base(),
        dom: domMatching(painted(), {
          perSection: { link: { visible: 2, ghost: 0, bare: 0, visibleEmpty: 0, unkeyed: 0 } }
        })
      });
      expect(p.verdict).toBe('🔴');
      expect(p.unexplained.sampleKeys.join(',')).toContain('link:DOM欠2');
    });

    it('3点一致(鏡=データ=実DOM)で初めて ✅・DOM=データ を明記', () => {
      const p = buildVenueLaneParity({ ...base(), dom: domMatching(painted()) });
      expect(p.verdict).toBe('✅');
      expect(p.line).toContain('DOM=データ');
      expect(p.line).toContain('①DOM=鏡');
      expect(p.line).toContain('幾何=一致');
      expect(p.dom).toMatchObject({ measured: true, ghost: 0 });
    });

    it('旧鏡(domSelfなし)は一致を断言せず ⚪ ①DOM未計測', () => {
      const snap = makeSnap();
      delete snap.domSelf;
      const p = buildVenueLaneParity({ ...base(), snap, dom: domMatching(painted()) });
      expect(p.verdict).toBe('⚪');
      expect(p.reason).toBe('①DOM未計測');
      expect(p.line).toContain('①DOM未計測');
    });

    it('①の実DOM表示数が鏡セル数と違えば 🔴(paint完了報告の嘘を検出)', () => {
      const snap = makeSnap();
      snap.domSelf.perTier.tanu.visible = 3;
      const p = buildVenueLaneParity({ ...base(), snap, dom: domMatching(painted()) });
      expect(p.verdict).toBe('🔴');
      expect(p.unexplained.count).toBe(1);
      expect(p.line).toContain('①DOM≠鏡 tanu:可視3(鏡2)');
    });

    it('段のタイル寸法が10%を超えて違えば 🔴 幾何差', () => {
      const p = buildVenueLaneParity({
        ...base(),
        dom: domMatching(painted(), { perSection: { tanu: { tileW: 96, tileH: 84 } } })
      });
      expect(p.verdict).toBe('🔴');
      expect(p.unexplained.count).toBe(1);
      expect(p.line).toContain('幾何≠ tanu:96×84px(①64×84px)');
    });

    it('表示中タイルの寸法が取れなければ ✅ にせず ⚪ 寸法未計測', () => {
      const snap = makeSnap();
      snap.domSelf.perTier.tanu.tileW = 0;
      const p = buildVenueLaneParity({ ...base(), snap, dom: domMatching(painted()) });
      expect(p.verdict).toBe('⚪');
      expect(p.reason).toContain('寸法未計測');
    });

    it('census欠落(dom なし)は ✅ を名乗れない=⚪ DOM未計測(fail-closed)', () => {
      const p = buildVenueLaneParity(base());
      expect(p.verdict).toBe('⚪');
      expect(p.reason).toBe('DOM未計測');
      expect(p.line).toContain('DOM未計測');
      expect(p.dom).toBeNull();
    });

    it('幽霊のみ(不可視の消し残り)は verdict 不算入=✅+幽N 併記', () => {
      const p = buildVenueLaneParity({
        ...base(),
        dom: domMatching(painted(), {
          perSection: { tanu: { visible: 2, ghost: 3, bare: 0, visibleEmpty: 0, unkeyed: 0 } },
          ghost: 3
        })
      });
      expect(p.verdict).toBe('✅');
      expect(p.line).toContain('DOM=データ(幽3)');
    });

    it('重複/迷子/空可視/無鍵は件数一致でも 🔴 DOM異常(✅ブロッカー)', () => {
      const p = buildVenueLaneParity({
        ...base(),
        dom: domMatching(painted(), { strays: 2, visibleEmpty: 1, unkeyed: 2 })
      });
      expect(p.verdict).toBe('🔴');
      expect(p.reason).toContain('DOM異常');
      expect(p.reason).toContain('迷子2');
      expect(p.line).toContain('無鍵2');
      expect(p.line).toContain('空可視1');
    });

    it('群衆Canvas/額縁は判定外の参考値として付帯する(容疑者③④が写る)', () => {
      const p = buildVenueLaneParity({
        ...base(),
        dom: domMatching(painted(), { crowdOn: true, crowdCount: 154, charFrame: 12 })
      });
      expect(p.verdict).toBe('✅'); // 参考値は✅を壊さない
      expect(p.line).toContain('群衆on(154)');
      expect(p.line).toContain('額縁12');
    });

    it('v0.1.1116: 白円/顔404 は判定外の参考値として付帯し、diag の dom にも載る', () => {
      const p = buildVenueLaneParity({
        ...base(),
        dom: domMatching(painted(), { blank: 9, blankAnon: 3, probeFail: 7 })
      });
      expect(p.verdict).toBe('✅'); // 白円は①も同じ404がありうる=参考値(P3後は blankAnon=0 が期待値)
      expect(p.line).toContain('白円9(匿名3)');
      expect(p.line).toContain('顔404=7');
      const d = toVenueLaneParityDiag(p);
      expect(d.dom).toMatchObject({ blank: 9, blankAnon: 3, probeFail: 7 });
    });

    it('venue-avatar-stale-mirror-DESIGN.md §D: 顔404の種別(timeout/error)を line と diag.dom に分けて出す', () => {
      const p = buildVenueLaneParity({
        ...base(),
        dom: domMatching(painted(), {
          blank: 9,
          blankAnon: 3,
          probeFail: 7,
          probeFailTimeout: 5,
          probeFailError: 2
        })
      });
      expect(p.line).toContain('顔404=7(t:5,e:2)');
      const d = toVenueLaneParityDiag(p);
      expect(d.dom).toMatchObject({ probeFail: 7, probeFailTimeout: 5, probeFailError: 2 });
    });

    it('venue-avatar-stale-mirror-DESIGN.md §C-1(段階1): 顔再試行回数(probeRetried)をlineとdiag.domに出す', () => {
      const p = buildVenueLaneParity({
        ...base(),
        dom: domMatching(painted(), {
          blank: 9,
          blankAnon: 3,
          probeFail: 7,
          probeFailTimeout: 5,
          probeFailError: 2,
          probeRetried: 4
        })
      });
      expect(p.line).toContain('顔再試行4');
      const d = toVenueLaneParityDiag(p);
      expect(d.dom).toMatchObject({ probeRetried: 4 });
    });

    it('probeRetried=0のときはline に「顔再試行」を出さない(誤報しない)', () => {
      const p = buildVenueLaneParity({
        ...base(),
        dom: domMatching(painted(), { blank: 9, blankAnon: 3, probeFail: 7 })
      });
      expect(p.line).not.toContain('顔再試行');
    });

    it('fallback でも census は参考で line に写る(白円/迷子はモード無関係)', () => {
      const p = buildVenueLaneParity({
        ...base(),
        mode: 'fallback',
        dom: domMatching(painted(), {
          perSection: { tanu: { visible: 5, ghost: 0, bare: 3, visibleEmpty: 0, unkeyed: 0 } }
        })
      });
      expect(p.verdict).toBe('⚪'); // fallback は判定しない(従来どおり)
      expect(p.unexplained.count).toBe(0); // 参考値は未説明に計上しない
      expect(p.line).toContain('DOM≠ tanu:可視5(データ2 裸3)');
    });
  });
});

describe('toVenueLaneParityDiag', () => {
  it('storage 同梱用の軽量形(line/verdict/unexplained/dom要約)に畳む', () => {
    const painted = { link: keys(['1', '2', '3', '4']), gift: [], ad: ['c:#1|珍味団', 'c:#2|ゲスト'], konta: [], tanu: keys(['a1', 'a2']) };
    const p = buildVenueLaneParity({
      snap: makeSnap(),
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: 'mirror',
      painted,
      dom: domMatching(painted, { ghost: 3, charFrame: 12 })
    });
    const d = toVenueLaneParityDiag(p);
    expect(d).toMatchObject({ mode: 'mirror', verdict: '✅', unexplained: 0 });
    expect(d.line).toContain('会場一致');
    expect(d.dom).toMatchObject({ measured: true, ghost: 3, charFrame: 12 });
    expect(d.dom).not.toHaveProperty('perSection'); // 段別詳細は storage に常設しない
    expect(toVenueLaneParityDiag(null)).toBeNull();
  });

  it('dom 未計測は dom:null のまま畳む(⚪ DOM未計測)', () => {
    const p = buildVenueLaneParity({
      snap: makeSnap(),
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: 'mirror',
      painted: { link: keys(['1', '2', '3', '4']), gift: [], ad: ['c:#1|珍味団', 'c:#2|ゲスト'], konta: [], tanu: keys(['a1', 'a2']) }
    });
    const d = toVenueLaneParityDiag(p);
    expect(d.verdict).toBe('⚪');
    expect(d.reason).toBe('DOM未計測');
    expect(d.dom).toBeNull();
  });
});

describe('定数(設計との契約)', () => {
  it('鏡の鮮度窓=180s・暫定窓=60s', () => {
    expect(VENUE_LANE_MIRROR_SOFT_WINDOW_MS).toBe(180_000);
    expect(VENUE_LANE_TRANSIENT_WINDOW_MS).toBe(60_000);
  });
});
