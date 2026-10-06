/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { paintStoryUserLaneDomFilled, syncStoryUserLaneStatsInPlace } from '../extension/story/renderStoryUserLaneDom.js';
import { buildLaneMirrorSnapshot, restoreLaneMirrorBuckets } from './laneMirror.js';
import { sanitizeLaneMirrorForRead } from './laneMirrorContract.js';
import { createMirrorBundleFlushScheduler } from './mirrorBundleFlushScheduler.js';
import { composeVenueLaneBuckets } from './venueLaneMirrorSupply.js';
import {
  BASE_MIRROR_CELL_KEYS,
  BASE_RESTORED_ITEM_KEYS,
  LANE_IMPORT_CONTRACT,
  VENUE_INTERNAL_KEYS,
  contractItemKeys,
  contractMirrorKeys
} from '../../tests/helpers/laneImportContract.js';

/**
 * 輸入契約(tests/helpers/laneImportContract.js)と実装の【集合差】を赤にする(v0.1.1571)。
 *   鏡セルを個別列挙で作り直す3箇所(toMirrorCell / restoreLaneMirrorBuckets / composeVenueLaneBuckets)のどれかが
 *   新しい項目を運び忘れる/契約に無い項目を勝手に運ぶと、ここが「どの段階で何が余る/足りない」を名指しして落ちる。
 *   ★fixture は契約の sampleItem で【全項目・全サブ項目】を埋める。足し忘れた項目は空振りで緑にならない。
 */

const TIERS = ['link', 'gift', 'ad', 'konta', 'tanu'];
const IO = {
  storyAvatarLoadGuard: { pickDisplaySrc: (s) => s, noteRemoteAttempt: () => {} },
  isHttpOrHttpsUrl: (u) => /^https?:/.test(String(u || '')),
  storyTileUsesYukkuriTvStyle: () => false,
  upgradeAnonymousAvatarImage: () => {}
};
const FACES = { faceLink: 'l', faceGift: 'g', faceAd: 'a', faceKonta: 'k', faceTanu: 't' };

const item = (userId, name, extra = {}) => ({
  displaySrc: `https://cdn/${userId || 'ad'}.jpg`,
  title: name,
  meta: { idLine: userId || '広告', nameLine: name },
  entry: { userId },
  recentTexts: ['こんにちは'],
  ...extra
});

/** 数値の項目に seed を足して「段ごと・人ごとに値が違う」fixture にする(全員同値だと取り違えても緑になる)。 */
const varied = (sample, seed) =>
  Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, typeof v === 'number' ? v + seed : v]));

/** 契約の全項目を持つアイテム(各段に1件・uid 無し広告も含める)。seed で値を変える。 */
function fullItem(userId, name, seed) {
  const extra = {};
  for (const c of LANE_IMPORT_CONTRACT) extra[c.itemKey] = varied(c.sampleItem, seed);
  return item(userId, name, extra);
}
const fullBuckets = () => ({
  link: [fullItem('1001', 'りんく友', 1)],
  gift: [fullItem('1002', 'ギフトさん', 20)],
  ad: [fullItem('', '広告主', 300)],
  konta: [fullItem('1003', 'こん太友', 4000)],
  tanu: [fullItem('a:AAA111', '匿名A', 50000)]
});

const sorted = (o) => Object.keys(o).sort();
const snapOf = (b) => JSON.parse(JSON.stringify(buildLaneMirrorSnapshot({ liveId: 'lv1', buckets: b, pickedLength: 5, totalCandidates: 5 }, { nowMs: 1 })));

