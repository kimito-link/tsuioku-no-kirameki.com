import { describe, it, expect } from 'vitest';
import { ytWording, ytWordingPlatformFixed } from './ytWording.js';
import { STREAM_PLATFORMS } from '../platform/streamPlatform.js';

describe('ytWording', () => {
  it('rewrites the gift-contribution lane for YouTube top fans', () => {
    expect(ytWording('公式の貢献度ランキング（niconico の表示に準拠）')).toBe('YouTube 公式のトップファン（XP の順位）');
    expect(ytWording('ギフト貢献度')).toBe('トップファン');
    expect(ytWording('410貢')).toBe('410 XP');
    expect(ytWording('1,250 貢')).toBe('1,250 XP');
    expect(ytWording('ニコニコ公式のギフト貢献度ランキング（上位）を表示します。ギフトを投げた人がいない配信では空になります（広告ポイントとは別系統です）。')).toMatch(/^YouTube のトップファン/);
  });
  it('leaves other text alone', () => {
    expect(ytWording('ニコニコ大好き')).toBe('ニコニコ大好き');
    expect(ytWording('こんにちは')).toBe('こんにちは');
    expect(ytWording('')).toBe('');
  });
});

describe('ytWording のスパチャ合計順', () => {
  it('トップファンが無いときは XP でなく pt にする', async () => {
    const { ytWording } = await import('./ytWording.js');
    expect(ytWording('15800貢', { topFans: false })).toBe('15800 pt');
    expect(ytWording('ギフト貢献度', { topFans: false })).toBe('スパチャの合計順');
    expect(ytWording('15800貢')).toBe('15800 XP');
  });
});

describe('ytWordingTopFanToSuperChatRank', () => {
  it('トップファンの言葉をスパチャの合計順に戻す', async () => {
    const { ytWordingTopFanToSuperChatRank } = await import('./ytWording.js');
    expect(ytWordingTopFanToSuperChatRank('トップファン')).toBe('スパチャの合計順');
    expect(ytWordingTopFanToSuperChatRank('15800 XP')).toBe('15800 pt');
    expect(ytWordingTopFanToSuperChatRank('こんにちは')).toBe('こんにちは');
  });
});

describe('ytWordingSuperChatRankToTopFan', () => {
  it('スパチャの合計順の言葉をトップファンに戻す', async () => {
    const { ytWordingSuperChatRankToTopFan, ytWordingTopFanToSuperChatRank } = await import('./ytWording.js');
    expect(ytWordingSuperChatRankToTopFan('スパチャの合計順')).toBe('トップファン');
    expect(ytWordingSuperChatRankToTopFan('スーパーチャット・ギフトの合計の順位')).toBe('YouTube 公式のトップファン（XP の順位）');
    const long = 'YouTube のトップファン（チャットでの応援の XP の順位・上位）を表示します。チャット欄のトップファンの画面から読み取ります。';
    expect(ytWordingSuperChatRankToTopFan(ytWordingTopFanToSuperChatRank(long))).toBe(long);
    expect(ytWordingSuperChatRankToTopFan('こんにちは')).toBe('こんにちは');
  });
});

describe('niconico だけの文', () => {
  it('ニコ を含まなくても直す', async () => {
    const { ytWording } = await import('./ytWording.js');
    expect(ytWording('サムネ・名前は数値ID時のみ niconico ユーザーページへリンクします(共有モードでは非表示)。')).toBe('サムネ・名前は YouTube のチャンネルへリンクします(共有モードでは非表示)。');
  });
});

describe('ランキング欄の補足の「ニコ生」(2026-11-08 Kick 実測で title・aria-label に残っていた)', () => {
  it('どのサービスでも「ニコ生」を出さない', async () => {
    const { ytWording } = await import('./ytWording.js');
    for (const t of [
      'パーセントではありません。ニコ生側の一覧がDOMに出るまでの待機表示です。',
      'ニコ生プレイヤー表示の番組ギフト累計pt。下の一覧合計（履歴API）とは別指標です',
      'ニコ生 ランキング',
    ]) {
      expect(ytWording(t)).not.toContain('ニコ生');
      expect(ytWording(t, { topFans: false })).not.toContain('ニコ生');
    }
  });
});

