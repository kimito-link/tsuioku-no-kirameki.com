import { describe, expect, it } from 'vitest';
import {
  parseCensusReport,
  aggregateByKey,
  compareToBaseline,
  decideReady,
  evaluateExpect,
  isWindowMature
} from './censusWatch.js';

/** 2026-10-20 の実機の状態速報から抜いた行(形は実物のまま・数字だけ)。 */
const SAMPLE = [
  '  ⚙ paint 3ms / 取得 1.2件/秒 / 描画1005回',
  'サイドパネル自己診断: 🔴黒くなりうる / v0.1.1700 / 482x1063 / 外✅ / コメント書込モード ✅チャンク追記(51回・記録957件・31秒前)',
  '  ・status#dxia 稼働3分: 長い処理206回/計16471ms(最大141ms)=稼働の13.7% / 受けた遅れ計1673ms(最大140ms) / onChanged nls_liveview_publish_payload_v1×6(1643KB) nls_watch_snapshot_*×40(766KB) nls_lane_mirror_v1×29(646KB)',
  '  ・popup-sidepanel#q0qz 稼働1分: 長い処理96回/計9544ms(最大203ms)=稼働の15.9% / 受けた遅れ計977ms(最大162ms) / onChanged nls_user_comment_profile_v1×10(3362KB) nls_lane_mirror_v2_*×18(1703KB) nls_comments_*×4(4400KB)',
  '  ・popup-watch#coqa 稼働10秒: 長い処理0回/計0ms(最大0ms)=稼働の0% / 受けた遅れ計3242ms(最大749ms) / onChanged nls_user_comment_profile_v1×2(660KB)',
  '  → 🔴犯人候補: status#dxia(長い処理が稼働の13.7%)'
].join('\n');

describe('parseCensusReport: 状態速報の census 行を数字だけで読む', () => {
  const r = parseCensusReport(SAMPLE);
  it('版・書込モード・コメント取得率を読む', () => {
    expect(r.version).toBe('v0.1.1700');
    expect(r.writeMode).toBe('chunk');
    expect(r.commentRatePerSec).toBeCloseTo(1.2);
  });
  it('文書ごとに 種類・窓(秒)・稼働%・onChanged(キー,回数,KB) を読む', () => {
    expect(r.docs).toHaveLength(3);
    const st = r.docs[0];
    expect(st).toMatchObject({ kind: 'status', id: 'dxia', windowSec: 180, busyPct: 13.7 });
    expect(st.oc).toEqual([
      { key: 'nls_liveview_publish_payload_v1', n: 6, kb: 1643 },
      { key: 'nls_watch_snapshot_*', n: 40, kb: 766 },
      { key: 'nls_lane_mirror_v1', n: 29, kb: 646 }
    ]);
    expect(r.docs[1].windowSec).toBe(60);
    expect(r.docs[2].windowSec).toBe(10);
  });
  it('census 行が無い入力は docs=[]・version=null(測れていない=異常なしではない)', () => {
    const e = parseCensusReport('なにもない');
    expect(e.docs).toEqual([]);
    expect(e.version).toBeNull();
    expect(e.writeMode).toBe('unknown');
    expect(e.commentRatePerSec).toBeNull();
  });
  it('第三者の文字列を出力に含めない: 返すのは数字とキー名(nls_*)だけ', () => {
    const dirty = parseCensusReport('  ・popup-sidepanel#a1b2 稼働2分: 長い処理1回/計1ms(最大1ms)=稼働の1% / onChanged <script>×3(10KB) nls_ok_*×1(2KB)');
    expect(dirty.docs[0].oc.map((o) => o.key)).toEqual(['nls_ok_*']);
  });
});

describe('isWindowMature: 窓が十分に溜まったか', () => {
  it('1つでも minSec 以上の窓の文書があれば成熟', () => {
    expect(isWindowMature(parseCensusReport(SAMPLE), 180)).toBe(true);
    expect(isWindowMature(parseCensusReport(SAMPLE), 240)).toBe(false);
    expect(isWindowMature(parseCensusReport('x'), 10)).toBe(false);
  });
});

