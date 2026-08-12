import { describe, expect, it } from 'vitest';
import {
  OSC_HISTORY_CAP,
  OSC_MIN_DELTA,
  pushLaneTileSample,
  summarizeLaneTileOscillation
} from './laneTileOscillation.js';
import {
  buildStoryUserLaneRenderDiag,
  formatStoryUserLaneRenderDiagLines
} from './storyUserLaneRenderProbe.js';

const s = (tiles, origin = 'light_summary') => ({ tiles, origin });

describe('pushLaneTileSample — 履歴リング', () => {
  it('上限を超えたら古い方から捨てる(軽さのため)', () => {
    let h = [];
    for (let i = 0; i < OSC_HISTORY_CAP + 5; i += 1) h = pushLaneTileSample(h, s(i));
    expect(h.length).toBe(OSC_HISTORY_CAP);
    // 最後が最新であること。
    expect(h[h.length - 1].tiles).toBe(OSC_HISTORY_CAP + 4);
  });

  it('不正な値は0に正規化して落とさない(計器が壊れて欠測にならない)', () => {
    const h = pushLaneTileSample([], { tiles: 'x', origin: 42 });
    expect(h).toEqual([{ tiles: 0, origin: '42' }]);
  });

  it('null 履歴でも新しい配列を返す(元を壊さない)', () => {
    expect(pushLaneTileSample(null, s(3))).toEqual([{ tiles: 3, origin: 'light_summary' }]);
  });
});

describe('summarizeLaneTileOscillation — 点滅(往復)の検出', () => {
  it('未観測は ⚪(0件で赤くしない)', () => {
    const r = summarizeLaneTileOscillation([]);
    expect(r.samples).toBe(0);
    expect(r.line).toContain('未観測');
  });

  it('★単調に増えるだけは点滅ではない(入場が続いているだけ)', () => {
    const r = summarizeLaneTileOscillation([s(2), s(10), s(20), s(30)]);
    expect(r.reversals).toBe(0);
    // ★v0.1.1355: 文言を「増え続けている」へ変更(減少も見るようになったため)。
    //   判定の意味は不変=往復0かつ減少0なら正常。
    expect(r.line).toContain('増え続けている');
    expect(r.drops).toBe(0);
  });

  it('★増→減→増 は往復2回として数える(これが点滅)', () => {
    const r = summarizeLaneTileOscillation([s(2), s(30), s(2), s(30)]);
    expect(r.reversals).toBe(2);
    expect(r.minTiles).toBe(2);
    expect(r.maxTiles).toBe(30);
    expect(r.amplitude).toBe(28);
    expect(r.line).toContain('🔴');
  });

  it(`★${OSC_MIN_DELTA}未満の揺れは無視する(1枚の入退場をノイズにしない)`, () => {
    // 2→3→2→3 は毎回 delta=1 なので往復に数えない。
    const r = summarizeLaneTileOscillation([s(2), s(3), s(2), s(3)]);
    expect(r.reversals).toBe(0);
  });

  it('★境界: ちょうど OSC_MIN_DELTA の変化は数える', () => {
    const r = summarizeLaneTileOscillation([s(2), s(4), s(2)]);
    expect(r.reversals).toBe(1);
  });

  it('★供給元が複数なら併記する(交互供給が点滅の原因になりうる)', () => {
    const r = summarizeLaneTileOscillation([
      s(2, 'light_summary'),
      s(30, 'heavy_refresh'),
      s(2, 'light_summary')
    ]);
    expect(r.originsSeen).toEqual(['light_summary', 'heavy_refresh']);
    expect(r.line).toContain('供給元が2種');
  });

  it('供給元が1つなら併記しない(ノイズにしない)', () => {
    const r = summarizeLaneTileOscillation([s(5), s(5)]);
    expect(r.line).not.toContain('供給元が');
  });

  it('★実測の再現: 2枚のまま安定は点滅ではない(縮小ガードが0を返す状況)', () => {
    // domTilesPainted=2 が続く状態。少ないこと自体は別問題で、点滅ではない。
    const r = summarizeLaneTileOscillation([s(2), s(2), s(2)]);
    expect(r.reversals).toBe(0);
    expect(r.amplitude).toBe(0);
  });
});

