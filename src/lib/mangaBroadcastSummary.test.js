import { describe, it, expect } from 'vitest';
import {
  buildMangaBroadcastPanels,
  renderMangaBroadcastPanelsHtml,
  mangaBroadcastSummaryEmbeddedCss,
  listMangaCharacterImagePaths
} from './mangaBroadcastSummary.js';

const sampleInput = () => ({
  bundle: {
    capturedAt: 1700000000000,
    eventBanner: {
      rank: 2,
      score: 207835,
      title: 'クリエイターズギフトスタジオで使える！ギフトのモト争奪戦 2026年5月開催',
      iconUrl: '',
      ownerText: '',
      href: ''
    },
    eventBalloon: { eventTotalScore: 210000, programTotalPoints: 1740 },
    contributionRanking: [
      { rank: 1, name: 'なぎ', contribution: 5000, isAnonymous: false, thumbnailUrl: '' },
      { rank: 2, name: 'マカロン', contribution: 1505, isAnonymous: false, thumbnailUrl: '' },
      { rank: 3, name: 'おはぎ', contribution: 915, isAnonymous: false, thumbnailUrl: '' }
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

describe('buildMangaBroadcastPanels', () => {
  it('6 種のシーン（opening/numbers/capture/event/top-fans/closing）が並ぶ', () => {
    const panels = buildMangaBroadcastPanels(sampleInput());
    const sceneIds = panels.map((p) => p.sceneId);
    expect(sceneIds).toContain('opening');
    expect(sceneIds).toContain('numbers');
    expect(sceneIds).toContain('capture');
    expect(sceneIds).toContain('event');
    expect(sceneIds).toContain('top-fans');
    expect(sceneIds).toContain('closing');
  });

  it('opening は番組タイトル＋配信者名を含み、りんくが大顔', () => {
    const panels = buildMangaBroadcastPanels(sampleInput());
    const opening = panels.find((p) => p.sceneId === 'opening');
    expect(opening.dialogues[0].character).toBe('rinku');
    expect(opening.dialogues[0].size).toBe('big');
    expect(opening.dialogues[0].line).toContain('浜松まつり');
    expect(opening.dialogues[0].line).toContain('あかねこ。');
    expect(opening.bg).toBe('rinku');
    expect(opening.onomatopoeia).toBeTruthy();
  });

  it('numbers は たぬ姉、来場者数を highlight に出す', () => {
    const panels = buildMangaBroadcastPanels(sampleInput());
    const numbers = panels.find((p) => p.sceneId === 'numbers');
    expect(numbers.dialogues[0].character).toBe('tanunee');
    expect(numbers.highlight).not.toBeNull();
    expect(numbers.highlight.value).toContain('3,266');
    expect(numbers.highlight.label).toBe('来場者数');
  });

  it('capture は こん太、捕捉率を highlight に出す（30%↑は smile + パチパチ）', () => {
    const panels = buildMangaBroadcastPanels({
      ...sampleInput(),
      recordedCommentCount: 500
    });
    const cap = panels.find((p) => p.sceneId === 'capture');
    expect(cap.dialogues[0].character).toBe('konta');
    expect(cap.dialogues[0].expression).toBe('smile');
    expect(cap.bg).toBe('gold');
    expect(cap.onomatopoeia).toContain('パチパチ');
    expect(cap.highlight.value).toContain('%');
    // こん太は語尾「コン」を使わない
    expect(cap.dialogues[0].line).not.toMatch(/コン$|コン[！。…]/);
  });

  it('capture 30%↓は half-eyes + しゅん背景konta', () => {
    const panels = buildMangaBroadcastPanels({
      ...sampleInput(),
      recordedCommentCount: 100
    });
    const cap = panels.find((p) => p.sceneId === 'capture');
    expect(cap.dialogues[0].expression).toBe('half-eyes');
    expect(cap.bg).toBe('konta');
    expect(cap.onomatopoeia).toContain('しゅん');
  });

  it('event は たぬ姉、順位を highlight、bg は gold で キラキラ', () => {
    const panels = buildMangaBroadcastPanels(sampleInput());
    const ev = panels.find((p) => p.sceneId === 'event');
    expect(ev.dialogues[0].character).toBe('tanunee');
    expect(ev.bg).toBe('gold');
    expect(ev.onomatopoeia).toContain('キラキラ');
    expect(ev.highlight.value).toContain('2');
    expect(ev.highlight.label).toContain('順位');
  });

  it('broadcasterUserId を渡すと opening の配信者名が user リンク（lineHtml）になる', () => {
    const panels = buildMangaBroadcastPanels({
      ...sampleInput(),
      broadcasterUserId: '142919600'
    });
    const opening = panels.find((p) => p.sceneId === 'opening');
    expect(opening.dialogues[0].lineHtml).toContain(
      'https://www.nicovideo.jp/user/142919600'
    );
    expect(opening.dialogues[0].lineHtml).toContain('あかねこ。');
  });

  it('貢献者に userId があると top-fans の名前が user リンク（lineHtml）になる', () => {
    const input = sampleInput();
    input.bundle.contributionRanking[0] = {
      ...input.bundle.contributionRanking[0],
      userId: '6329015'
    };
    const panels = buildMangaBroadcastPanels(input);
    const fans = panels.find((p) => p.sceneId === 'top-fans');
    expect(fans.dialogues[0].lineHtml).toContain(
      'https://www.nicovideo.jp/user/6329015'
    );
    expect(fans.dialogues[0].lineHtml).toContain('なぎ');
    expect(fans.dialogues[1].lineHtml).toBeUndefined();
  });

  it('top-fans は 3 人会話で 1〜3 位を順に紹介、1位を highlight', () => {
    const panels = buildMangaBroadcastPanels(sampleInput());
    const fans = panels.find((p) => p.sceneId === 'top-fans');
    expect(fans.dialogues.length).toBe(3);
    expect(fans.dialogues[0].character).toBe('rinku');
    expect(fans.dialogues[1].character).toBe('konta');
    expect(fans.dialogues[2].character).toBe('tanunee');
    expect(fans.highlight.value).toContain('なぎ');
    expect(fans.highlight.label).toContain('5,000');
    expect(fans.bg).toBe('pink');
  });

  it('closing は りんく、お辞儀（mouth-closed smile）+ ぺこり', () => {
    const panels = buildMangaBroadcastPanels(sampleInput());
    const cl = panels.find((p) => p.sceneId === 'closing');
    expect(cl.dialogues[0].character).toBe('rinku');
    expect(cl.dialogues[0].expression).toBe('smile');
    expect(cl.dialogues[0].mouthOpen).toBe(false);
    expect(cl.onomatopoeia).toContain('ぺこ');
  });

  it('bundle が空でも opening / closing は出る（最低限のおさらいになる）', () => {
    const panels = buildMangaBroadcastPanels({ bundle: null, broadcastTitle: 'テスト' });
    const ids = panels.map((p) => p.sceneId);
    expect(ids).toContain('opening');
    expect(ids).toContain('closing');
  });
});

describe('renderMangaBroadcastPanelsHtml', () => {
  it('section と各 panel を出し、XSS 安全', () => {
    const html = renderMangaBroadcastPanelsHtml(
      [
        {
          sceneId: 'opening',
          caption: '<script>x</script>',
          bg: 'rinku',
          dialogues: [
            { character: 'rinku', expression: 'smile', mouthOpen: true, size: 'big', line: '<b>x</b>' }
          ],
          highlight: { value: '<i>1</i>', label: '<i>title</i>' },
          onomatopoeia: '<svg/>'
        }
      ],
      { heading: '振り返り' }
    );
    expect(html).toContain('nl-manga-summary');
    expect(html).toContain('振り返り');
    expect(html).toContain('nl-manga-panel--bg-rinku');
    expect(html).toContain('nl-manga-panel--scene-opening');
    expect(html).not.toContain('<script>x</script>');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('imageDataUrlMap を渡すと img.src が data URL に置き換わる', () => {
    const html = renderMangaBroadcastPanelsHtml(
      [
        {
          sceneId: 'opening',
          caption: 'cap',
          bg: 'rinku',
          dialogues: [
            { character: 'rinku', expression: 'smile', mouthOpen: true, size: 'big', line: 'hi' }
          ],
          highlight: null,
          onomatopoeia: null
        }
      ],
      {
        imageDataUrlMap: {
          'images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.png':
            'data:image/png;base64,XXX'
        }
      }
    );
    expect(html).toContain('data:image/png;base64,XXX');
    expect(html).not.toContain('link-yukkuri-smile-mouth-open.png');
  });

  it('空配列なら空文字', () => {
    expect(renderMangaBroadcastPanelsHtml([])).toBe('');
  });
});

describe('mangaBroadcastSummaryEmbeddedCss', () => {
  it('clamp() ベースのレスポンシブ指定が含まれる', () => {
    const css = mangaBroadcastSummaryEmbeddedCss();
    // clamp による顔サイズ指定
    expect(css).toMatch(/clamp\(64px,18vw,96px\)/);
    expect(css).toMatch(/clamp\(54px,14vw,72px\)/);
    expect(css).toMatch(/clamp\(44px,11vw,56px\)/);
    // 1col → 2col の breakpoint（container query + viewport の二段構え）
    expect(css).toMatch(/@container.*min-width: 720px/);
    expect(css).toMatch(/@media\(min-width:760px\)/);
    // overflow-wrap で長文の行間崩れ回避
    expect(css).toContain('overflow-wrap:anywhere');
    // prefers-reduced-motion
    expect(css).toContain('prefers-reduced-motion');
  });
});

describe('listMangaCharacterImagePaths', () => {
  it('24 種前後のキャラ画像パスを返す', () => {
    const paths = listMangaCharacterImagePaths();
    expect(paths.length).toBeGreaterThan(20);
    expect(paths.length).toBeLessThanOrEqual(30);
  });
});
