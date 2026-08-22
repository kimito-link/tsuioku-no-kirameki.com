import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  LP_CONTENT_STALE_VERSIONS,
  versionDistance,
  extractBodyVersions,
  judgeLpContentStaleness,
  formatLpStalenessLine
} from './lpContentStaleness.js';

const ROOT = path.resolve(__dirname, '../..');

describe('versionDistance', () => {
  it('同じ体系なら patch 差を返す', () => {
    expect(versionDistance('0.1.1237', '0.1.1479')).toBe(242);
  });

  it('★major/minor が違えば測れない(null)＝0にしない', () => {
    expect(versionDistance('0.2.1', '0.1.1479')).toBeNull();
    expect(versionDistance('1.1.1', '0.1.1479')).toBeNull();
  });

  it('★壊れた入力を0にしない', () => {
    expect(versionDistance('', '0.1.1')).toBeNull();
    expect(versionDistance('abc', '0.1.1')).toBeNull();
  });
});

describe('extractBodyVersions', () => {
  it('本文の（v0.1.x）を拾う', () => {
    expect(extractBodyVersions('<p>あ（v0.1.1237）い</p>')).toEqual(['0.1.1237']);
  });

  it('★範囲表記（v0.1.1232〜1237）は後半も拾う', () => {
    expect(extractBodyVersions('（v0.1.1232〜1237）')).toEqual(['0.1.1232', '0.1.1237']);
  });

  it('★メタ情報の版数は拾わない(全角カッコでないため)', () => {
    // ★ここが要。拾ってしまうとこの検査は恒真になって死ぬ。
    const meta = '<meta name="x" content="0.1.1479"><script>{"softwareVersion":"0.1.1479"}</script>';
    expect(extractBodyVersions(meta)).toEqual([]);
  });

  it('★meta description の【全角カッコ】の版も拾わない(実際に踏んだ)', () => {
    // 2026-08-23: meta description は「〜（v0.1.1479）。」と全角カッコで版を書いている。
    // ★verify-bump [6] が毎版書き換えるので、拾うとこの検査は恒真になって死ぬ。
    // ★実際に一度そうなり「0版前」と出た。本文は1479を1つも持っていなかった。
    const meta = String.raw`<meta name="description" content="…備えた Chrome 拡張（v0.1.1479）。">`;
    expect(extractBodyVersions(meta)).toEqual([]);
  });

  it('★JSON-LD の中の版も拾わない', () => {
    const ld = String.raw`<script type="application/ld+json">{"softwareVersion":"0.1.1479"}</script>`;
    expect(extractBodyVersions(ld)).toEqual([]);
  });

  it('★フッターの「追憶のきらめき v0.1.1479」も拾わない', () => {
    expect(extractBodyVersions('<div>追憶のきらめき v0.1.1479 ― Kimito-Link</div>')).toEqual([]);
  });
});

describe('judgeLpContentStaleness', () => {
  it('★実際に起きた退化(本文1237 / 現在1479)を stale と言える', () => {
    const v = judgeLpContentStaleness({
      html: '<p>会場（v0.1.1232〜1237）</p>',
      currentVersion: '0.1.1479'
    });
    expect(v.state).toBe('stale');
    expect(v.behind).toBe(242);
    expect(v.newestInBody).toBe('0.1.1237');
  });

  it('直近に載せていれば fresh', () => {
    const v = judgeLpContentStaleness({
      html: '<p>なふだ（v0.1.1477〜1478）</p>',
      currentVersion: '0.1.1479'
    });
    expect(v.state).toBe('fresh');
    expect(v.behind).toBe(1);
  });

  it('★境界: ちょうど閾値なら fresh、超えたら stale', () => {
    const at = judgeLpContentStaleness({
      html: `<p>（v0.1.${1479 - LP_CONTENT_STALE_VERSIONS}）</p>`,
      currentVersion: '0.1.1479'
    });
    expect(at.state).toBe('fresh');

    const over = judgeLpContentStaleness({
      html: `<p>（v0.1.${1479 - LP_CONTENT_STALE_VERSIONS - 1}）</p>`,
      currentVersion: '0.1.1479'
    });
    expect(over.state).toBe('stale');
  });

  it('★本文に版表記が1つも無いとき「新しい」と言わない(unknown)', () => {
    const v = judgeLpContentStaleness({ html: '<p>版の表記なし</p>', currentVersion: '0.1.1479' });
    expect(v.state).toBe('unknown');
    expect(v.behind).toBeNull();
  });

  it('★現在の版が分からないとき「新しい」と言わない(unknown)', () => {
    const v = judgeLpContentStaleness({ html: '<p>（v0.1.1478）</p>', currentVersion: '' });
    expect(v.state).toBe('unknown');
  });

  it('★体系が違う版しか無いとき「新しい」と言わない(unknown)', () => {
    const v = judgeLpContentStaleness({ html: '<p>（v0.2.5）</p>', currentVersion: '0.1.1479' });
    expect(v.state).toBe('unknown');
  });

  it('★null/undefined を0にしない', () => {
    expect(judgeLpContentStaleness(/** @type {any} */ (null)).state).toBe('unknown');
    expect(judgeLpContentStaleness({ html: '', currentVersion: '' }).state).toBe('unknown');
  });
});

describe('formatLpStalenessLine', () => {
  it('★staleでも「強制しない」と明言する', () => {
    const line = formatLpStalenessLine(
      judgeLpContentStaleness({ html: '<p>（v0.1.1237）</p>', currentVersion: '0.1.1479' })
    );
    expect(line).toContain('242');
    expect(line).toContain('強制しません');
  });

  it('unknown を ✅ にしない', () => {
    const line = formatLpStalenessLine(
      judgeLpContentStaleness({ html: '<p>なし</p>', currentVersion: '0.1.1479' })
    );
    expect(line).not.toContain('✅');
    expect(line).toContain('判定できませんでした');
  });
});

describe('★実物のLPで判定する(通し検査)', () => {
  it('いまのLPは fresh である', () => {
    const html = readFileSync(path.join(ROOT, 'tsuioku-no-kirameki/index.html'), 'utf8');
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const v = judgeLpContentStaleness({ html, currentVersion: pkg.version });
    // ★もし将来また放置されたら、ここが赤くなって気づける
    expect(v.state).toBe('fresh');
  });

  it('★今日の4件が実際にLPに載っている(数で固定)', () => {
    const html = readFileSync(path.join(ROOT, 'tsuioku-no-kirameki/index.html'), 'utf8');
    // ★実名で固定する。消したら赤くなる。
    expect(html).toContain('lp-nameplate-block');
    expect(html).toContain('lp-fix-1473');
    expect(html).toContain('lp-fix-1475');
  });

  it('★なふだの説明が「放送者さんだけ」と言っている(誤った説明への退化を止める)', () => {
    const html = readFileSync(path.join(ROOT, 'tsuioku-no-kirameki/index.html'), 'utf8');
    const i = html.indexOf('lp-nameplate-block');
    expect(i).toBeGreaterThan(-1);
    const near = html.slice(i, i + 900);
    // ★ユーザーの指摘: 公式機能の説明でなく「この拡張で何が起きるか」を書く
    expect(near).toContain('放送者さんだけ');
    expect(near).toContain('ほかの視聴者さんには見えません');
  });
});
