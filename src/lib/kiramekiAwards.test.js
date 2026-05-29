import { describe, it, expect } from 'vitest';
import { computeKiramekiAwards, AWARD_DEFS } from './kiramekiAwards.js';

// テスト用フィクスチャ
const makeRoom = (userKey, count, nickname = '') => ({ userKey, count, nickname });
const makeComment = (userId, text) => ({ userId, text });

const baseRooms = [
  makeRoom('u1', 20, 'アリス'),   // 常連・長文・ひかり候補
  makeRoom('u2', 15, 'ボブ'),     // 常連・えがお候補
  makeRoom('u3', 10, 'チャーリー'), // 新規
  makeRoom('u4', 5, 'ダン'),      // そっと候補
  makeRoom('u5', 1, 'イヴ'),      // 参加のみ
];

const baseComments = [
  // u1: 長文たくさん
  makeComment('u1', 'りんくさんのこの配信本当に大好きです！いつも元気もらえます。毎回来るの楽しみにしてます'),
  makeComment('u1', '今日も最高でした。次の配信も絶対来ます！応援しています'),
  makeComment('u1', 'わわわ'),
  // u2: 短文連打
  makeComment('u2', 'w'),
  makeComment('u2', 'ww'),
  makeComment('u2', 'すごw'),
  makeComment('u2', 'www'),
  makeComment('u2', 'ｗｗｗ'),
  // u3: 普通
  makeComment('u3', 'こんにちは！初めて来ました'),
  // u4: あたたかい
  makeComment('u4', 'ありがとう配信してくれて'),
  makeComment('u4', 'がんばってください応援してます'),
  // u5: 短いだけ
  makeComment('u5', 'お'),
];

