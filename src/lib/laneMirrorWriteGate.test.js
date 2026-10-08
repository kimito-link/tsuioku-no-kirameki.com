import { describe, it, expect } from 'vitest';
import {
  LANE_MIRROR_WRITE_FLOOR_MS,
  laneMirrorWriteSignature,
  createLaneMirrorWriteGate
} from './laneMirrorWriteGate.js';
import { publishLaneMirrorPerLive } from './laneMirrorPerLivePublish.js';
import { buildLaneMirrorSnapshot } from './laneMirror.js';

/**
 * 配信別の鏡(v2)の書き込み抑制ゲート。
 *   実測(2026-10-08): 鏡(約62KB)×2キー(鏡+受領証)を、描画の呼び出しごとに無条件で storage.set していた
 *   (実機の描き直し3,628回に対し描画1,237回・内容は同じ)。書くたびに開いている全拡張ページへ
 *   storage.onChanged が全文(old+new)で配られる。内容が同じなら書かない。
 *   ★守ること: ①統計(stats)・バッジ(pulse)の変化は【書く】(鍵 contentHash には入れない決まりなので、
 *   署名は contentHash でなく鏡の中身そのもので作る) ②60秒に1回は同内容でも書く(会場の鏡有効窓180秒を下回らない=
 *   「鏡が656秒凍結した」実損の再発を構造で防ぐ)。
 */

const cell = (uid, extra = {}) => ({
  displaySrc: `https://example.invalid/${uid}.png`,
  title: uid,
  meta: { idLine: uid, nameLine: uid },
  entry: { userId: uid },
  ...extra
});

/** @param {Record<string, any>} [o] */
const snapOf = (o = {}) =>
  buildLaneMirrorSnapshot(
    {
      liveId: o.liveId ?? 'lv351133862',
      buckets: o.buckets ?? { link: [cell('134093242')], gift: [], ad: [], konta: [], tanu: [] },
      domSelf: o.domSelf ?? { measured: true, fingerprint: 'fp-a' },
      pickedLength: 1,
      totalCandidates: 1
    },
    { nowMs: o.nowMs ?? 1000, cap: 48 }
  );

describe('laneMirrorWriteSignature — 鏡の中身そのもの(時刻と受領証を除く)', () => {
  it('時刻(capturedAt)だけが違う鏡は同じ署名(毎回別物になって抑制が効かない事故を防ぐ)', () => {
    expect(laneMirrorWriteSignature(snapOf({ nowMs: 1000 }))).toBe(laneMirrorWriteSignature(snapOf({ nowMs: 99_999 })));
  });

  it('受領証(domSelf)だけが違う鏡も同じ署名(domSelf は別キーの受領証に書く)', () => {
    const a = snapOf({ domSelf: { measured: true, fingerprint: 'fp-a' } });
    const b = snapOf({ domSelf: { measured: true, fingerprint: 'fp-b', measuredAt: 5 } });
    expect(laneMirrorWriteSignature(a)).toBe(laneMirrorWriteSignature(b));
  });

  it('★統計(stats)が変われば署名が変わる(🎁📣💬の件数を最大60秒止めない)', () => {
    const base = snapOf({ buckets: { link: [cell('1', { stats: { commentCount: 3, giftPt: null, adPt: null } })], gift: [], ad: [], konta: [], tanu: [] } });
    const next = snapOf({ buckets: { link: [cell('1', { stats: { commentCount: 4, giftPt: null, adPt: null } })], gift: [], ad: [], konta: [], tanu: [] } });
    expect(laneMirrorWriteSignature(base)).not.toBe(laneMirrorWriteSignature(next));
  });

  it('★バッジ(pulse)が出入りすれば署名が変わる', () => {
    const none = snapOf({ buckets: { link: [cell('1')], gift: [], ad: [], konta: [], tanu: [] } });
    const gifted = snapOf({ buckets: { link: [cell('1', { pulse: { giftDelta: 500, giftTier: 'large' } })], gift: [], ad: [], konta: [], tanu: [] } });
    expect(laneMirrorWriteSignature(none)).not.toBe(laneMirrorWriteSignature(gifted));
  });

  it('顔ぶれ・並び・配信が変われば署名が変わる', () => {
    const a = snapOf({ buckets: { link: [cell('1'), cell('2')], gift: [], ad: [], konta: [], tanu: [] } });
    const swapped = snapOf({ buckets: { link: [cell('2'), cell('1')], gift: [], ad: [], konta: [], tanu: [] } });
    const other = snapOf({ liveId: 'lv999', buckets: { link: [cell('1'), cell('2')], gift: [], ad: [], konta: [], tanu: [] } });
    expect(laneMirrorWriteSignature(a)).not.toBe(laneMirrorWriteSignature(swapped));
    expect(laneMirrorWriteSignature(a)).not.toBe(laneMirrorWriteSignature(other));
  });

  it('壊れた入力(null・循環)でも例外を出さず、空署名を返す(=ゲートは「書く」側に倒れる)', () => {
    expect(laneMirrorWriteSignature(null)).toBe('');
    const cyc = /** @type {any} */ ({});
    cyc.self = cyc;
    expect(laneMirrorWriteSignature(cyc)).toBe('');
  });
});