describe('Twitch の画面の言葉(2026-11-07 実配信で残っていた文)', () => {
  const NICO_SENTENCE = 'ニコニコ公式のギフト貢献度ランキング（上位）を表示します。ギフトを投げた人がいない配信では空になります（広告ポイントとは別系統です）。';
  it('ニコ生の文 → 合計の順位の言葉 → Twitch の言葉', async () => {
    const { ytWording, ytWordingForTwitch } = await import('./ytWording.js');
    const out = ytWordingForTwitch(ytWording(NICO_SENTENCE, { topFans: false }));
    expect(out).not.toMatch(/スパチャ|スーパーチャット|トップファン|YouTube|XP/);
    expect(out).toContain('Bits・ギフトサブの合計の順位');
    expect(ytWordingForTwitch(ytWording('ギフト貢献度', { topFans: false }))).toBe('Bits の合計順');
    expect(ytWordingForTwitch(ytWording('410貢', { topFans: false }))).toBe('410 pt');
  });
  it('トップファンの言葉で描いたあと入れ替えた途中の文も直す', async () => {
    const { ytWordingTwitchFixed } = await import('./ytWording.js');
    const seen = [
      'Twitch のスパチャの合計順（チャットでの応援の XP の順位・上位）を表示します。チャット欄のトップファンの画面から読み取ります。',
      'スーパーチャット・ギフトの合計の順位（上位）を表示します。トップファンの順位が出ていない配信（アーカイブなど）で使います。',
      'YouTube のトップファン（チャットでの応援の XP の順位・上位）を表示します。チャット欄のトップファンの画面から読み取ります。',
    ];
    for (const t of seen) {
      const out = ytWordingTwitchFixed(t);
      expect(out).not.toMatch(/スパチャ|スーパーチャット|トップファン|YouTube|XP/);
    }
    expect(ytWordingTwitchFixed('スパチャの合計順')).toBe('Bits の合計順');
  });
  it('コメント本文の「スパチャ」単独は触らない', async () => {
    const { ytWordingTwitchFixed } = await import('./ytWording.js');
    expect(ytWordingTwitchFixed('スパチャありがとう')).toBe('スパチャありがとう');
  });
});

describe('Kick の画面の言葉', () => {
  const KICK = { name: 'Kick', paid: 'Kicks', rankSentence: 'Kicks・ギフトサブの合計の順位（上位）を表示します。このPCの記録から数えます。' };
  it('ランキング欄を Kick の言葉に', async () => {
    const { ytWording, ytWordingForPlatform, ytWordingPlatformFixed } = await import('./ytWording.js');
    expect(ytWordingForPlatform(ytWording('ギフト貢献度', { topFans: false }), KICK)).toBe('Kicks の合計順');
    const s = ytWordingForPlatform(ytWording('ニコニコ公式のギフト貢献度ランキング（上位）を表示します。ギフトを投げた人がいない配信では空になります（広告ポイントとは別系統です）。', { topFans: false }), KICK);
    expect(s).toBe(KICK.rankSentence);
    expect(ytWordingPlatformFixed('YouTube のトップファン（チャットでの応援の XP の順位・上位）を表示します。チャット欄のトップファンの画面から読み取ります。', KICK)).toBe(KICK.rankSentence);
    expect(ytWordingPlatformFixed('スパチャありがとう', KICK)).toBe('スパチャありがとう');
  });
});

