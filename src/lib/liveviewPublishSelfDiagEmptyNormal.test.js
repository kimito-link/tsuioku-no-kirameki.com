import { describe, it, expect } from 'vitest';
import { buildLiveviewPublishSelfDiag } from './liveviewPublishSelfDiag.js';

/**
 * 「この配信には元々0件」「鏡が別配信」を『コピー漏れ』と誤報しないことの回帰テスト。
 *
 * ■ 実機で出た誤報(状態速報 2026-08-07T20:20 / lv351126026)
 *     🔴 北極星 貢献度: 拡張 apiRows=0 / 鏡 6 「フルコピーでない」
 *     次の一手: このズレを開発者(Claude)に状態速報ごと共有してください
 *   しかし拡張側 state は no_ranking_data =【まだギフト無し】(healthCells.js:97)。
 *   この配信は広告4,900ptのみ・ギフト0pt＝貢献者0人が【正常】で、
 *   鏡の6件は前の配信(ギフト1,640pt)の残骸だった。
 *
 * ■ 見つかった穴は2つ
 *   1. 空が正常な state(no_ranking_data 等)で拡張0でも突合していた
 *   2. 北極星の突合だけ liveId を見ていなかった
 *      (応援レーン側は lidMatch(lane)!==false で既に別配信を弾いていた=片側だけ穴)
 *
 * ★本物のコピー漏れ(拡張が ok で件数があるのに鏡0)の検出力は落とさないこと。
 */

const now = 1_800_000_000_000;
const rows = (n) => Array.from({ length: n }, (_, i) => ({ name: `user${i}`, contribution: 10 + i }));

/**
 * @param {{ apiRows:number, state:string, mirrorRows:number, mirrorLid?:string, ageMs?:number }} o
 */
function build(o) {
  return buildLiveviewPublishSelfDiag({
    nowMs: now,
    currentLiveId: 'lv351126026',
    fastDiag: {
      content: {
        giftDiagnostics: {
          '北極星レーン': {
            '1_貢献度ランキング': { apiRows: o.apiRows, state: o.state },
            '+α_広告ランキング': { apiRows: 1, state: 'ok' }
          }
        }
      }
    },
    jsonBlob: {
      northStarMirror: {
        liveId: o.mirrorLid ?? 'lv351126026',
        capturedAt: now - (o.ageMs ?? 10_000),
        lanes: { contributionRanking: rows(o.mirrorRows), adRanking: rows(1) }
      }
    }
  });
}

const contribOf = (d) => (d.consistency || []).find((x) => x.lane === '北極星 貢献度');

describe('純Web鏡の整合チェック: 空が正常なケースを🔴にしない', () => {
  it('★実機再現(拡張0/no_ranking_data/鏡6): 保留になり不一致にしない', () => {
    const c = contribOf(build({ apiRows: 0, state: 'no_ranking_data', mirrorRows: 6 }));
    expect(c.match).toBe(null);
    expect(c.skipped).toBe(true);
    expect(c.reason).toContain('元々0件');
  });

  it('★鏡が別配信の残骸なら突合しない(北極星にも liveId ガードを入れた)', () => {
    const c = contribOf(
      build({ apiRows: 6, state: 'ok', mirrorRows: 6, mirrorLid: 'lv351125068' })
    );
    expect(c.match).toBe(null);
    expect(c.skipped).toBe(true);
    expect(c.reason).toContain('別配信');
  });

  it('★本物のコピー漏れ(拡張6=ok なのに鏡0)は従来どおり不一致', () => {
    const c = contribOf(build({ apiRows: 6, state: 'ok', mirrorRows: 0 }));
    expect(c.match).toBe(false);
    expect(c.reason).toContain('取りこぼし');
  });

  it('正常一致(拡張6=ok / 鏡6)は一致', () => {
    const c = contribOf(build({ apiRows: 6, state: 'ok', mirrorRows: 6 }));
    expect(c.match).toBe(true);
  });

  it('state=ok で拡張0・鏡0なら一致(空同士)', () => {
    const c = contribOf(build({ apiRows: 0, state: 'ok', mirrorRows: 0 }));
    expect(c.match).toBe(true);
  });

  it('取得中(iframe_unrendered)は従来どおり保留', () => {
    const c = contribOf(build({ apiRows: 0, state: 'iframe_unrendered', mirrorRows: 6 }));
    expect(c.match).toBe(null);
    expect(c.skipped).toBe(true);
    expect(c.reason).toContain('取得中');
  });
});
