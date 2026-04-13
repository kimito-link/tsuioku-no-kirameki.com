import { describe, it, expect } from 'vitest';
import {
  buildHtmlReportConceptGuideCardHtml,
  buildHtmlReportSaveGuideCardHtml
} from './htmlReportConceptGuide.js';

const avatars = {
  avatarLinkHtml: '<span data-test="link"></span>',
  avatarKontaHtml: '<span data-test="konta"></span>',
  avatarTanuHtml: '<span data-test="tanu"></span>'
};

describe('buildHtmlReportConceptGuideCardHtml', () => {
  it('決定名・nicolivelog識別子・応援の可視化・動員ちゃれんじリンクの文脈を含む', () => {
    const html = buildHtmlReportConceptGuideCardHtml(avatars);
    expect(html).toContain(
      'この拡張について（君斗りんくの追憶のきらめき）'
    );
    expect(html).toContain('君斗りんくの追憶のきらめき');
    expect(html).toContain('nicolivelog');
    expect(html).toContain('応援の可視化');
    expect(html).toContain('応援ログ');
    expect(html).toContain('動員ちゃれんじ');
    expect(html).toContain('doin-challenge.com');
    expect(html).toContain('リンク');
    expect(html).toContain('ライブ会場に来て');
    expect(html).toContain('nicodb.net');
  });

  it('続きを読むアコーディオンが4つ（本文は閉じた状態で折りたたみ）', () => {
    const html = buildHtmlReportConceptGuideCardHtml(avatars);
    expect(html).toContain('concept-read-more');
    expect(html).toContain('下の折りたたみ');
    const n = html.match(/続きを読む/g);
    expect(n?.length).toBe(4);
    expect(html).toContain('details class="concept-read-more"');
  });

  it('3 行のゆっくりガイドとアバタープレースホルダを出力する', () => {
    const html = buildHtmlReportConceptGuideCardHtml(avatars);
    expect(html).toContain('data-test="link"');
    expect(html).toContain('data-test="konta"');
    expect(html).toContain('data-test="tanu"');
    expect(html).toContain('ゆっくりりんく');
    expect(html).toContain('ゆっくりこん太');
    expect(html).toContain('ゆっくりたぬ姉');
    const rowMatches = html.match(/class="yukkuri-row/g);
    expect(rowMatches?.length).toBe(3);
  });

  it('こん太行は yukkuri-row--reverse である', () => {
    const html = buildHtmlReportConceptGuideCardHtml(avatars);
    expect(html).toContain('yukkuri-row--reverse');
    const kontaIdx = html.indexOf('data-test="konta"');
    const reverseIdx = html.indexOf('yukkuri-row--reverse');
    expect(kontaIdx).toBeGreaterThan(-1);
    expect(reverseIdx).toBeGreaterThan(-1);
    expect(reverseIdx).toBeLessThan(kontaIdx);
  });

  it('セマンティクス用クラスを維持する', () => {
    const html = buildHtmlReportConceptGuideCardHtml(avatars);
    expect(html).toContain('yukkuri-guide-card');
    expect(html).toContain('guide-lead');
    expect(html).toContain('speech-bubble');
  });
});

describe('buildHtmlReportSaveGuideCardHtml', () => {
  it('振り返り用メモと応援の痕跡のリードを含む', () => {
    const html = buildHtmlReportSaveGuideCardHtml(avatars);
    expect(html).toContain('なにこれ？（ゆっくりガイド）');
    expect(html).toContain('振り返り用メモ');
    expect(html).toContain('応援の痕跡');
  });

  it('既存の実用説明（概要・シェア・折りたたみ）を含む', () => {
    const html = buildHtmlReportSaveGuideCardHtml(avatars);
    expect(html).toContain('上の「概要」');
    expect(html).toContain('シェア・プレビュー向け');
    expect(html).toContain('折りたたみ');
  });

  it('こん太行は reverse である', () => {
    const html = buildHtmlReportSaveGuideCardHtml(avatars);
    expect(html).toContain('yukkuri-row--reverse');
  });
});
