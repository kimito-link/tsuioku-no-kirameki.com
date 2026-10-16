import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { collectVenueParticipants, venueRowsFromUserLaneCandidates } from './venueSeats.js';
import { venueRowsFromLaneMirror } from './venueLaneMirrorSupply.js';
import { hydrateRosterFromCandidates, rosterToVenueRows, touchRoster } from './venueLiveRoster.js';
import { resolveVenueHoverFacts } from './venueHoverFacts.js';
import { hasSpeech, speechWithFallbackTexts } from './speechEvidence.js';

/**
 * 2026-10-16(発言の証拠 v1): 3系統(候補/鏡/名簿)の行が `speech` を持ち、参加者まで落ちずに届くこと。
 *   個別列挙で作り直す関数に speech を足し忘れると黙って消える(v0.1.1218/1219 で踏んだ型)ので、結果が使われるところまで固定する。
 *   ★支援者(発言0)は「発言の証拠なし」のまま届き、preCount の下駄(最低1)が発言の証拠に化けない。
 */
const T = 1_000_000;

describe('候補 → 行 → 参加者', () => {
  it('★発言した人(commentCount 3・本文あり)は証拠ありで届く', () => {
    const rows = venueRowsFromUserLaneCandidates([{ userId: '111', nickname: 'a', commentCount: 3, _laneSortAt: T, recentTexts: ['こんにちは'] }]);
    const p = collectVenueParticipants(rows);
    expect(p).toHaveLength(1);
    expect(p[0].speech).toEqual({ comments: 3, lastAt: T, texts: ['こんにちは'] });
    expect(hasSpeech(p[0].speech)).toBe(true);
  });
  it('★発言0の候補は count が下駄で1になっても証拠なし(捏造しない)', () => {
    const rows = venueRowsFromUserLaneCandidates([{ userId: '222', nickname: 'ad', commentCount: 0, _laneSortAt: T, recentTexts: [] }]);
    const p = collectVenueParticipants(rows);
    expect(p[0].count).toBe(1); // 並び/VIP 用の下駄は残る(v1 は触らない)
    expect(hasSpeech(p[0].speech)).toBe(false);
    expect(p[0].speech.lastAt).toBeNull();
  });
});

describe('鏡 → 行 → 参加者', () => {
  const snap = { capturedAt: T, link: [{ userId: '333', title: 'キリン', displaySrc: 'https://x/a.jpg', recentTexts: [] }], konta: [], gift: [], tanu: [], ad: [] };
  it('★storage 候補に居ない鏡のセル(支援者)は、鏡の発行時刻から「発言した時刻」を作らない', () => {
    const rows = venueRowsFromLaneMirror(snap, new Map());
    expect(rows).toHaveLength(1);
    expect(rows[0].capturedAt).toBe(T); // 「居る」の根拠としては使う(従来どおり)
    expect(rows[0].preCount).toBe(1); // 下駄(v1 は触らない)
    expect(hasSpeech(rows[0].speech)).toBe(false);
    expect(rows[0].speech.lastAt).toBeNull();
    const p = collectVenueParticipants(rows);
    expect(hasSpeech(p[0].speech)).toBe(false);
  });
  it('鏡のセルが stats.c と本文を持っていれば、それだけ(時刻なし)で証拠あり', () => {
    const s = { ...snap, link: [{ userId: '444', title: 'b', displaySrc: 'https://x/b.jpg', recentTexts: ['やあ'], stats: { c: 2 } }] };
    const rows = venueRowsFromLaneMirror(s, new Map());
    expect(rows[0].speech).toEqual({ comments: 2, lastAt: null, texts: ['やあ'] });
  });
  it('候補があれば候補の実数(commentCount・_laneSortAt)を使う', () => {
    const cands = new Map([['333', { commentCount: 5, _laneSortAt: T - 1000, recentTexts: ['x'] }]]);
    const rows = venueRowsFromLaneMirror(snap, cands);
    expect(rows[0].speech).toEqual({ comments: 5, lastAt: T - 1000, texts: ['x'] });
  });
});

