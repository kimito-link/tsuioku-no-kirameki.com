import { describe, expect, it } from 'vitest';
import {
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
});
