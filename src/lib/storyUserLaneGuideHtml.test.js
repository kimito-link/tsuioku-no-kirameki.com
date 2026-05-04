import { describe, expect, it } from 'vitest';
import {
  buildStoryUserLaneEmptyNoteKontaHtml,
  buildStoryUserLaneEmptyNoteLinkHtml,
  buildStoryUserLaneEmptyNoteTanuHtml,
  buildStoryUserLaneGuideFootAndRecordedHtml,
  buildStoryUserLaneGuideFootHtml,
  buildStoryUserLaneGuideKontaHtml,
  buildStoryUserLaneGuideTanuHtml,
  buildStoryUserLaneGuideTopHtml
} from './storyUserLaneGuideHtml.js';

const FACE_LINK = 'https://example.test/link.png';
const FACE_KONTA = 'https://example.test/konta.png';
const FACE_TANU = 'https://example.test/tanu.png';

describe('storyUserLaneGuideHtml', () => {
  it('Top / Konta / Tanu を別 HTML に分離し、本文に XSS 用記号を含めない', () => {
    const top = buildStoryUserLaneGuideTopHtml(FACE_LINK);
    const konta = buildStoryUserLaneGuideKontaHtml(FACE_KONTA);
    const tanu = buildStoryUserLaneGuideTanuHtml(FACE_TANU);
    expect(top).toContain('りんく:');
    expect(top).not.toContain('こん太:');
    expect(top).not.toContain('たぬ姉:');
    expect(konta).toContain('こん太:');
    expect(konta).toContain('数値ID');
    expect(konta).toContain('a: 形式');
    expect(konta).not.toContain('りんく:');
    expect(konta).not.toContain('たぬ姉:');
    expect(tanu).toContain('たぬ姉:');
    expect(tanu).toContain('詳しい状況（開発・切り分け用）');
    expect(tanu).not.toContain('こん太:');
    expect(top + konta + tanu).not.toMatch(/<script/i);
    expect(top).toMatch(/src="https:\/\/example\.test\/link\.png"/);
  });

  it('face URL の属性値をエスケープする', () => {
    const evil = 'https://x.test/a.png" onload="alert(1)';
    const html = buildStoryUserLaneGuideTopHtml(evil);
    expect(html).toContain('&quot;');
    expect(html).not.toMatch(/\s+onload\s*=\s*"/);
  });

  it('フットのみの HTML にキャラ行が含まれない', () => {
    const foot = buildStoryUserLaneGuideFootHtml(3);
    expect(foot).toContain('いま 3 件を表示中');
    expect(foot).not.toContain('こん太:');
    expect(foot).not.toContain('たぬ姉:');
    expect(foot).toContain('nl-story-userlane-guide__foot');
  });

  it('フット＋記録件数は第2文でコメント総数とレーン枠の違いを説明する', () => {
    const html = buildStoryUserLaneGuideFootAndRecordedHtml(34, 220);
    expect(html).toContain('いま 34 件を表示中');
    expect(html).toContain('<strong>220</strong>');
    expect(html).toContain('nl-story-userlane-guide__recorded');
    expect(html).toContain('数え方が異なります');
    expect(html).not.toMatch(/<script/i);
  });

  it('記録件数が未指定・0 以下なら第2文なし', () => {
    expect(buildStoryUserLaneGuideFootAndRecordedHtml(3, undefined)).toBe(
      buildStoryUserLaneGuideFootHtml(3)
    );
    expect(buildStoryUserLaneGuideFootAndRecordedHtml(3, 0)).toBe(
      buildStoryUserLaneGuideFootHtml(3)
    );
    expect(buildStoryUserLaneGuideFootAndRecordedHtml(3, -2)).toBe(
      buildStoryUserLaneGuideFootHtml(3)
    );
  });

  it('空段ノートは段ごとに別文面で、増える一文は共通', () => {
    const link = buildStoryUserLaneEmptyNoteLinkHtml();
    const konta = buildStoryUserLaneEmptyNoteKontaHtml();
    const tanu = buildStoryUserLaneEmptyNoteTanuHtml();
    expect(link).toContain('数値ユーザーID＋個人サムネ');
    expect(konta).toContain('表示名か個人サムネのどちらかまで取れた');
    expect(tanu).toContain('匿名（a:）');
    expect(link).not.toContain('こん太:');
    expect(konta).not.toContain('りんく');
    const common = '条件を満たす応援が届くと自動で増えます。';
    expect(link).toContain(common);
    expect(konta).toContain(common);
    expect(tanu).toContain(common);
    expect(link + konta + tanu).not.toMatch(/<script/i);
  });
});