describe('名簿 → 行 → 参加者', () => {
  it('★ライブで発言した人は証拠あり(本文と時刻)', () => {
    const roster = new Map();
    touchRoster(roster, { userId: '555', name: 'c', text: 'ライブ発言' }, T);
    const rows = rosterToVenueRows(roster);
    expect(rows[0].speech.comments).toBe(1);
    expect(rows[0].speech.texts).toEqual(['ライブ発言']);
    expect(hasSpeech(collectVenueParticipants(rows)[0].speech)).toBe(true);
  });
});

describe('名簿の hydrate(下駄込みの commentCount を発言の証拠にしない)', () => {
  it('★発言0の候補で seed した名簿は、commentCount が下駄で1でも証拠なし', () => {
    const roster = new Map();
    hydrateRosterFromCandidates(roster, [{ userId: '888', nickname: 'ad', commentCount: 0, _laneSortAt: T, recentTexts: [] }]);
    const e = roster.get('888');
    expect(e.commentCount).toBe(1); // 並び/VIP 用の下駄は残る
    expect(e.realComments).toBe(0);
    const rows = rosterToVenueRows(roster);
    expect(hasSpeech(rows[0].speech)).toBe(false);
    expect(rows[0].speech.lastAt).toBeNull();
  });
  it('★発言3の候補で seed した名簿は実数3・時刻あり。ライブ発言で+1される(ギフト行は数えない)', () => {
    const roster = new Map();
    hydrateRosterFromCandidates(roster, [{ userId: '999', nickname: 'x', commentCount: 3, _laneSortAt: T, recentTexts: [] }]);
    expect(roster.get('999').realComments).toBe(3);
    touchRoster(roster, { userId: '999', name: 'x', text: 'ライブ' }, T + 5);
    expect(roster.get('999').realComments).toBe(4);
    touchRoster(roster, { userId: '999', name: 'x', text: 'ギフト行' }, T + 6, { isGift: true });
    expect(roster.get('999').realComments).toBe(4);
    expect(rosterToVenueRows(roster)[0].speech.comments).toBe(4);
  });
});

describe('同じ人の複数の行は合流する', () => {
  it('件数は和・時刻は新しい方・本文は新しい行を優先', () => {
    const rows = [
      { userId: '666', name: 'd', text: '', capturedAt: T, preCount: 2, speech: { comments: 2, lastAt: T, texts: ['old'] } },
      { userId: '666', name: 'd', text: '', capturedAt: T + 10, preCount: 1, speech: { comments: 1, lastAt: T + 10, texts: ['new'] } }
    ];
    const p = collectVenueParticipants(rows);
    expect(p).toHaveLength(1);
    expect(p[0].speech).toEqual({ comments: 3, lastAt: T + 10, texts: ['new'] });
  });
  it('speech を持たない生の発言行(本文あり)は1件の発言として扱う', () => {
    const p = collectVenueParticipants([{ userId: '777', name: 'e', text: 'hi', capturedAt: T }]);
    expect(p[0].speech).toEqual({ comments: 1, lastAt: T, texts: ['hi'] });
  });
});

describe('resolveVenueHoverFacts の speech(出所を混ぜない)', () => {
  it('★registered があれば registered.speech をそのまま・鏡セルの stats.c は使わない', () => {
    const f = resolveVenueHoverFacts({ registered: { count: 3, speech: { comments: 3, lastAt: T, texts: ['r'] } }, mirrorCell: { stats: { c: 99 }, recentTexts: ['m'] } });
    expect(f.speech).toEqual({ comments: 3, lastAt: T, texts: ['r'] });
  });
  it('registered が無く名簿があれば名簿の speech', () => {
    const f = resolveVenueHoverFacts({ rosterEntry: { commentCount: 2, lastSeen: T, lastTextAt: T - 5, recentTexts: ['n'] }, mirrorCell: { stats: { c: 99 } } });
    expect(f.speech).toEqual({ comments: 2, lastAt: T - 5, texts: ['n'] });
  });
  it('どちらも無ければ鏡セルの stats.c と本文だけ(時刻なし)・鏡も無ければ不明', () => {
    expect(resolveVenueHoverFacts({ mirrorCell: { stats: { c: 4 }, recentTexts: ['m'] } }).speech).toEqual({ comments: 4, lastAt: null, texts: ['m'] });
    expect(hasSpeech(resolveVenueHoverFacts({}).speech)).toBe(false);
  });
  it('従来の count/lastAt/lastText/recentTexts の戻りは不変(none は null/0)', () => {
    const f = resolveVenueHoverFacts({ mirrorCell: { stats: { c: 4 }, recentTexts: ['m'] } });
    expect(f.count).toBeNull();
    expect(f.lastAt).toBe(0);
    expect(f.recentTexts).toEqual([]);
  });
});

