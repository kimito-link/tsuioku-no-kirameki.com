import { describe, expect, it } from 'vitest';
import { rosterToVenueRows, touchRoster } from './venueLiveRoster.js';
import { collectVenueParticipants, venueRowsFromUserLaneCandidates } from './venueSeats.js';
import { buildVenueHoverCardModel } from './venueHoverCard.js';
import { RECENT_TEXT_KEEP } from './recentTextRing.js';
import { userLaneCandidatesFromStorage } from './userLaneCandidatesFromStorage.js';
import { buildLaneMirrorSnapshot } from './laneMirror.js';
import { venueRowsFromLaneMirror } from './venueLaneMirrorSupply.js';

/**
 * v0.1.1218: 会場のホバーカードで「その人の直近数件の発言」を読めるようにした配線を、
 * 端から端まで本番モジュールを実importして通す([[integration-test-must-import-real-code]])。
 *
 * 経路: touchRoster → rosterToVenueRows → collectVenueParticipants → buildVenueHoverCardModel
 *
 * ★中継が1つでも recentTexts を落とすと、値は貯まるのにカードが空になる。
 *   v0.1.1216 で lastText がまさにそれ(touchRoster が保存していなかった)だったので、
 *   同じ轍を踏まないよう全経路を1本のテストで縛る。
 */
const NOW = 1_700_000_000_000;

/** @param {string[]} texts */
function rosterWithSpeeches(texts) {
  const roster = new Map();
  texts.forEach((t, i) => {
    touchRoster(roster, { userId: '55141222', nickname: 'だるま', text: t }, NOW + i * 1000);
  });
  return roster;
}

describe('会場ホバーカードの直近発言(端から端)', () => {
  it('発言が roster → rows → participants → カードまで届く', () => {
    const rows = rosterToVenueRows(rosterWithSpeeches(['1つめ', '2つめ', '3つめ']));
    const participants = collectVenueParticipants(rows, {});
    const model = buildVenueHoverCardModel({
      uid: '55141222',
      displayName: 'だるま',
      count: 3,
      lastAt: NOW,
      nowMs: NOW,
      tier: 'link',
      lastText: participants[0].lastText,
      recentTexts: participants[0].recentTexts
    });
    // 新しい順
    expect(model.recentTexts).toEqual(['3つめ', '2つめ', '1つめ']);
  });

  it('上限を超えたら古いものが落ちる(長時間配信でも膨らまない)', () => {
    const many = Array.from({ length: RECENT_TEXT_KEEP + 3 }, (_, i) => `発言${i + 1}`);
    const rows = rosterToVenueRows(rosterWithSpeeches(many));
    const participants = collectVenueParticipants(rows, {});
    expect(participants[0].recentTexts).toHaveLength(RECENT_TEXT_KEEP);
    expect(participants[0].recentTexts[0]).toBe(`発言${many.length}`);
    expect(participants[0].recentTexts).not.toContain('発言1');
  });

  it('投擲段(広告/ギフト)には発言を出さない(発言していないのに本文が出る嘘を作らない)', () => {
    const rows = rosterToVenueRows(rosterWithSpeeches(['喋った']));
    const participants = collectVenueParticipants(rows, {});
    for (const tier of ['ad', 'gift']) {
      const model = buildVenueHoverCardModel({
        uid: '55141222',
        displayName: 'だるま',
        lastAt: NOW,
        nowMs: NOW,
        tier,
        lastText: participants[0].lastText,
        recentTexts: participants[0].recentTexts
      });
      expect(model.recentTexts).toEqual([]);
      expect(model.lastText).toBe('');
    }
  });

  it('ギフトだけの人は直近発言を持たない', () => {
    const roster = new Map();
    touchRoster(roster, { userId: 'g1', text: '' }, NOW, { requireText: false, isGift: true });
    const participants = collectVenueParticipants(rosterToVenueRows(roster), {});
    expect(participants[0].recentTexts).toEqual([]);
  });

  it('長文はカードが会場を覆わないよう切られる', () => {
    const long = 'あ'.repeat(200);
    const rows = rosterToVenueRows(rosterWithSpeeches([long]));
    const participants = collectVenueParticipants(rows, {});
    const model = buildVenueHoverCardModel({
      uid: '55141222',
      displayName: 'だるま',
      lastAt: NOW,
      nowMs: NOW,
      tier: 'link',
      recentTexts: participants[0].recentTexts
    });
    expect(model.recentTexts[0].length).toBeLessThan(long.length);
    expect(model.recentTexts[0].endsWith('…')).toBe(true);
  });

  it('recentTexts が無い旧データでも lastText で1件は出せる(後方互換)', () => {
    const model = buildVenueHoverCardModel({
      uid: '55141222',
      displayName: 'だるま',
      lastAt: NOW,
      nowMs: NOW,
      tier: 'link',
      lastText: '旧データの1件'
    });
    expect(model.lastText).toBe('旧データの1件');
    expect(model.recentTexts).toEqual([]);
  });
});

