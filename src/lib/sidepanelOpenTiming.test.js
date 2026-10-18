import { describe, expect, it } from 'vitest';
import {
  buildOpenTiming,
  mergeOpens,
  formatOpenTimingLine,
  SP_CLICK_KEY,
  OPEN_HISTORY_CAP,
  MAX_CLICK_TO_DOC_MS
} from './sidepanelOpenTiming.js';

const T = 1_800_000_000_000;

describe('buildOpenTiming', () => {
  it('★押下→文書開始→最初の描画→中身 の各区間を ms で出す', () => {
    const e = buildOpenTiming({
      click: { at: T, swAgeMs: 120_000, armed: true, hasLv: true },
      docStartEpoch: T + 180,
      firstPaintEpoch: T + 260,
      contentPaintEpoch: T + 900
    });
    expect(e).toMatchObject({
      clickMissing: false,
      clickToDocMs: 180,
      docToFirstPaintMs: 80,
      clickToFirstPaintMs: 260,
      clickToContentMs: 900,
      armed: true,
      hasLv: true
    });
  });

  it('★押した時刻が無ければ押下基準の区間を捏造しない(clickMissing)', () => {
    const e = buildOpenTiming({ click: null, docStartEpoch: T, firstPaintEpoch: T + 50, contentPaintEpoch: T + 500 });
    expect(e.clickMissing).toBe(true);
    expect(e.clickToDocMs).toBeNull();
    expect(e.clickToFirstPaintMs).toBeNull();
    expect(e.clickToContentMs).toBeNull();
    // 文書の中だけで測れる区間は残す
    expect(e.docToFirstPaintMs).toBe(50);
  });

  it('★押下が古い(別の経路で開いた)ときも区間を出さない', () => {
    const e = buildOpenTiming({
      click: { at: T - MAX_CLICK_TO_DOC_MS - 1 },
      docStartEpoch: T,
      firstPaintEpoch: T + 10
    });
    expect(e.clickMissing).toBe(true);
    expect(e.clickToFirstPaintMs).toBeNull();
  });

  it('★押下が文書開始より後(時計のずれ・別の押下)は出さない', () => {
    expect(buildOpenTiming({ click: { at: T + 5 }, docStartEpoch: T, firstPaintEpoch: T + 10 }).clickMissing).toBe(true);
  });

  it('描画がまだのときは null(0 にしない)', () => {
    const e = buildOpenTiming({ click: { at: T }, docStartEpoch: T + 100 });
    expect(e.clickToDocMs).toBe(100);
    expect(e.clickToFirstPaintMs).toBeNull();
    expect(e.clickToContentMs).toBeNull();
  });

  it('壊れた入力でも落ちない', () => {
    expect(() => buildOpenTiming(/** @type {any} */ (null))).not.toThrow();
    expect(() => buildOpenTiming({ click: /** @type {any} */ ({ at: 'x' }), docStartEpoch: NaN })).not.toThrow();
  });

  it('SW のキーは契約として固定(background.js と文字列照合される)', () => {
    expect(SP_CLICK_KEY).toBe('nls_sp_click_at_v1');
  });
});

describe('mergeOpens', () => {
  it('同じ id は置き換え(1回の起動で何度書いても1件)', () => {
    const a = mergeOpens([], { id: 1, v: 1 });
    const b = mergeOpens(a, { id: 1, v: 2 });
    expect(b).toEqual([{ id: 1, v: 2 }]);
  });

  it('古い順に並べ、上限を超えたら古い方から捨てる', () => {
    let h = /** @type {any[]} */ ([]);
    for (let i = 1; i <= OPEN_HISTORY_CAP + 3; i++) h = mergeOpens(h, { id: i });
    expect(h).toHaveLength(OPEN_HISTORY_CAP);
    expect(h[0].id).toBe(4);
    expect(h[h.length - 1].id).toBe(OPEN_HISTORY_CAP + 3);
  });

  it('壊れた履歴は捨てて続ける', () => {
    expect(mergeOpens('x', { id: 5 })).toEqual([{ id: 5 }]);
    expect(mergeOpens([null, 3, { id: 'a' }], { id: 5 })).toEqual([{ id: 5 }]);
  });
});