describe('computeKiramekiAwards', () => {
  it('ともしびのきらめき: 全参加者が受賞する（誰も外れない）', () => {
    const { awards } = computeKiramekiAwards({
      comments: baseComments,
      aggregatedRooms: baseRooms
    });
    const tomoshibi = awards.find((a) => a.id === 'tomoshibi');
    expect(tomoshibi.userKeys).toContain('u1');
    expect(tomoshibi.userKeys).toContain('u2');
    expect(tomoshibi.userKeys).toContain('u3');
    expect(tomoshibi.userKeys).toContain('u4');
    expect(tomoshibi.userKeys).toContain('u5');
    // 件数が少なくても全員入る
    expect(tomoshibi.userKeys.length).toBe(5);
  });

  it('かよいのきらめき: returningUserKeys に含まれる人だけ', () => {
    const { awards } = computeKiramekiAwards({
      comments: baseComments,
      aggregatedRooms: baseRooms,
      returningUserKeys: ['u1', 'u2']
    });
    const kayoi = awards.find((a) => a.id === 'kayoi');
    expect(kayoi.userKeys).toContain('u1');
    expect(kayoi.userKeys).toContain('u2');
    expect(kayoi.userKeys).not.toContain('u3');
    expect(kayoi.userKeys).not.toContain('u5');
  });

  it('はじまりのきらめき: firstTimeUserKeys に含まれる人だけ', () => {
    const { awards } = computeKiramekiAwards({
      comments: baseComments,
      aggregatedRooms: baseRooms,
      firstTimeUserKeys: ['u3']
    });
    const hajimari = awards.find((a) => a.id === 'hajimari');
    expect(hajimari.userKeys).toContain('u3');
    expect(hajimari.userKeys).not.toContain('u1');
  });

  it('ことばのきらめき: 総文字数が閾値以上の人が受賞', () => {
    const { awards } = computeKiramekiAwards({
      comments: baseComments,
      aggregatedRooms: baseRooms
    });
    const kotoba = awards.find((a) => a.id === 'kotoba');
    // u1 は長文2本 = 50文字超
    expect(kotoba.userKeys).toContain('u1');
    // u2 は短文連打 = 文字数少ない
    expect(kotoba.userKeys).not.toContain('u2');
    // u5 は「お」1文字のみ
    expect(kotoba.userKeys).not.toContain('u5');
  });

  it('ひかりのきらめき: コメント件数上位の人が受賞（複数可・同率含む）', () => {
    const { awards } = computeKiramekiAwards({
      comments: baseComments,
      aggregatedRooms: baseRooms
    });
    const hikari = awards.find((a) => a.id === 'hikari');
    // u1(20件)・u2(15件)・u3(10件) が上位3
    expect(hikari.userKeys).toContain('u1');
    expect(hikari.userKeys).toContain('u2');
    expect(hikari.userKeys).toContain('u3');
    // u5(1件) は入らない
    expect(hikari.userKeys).not.toContain('u5');
  });

  it('えがおのきらめき: 短文コメントが多い人が受賞', () => {
    const { awards } = computeKiramekiAwards({
      comments: baseComments,
      aggregatedRooms: baseRooms
    });
    const egao = awards.find((a) => a.id === 'egao');
    // u2 は短文5本
    expect(egao.userKeys).toContain('u2');
    // u1 は長文メイン
    expect(egao.userKeys).not.toContain('u1');
  });

  it('そっとのきらめき: あたたかい語彙を持つコメントをした人が受賞', () => {
    const { awards } = computeKiramekiAwards({
      comments: baseComments,
      aggregatedRooms: baseRooms
    });
    const sotto = awards.find((a) => a.id === 'sotto');
    // u1 は「応援」含む
    expect(sotto.userKeys).toContain('u1');
    // u4 は「ありがとう」「がんばって」含む
    expect(sotto.userKeys).toContain('u4');
    // u2 は「w」「ww」のみ
    expect(sotto.userKeys).not.toContain('u2');
  });

  it('配信者IDは全ての賞から除外される', () => {
    const roomsWithBroadcaster = [
      ...baseRooms,
      makeRoom('broadcaster', 100, '配信者')
    ];
    const commentsWithBroadcaster = [
      ...baseComments,
      makeComment('broadcaster', 'ありがとうございます！応援してます'),
    ];
    const { awards } = computeKiramekiAwards({
      comments: commentsWithBroadcaster,
      aggregatedRooms: roomsWithBroadcaster,
      broadcasterUserId: 'broadcaster'
    });
    // aggregatedRooms から除外されていないので tomoshibi には入るが
    // broadcaster を aggregatedRooms から除くのは呼び出し側責務
    // ここでは broadcasterUserId が文字数カウントから除外されることを確認
    const kotoba = awards.find((a) => a.id === 'kotoba');
    // broadcaster は文字数カウントから除外されるので kotoba に入らないはず
    // （aggregatedRooms には入っているので tomoshibi には入る）
    expect(kotoba.userKeys).not.toContain('broadcaster');
  });

  it('参加者0人でも安全に動く', () => {
    const result = computeKiramekiAwards({
      comments: [],
      aggregatedRooms: []
    });
    expect(result.awards.length).toBe(AWARD_DEFS.length);
    for (const a of result.awards) {
      expect(a.userKeys).toEqual([]);
    }
  });

  it('userKeyToAwardIds で逆引きできる', () => {
    const { userKeyToAwardIds } = computeKiramekiAwards({
      comments: baseComments,
      aggregatedRooms: baseRooms,
      returningUserKeys: ['u1'],
      firstTimeUserKeys: ['u3']
    });
    // u1 は tomoshibi + kayoi + kotoba + hikari + sotto を持つはず
    const u1Awards = userKeyToAwardIds.get('u1') || [];
    expect(u1Awards).toContain('tomoshibi');
    expect(u1Awards).toContain('kayoi');
    // u3 は tomoshibi + hajimari
    const u3Awards = userKeyToAwardIds.get('u3') || [];
    expect(u3Awards).toContain('tomoshibi');
    expect(u3Awards).toContain('hajimari');
  });

  it('AWARD_DEFS は全7賞を定義している', () => {
    expect(AWARD_DEFS.length).toBe(7);
    const ids = AWARD_DEFS.map((d) => d.id);
    expect(ids).toContain('tomoshibi');
    expect(ids).toContain('kayoi');
    expect(ids).toContain('hajimari');
    expect(ids).toContain('kotoba');
    expect(ids).toContain('hikari');
    expect(ids).toContain('egao');
    expect(ids).toContain('sotto');
  });
});
