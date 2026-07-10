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
  it('完全一致(P層のみ)なら ✅ で件数を明記する', () => {
    const snap = makeSnap();
    const p = buildVenueLaneParity({
      snap,
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: 'mirror',
      painted: {
        link: keys(['1', '2', '3', '4']),
        gift: [],
        ad: ['c:#1|珍味団', 'c:#2|ゲスト'],
        konta: [],
        tanu: keys(['a1', 'a2'])
      }
    });
    expect(p.verdict).toBe('✅');
    expect(p.unexplained.count).toBe(0);
    expect(p.line).toContain('会場一致 ✅');
    expect(p.line).toContain('link4');
    expect(p.line).toContain('ad2');
  });

  it('v2: 尾・暫定はロビーに居れば説明済み=✅のまま「ロビーN(暫定M)」を明記(実機の尾14+暫定1の同型)', () => {
    const snap = makeSnap({ totalCandidates: 20 }); // ①はcapで切っている
    const p = buildVenueLaneParity({
      snap,
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: 'mirror',
      painted: {
        // 段は鏡と厳密同一(尾は段に混ぜない)。
        link: keys(['1', '2', '3', '4']),
        gift: [],
        ad: ['c:#1|珍味団', 'c:#2|ゲスト'],
        konta: [],
        tanu: keys(['a1', 'a2'])
      },
      lobby: [...keys(['13702502', '33687377', '96090801']), 'u:999'],
      transientKeys: new Set(['u:999'])
    });
    expect(p.verdict).toBe('✅');
    expect(p.lobby).toEqual({ total: 4, transient: 1, inMirror: 0 });
    expect(p.line).toContain('ロビー4(暫定1)');
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

  it('v2: 段とロビーの二重在籍(lobbyInMirror)は 🔴(余り=嘘の緑を出さない)', () => {
    const snap = makeSnap();
    const p = buildVenueLaneParity({
      snap,
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: 'mirror',
      painted: {
        link: keys(['1', '2', '3', '4']),
        gift: [],
        ad: ['c:#1|珍味団', 'c:#2|ゲスト'],
        konta: [],
        tanu: keys(['a1', 'a2'])
      },
      lobby: keys(['2']) // 鏡在籍者がロビーにも居る=二重
    });
    expect(p.verdict).toBe('🔴');
    expect(p.lobby.inMirror).toBe(1);
    expect(p.unexplained.sampleKeys.join(',')).toContain('ロビー重複');
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
    const p = buildVenueLaneParity({
      snap,
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: 'mirror',
      painted: {
        link: keys(['1', '2', '3', '4']),
        gift: [],
        ad: ['c:#1|珍味団', 'c:#2|ゲスト'],
        konta: [],
        tanu: keys(['a1', 'a2'])
      }
    });
    expect(p.mirrorPruned).toBe(true);
    expect(p.verdict).toBe('⚪');
    expect(p.reason).toContain('縮退');
  });

  it('表示間引き(L6)は不一致でなく 表示n/N の併記になる', () => {
    const snap = makeSnap();
    const p = buildVenueLaneParity({
      snap,
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: 'mirror',
      painted: {
        link: keys(['1', '2', '3', '4']),
        gift: [],
        ad: ['c:#1|珍味団', 'c:#2|ゲスト'],
        konta: [],
        tanu: keys(['a1', 'a2'])
      },
      visibleShown: 6,
      logicalTotal: 8
    });
    expect(p.verdict).toBe('✅');
    expect(p.line).toContain('表示6/8');
  });
});

describe('toVenueLaneParityDiag', () => {
  it('storage 同梱用の軽量形(line/verdict/unexplained)に畳む', () => {
    const p = buildVenueLaneParity({
      snap: makeSnap(),
      liveId: 'lv350912687',
      nowMs: NOW,
      mode: 'mirror',
      painted: { link: keys(['1', '2', '3', '4']), gift: [], ad: ['c:#1|珍味団', 'c:#2|ゲスト'], konta: [], tanu: keys(['a1', 'a2']) }
    });
    const d = toVenueLaneParityDiag(p);
    expect(d).toMatchObject({ mode: 'mirror', verdict: '✅', unexplained: 0 });
    expect(d.line).toContain('会場一致');
    expect(toVenueLaneParityDiag(null)).toBeNull();
  });
});

describe('定数(設計との契約)', () => {
  it('鏡の鮮度窓=180s・暫定窓=60s', () => {
    expect(VENUE_LANE_MIRROR_SOFT_WINDOW_MS).toBe(180_000);
    expect(VENUE_LANE_TRANSIENT_WINDOW_MS).toBe(60_000);
  });
});