describe('decideReady: いま判定してよいか(待つ理由を全部返す)', () => {
  const r = parseCensusReport(SAMPLE);
  it('版一致・新しい・窓が成熟・コメントが流れている → ready', () => {
    const d = decideReady(r, { wantVersion: 'v0.1.1700', minWindowSec: 180, reportAgeSec: 40 });
    expect(d).toEqual({ ready: true, reasons: [], commentsFlowing: true });
  });
  it('版が違う(更新+F5待ち)・窓が短い・古い・コメントなし を全部理由に出す', () => {
    const d = decideReady(
      parseCensusReport('サイドパネル自己診断: x / v0.1.1699 / y\n  ⚙ 取得 0.0件/秒\n  ・popup-sidepanel#a1 稼働10秒: x=稼働の1% / onChanged nls_a×1(1KB)'),
      { wantVersion: 'v0.1.1700', minWindowSec: 180, reportAgeSec: 900 }
    );
    expect(d.ready).toBe(false);
    expect(d.reasons.join('|')).toMatch(/古い/);
    expect(d.reasons.join('|')).toMatch(/版が違う/);
    expect(d.reasons.join('|')).toMatch(/窓が短い/);
    expect(d.reasons.join('|')).toMatch(/コメントがほぼ流れていない/);
    expect(d.commentsFlowing).toBe(false);
  });
  it('census 行が無い・生成時刻不明でも ready にならない(測れていない=異常なしではない)', () => {
    const d = decideReady(parseCensusReport(''), { minWindowSec: 60, reportAgeSec: null });
    expect(d.ready).toBe(false);
  });
});

describe('aggregateByKey: 窓の十分長い文書だけで、キーごとの毎分の回数/KBを出す', () => {
  const r = parseCensusReport(SAMPLE);
  it('minSec 未満の窓の文書は使わない(10秒窓の「0回」を信じない)', () => {
    const a = aggregateByKey(r.docs, 60);
    expect(a['nls_user_comment_profile_v1'].docs).toBe(1); // 10秒窓の popup-watch は除外
    expect(a['nls_user_comment_profile_v1'].maxPerMin).toBeCloseTo(10);
    expect(a['nls_comments_*'].maxKbPerMin).toBeCloseTo(4400);
    expect(a['nls_watch_snapshot_*'].maxPerMin).toBeCloseTo(40 / 3);
  });
  it('どの文書の上位3族にも無いキーは undefined(=0 とは限らない)', () => {
    expect(aggregateByKey(r.docs, 60)['nls_ctail_*']).toBeUndefined();
  });
});

describe('evaluateExpect: 「このキーは毎分N回以下」の判定', () => {
  const agg = aggregateByKey(parseCensusReport(SAMPLE).docs, 60);
  it('超過なら fail・以内なら pass', () => {
    expect(evaluateExpect(agg, { key: 'nls_comments_*', maxPerMin: 0.7 }).verdict).toBe('fail');
    expect(evaluateExpect(agg, { key: 'nls_comments_*', maxPerMin: 5 }).verdict).toBe('pass');
  });
  it('上位3族に無い=「上位3族に無い」と明示し pass とは言い切らない(unproven)', () => {
    const v = evaluateExpect(agg, { key: 'nls_ctail_*', maxPerMin: 0.5 });
    expect(v.verdict).toBe('absent-from-top3');
    expect(v.note).toContain('上位3族');
  });
});

describe('compareToBaseline: 基準線との毎分の回数の差', () => {
  const base = aggregateByKey(parseCensusReport(SAMPLE).docs, 60);
  const now = JSON.parse(JSON.stringify(base));
  now['nls_comments_*'].maxPerMin = 0.3;
  it('キーごとに 基準→今・変化率 を返す', () => {
    const c = compareToBaseline(base, now);
    const row = c.find((x) => x.key === 'nls_comments_*');
    expect(row.baseline).toBeCloseTo(4);
    expect(row.now).toBeCloseTo(0.3);
    expect(row.changePct).toBeCloseTo(-92.5, 0);
  });
  it('基準線にだけ・今にだけあるキーも落とさない', () => {
    const c = compareToBaseline({ a: { maxPerMin: 2, maxKbPerMin: 10, docs: 1 } }, { b: { maxPerMin: 1, maxKbPerMin: 5, docs: 1 } });
    expect(c.map((x) => x.key).sort()).toEqual(['a', 'b']);
    expect(c.find((x) => x.key === 'a').now).toBeNull();
    expect(c.find((x) => x.key === 'b').baseline).toBeNull();
  });
});