describe('formatOpenTimingLine', () => {
  const mk = (id, doc, fp, cp, extra = {}) =>
    buildOpenTiming({
      click: { at: T + id * 1000, swAgeMs: 60_000, armed: true, hasLv: true, ...extra },
      docStartEpoch: T + id * 1000 + doc,
      firstPaintEpoch: T + id * 1000 + fp,
      contentPaintEpoch: T + id * 1000 + cp
    });

  it('計測が無ければ空(速報に何も足さない)', () => {
    expect(formatOpenTimingLine([])).toBe('');
    expect(formatOpenTimingLine(/** @type {any} */ (null))).toBe('');
  });

  it('★中央値・最大・直近を事実の数値だけで出す(原因は断定しない)', () => {
    const line = formatOpenTimingLine([mk(1, 100, 200, 700), mk(2, 120, 260, 800), mk(3, 400, 2400, 3000)]);
    expect(line).toContain('3回');
    expect(line).toContain('親の最初の描画 中央値260ms(最大2400ms)');
    expect(line).toContain('直近 押下→文書開始400ms→最初の描画2400ms→中身3000ms');
    expect(line).not.toMatch(/原因|せい|が悪い/);
  });

  it('★SW が起きた直後・事前用意済みの回数を出す(押下前の状態との相関を読めるように)', () => {
    const line = formatOpenTimingLine([mk(1, 100, 200, 700, { swAgeMs: 500, armed: false }), mk(2, 100, 200, 700)]);
    expect(line).toContain('SW起こし直し直後1回');
    expect(line).toContain('事前用意済み1回');
  });

  it('★押した時刻が全回で取れなかったら、そう言う(0 ms と読ませない)', () => {
    const line = formatOpenTimingLine([buildOpenTiming({ click: null, docStartEpoch: T, firstPaintEpoch: T + 5 })]);
    expect(line).toContain('押した時刻が取れた回が0/1回');
    // 押下基準の区間(文書開始/親の最初の描画/中身の描画)は出さない。文書内の統計の「中央値」は別物。
    expect(line).not.toContain('文書開始 中央値');
    expect(line).not.toContain('親の最初の描画 中央値');
    expect(line).not.toContain('中身の描画 中央値');
  });
});

describe('文書内の値(押した時刻が無い回でも残る・v0.1.1676)', () => {
  it('★押した時刻が無くても scriptAt・長い処理・停止区間は残る', () => {
    const e = buildOpenTiming({
      click: null,
      docStartEpoch: T,
      firstPaintEpoch: T + 636,
      scriptAtMs: 412.4,
      domInteractiveMs: 520,
      ownLongTasks: [[100, 80], [300.4, 60]],
      stalls: [[40, 400]]
    });
    expect(e.clickMissing).toBe(true);
    expect(e.docToFirstPaintMs).toBe(636);
    expect(e.scriptAtMs).toBe(412);
    expect(e.domInteractiveMs).toBe(520);
    expect(e.ownLongTasks).toEqual([[100, 80], [300, 60]]);
    expect(e.stalls).toEqual([[40, 400]]);
  });

  it('壊れた組は捨て、6組までに切る', () => {
    const e = buildOpenTiming({
      docStartEpoch: T,
      stalls: /** @type {any} */ ([[1, 2], 'x', [NaN, 3], [4], ...Array.from({ length: 10 }, (_, i) => [i, 150])])
    });
    expect(e.stalls).toHaveLength(6);
    expect(e.stalls[0]).toEqual([1, 2]);
  });

  it('★押した時刻が全回で無くても、文書内の数字を行に出す(0回と書いて終わりにしない)', () => {
    const mkDoc = (id, fp, sa, stalls) =>
      buildOpenTiming({ click: null, docStartEpoch: T + id * 1000, firstPaintEpoch: T + id * 1000 + fp, scriptAtMs: sa, stalls });
    const line = formatOpenTimingLine([mkDoc(1, 100, 50, []), mkDoc(2, 636, 900, [[40, 400]])]);
    expect(line).toContain('押した時刻が取れた回が0/2回');
    expect(line).toContain('開始→最初の描画 中央値368ms(最大636ms)');
    expect(line).toContain('文書作成→スクリプト開始 中央値475ms(最大900ms)');
    expect(line).toContain('主スレッド停止(120ms超)1件');
    expect(line).toContain('40ms地点で400ms');
  });

  it('押した時刻が取れない回が混ざるときは、その回数を言う', () => {
    const a = buildOpenTiming({ click: { at: T, swAgeMs: 9000, armed: true, hasLv: true }, docStartEpoch: T + 8, firstPaintEpoch: T + 600, contentPaintEpoch: T + 900 });
    const b = buildOpenTiming({ click: null, docStartEpoch: T + 5000, firstPaintEpoch: T + 5100 });
    expect(formatOpenTimingLine([a, b])).toContain('押した時刻なし1回');
  });
});