describe('輸入契約: 各段階のキー集合が契約と完全一致する', () => {
  it('契約そのものが空でなく、キー名に重複が無い(0件の緑を許さない)', () => {
    expect(LANE_IMPORT_CONTRACT.length).toBeGreaterThan(0);
    expect(new Set(contractItemKeys()).size).toBe(contractItemKeys().length);
    expect(new Set(contractMirrorKeys()).size).toBe(contractMirrorKeys().length);
  });

  it('① 鏡セル(書き込み): 基本キー+契約の mirrorKey と完全一致(全段・uid無し広告も)', () => {
    const snap = snapOf(fullBuckets());
    const want = [...BASE_MIRROR_CELL_KEYS, ...contractMirrorKeys()].sort();
    for (const t of TIERS) {
      expect(snap[t], `${t} のセルが空`).toHaveLength(1);
      expect(sorted(snap[t][0]), `鏡セル(${t})`).toEqual(want);
    }
  });

  it('② 復元後のアイテム: 基本キー+契約の itemKey と完全一致', () => {
    const restored = restoreLaneMirrorBuckets(snapOf(fullBuckets()));
    const want = [...BASE_RESTORED_ITEM_KEYS, ...contractItemKeys()].sort();
    for (const t of TIERS) expect(sorted(restored[t][0]), `復元(${t})`).toEqual(want);
  });

  it('③ 復元後の値が元の値と同じ(往復で欠けない・サブ項目も)', () => {
    const restored = restoreLaneMirrorBuckets(snapOf(fullBuckets()));
    const src = fullBuckets();
    for (const c of LANE_IMPORT_CONTRACT) {
      for (const t of TIERS) expect(restored[t][0][c.itemKey], `${c.id}@${t}`).toEqual(src[t][0][c.itemKey]);
      // 段をまたいで取り違えていない(段ごとに値が違うので、同じなら取り違え)
      expect(restored.link[0][c.itemKey]).not.toEqual(restored.gift[0][c.itemKey]);
    }
  });

  it('④ 会場の組み立て(composeVenueLaneBuckets): 内部キー+契約の itemKey と完全一致し、値も落とさない', () => {
    const restored = restoreLaneMirrorBuckets(snapOf(fullBuckets()));
    const out = composeVenueLaneBuckets({ mirrorBuckets: restored, seatIndexByUid: new Map([['1001', 0]]) }).buckets;
    const want = [...new Set([...VENUE_INTERNAL_KEYS, ...contractItemKeys()])].sort();
    for (const t of TIERS) {
      expect(sorted(out[t][0]), `会場(${t})`).toEqual(want);
      for (const c of LANE_IMPORT_CONTRACT) expect(out[t][0][c.itemKey], `${c.id}@${t}`).toEqual(restored[t][0][c.itemKey]);
    }
  });

  it('⑤ 読み取りの関所(sanitizeLaneMirrorForRead)は契約の項目を落とさない', () => {
    const snap = snapOf(fullBuckets());
    const { snap: out } = sanitizeLaneMirrorForRead(snap);
    for (const t of TIERS) {
      // 関所は匿名を link/konta から落とす・uid無しを link/konta から落とす等の正当な絞り込みをする。
      // 残ったセルは入力セルと完全に同じであること(キーも値も)。
      for (const cell of out[t]) expect(cell).toEqual(snap[t].find((c) => c.userId === cell.userId));
    }
    expect(out.gift).toHaveLength(1);
    expect(out.ad).toHaveLength(1);
  });

  it('⑥ 旧鏡の書き出し(flush のレガシーペイロード)がセルをそのまま保持する', () => {
    const snap = snapOf(fullBuckets());
    const sch = createMirrorBundleFlushScheduler({ minGapMs: 0 });
    sch.reflect('lane', snap, { liveId: 'lv1', nowMs: 1000 });
    const out = sch.takeFlushPayload(2000);
    expect(out).not.toBeNull();
    const legacy = Object.values(out.legacyPayload).find((v) => v && Array.isArray(v.gift));
    expect(legacy, '旧キーの鏡が無い').toBeTruthy();
    expect(legacy.gift[0]).toEqual(snap.gift[0]);
  });
});