/**
 * ★実機で本文が出なかった真因(v0.1.1218 → 1219)。
 *
 * 会場が実際に使うのは roster 経路ではなく
 *   userLaneCandidatesFromStorage → venueRowsFromUserLaneCandidates → collectVenueParticipants
 * だった。v0.1.1218 は roster 側だけ直していたため、実機では常に空のままだった。
 *
 * さらに userLaneCandidatesFromStorage は返す直前に Object.freeze で
 * **フィールドを個別に列挙し直す**造りで、そこに足し忘れると値が黙って消える。
 * これも実際に踏んだ。両方をこのテストで縛る。
 */
describe('会場ホバーカードの直近発言(実機で使われる主経路)', () => {
  /** @param {number} n */
  const storedComments = (n) =>
    Array.from({ length: n }, (_, i) => ({
      userId: '138339168',
      nickname: 'ヘンリー塚原',
      text: `発言${i + 1}`,
      capturedAt: NOW + i * 1000,
      commentNo: i + 1,
      liveId: 'lv1'
    }));

  it('storage集計 → 会場行 → 参加者 → カードまで届く', () => {
    const candidates = userLaneCandidatesFromStorage(storedComments(17), 'lv1', {});
    // ★ここが落ちると以降が全部空になる(freeze の列挙漏れ)
    expect(candidates[0].recentTexts).toBeDefined();

    const participants = collectVenueParticipants(
      venueRowsFromUserLaneCandidates(candidates),
      {}
    );
    const model = buildVenueHoverCardModel({
      uid: '138339168',
      displayName: 'ヘンリー塚原',
      count: 17,
      lastAt: NOW,
      nowMs: NOW,
      tier: 'link',
      recentTexts: participants[0].recentTexts
    });
    // 新しい順に上限件数ぶん
    expect(model.recentTexts).toEqual(['発言17', '発言16', '発言15', '発言14', '発言13']);
  });

  it('freeze後も配列が保たれる(列挙漏れの退化ガード)', () => {
    const candidates = userLaneCandidatesFromStorage(storedComments(3), 'lv1', {});
    expect(Array.isArray(candidates[0].recentTexts)).toBe(true);
    expect(candidates[0].recentTexts).toHaveLength(3);
  });
});

/**
 * ★★実機で最も使われる経路(v0.1.1220)。
 *
 * 会場は鏡(laneMirror)が使えるとき**鏡を優先**する(venueBar.js composeVenueBaseRows)。
 * v0.1.1218 は roster を、v0.1.1219 は候補集計を直したが、どちらも鏡に負けていたため
 * 実機では空のままだった=同じ機能で2回続けて外した。
 *
 * 経路: ①POPのbuckets → buildLaneMirrorSnapshot → venueRowsFromLaneMirror
 *       → collectVenueParticipants → buildVenueHoverCardModel
 */
describe('会場ホバーカードの直近発言(鏡経路=実機の本命)', () => {
  const bucketsWith = (/** @type {string[]} */ recentTexts) => ({
    link: [
      {
        displaySrc: 'https://example.invalid/a.jpg',
        title: 'こんこんかん',
        meta: { idLine: 'ID:80330078', nameLine: 'こんこんかん' },
        entry: { userId: '80330078' },
        recentTexts
      }
    ],
    gift: [],
    ad: [],
    konta: [],
    tanu: []
  });

  it('①POPのbuckets → 鏡 → 会場行 → 参加者 → カードまで届く', () => {
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: bucketsWith(['最新の発言', 'その前の発言']),
      capturedAt: NOW
    });
    // ★鏡セルに載っていること(ここが落ちると会場では永久に空)
    expect(snap.link[0].recentTexts).toEqual(['最新の発言', 'その前の発言']);

    const rows = venueRowsFromLaneMirror(snap, new Map());
    const participants = collectVenueParticipants(rows, {});
    const model = buildVenueHoverCardModel({
      uid: '80330078',
      displayName: 'こんこんかん',
      lastAt: NOW,
      nowMs: NOW,
      tier: 'link',
      recentTexts: participants[0].recentTexts
    });
    expect(model.recentTexts).toEqual(['最新の発言', 'その前の発言']);
  });

  it('鏡は容量を優先して3件までに絞る(純Web公開のサイズを膨らませない)', () => {
    const many = ['1', '2', '3', '4', '5'];
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: bucketsWith(many),
      capturedAt: NOW
    });
    expect(snap.link[0].recentTexts).toEqual(['1', '2', '3']);
  });

  it('recentTexts が無い旧い鏡でも落ちない(後方互換)', () => {
    const b = bucketsWith([]);
    delete b.link[0].recentTexts;
    const snap = buildLaneMirrorSnapshot({ liveId: 'lv1', buckets: b, capturedAt: NOW });
    expect(snap.link[0].recentTexts).toEqual([]);
    const rows = venueRowsFromLaneMirror(snap, new Map());
    expect(rows[0].recentTexts).toEqual([]);
  });
});
