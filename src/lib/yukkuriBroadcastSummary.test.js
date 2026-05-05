import { describe, it, expect } from 'vitest';
import {
  buildYukkuriBroadcastSummary,
  renderYukkuriBroadcastSummaryHtml,
  yukkuriCharacterImagePath
} from './yukkuriBroadcastSummary.js';

describe('yukkuriCharacterImagePath', () => {
  it('rinku の smile mouth-open', () => {
    expect(yukkuriCharacterImagePath('rinku', 'smile', true)).toBe(
      'images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.png'
    );
  });
  it('konta の normal は単独ファイルに切替', () => {
    expect(yukkuriCharacterImagePath('konta', 'normal', false)).toBe(
      'images/yukkuri-charactore-english/konta/kitsune-yukkuri-normal.png'
    );
  });
  it('tanunee の blink mouth-closed', () => {
    expect(yukkuriCharacterImagePath('tanunee', 'blink', false)).toBe(
      'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-blink-mouth-closed.png'
    );
  });
});

describe('buildYukkuriBroadcastSummary', () => {
  const baseInput = () => ({
    bundle: {
      capturedAt: 1700000000000,
      eventBanner: {
        rank: 2,
        score: 207835,
        title: 'クリエイターズギフトスタジオで使える！ギフトのモト争奪戦 2026年5月開催',
        iconUrl: 'x.jpg',
        ownerText: 'あかねこ。さんが参加しています！',
        href: ''
      },
      eventBalloon: { eventTotalScore: 207835, programTotalPoints: 1740 },
      contributionRanking: [
        { rank: 1, name: 'なぎ', contribution: 5000, isAnonymous: false, thumbnailUrl: '' },
        { rank: 2, name: 'マカロン⚔️♥️', contribution: 1505, isAnonymous: false, thumbnailUrl: '' },
        { rank: 3, name: 'おはぎ', contribution: 915, isAnonymous: false, thumbnailUrl: '' },
        { rank: 8, name: '名無し', contribution: 15, isAnonymous: true, thumbnailUrl: '' }
      ],
      programStats: {
        watchCount: 3266,
        commentCount: 1060,
        timeshiftReservationCount: 1,
        adPoints: 55800,
        giftPoints: 1770
      }
    },
    broadcastTitle: '浜松まつり꜀^. ̫.^꜆',
    broadcasterName: 'あかねこ。',
    recordedCommentCount: 156,
    streamAgeMin: 65
  });

  it('開幕でりんくがタイトルと配信者を読む', () => {
    const lines = buildYukkuriBroadcastSummary(baseInput());
    expect(lines[0].character).toBe('rinku');
    expect(lines[0].line).toContain('浜松まつり');
    expect(lines[0].line).toContain('あかねこ。');
  });

  it('5値があれば たぬ姉 が来場/コメ/配信時間を読む', () => {
    const lines = buildYukkuriBroadcastSummary(baseInput());
    const tanu = lines.find((l) => l.character === 'tanunee' && /来場/.test(l.line));
    expect(tanu).toBeDefined();
    expect(tanu.line).toContain('3,266 人');
    expect(tanu.line).toContain('1,060 件');
    expect(tanu.line).toContain('1時間5分');
  });

  it('捕捉率は こん太 が読む（30%以上はsmile・未満はhalf-eyes、語尾コンは使わない）', () => {
    const r1 = buildYukkuriBroadcastSummary({
      ...baseInput(),
      recordedCommentCount: 500
    });
    const k1 = r1.find((l) => l.character === 'konta' && /捕捉率/.test(l.line));
    expect(k1.expression).toBe('smile');
    expect(k1.line).toContain('47%');
    expect(k1.line).not.toMatch(/コン$|コン[！。]/);

    const r2 = buildYukkuriBroadcastSummary({
      ...baseInput(),
      recordedCommentCount: 156
    });
    const k2 = r2.find((l) => l.character === 'konta' && /捕捉率/.test(l.line));
    expect(k2.expression).toBe('half-eyes');
    expect(k2.line).toContain('15%');
    expect(k2.line).not.toMatch(/コン$|コン[！。…]/);
  });

  it('こん太のセリフは語尾「コン」を使わない', () => {
    const lines = buildYukkuriBroadcastSummary(baseInput());
    const kontaLines = lines.filter((l) => l.character === 'konta');
    for (const l of kontaLines) {
      expect(l.line).not.toMatch(/コン$|コン[！。…]/);
    }
  });

  it('イベント参加情報は たぬ姉', () => {
    const lines = buildYukkuriBroadcastSummary(baseInput());
    const ev = lines.find((l) => /イベント/.test(l.line));
    expect(ev).toBeDefined();
    expect(ev.character).toBe('tanunee');
    expect(ev.line).toContain('現在 2 位');
    expect(ev.line).toContain('207,835');
  });

  it('上位3位（匿名は飛ばし）を 3 キャラで回す', () => {
    const lines = buildYukkuriBroadcastSummary(baseInput());
    const topMentions = lines.filter((l) => /位/.test(l.line) && /貢/.test(l.line));
    expect(topMentions.length).toBe(3);
    expect(topMentions.map((l) => l.character)).toEqual(['rinku', 'konta', 'tanunee']);
    expect(topMentions[0].line).toContain('なぎ');
    expect(topMentions[0].line).toContain('5,000 貢');
  });

  it('締めは りんく の感謝', () => {
    const lines = buildYukkuriBroadcastSummary(baseInput());
    const last = lines[lines.length - 1];
    expect(last.character).toBe('rinku');
    expect(last.line).toContain('ありがとう');
  });

  it('bundle が無くても最低 1 行（開幕）は出す', () => {
    const lines = buildYukkuriBroadcastSummary({
      bundle: null,
      broadcastTitle: 'テスト'
    });
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0].character).toBe('rinku');
  });
});

describe('renderYukkuriBroadcastSummaryHtml', () => {
  it('section と各 line を出す（XSS 安全）', () => {
    const lines = [
      { character: 'rinku', expression: 'smile', mouthOpen: true, line: '<script>x</script>' }
    ];
    const html = renderYukkuriBroadcastSummaryHtml(lines, { heading: '振り返り' });
    expect(html).toContain('nl-yukkuri-summary');
    expect(html).toContain('振り返り');
    expect(html).toContain('link-yukkuri-smile-mouth-open.png');
    // XSS エスケープ
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('空配列なら空文字', () => {
    expect(renderYukkuriBroadcastSummaryHtml([])).toBe('');
  });
});