describe('speechWithFallbackTexts', () => {
  it('★本文だけ借りる(件数・時刻は借りない)', () => {
    const e = speechWithFallbackTexts({ comments: null, lastAt: null, texts: [] }, ['鏡の本文']);
    expect(e).toEqual({ comments: null, lastAt: null, texts: ['鏡の本文'] });
    expect(speechWithFallbackTexts({ comments: 2, lastAt: T, texts: ['own'] }, ['鏡'])).toEqual({ comments: 2, lastAt: T, texts: ['own'] });
  });
});

describe('★毒テスト: 持ち回しの配線を落とすと赤になる', () => {
  const read = (p) => fs.readFileSync(path.resolve(p), 'utf8').split('\r\n').join('\n');
  it('個別列挙で作り直す4関数と venueBar の2登録が speech を持ち回す', () => {
    expect(read('src/lib/venueSeats.js')).toContain('speech: speechEvidenceFromCandidate(c)');
    expect(read('src/lib/venueSeats.js')).toContain('existing.speech = mergeSpeechEvidence(');
    expect(read('src/lib/venueSeats.js')).toContain('speech: r?.speech || speechEvidenceFromRow(r) || SPEECH_UNKNOWN');
    expect(read('src/lib/venueLaneMirrorSupply.js')).toContain('speech: cand ? speechEvidenceFromCandidate(cand) : speechEvidenceFromMirrorCell(cell)');
    expect(read('src/lib/venueLiveRoster.js')).toContain('speech: speechEvidenceFromRoster(e)');
    const bar = read('src/extension/venueBar.js');
    expect(bar).toContain('speech: speechWithFallbackTexts(participant.speech, item?.recentTexts)');
    expect(bar).toContain('speech: speechWithFallbackTexts(facts.speech, it?.recentTexts)');
    // 応援者トップ(renderTopBar)の登録も speech を持つ(落とすと census の「発言の嘘」が全員分過大計上される)
    expect(bar).toMatch(/recentTexts: Array\.isArray\(p\.recentTexts\) \? p\.recentTexts : \[\],\n\s+\/\/[^\n]*\n\s+speech: p\.speech/);
    expect(bar).toContain('resolveVenueHoverFacts({ registered: null, rosterEntry, mirrorCell: it })');
  });
});

import { buildVenueHoverCardModel } from './venueHoverCard.js';
import { SPEECH_EVIDENCE_GATE_ENABLED } from './speechEvidence.js';

