import { describe, it, expect } from 'vitest';
import {
  applyInstantPushDiagDelta,
  makeInitialInstantPushDiag,
  buildInstantPushDiagLines
} from './instantPushDiag.js';

/**
 * ★累計カウンタに「いつから数えているか」を持たせる。
 *
 * ■ なぜ要るか(2026-08-19・「受信+破棄=送信の1.51倍」の誤診)
 *   この計器は **リセット経路が存在しない生涯累計**。
 *   即時プッシュ導入 v0.1.1092(2026-07-06) → 速報 v0.1.1413(08-17)
 *   ＝ **6週間・約320版ぶんの累計**を1つの比で語り、
 *   「二重注入だ」という**誤った真因**に到達した。
 *   ★その間に nonce 機構自体が v0.1.1094 で変わっている
 *   ＝**違うコードが書いた数を足していた**。
 *
 *   `since` が無い限り「1時間の値」と「6週間の値」が同じ顔で並ぶ。
 *   ＝**将来また同じ誤読が起きる**
 *   ([[cumulative-value-shown-as-current-state-2026-08-12]])。
 *
 * ★掟: `since` は【最初の1回だけ】刻んで、以後は絶対に上書きしない。
 *   上書きすると期間が縮んで見え、比の分母がまた嘘になる。
 */
describe('★即時プッシュ計器に「いつから」を持たせる', () => {
  it('★初期状態は since=0(まだ何も数えていない)', () => {
    expect(makeInitialInstantPushDiag().since).toBe(0);
  });

  it('★最初の delta で since が刻まれる', () => {
    const next = applyInstantPushDiagDelta(null, { sentCount: 1, lastEventAt: 1_000 });
    expect(next.since).toBe(1_000);
  });

  it('★★2回目以降は since を【上書きしない】(期間が縮むと比がまた嘘になる)', () => {
    let s = applyInstantPushDiagDelta(null, { sentCount: 1, lastEventAt: 1_000 });
    s = applyInstantPushDiagDelta(s, { sentCount: 1, lastEventAt: 9_999 });
    s = applyInstantPushDiagDelta(s, { receivedCount: 1, lastEventAt: 50_000 });
    expect(s.since, 'since が上書きされた=期間が縮む').toBe(1_000);
    // lastEventAt の方は最新に進む(こちらは置換が正しい)。
    expect(s.lastEventAt).toBe(50_000);
  });

  it('★既存の保存値に since が無くても壊れない(移行・過去データ)', () => {
    // v0.1.1452 以前に保存された snapshot には since が無い。
    const legacy = { sentCount: 100, receivedCount: 80, rejectedCount: 5 };
    const next = applyInstantPushDiagDelta(legacy, { sentCount: 1, lastEventAt: 7_000 });
    expect(next.sentCount, '既存の累計を壊してはいけない').toBe(101);
    // ★過去データは「いつからか分からない」。ここで今の時刻を刻むと
    //   6週間ぶんの累計に「たった今から」という嘘の期間が付く。
    //   分からないものは 0(=不明)のまま返す。
    expect(next.since, '不明な期間に嘘の起点を付けてはいけない').toBe(0);
  });

  it('★lastEventAt が無い delta では since を刻まない(時刻が無ければ不明のまま)', () => {
    const next = applyInstantPushDiagDelta(null, { sentCount: 1 });
    expect(next.since).toBe(0);
  });

  it('★表示に「いつから」が出る(読み手が期間を誤解できないようにする)', () => {
    // ★行数が0だと未観測として空配列が返る仕様(既存)。実機同様に行数も入れる。
    const snap = {
      ...makeInitialInstantPushDiag(),
      sentCount: 370041, sentRows: 900000,
      receivedCount: 310750, receivedRows: 800000,
      rejectedCount: 247763,
      since: 1_000, lastEventAt: 1_000 + 6 * 24 * 3600 * 1000
    };
    const text = buildInstantPushDiagLines(snap, snap.lastEventAt).join('\n');
    expect(text, '期間が表示に出ていない=また6週間ぶんを1時間の値と誤読する').toMatch(/6日|集計/);
  });

  it('★since=0(不明)なら期間を騙らない', () => {
    const snap = { ...makeInitialInstantPushDiag(), sentCount: 5, since: 0, lastEventAt: 9_000 };
    const text = buildInstantPushDiagLines(snap, 9_000).join('\n');
    expect(text).not.toMatch(/集計\s*0日/);
  });
});
