import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildVenueHoverCardModel } from './venueHoverCard.js';
import { resolveVenueHoverFacts } from './venueHoverFacts.js';

/*
 * T3: ★3経路の同値性（2026-08-29）
 *
 *   実機症状: 同じ人（同じ uid）が同じ時刻に「発言 1」と「発言 70」で表示された。
 *   原因はホバーデータの登録経路が3つあり、席なし経路だけが
 *   count:0 のゼロ埋めリテラルを渡していたこと。
 *
 *   ★既存のテストは resolveSeatlessHoverData を「ソース文字列の正規表現」でしか
 *   見ておらず、★値を1つも検証していなかった。だから count:0 を入れても赤くならず、
 *   1ヶ月生き延びた。ここでは【値】を突き合わせる。
 */

const NOW = 1_700_000_000_000;
const venueBarSrc = readFileSync(new URL('../extension/venueBar.js', import.meta.url), 'utf8');

/** 同じ人の同じ事実。経路が違っても、これが答えであるべき。 */
const TRUTH = {
  uid: '143140387',
  displayName: '銀ちゃ',
  count: 70,
  giftCount: 2,
  venueRank: 1,
  lastAt: NOW - 30_000,
  lastText: 'こんばんは',
  recentTexts: ['こんばんは']
};

/** 経路1/2（トップバー・席あり）が渡す形。participant から正しい値が来る。 */
function viaRegistered() {
  return resolveVenueHoverFacts({
    registered: {
      count: TRUTH.count,
      giftCount: TRUTH.giftCount,
      venueRank: TRUTH.venueRank,
      lastAt: TRUTH.lastAt,
      lastText: TRUTH.lastText,
      recentTexts: TRUTH.recentTexts
    },
    rosterEntry: null
  });
}

/** 経路3（席なし）が渡す形。在席名簿から引く。 */
function viaRoster() {
  return resolveVenueHoverFacts({
    registered: null,
    rosterEntry: {
      userId: TRUTH.uid,
      commentCount: TRUTH.count,
      giftCount: TRUTH.giftCount,
      venueRank: TRUTH.venueRank,
      lastSeen: TRUTH.lastAt,
      lastText: TRUTH.lastText,
      recentTexts: TRUTH.recentTexts
    }
  });
}

function toCard(facts) {
  return buildVenueHoverCardModel({
    uid: TRUTH.uid,
    displayName: TRUTH.displayName,
    count: facts.count,
    hasGift: (facts.giftCount || 0) > 0,
    giftCount: facts.giftCount,
    venueRank: facts.venueRank,
    lastAt: facts.lastAt,
    lastText: facts.lastText,
    recentTexts: facts.recentTexts,
    nowMs: NOW
  });
}

describe('T3: ★同じ事実なら、どの経路から来ても同じ画面になる', () => {
  it('★統計行が一致する（発言70 が経路によって 1 や 0 に化けない）', () => {
    const a = toCard(viaRegistered());
    const b = toCard(viaRoster());
    expect(a.statLine).toBe(b.statLine);
    expect(a.statLine).toContain('発言 70');
    // ★症状そのものを名指しで禁じる。
    expect(a.statLine).not.toContain('発言 1(');
    expect(a.statLine).not.toContain('発言 0');
  });

  it('★一言が一致する', () => {
    expect(toCard(viaRegistered()).presenceNote).toBe(toCard(viaRoster()).presenceNote);
  });

  it('★事実そのものが一致する（source 以外の全項目）', () => {
    const { source: sa, ...a } = viaRegistered();
    const { source: sb, ...b } = viaRoster();
    expect(a).toEqual(b);
    expect(sa).not.toBe(sb); // 出所は違ってよい。★中身が同じであることが要件
  });
});

describe('★名簿に居ない人を「0回」と断言しない', () => {
  it('数を言わず、居ることを言う', () => {
    const card = toCard(resolveVenueHoverFacts({ registered: null, rosterEntry: null }));
    expect(card.statLine).not.toContain('発言 0');
    expect(card.statLine).not.toContain('発言 1');
    expect(card.statLine).toContain('会場に居る');
  });

  it('★一言も消えない（発言のある人で行が出たり消えたりした症状）', () => {
    const card = buildVenueHoverCardModel({
      uid: TRUTH.uid,
      displayName: TRUTH.displayName,
      count: null,
      giftCount: null,
      lastAt: NOW - 30_000,
      nowMs: NOW
    });
    expect(card.presenceNote).not.toBe('');
    expect(card.presenceNote).not.toMatch(/\d+回/);
  });
});

describe('T5: ★席なし経路がゼロ埋めリテラルに戻っていないこと', () => {
  const fnAt = venueBarSrc.indexOf('const resolveSeatlessHoverData');
  const afterFn = venueBarSrc.slice(fnAt + 1);
  const nextDeclAt = afterFn.search(/\n {2}(?:const|let|function) /);
  const fnBlock = venueBarSrc.slice(fnAt, nextDeclAt > 0 ? fnAt + 1 + nextDeclAt : fnAt + 4000);

  it('★count: 0 / lastAt: 0 のリテラルを持たない（これが元の嘘の出どころ）', () => {
    expect(fnBlock).not.toMatch(/count:\s*0\s*,/);
    expect(fnBlock).not.toMatch(/lastAt:\s*0\s*,/);
    expect(fnBlock).not.toMatch(/giftCount:\s*0\s*,/);
  });

  it('★在席名簿から引いている', () => {
    expect(fnBlock).toMatch(/liveRoster\.get\(/);
    expect(fnBlock).toMatch(/resolveVenueHoverFacts/);
  });

  it('★名簿を全走査しない（hot path を汚さない）', () => {
    expect(fnBlock).not.toMatch(/liveRoster\.forEach|for\s*\(.*of\s+liveRoster/);
  });

  it('★uid のある人の値をキャッシュしない（喋るほど伸びる値を固定しない）', () => {
    const openAt = venueBarSrc.indexOf('const openHoverCardFor');
    const openBlock = venueBarSrc.slice(openAt, openAt + 2500);
    expect(openBlock).toMatch(/if\s*\(!seatless\.uid\)\s*_hoverCardDataByEl\.set/);
  });
});