describe('★結果が使われているか(v2): 鏡の支援者セル → 参加者 → カード', () => {
  const NOW = 1_700_000_000_000;
  it('既定でゲートは有効', () => {
    expect(SPEECH_EVIDENCE_GATE_ENABLED).toBe(true);
  });
  it('★広告の支援者(りんく段・コメント無し)のカードに「発言」「たった今」「いま喋っている」が出ない(キリンの症状)', () => {
    const snap = { capturedAt: NOW - 2000, link: [{ userId: '19707371', title: 'キリン', displaySrc: 'https://x/k.jpg', recentTexts: [] }], konta: [], gift: [], tanu: [], ad: [] };
    const p = collectVenueParticipants(venueRowsFromLaneMirror(snap, new Map()))[0];
    // 席の count は下駄で1・lastAt は鏡の発行時刻=旧ロジックなら「発言 1(たった今)」になる入力
    expect(p.count).toBe(1);
    expect(p.lastAt).toBe(NOW - 2000);
    const m = buildVenueHoverCardModel({ uid: p.userId, displayName: p.name, count: p.count, lastAt: p.lastAt, tier: 'link', nowMs: NOW, speech: p.speech, lastText: p.lastText, recentTexts: p.recentTexts });
    expect(m.statLine).toBe('会場に居る');
    expect(m.presenceNote).not.toContain('喋っている');
    const old = buildVenueHoverCardModel({ uid: p.userId, displayName: p.name, count: p.count, lastAt: p.lastAt, tier: 'link', nowMs: NOW, lastText: p.lastText, recentTexts: p.recentTexts });
    expect(old.statLine).toContain('発言 1'); // 旧ロジック(speech 無し)では嘘が出る=この差が v2 の効果
  });
  it('★storage で実際に発言していた人(本文あり)は、鏡のセルでも本文つきの発言として出る', () => {
    const snap = { capturedAt: NOW, link: [{ userId: '1', title: 'a', displaySrc: 'https://x/a.jpg', recentTexts: ['こんにちは'], stats: { c: 3 } }], konta: [], gift: [], tanu: [], ad: [] };
    const p = collectVenueParticipants(venueRowsFromLaneMirror(snap, new Map()))[0];
    const m = buildVenueHoverCardModel({ uid: '1', displayName: 'a', count: p.count, lastAt: p.lastAt, tier: 'link', nowMs: NOW, speech: p.speech });
    expect(m.statLine).toContain('発言 3'); // 鏡由来は時刻を言わない
    expect(m.recentTexts).toEqual(['こんにちは']);
  });
});

import { mergeUserLaneAggregates } from './venueIncrementalAggregate.js';

describe('★結果が使われているか(v3+v4): チャンク差分集計 → 名簿 hydrate → 参加者 → カードに本文が出る', () => {
  const NOW = 1_700_000_000_000;
  it('会場を開く前に発言していた人(チャンク2つに分かれた記録)のカードに、発言と本文が出る(以前は count≥1 なのに本文が空だった)', () => {
    const chunk1 = [{ userId: '555', nickname: 'x', avatarUrl: '', liveId: 'lv1', commentCount: 2, giftCount: 0, _laneSortAt: NOW - 600_000, recentTexts: ['二番目', '最初'] }];
    const chunk2 = [{ userId: '555', nickname: 'x', avatarUrl: '', liveId: 'lv1', commentCount: 1, giftCount: 0, _laneSortAt: NOW - 120_000, recentTexts: ['いちばん新しい'] }];
    const aggregated = mergeUserLaneAggregates(chunk1, chunk2); // チャンク経路の aggregatedCandidates
    const roster = new Map();
    hydrateRosterFromCandidates(roster, aggregated);
    const p = collectVenueParticipants(rosterToVenueRows(roster))[0];
    expect(p.speech.comments).toBe(3);
    expect(p.speech.texts).toEqual(['いちばん新しい', '二番目', '最初']);
    const m = buildVenueHoverCardModel({ uid: '555', displayName: 'x', count: p.count, lastAt: p.lastAt, tier: 'link', nowMs: NOW, speech: p.speech });
    expect(m.statLine).toContain('発言 3(2分前)');
    expect(m.recentTexts).toEqual(['いちばん新しい', '二番目', '最初']);
  });
  it('発言0の支援者を同じ経路に通しても「発言」は出ない(v2 の効果が v3/v4 で壊れていない)', () => {
    const aggregated = mergeUserLaneAggregates([], [{ userId: '666', nickname: 'ad', avatarUrl: '', liveId: 'lv1', commentCount: 0, giftCount: 1, _laneSortAt: NOW - 1000, recentTexts: [] }]);
    const roster = new Map();
    hydrateRosterFromCandidates(roster, aggregated);
    const p = collectVenueParticipants(rosterToVenueRows(roster))[0];
    const m = buildVenueHoverCardModel({ uid: '666', displayName: 'ad', count: p.count, lastAt: p.lastAt, tier: 'link', nowMs: NOW, speech: p.speech, hasGift: true, giftCount: 1 });
    expect(m.statLine).not.toContain('発言');
    expect(m.presenceNote).not.toContain('喋っている');
  });
});
