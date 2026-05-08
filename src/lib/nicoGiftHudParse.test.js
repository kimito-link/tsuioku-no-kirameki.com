import { describe, it, expect } from 'vitest';
import {
  parseJpIntToken,
  parseNicoGiftHudScoresFromInnerText,
  parseNicoEventRankFromInnerText,
  parseNicoGiftHudFromInnerText,
  parseNicoEventTitleFromInnerText,
  parseNicoGiftHudFromPageHtml
} from './nicoGiftHudParse.js';

describe('parseJpIntToken', () => {
  it('カンマ区切りを解釈', () => {
    expect(parseJpIntToken('7,780')).toBe(7780);
    expect(parseJpIntToken('3,880')).toBe(3880);
  });

  it('全角数字を解釈', () => {
    expect(parseJpIntToken('７，７８０')).toBe(7780);
  });
});

describe('parseNicoGiftHudScoresFromInnerText', () => {
  it('イベント累計と番組累計を拾う', () => {
    const t =
      'イベント累計スコア : 💎 7,780\n' + '番組累計ポイント : 3,880 pt\n';
    expect(parseNicoGiftHudScoresFromInnerText(t)).toEqual({
      eventScore: 7780,
      programPoints: 3880
    });
  });

  it('全角コロンでも可', () => {
    const t = 'イベント累計スコア：7780\n番組累計ポイント：100 pt';
    expect(parseNicoGiftHudScoresFromInnerText(t)).toEqual({
      eventScore: 7780,
      programPoints: 100
    });
  });

  it('ラベルと数値が改行で分かれても拾う', () => {
    const t = 'イベント累計スコア\n7,780\n番組累計ポイント\n3,880 pt';
    expect(parseNicoGiftHudScoresFromInnerText(t)).toEqual({
      eventScore: 7780,
      programPoints: 3880
    });
  });

  it('「イベント累計」単独ラベル（スコア無し）', () => {
    const t = 'イベント累計\n12,345\n番組累計\n99 pt';
    expect(parseNicoGiftHudScoresFromInnerText(t)).toEqual({
      eventScore: 12345,
      programPoints: 99
    });
  });
});

describe('parseNicoEventRankFromInnerText', () => {
  it('現在 N 位を拾う', () => {
    expect(parseNicoEventRankFromInnerText('現在 21 位')).toBe(21);
  });

  it('貢献度付近の「現在 N 位」は無視', () => {
    const t = '貢献度ランキング 現在 3 位 ギフト 現在 21 位';
    expect(parseNicoEventRankFromInnerText(t)).toBe(21);
  });

  it('貢献度しか無ければ null', () => {
    expect(parseNicoEventRankFromInnerText('貢献度 現在 3 位')).toBeNull();
  });

  it('遠い貢献度だけではイベント側「現在 N 位」を捨てない', () => {
    const t =
      '貢献度ランキング ' +
      'x'.repeat(300) +
      ' イベント 現在 44 位';
    expect(parseNicoEventRankFromInnerText(t)).toBe(44);
  });

  it('現在の順位表記（フォールバック）', () => {
    expect(parseNicoEventRankFromInnerText('イベント 現在の順位：12位')).toBe(12);
  });
});

describe('parseNicoGiftHudFromInnerText', () => {
  it('まとめて返す', () => {
    const t =
      'イベント累計スコア : 100\n番組累計ポイント : 50 pt\n現在 8 位';
    expect(parseNicoGiftHudFromInnerText(t)).toEqual({
      eventScore: 100,
      programPoints: 50,
      eventRank: 8,
      eventTitle: null
    });
  });

  it('参加カード周辺の「現在 N 位」を拾う', () => {
    const t =
      '「テストイベント2026」 あかねこ。さんが参加しています。 foo 現在 2 位 bar ダイヤ 123';
    expect(parseNicoEventRankFromInnerText(t)).toBe(2);
  });

  it('「さんが参加」の直前のイベント名を拾う', () => {
    const t =
      'ヘッダ 「ジオで使える！ギフトのモト争奪戦 2026年5月」 あかねこ。さんが参加しています';
    expect(parseNicoEventTitleFromInnerText(t)).toBe(
      'ジオで使える！ギフトのモト争奪戦 2026年5月'
    );
  });

  it('『』括弧のイベント名も拾う', () => {
    const t =
      'バナー 『春のギフト祭り2026』 たろうさんが参加しています';
    expect(parseNicoEventTitleFromInnerText(t)).toBe('春のギフト祭り2026');
  });

  it('fetch HTML 断片からもスコアを拾える', () => {
    const html =
      '<div>イベント累計スコア : 💎 134,610</div><span>番組累計ポイント</span>134,510 pt';
    const r = parseNicoGiftHudFromPageHtml(html);
    expect(r.eventScore).toBe(134610);
    expect(r.programPoints).toBe(134510);
  });
});