describe('Kick の公式ランキングを出しているときの言葉', () => {
  const KICK = { name: 'Kick', paid: 'Kicks', rankSentence: 'Kicks・ギフトサブの合計の順位（上位）を表示します。このPCの記録から数えます。' };
  it('どの段階の言葉からでも公式の言葉になり、公式の順位表が無くなれば記録の言葉に戻る', async () => {
    const { ytWording, ytWordingPlatformOfficial, ytWordingPlatformFixed, officialWords } = await import('./ytWording.js');
    const off = officialWords(KICK);
    const nico = 'ニコニコ公式のギフト貢献度ランキング（上位）を表示します。ギフトを投げた人がいない配信では空になります（広告ポイントとは別系統です）。';
    expect(ytWordingPlatformOfficial(ytWording(nico, { topFans: true }), KICK)).toBe(off.sentence);
    expect(ytWordingPlatformOfficial(KICK.rankSentence, KICK)).toBe(off.sentence);
    expect(ytWordingPlatformOfficial(ytWording('公式の貢献度ランキング（niconico の表示に準拠）', { topFans: true }), KICK)).toBe(off.heading);
    expect(ytWordingPlatformOfficial('Kicks・ギフトサブの合計の順位', KICK)).toBe(off.heading);
    expect(ytWordingPlatformOfficial(ytWording('ギフト貢献度', { topFans: true }), KICK)).toBe('Kicks ランキング');
    expect(ytWordingPlatformOfficial(ytWording('9,502貢', { topFans: true }), KICK)).toBe('9,502 Kicks');
    // 2回掛けても壊れない・戻せる
    expect(ytWordingPlatformOfficial(off.sentence, KICK)).toBe(off.sentence);
    expect(ytWordingPlatformFixed(off.sentence, KICK)).toBe(KICK.rankSentence);
    expect(ytWordingPlatformFixed(off.heading, KICK)).toBe('Kicks・ギフトサブの合計の順位');
    expect(ytWordingPlatformOfficial('こんにちは', KICK)).toBe('こんにちは');
  });
});

describe('公式ランキングの期間・名前・数の区切り(2026-11-08 PC 実測)', () => {
  it('Kick は「歴代トップKICKユーザー」と同じ値と書く・大きい数は3桁ごとに区切る', async () => {
    const { ytWording, ytWordingPlatformOfficial, officialWords } = await import('./ytWording.js');
    const { STREAM_PLATFORMS } = await import('../platform/streamPlatform.js');
    const kick = STREAM_PLATFORMS.kick;
    expect(officialWords(kick).sentence).toContain('Kick のチャット欄のランキングの「歴代トップKICKユーザー」と同じ値です。');
    expect(officialWords(kick).heading).toBe('Kick 公式の Kicks ランキング（累計）');
    expect(ytWordingPlatformOfficial(ytWording('550000貢', { topFans: true }), kick)).toBe('550,000 Kicks');
  });
  it('Twitch はチャンネルごとの期間を見出しに出す・記録の言葉に戻せる', async () => {
    const { ytWording, ytWordingPlatformOfficial, ytWordingPlatformFixed, officialWords } = await import('./ytWording.js');
    const { STREAM_PLATFORMS } = await import('../platform/streamPlatform.js');
    const tw = { ...STREAM_PLATFORMS.twitch, boardPeriod: 'MONTH' };
    const off = officialWords(tw);
    expect(off.heading).toBe('Twitch 公式の Bits ランキング（今月）');
    expect(off.sentence).toContain('（今月・上位）');
    expect(STREAM_PLATFORMS.twitch.rankSentence).not.toContain('公式の応援ランキングが無い');
    const nico = 'ニコニコ公式のギフト貢献度ランキング（上位）を表示します。ギフトを投げた人がいない配信では空になります（広告ポイントとは別系統です）。';
    expect(ytWordingPlatformOfficial(ytWording(nico, { topFans: true }), tw)).toBe(off.sentence);
    expect(ytWordingPlatformFixed(off.heading, tw)).toBe('Bits・ギフトサブの合計の順位');
    expect(officialWords({ ...tw, boardPeriod: 'WEEK' }).heading).toBe('Twitch 公式の Bits ランキング（今週）');
    expect(officialWords({ ...tw, boardPeriod: '' }).heading).toBe('Twitch 公式の Bits ランキング（累計）');
  });
});