describe('輸入契約: 一部のサブ項目だけ・項目なしのセルの往復', () => {
  const only = (extra) => ({ link: [item('1001', 'りんく友', extra)], gift: [], ad: [], konta: [], tanu: [] });
  it('stats の一部(giftPt だけ)は残りが null で復元される。pulse の heat だけも同様', () => {
    const snap = snapOf(only({ stats: { commentCount: null, giftPt: 5, adPt: null }, pulse: { heat: 4, heatTier: 'medium' } }));
    expect(snap.link[0].stats).toEqual({ g: 5 });
    expect(snap.link[0].pulse).toEqual({ h: 4, ht: 'medium' });
    const r = restoreLaneMirrorBuckets(snap).link[0];
    expect(r.stats).toEqual({ commentCount: null, giftPt: 5, adPt: null });
    expect(r.pulse).toEqual({ heat: 4, heatTier: 'medium' });
  });
  it('項目が無い/全部 null のセルは、鏡にも復元後にも項目のキーが生えない(旧鏡と同じ形)', () => {
    const snap = snapOf(only({ stats: { commentCount: null, giftPt: null, adPt: null }, pulse: { giftDelta: 0, heat: 0 } }));
    for (const k of contractMirrorKeys()) expect(k in snap.link[0], `鏡 ${k}`).toBe(false);
    const r = restoreLaneMirrorBuckets(snap).link[0];
    for (const k of contractItemKeys()) expect(k in r, `復元 ${k}`).toBe(false);
  });
});

describe('輸入契約: 同一人物性と 0 の非捏造(fixture は全員で値を変える)', () => {
  const makeEls = () => {
    const mk = () => document.createElement('div');
    const els = {
      stack: mk(), laneLink: mk(), laneGift: mk(), laneAd: mk(), laneKonta: mk(), laneTanu: mk(),
      hintLink: mk(), linkWrap: mk(), giftWrap: mk(), adWrap: mk(),
      guideTop: mk(), guideLinesTop: mk(), guideMidGift: mk(), guideLinesMidGift: mk(),
      guideMidAd: mk(), guideLinesMidAd: mk(), guideMidKonta: mk(), guideLinesMidKonta: mk(),
      guideMidTanu: mk(), guideLinesMidTanu: mk(), guideBottom: mk(), guideLinesBottom: mk()
    };
    els.laneTanu.id = 'sceneStoryUserLaneTanu';
    return els;
  };
  const tanu = (people) => ({ link: [], gift: [], ad: [], konta: [], tanu: people });
  const person = (uid, n) => item(uid, `匿名${uid}`, { stats: { commentCount: n, giftPt: null, adPt: null } });
  const stat = (els, i) => els.laneTanu.children[i].querySelector('.nl-story-userlane-meta').getAttribute('data-stats');

  it('syncInPlace の項目は、顔ぶれが入れ替わった(同数)段では別人の値を貼らない(全員異なる値)', () => {
    expect(LANE_IMPORT_CONTRACT.some((c) => c.syncInPlace)).toBe(true);
    const els = makeEls();
    paintStoryUserLaneDomFilled(els, FACES, tanu([person('a:甲', 12), person('a:乙', 3), person('a:丙', 40)]), 3, IO, {});
    expect([stat(els, 0), stat(els, 1), stat(els, 2)]).toEqual(['💬12', '💬3', '💬40']);
    // 供給だけが 乙,丙,丁 に入れ替わった(DOM は 甲,乙,丙 のまま)状態で sync が呼ばれる
    syncStoryUserLaneStatsInPlace(els, tanu([person('a:乙', 33), person('a:丙', 44), person('a:丁', 55)]));
    expect([stat(els, 0), stat(els, 1), stat(els, 2)]).toEqual(['💬12', '💬3', '💬40']); // 誰のタイルにも別人の数字が乗らない
  });

  it('同じ顔ぶれなら各人のタイルに各人の値が追従する', () => {
    const els = makeEls();
    paintStoryUserLaneDomFilled(els, FACES, tanu([person('a:甲', 12), person('a:乙', 3)]), 2, IO, {});
    syncStoryUserLaneStatsInPlace(els, tanu([person('a:甲', 13), person('a:乙', 4)]));
    expect([stat(els, 0), stat(els, 1)]).toEqual(['💬13', '💬4']);
  });

  it('0・null は出さない(0 を捏造しない)。正の値だけが出る', () => {
    const els = makeEls();
    const zero = item('a:零', '零', { stats: { commentCount: 0, giftPt: 0, adPt: null } });
    const pos = item('a:正', '正', { stats: { commentCount: 5, giftPt: 0, adPt: null } });
    paintStoryUserLaneDomFilled(els, FACES, tanu([zero, pos]), 2, IO, {});
    expect(stat(els, 0)).toBeNull();
    expect(stat(els, 1)).toBe('💬5');
  });
});
