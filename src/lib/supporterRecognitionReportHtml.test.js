import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { buildSupporterRecognitionReportHtml } from './supporterRecognitionReportHtml.js';

/**
 * @param {string} html
 */
function parseDocument(html) {
  const window = new Window();
  window.document.write(html);
  window.document.close();
  return window.document;
}

describe('buildSupporterRecognitionReportHtml', () => {
  it('standalone HTML とランキングを出力する', () => {
    const html = buildSupporterRecognitionReportHtml(
      [
        {
          userKey: 'u2',
          displayName: '二番手さん',
          score: 14,
          breakdown: { commentCount: 11, giftPoints: 3 },
          rank: 2,
          isAnonymous: false,
          highlights: ['連投コメントで空気を温めてくれました。']
        },
        {
          userKey: 'u1',
          displayName: 'トップさん',
          score: 21,
          breakdown: { commentCount: 17, giftPoints: 4 },
          rank: 1,
          isAnonymous: false,
          highlights: ['配信の山場で背中を押してくれました。']
        }
      ],
      {
        liveId: 'lv123',
        programTitle: 'テスト番組',
        broadcasterName: '君斗りんく',
        generatedAt: Date.UTC(2026, 4, 17, 3, 45, 0)
      }
    );

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('standalone HTML');
    expect(html).toContain('完全ローカル保存');
    expect(html).toContain('外部送信なし');

    const document = parseDocument(html);
    const title = document.querySelector('title');
    const cards = [...document.querySelectorAll('.supporter-card')];

    expect(title?.textContent).toContain('テスト番組');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('トップさん');
    expect(cards[0].textContent).toContain('応援スコア');
    expect(cards[0].textContent).toContain('comment Count');
    expect(cards[1].textContent).toContain('二番手さん');
  });

  it('空配列でも standalone HTML と空状態を返す', () => {
    const html = buildSupporterRecognitionReportHtml([], {
      programTitle: '空配信'
    });

    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('今回はまだ表彰カードがありません');
    expect(html).toContain('匿名のひとことも含めて');

    const document = parseDocument(html);
    expect(document.querySelectorAll('.supporter-card')).toHaveLength(0);
    expect(document.querySelector('.empty-state h3')?.textContent).toContain(
      '今回はまだ表彰カードがありません'
    );
  });

  it('匿名だけの入力でも、たぬ姉案内と匿名 badge を維持する', () => {
    const html = buildSupporterRecognitionReportHtml([
      {
        userKey: 'a:anon',
        displayName: '184 さん',
        score: 9,
        breakdown: { commentCount: 9 },
        rank: 1,
        isAnonymous: true,
        highlights: ['ひっそり続けてくれたコメントが流れを支えました。']
      }
    ]);

    const document = parseDocument(html);
    const card = document.querySelector('.supporter-card--anonymous');

    expect(card?.textContent).toContain('184 さん');
    expect(card?.textContent).toContain('匿名も記録');
    expect(card?.textContent).toContain('匿名の応援も埋もれさせず');
    expect(html).toContain('たぬ姉');
  });

  it('displayName と highlights と meta を HTML エスケープする', () => {
    const html = buildSupporterRecognitionReportHtml(
      [
        {
          userKey: 'u<script>',
          displayName: '<img src=x onerror=alert(1)>',
          score: 4,
          breakdown: { commentCount: 4 },
          rank: 1,
          isAnonymous: false,
          highlights: ['<b>山場</b> を支えました & "ありがとう"']
        }
      ],
      {
        programTitle: '<script>alert(1)</script>',
        broadcasterName: '"配信者"',
        liveId: '<lv>'
      }
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<b>山場</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;b&gt;山場&lt;/b&gt; を支えました &amp; &quot;ありがとう&quot;');
  });

  it('highlights を称賛文として複数行反映する', () => {
    const html = buildSupporterRecognitionReportHtml([
      {
        userKey: 'u7',
        displayName: '褒めたい人',
        score: 12,
        breakdown: { commentCount: 8, giftPoints: 4 },
        rank: 1,
        isAnonymous: false,
        highlights: [
          '開幕のひとことで場をあたためてくれました。',
          'ギフトで節目を押し上げてくれました。'
        ]
      }
    ]);

    const document = parseDocument(html);
    const highlights = [...document.querySelectorAll('.supporter-card__highlight')].map((node) =>
      node.textContent?.trim()
    );

    expect(highlights).toContain('開幕のひとことで場をあたためてくれました。');
    expect(highlights).toContain('ギフトで節目を押し上げてくれました。');
    expect(document.querySelector('.ranking-card__head')?.textContent).toContain(
      'highlights をそのまま称賛文'
    );
  });
});
