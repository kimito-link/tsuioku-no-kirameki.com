import { describe, expect, it } from 'vitest';
import {
  NICOLIVE_RANKING_URL,
  extractEmbeddedData,
  listRankingPrograms,
  pickProgramForCheck,
  watchUrlFor
} from './nicoliveRankingPick.js';

/**
 * ★この検査が守っているのは「配信を選べること」ではなく
 *   【検証に使えない配信を掴まないこと】。
 *   コメントの流れていない配信を選ぶと、レーンが空のままで
 *   「描画されない」のか「そもそも来ていない」のか区別できなくなる
 *   = 測っているつもりで何も測れない [[zero-count-may-mean-unmeasured-2026-08-04]]
 */

/** ★実際に live.nicovideo.jp/ranking から観測した形をそのまま使う(想像した形で検査しない)。 */
const seed = (v) => ({ type: 'seed', value: v });
const prog = (o) => seed({
  nicoliveProgramId: o.lv,
  title: o.title ?? 'タイトル',
  status: o.status ?? 'ON_AIR',
  providerType: o.providerType ?? 'community',
  isSensitive: o.isSensitive ?? false,
  isFollowerOnly: o.isFollowerOnly ?? false,
  nicoad: { totalPoint: o.adPt ?? 0 },
  statistics: { watchCount: o.watch ?? 0, commentCount: o.comment ?? 0 }
});

describe('extractEmbeddedData — HTMLの見た目に依存しない', () => {
  it('embedded-data の data-props を取り出す(実物と同じエスケープ)', () => {
    const html = '<html><script id="embedded-data" data-props="{&quot;ranking&quot;:{&quot;userPrograms&quot;:[]}}"></script></html>';
    expect(extractEmbeddedData(html)).toEqual({ ranking: { userPrograms: [] } });
  });

  it('★取れないときは null(でっち上げない)', () => {
    expect(extractEmbeddedData('<html>no data</html>')).toBeNull();
    expect(extractEmbeddedData('')).toBeNull();
    expect(extractEmbeddedData(null)).toBeNull();
  });

  it('★壊れたJSONでも落ちず null', () => {
    const html = '<script id="embedded-data" data-props="{broken"></script>';
    expect(() => extractEmbeddedData(html)).not.toThrow();
    expect(extractEmbeddedData(html)).toBeNull();
  });
});

describe('listRankingPrograms — 実物の包み {type,value} を解く', () => {
  const data = { ranking: { userPrograms: [prog({ lv: 'lv111', comment: 500, watch: 20, adPt: 900 })] } };

  it('配信を正規化して返す', () => {
    expect(listRankingPrograms(data)[0]).toEqual({
      lv: 'lv111', title: 'タイトル', status: 'ON_AIR',
      watchCount: 20, commentCount: 500, adPoints: 900,
      providerType: 'community', isSensitive: false, isFollowerOnly: false
    });
  });

  it('★既定では公式/チャンネルを混ぜない(ユーザー配信の検証が目的)', () => {
    const d = { ranking: { userPrograms: [prog({ lv: 'lv1' })], officialAndChannelPrograms: [prog({ lv: 'lv2' })] } };
    expect(listRankingPrograms(d).map((p) => p.lv)).toEqual(['lv1']);
    expect(listRankingPrograms(d, { includeOfficial: true }).map((p) => p.lv)).toEqual(['lv1', 'lv2']);
  });

  it('★不正な配信IDは捨てる', () => {
    const d = { ranking: { userPrograms: [prog({ lv: 'abc' }), prog({ lv: 'lv9' })] } };
    expect(listRankingPrograms(d).map((p) => p.lv)).toEqual(['lv9']);
  });

  it('★統計が無い配信は 0 でなく null(未観測と0を混同しない)', () => {
    const d = { ranking: { userPrograms: [seed({ nicoliveProgramId: 'lv5', status: 'ON_AIR' })] } };
    const p = listRankingPrograms(d)[0];
    expect(p.commentCount).toBeNull();
    expect(p.watchCount).toBeNull();
  });

  it('壊れた入力でも落ちない', () => {
    expect(() => listRankingPrograms(null)).not.toThrow();
    expect(listRankingPrograms({})).toEqual([]);
    expect(listRankingPrograms({ ranking: { userPrograms: 'x' } })).toEqual([]);
  });
});

describe('pickProgramForCheck — 検証に使える配信だけ選ぶ', () => {
  const many = listRankingPrograms({ ranking: { userPrograms: [
    prog({ lv: 'lv100', comment: 5000, watch: 500 }),
    prog({ lv: 'lv200', comment: 3000, watch: 900 }),
    prog({ lv: 'lv300', comment: 10, watch: 5 })
  ] } });

  it('いちばん賑わっている配信を選ぶ', () => {
    const r = pickProgramForCheck(many);
    expect(r.program.lv).toBe('lv100');
    expect(r.reason).toBe('ok');
    expect(r.candidates).toBe(2); // lv300 はコメント不足で除外
  });

  it('★コメントが流れていない配信は選ばない(検証にならない)', () => {
    expect(pickProgramForCheck(many).program.lv).not.toBe('lv300');
    expect(pickProgramForCheck(many, { minComments: 1 }).candidates).toBe(3);
  });

  it('★放送が終わっている配信は選ばない', () => {
    const ended = listRankingPrograms({ ranking: { userPrograms: [prog({ lv: 'lv1', comment: 999, status: 'ENDED' })] } });
    expect(pickProgramForCheck(ended).reason).toBe('none');
  });

  it('★センシティブ/フォロワー限定は既定で避ける', () => {
    const s = listRankingPrograms({ ranking: { userPrograms: [
      prog({ lv: 'lv1', comment: 999, isSensitive: true }),
      prog({ lv: 'lv2', comment: 999, isFollowerOnly: true })
    ] } });
    expect(pickProgramForCheck(s).reason).toBe('none');
    expect(pickProgramForCheck(s, { allowSensitive: true }).program.lv).toBe('lv1');
  });

  it('rank で別の配信を選べる(同じ入力なら必ず同じ結果)', () => {
    expect(pickProgramForCheck(many, { rank: 1 }).program.lv).toBe('lv200');
    expect(pickProgramForCheck(many, { rank: 0 }).program.lv).toBe(pickProgramForCheck(many, { rank: 0 }).program.lv);
  });

  it('★範囲外を頼まれたら黙って別のを返さず out-of-range と言う', () => {
    const r = pickProgramForCheck(many, { rank: 99 });
    expect(r.program).toBeNull();
    expect(r.reason).toBe('out-of-range');
  });

  it('候補ゼロなら none(勝手に基準を緩めない)', () => {
    expect(pickProgramForCheck([]).reason).toBe('none');
    expect(pickProgramForCheck(null).reason).toBe('none');
  });
});

describe('URL', () => {
  it('★既に host_permissions にある nicovideo.jp を使う(再審査を招かない)', () => {
    expect(NICOLIVE_RANKING_URL).toMatch(/^https:\/\/live\.nicovideo\.jp\//);
  });

  it('視聴URLを組み立てる / 不正なIDは空', () => {
    expect(watchUrlFor('lv123')).toBe('https://live.nicovideo.jp/watch/lv123');
    expect(watchUrlFor('abc')).toBe('');
    expect(watchUrlFor(null)).toBe('');
  });
});