describe('折りたたみの中のニコ生だけの説明(2026-11-08 Twitch 実測)', () => {
  it('なふだ・ニコの匿名ID・ニコ生のページの通信を残さない', () => {
    expect(ytWording('詳細設定（記録のON/OFF・なふだ・取り込み・パネル位置・動き・表示トラブル）')).toBe(
      '詳細設定（記録のON/OFF・取り込み・パネル位置・動き・表示トラブル）',
    );
    expect(ytWording('上の「詳細設定（なふだ・取り込み・パネル位置）」を開いて')).toBe('上の「詳細設定（取り込み・パネル位置）」を開いて');
    expect(ytWording('こん太: 並びやすいよ。ニコの匿名ID（a: 形式）はここには載せず、りんく条件を満たすときだけりんく、それ以外はたぬ姉側だよ。')).toBe(
      'こん太: 並びやすいよ。',
    );
    expect(ytWording('ニコ生のページが読み取る通信から、拡張が')).toBe('配信のページが読み取る通信から、拡張が');
  });
});

describe('ふわっちの言葉', () => {
  it('サブスクが無いので「ギフトサブ」を書かない', () => {
    const p = STREAM_PLATFORMS.whowatch;
    expect(ytWordingPlatformFixed('スーパーチャット・ギフトの合計の順位', p)).toBe('アイテムの合計の順位');
    expect(ytWordingPlatformFixed('スーパーチャット・ギフトの合計の順位', STREAM_PLATFORMS.kick)).toBe('Kicks・ギフトサブの合計の順位');
  });
});

describe('ミクチャ・SHOWROOM の公式ランキングの単位と期間(2026-11-08 PC 実測)', () => {
  it('数は pt(「6,430 ギフト」にしない)・ミクチャは今月', async () => {
    const { ytWording, ytWordingPlatformOfficial, officialWords } = await import('./ytWording.js');
    const { STREAM_PLATFORMS } = await import('../platform/streamPlatform.js');
    const mx = { ...STREAM_PLATFORMS.mixch, boardPeriod: 'MONTH' };
    expect(ytWordingPlatformOfficial(ytWording('6,430貢', { topFans: true }), mx)).toBe('6,430 pt');
    expect(ytWordingPlatformOfficial(ytWording('6430貢', { topFans: true }), STREAM_PLATFORMS.showroom)).toBe('6,430 pt');
    expect(officialWords(mx).heading).toBe('ミクチャ 公式の ギフト ランキング（今月）');
    expect(officialWords(mx).sentence).toContain('今月・上位');
  });
});

describe('3段の案内と「該当者なし」の文にニコ生の数値ID・匿名(a:)の話を残さない(2026-11-12 ツイキャス実ページ)', async () => {
  const g = await import('../storyUserLaneGuideHtml.js');
  const htmls = [
    g.buildStoryUserLaneGuideTopHtml('x.png', 1),
    g.buildStoryUserLaneGuideGiftHtml('x.png', 1),
    g.buildStoryUserLaneGuideKontaHtml('x.png', 1),
    g.buildStoryUserLaneGuideTanuHtml('x.png', 1),
    g.buildStoryUserLaneEmptyNoteLinkHtml(),
    g.buildStoryUserLaneEmptyNoteGiftHtml(),
    g.buildStoryUserLaneEmptyNoteKontaHtml(),
    g.buildStoryUserLaneEmptyNoteTanuHtml(),
  ];
  it.each(htmls.map((h, i) => [i, h]))('文 %i', (_i, h) => {
    const out = ytWording(String(h));
    expect(out).not.toMatch(/数値|a:）|a: 形式|ニコ/);
    expect(out).toMatch(/段|列/);
  });
  it('コメント本文の「数値」は変えない', () => {
    expect(ytWording('数値が大きいね a:）')).toBe('数値が大きいね a:）');
  });
});