/*
 * ★通し検査(v0.1.1346): 計器を足したら【その行が実際に出力に現れるか】を確認する。
 *   storage に載せても印字側へ通っていなければ永久に出ない、を今日2回踏んだ。
 */
describe('★通し: 点滅の行が状態速報のテキストに現れる', () => {
  const base = {
    activePath: 'heavy',
    started: 4,
    completed: 4,
    entriesLen: 56,
    domTilesPainted: 2,
    lastReachedStep: 'done'
  };

  it('往復ありなら行が出る(供給元の併記つき)', () => {
    const oscillation = summarizeLaneTileOscillation([
      s(2, 'light_summary'),
      s(30, 'heavy_refresh'),
      s(2, 'light_summary')
    ]);
    const d = buildStoryUserLaneRenderDiag({ ...base, laneTileOscillation: oscillation });
    const text = formatStoryUserLaneRenderDiagLines(d).join('\n');
    // ★v0.1.1355: 2→30→2 は【減少も含む】ので「増え続けていない」側で名指しする。
    //   往復回数も併記されるので、点滅の情報は失われていない。
    expect(text).toContain('増え続けていない');
    expect(text).toContain('往復');
    expect(text).toContain('供給元が2種');
  });

  it('往復なしなら行を出さない(正常時のノイズにしない)', () => {
    const oscillation = summarizeLaneTileOscillation([s(2), s(2)]);
    const d = buildStoryUserLaneRenderDiag({ ...base, laneTileOscillation: oscillation });
    const text = formatStoryUserLaneRenderDiagLines(d).join('\n');
    expect(text).not.toContain('レーンの点滅');
  });

  it('計器が無い(旧版の値)でも壊れない', () => {
    const d = buildStoryUserLaneRenderDiag({ ...base });
    expect(() => formatStoryUserLaneRenderDiagLines(d)).not.toThrow();
  });

  /*
   * ★v0.1.1355(ユーザー実機 2026-08-12「途中で増えたり減ったりしてる」「ふえつづけるように」)
   *   往復(reversals)は「増→減→増」と戻ってきたときだけ数える。
   *   戻ってこない減少は数えられず、実測の速報は
   *     レーンの点滅 ✅ 往復なし(2〜67枚・観測3回)
   *     ★タイルが減った直前の供給元: light_summary(暫定) 17枚→2枚
   *   と、17→2 の脱落を抱えたまま ✅ を出していた。
   *   ★名簿は増え続けるのが正しいので、減少は方向を問わず全部異常として数える。
   */
  describe('★増え続けているか(減少は往復でなくても異常)', () => {
    it('減ったまま戻らなくても🔴になる(17→2の実機ケース)', () => {
      const r = summarizeLaneTileOscillation([s(17, 'light_summary'), s(2, 'light_summary')]);
      expect(r.drops).toBe(1);
      expect(r.monotonicGrowth).toBe(false);
      expect(r.reversals).toBe(0); // ★往復では数えられない=だからこの検査が要る
      expect(r.line).toContain('🔴');
      expect(r.line).toContain('増え続けていない');
      expect(r.line).toContain('17→2枚');
    });

    it('最大の脱落幅と直前の供給元を名指しする', () => {
      const r = summarizeLaneTileOscillation([
        s(10, 'heavy_refresh'),
        s(8, 'heavy_refresh'),
        s(60, 'heavy_refresh'),
        s(3, 'light_summary')
      ]);
      expect(r.drops).toBe(2);
      expect(r.worstDrop).toBe(57);
      expect(r.worstDropFrom).toBe(60);
      expect(r.worstDropTo).toBe(3);
      expect(r.worstDropOrigin).toBe('light_summary');
      expect(r.line).toContain('light_summary');
    });

    it('★増えるだけなら正常(入場が続いているだけ)', () => {
      const r = summarizeLaneTileOscillation([s(2), s(17), s(67)]);
      expect(r.drops).toBe(0);
      expect(r.monotonicGrowth).toBe(true);
      expect(r.line).toContain('✅');
      expect(r.line).toContain('増え続けている');
    });

    it('据え置き(同数)は減少に数えない', () => {
      const r = summarizeLaneTileOscillation([s(5), s(5), s(5)]);
      expect(r.drops).toBe(0);
      expect(r.monotonicGrowth).toBe(true);
    });

    it('★1枚だけの減少も見逃さない(往復の閾値とは別)', () => {
      // 往復判定は OSC_MIN_DELTA=2 未満を無視するが、名簿が減るのは1人でも異常。
      const r = summarizeLaneTileOscillation([s(10), s(9)]);
      expect(r.drops).toBe(1);
      expect(r.monotonicGrowth).toBe(false);
    });

    it('未観測は「増え続けている」と言い切らない(測っていないだけ)', () => {
      const r = summarizeLaneTileOscillation([]);
      expect(r.monotonicGrowth).toBe(false);
      expect(r.line).toContain('⚪');
    });

    it('★減ったら速報に行が出る(往復0でも黙らない)', () => {
      const oscillation = summarizeLaneTileOscillation([s(17, 'light_summary'), s(2, 'light_summary')]);
      const d = buildStoryUserLaneRenderDiag({ ...base, laneTileOscillation: oscillation });
      const text = formatStoryUserLaneRenderDiagLines(d).join('\n');
      expect(text).toContain('増え続けていない');
      expect(text).toContain('17→2枚');
    });

    /*
     * ★v0.1.1357: 私が入れた v1355 の計器が実機で嘘をついた。同じ報告の中に
     *     レーンの人数 ✅ 増え続けている(0→67枚・観測3回)
     *     ★タイルが減った直前の供給元: light_summary(暫定) 13枚→8枚 / shrinkObservedCount:2
     *   が同居していた。履歴は【描こうとした候補数】を積んでおり、縮小ガードで
     *   描かなかった回も候補で埋まるため、実際の画面の増減とずれる。
     *   → 実DOM を見ている laneSupplyOriginDiag の観測を優先する。
     */
    describe('★実DOM起点の縮小観測を優先する(報告内の矛盾を作らない)', () => {
      it('履歴が「増え続けている」でも、実DOMが縮小を見ていれば🔴', () => {
        // 実機の再現: 履歴は 0→67 と単調増加に見えるが、実DOMは 13→8 の縮小を2回観測。
        const r = summarizeLaneTileOscillation([s(0), s(13), s(67)], {
          domShrinkCount: 2,
          domShrinkCulprit: { origin: 'light_summary', prevTiles: 13, nextTiles: 8 }
        });
        expect(r.drops).toBe(2);
        expect(r.monotonicGrowth).toBe(false);
        expect(r.worstDropFrom).toBe(13);
        expect(r.worstDropTo).toBe(8);
        expect(r.worstDropOrigin).toBe('light_summary');
        expect(r.line).toContain('増え続けていない');
        expect(r.line).toContain('13→8枚');
      });

      it('実DOMが縮小0なら履歴どおり(過剰に🔴にしない)', () => {
        const r = summarizeLaneTileOscillation([s(2), s(17), s(67)], { domShrinkCount: 0 });
        expect(r.drops).toBe(0);
        expect(r.monotonicGrowth).toBe(true);
        expect(r.line).toContain('✅');
      });

      it('履歴が既に多く減っていれば、そちらを下回らない(実DOMで上書きしない)', () => {
        const r = summarizeLaneTileOscillation([s(60), s(3), s(50), s(1)], { domShrinkCount: 1 });
        expect(r.drops).toBe(2); // 履歴の2回 > 実DOMの1回
      });

      it('第2引数が無くても壊れない(後方互換)', () => {
        const r = summarizeLaneTileOscillation([s(17), s(2)]);
        expect(r.drops).toBe(1);
      });
    });

    it('増えるだけなら行を出さない(正常時のノイズにしない)', () => {
      const oscillation = summarizeLaneTileOscillation([s(2), s(17), s(67)]);
      const d = buildStoryUserLaneRenderDiag({ ...base, laneTileOscillation: oscillation });
      const text = formatStoryUserLaneRenderDiagLines(d).join('\n');
      expect(text).not.toContain('レーンの人数');
    });
  });
});
