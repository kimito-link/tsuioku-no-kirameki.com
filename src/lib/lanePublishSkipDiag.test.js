import { describe, it, expect } from 'vitest';
import { formatLanePublishSkipLine, LANE_PUBLISH_SOFT_WINDOW_SEC } from './lanePublishSkipDiag.js';

/**
 * 応援レーン鏡 publish 計器の表示テスト。
 *
 * ★この計器の目的は「件数を出す」ことではなく【次にどこを直すか名指しする】こと
 *   ([[instrument-must-name-the-cause-2026-08-01]])。
 *   打ち手が正反対に分かれる(content移設 vs 供給修正)ので、そこを取り違えない断言を置く。
 */

const NOW = 1_800_000_000_000;
const at = (secAgo) => NOW - secAgo * 1000;

describe('formatLanePublishSkipLine', () => {
  it('publish が新鮮で見送りゼロなら、原因を名指ししない', () => {
    const line = formatLanePublishSkipLine(
      { noEls: 0, entriesEmpty: 0, lastPublishAt: at(5) },
      NOW
    );
    expect(line).toContain('最終5秒前');
    expect(line).toContain('見送り(els無し0 / 供給空0)');
    expect(line).not.toContain('→');
    expect(line).not.toContain('⚠古い');
  });

  it('★els無しだけが伸びていたら「content へ移すのが有効」と名指しする', () => {
    const line = formatLanePublishSkipLine(
      { noEls: 12, entriesEmpty: 0, lastPublishAt: at(600) },
      NOW
    );
    expect(line).toContain('els無し12');
    expect(line).toContain('常駐側(content)へ書き手を移すのが有効');
    // 打ち手が正反対の方を出してはいけない
    expect(line).not.toContain('供給側を見る');
  });

  it('★供給空だけが伸びていたら「移しても直らない」と名指しする', () => {
    const line = formatLanePublishSkipLine(
      { noEls: 0, entriesEmpty: 7, lastPublishAt: at(600) },
      NOW
    );
    expect(line).toContain('供給空7');
    expect(line).toContain('書き手を移しても直らない');
    expect(line).not.toContain('常駐側(content)へ書き手を移すのが有効');
  });

  it('両方伸びていたら「多い方から」と言う', () => {
    const line = formatLanePublishSkipLine(
      { noEls: 3, entriesEmpty: 9, lastPublishAt: at(10) },
      NOW
    );
    expect(line).toContain('両方あり');
  });

  it('★見送り0なのに鏡が古いなら「会場側の読み取りを疑う」と言う', () => {
    // この分岐が今回いちばん重要: 「①は動いているのに会場が古い」= 移設しても無意味
    const line = formatLanePublishSkipLine(
      { noEls: 0, entriesEmpty: 0, lastPublishAt: at(656) },
      NOW
    );
    expect(line).toContain('⚠古い');
    expect(line).toContain('会場側の読み取りを疑う');
    expect(line).not.toContain('content');
  });

  it(`SOFT窓(${LANE_PUBLISH_SOFT_WINDOW_SEC}秒)の内外で ⚠古い が切り替わる`, () => {
    const inside = formatLanePublishSkipLine(
      { noEls: 0, entriesEmpty: 0, lastPublishAt: at(LANE_PUBLISH_SOFT_WINDOW_SEC) },
      NOW
    );
    const outside = formatLanePublishSkipLine(
      { noEls: 0, entriesEmpty: 0, lastPublishAt: at(LANE_PUBLISH_SOFT_WINDOW_SEC + 1) },
      NOW
    );
    expect(inside).not.toContain('⚠古い');
    expect(outside).toContain('⚠古い');
  });

  it('一度も publish していなければ「一度も無し」', () => {
    const line = formatLanePublishSkipLine({ noEls: 0, entriesEmpty: 0, lastPublishAt: 0 }, NOW);
    expect(line).toContain('一度も無し');
    // 未publish を「古い」と誤って警告しない(起動直後の誤報を作らない)
    expect(line).not.toContain('⚠古い');
  });

  it('state が無い/壊れていても落ちない', () => {
    expect(formatLanePublishSkipLine(null, NOW)).toBe('');
    expect(formatLanePublishSkipLine(undefined, NOW)).toBe('');
    // @ts-expect-error 異常系
    expect(() => formatLanePublishSkipLine({ noEls: 'x', entriesEmpty: null }, NOW)).not.toThrow();
  });
});