describe('createLaneMirrorWriteGate', () => {
  it('最初の1回は必ず書く', () => {
    const g = createLaneMirrorWriteGate();
    expect(g.shouldWrite('lv1', 'sig', 0).write).toBe(true);
  });

  it('★同じ署名で60秒未満なら書かない', () => {
    const g = createLaneMirrorWriteGate();
    g.shouldWrite('lv1', 'sig', 0);
    const r = g.shouldWrite('lv1', 'sig', LANE_MIRROR_WRITE_FLOOR_MS - 1);
    expect(r.write).toBe(false);
    expect(r.reason).toContain('同内容');
  });

  it('★同じ署名でも60秒たったら書く(鮮度の下限・会場の鏡有効窓180秒を絶対に下回らない)', () => {
    const g = createLaneMirrorWriteGate();
    g.shouldWrite('lv1', 'sig', 0);
    expect(g.shouldWrite('lv1', 'sig', LANE_MIRROR_WRITE_FLOOR_MS).write).toBe(true);
    // 書いたら、そこから数え直す
    expect(g.shouldWrite('lv1', 'sig', LANE_MIRROR_WRITE_FLOOR_MS + 1000).write).toBe(false);
  });

  it('署名が変われば、60秒未満でも即座に書く', () => {
    const g = createLaneMirrorWriteGate();
    g.shouldWrite('lv1', 'a', 0);
    expect(g.shouldWrite('lv1', 'b', 100).write).toBe(true);
  });

  it('配信(lid)ごとに独立(別の配信の書き込みが互いを抑制しない)', () => {
    const g = createLaneMirrorWriteGate();
    g.shouldWrite('lv1', 'sig', 0);
    expect(g.shouldWrite('lv2', 'sig', 10).write).toBe(true);
    expect(g.shouldWrite('lv1', 'sig', 10).write).toBe(false);
  });

  it('時計が戻ったら(now < 前回)書く(固まらない)', () => {
    const g = createLaneMirrorWriteGate();
    g.shouldWrite('lv1', 'sig', 100_000);
    expect(g.shouldWrite('lv1', 'sig', 50_000).write).toBe(true);
  });

  it('★空の署名(壊れた入力)は常に書く側に倒れる', () => {
    const g = createLaneMirrorWriteGate();
    g.shouldWrite('lv1', '', 0);
    expect(g.shouldWrite('lv1', '', 10).write).toBe(true);
  });

  it('保持する配信数に上限がある(配信を渡り歩いても台帳が太らない)', () => {
    const g = createLaneMirrorWriteGate({ maxLives: 3 });
    for (let i = 0; i < 10; i += 1) g.shouldWrite(`lv${i}`, 's', i);
    expect(g.size()).toBeLessThanOrEqual(3);
  });
});

describe('publishLaneMirrorPerLive にゲートを通すと、同内容の set が消える(実行して数える)', () => {
  const spy = () => {
    const writes = /** @type {any[]} */ ([]);
    return { writes, set: (o) => writes.push(o) };
  };

  it('同じ鏡を100回 publish しても、書くのは1回(+60秒床)', () => {
    const st = spy();
    const gate = createLaneMirrorWriteGate();
    let now = 0;
    for (let i = 0; i < 100; i += 1) {
      now += 500; // 0.5秒ごと=50秒ぶん
      publishLaneMirrorPerLive(snapOf({ nowMs: now }), now, st, gate);
    }
    expect(st.writes).toHaveLength(1);
    // 60秒を超えたら同内容でも1回書く
    now += 20_000;
    publishLaneMirrorPerLive(snapOf({ nowMs: now }), now, st, gate);
    expect(st.writes).toHaveLength(2);
  });

  it('★統計が変わる鏡は毎回書く(🎁📣💬が止まらない)', () => {
    const st = spy();
    const gate = createLaneMirrorWriteGate();
    for (let i = 0; i < 10; i += 1) {
      const s = snapOf({ buckets: { link: [cell('1', { stats: { commentCount: i, giftPt: null, adPt: null } })], gift: [], ad: [], konta: [], tanu: [] } });
      publishLaneMirrorPerLive(s, 1000 + i, st, gate);
    }
    expect(st.writes).toHaveLength(10);
  });

  it('ゲート無し(従来の呼び方)は従来どおり毎回書く=後方互換', () => {
    const st = spy();
    for (let i = 0; i < 5; i += 1) publishLaneMirrorPerLive(snapOf(), 1000 + i, st);
    expect(st.writes).toHaveLength(5);
  });

  it('抑制した回は written:false と理由を返す(呼び手は握りつぶしてよい)', () => {
    const st = spy();
    const gate = createLaneMirrorWriteGate();
    publishLaneMirrorPerLive(snapOf(), 1000, st, gate);
    const r = publishLaneMirrorPerLive(snapOf(), 1500, st, gate);
    expect(r.written).toBe(false);
    expect(r.reason).toContain('同内容');
  });
});
