/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { collectCharaLiveCensus, charaLiveVerdict } from './charaLiveCensus.js';

/** 見えている状態の実測値。 */
function okCensus(over = {}) {
  return {
    mounted: true,
    parent: 'nlsb-stage',
    inVenueStage: true,
    hidden: false,
    display: 'flex',
    visibility: 'visible',
    opacity: '1',
    zIndex: '8',
    rect: { x: 800, y: 600, w: 380, h: 120 },
    charaCount: 3,
    imgLoaded: 3,
    imgBroken: 0,
    coveredBy: '',
    ...over
  };
}

describe('キャラライブ実測の判定', () => {
  it('全部そろっていれば「表示中」', () => {
    const v = charaLiveVerdict(okCensus());
    expect(v.visible).toBe(true);
    expect(v.line).toContain('✅');
    expect(v.line).toContain('3体');
  });

  // ★ここから下は、実際に3回外した原因それぞれに対応する。
  //   どれが起きても【理由が名指しで出る】ことを保証する。

  it('起動していない → そう言う', () => {
    const v = charaLiveVerdict(okCensus({ mounted: false }));
    expect(v.visible).toBe(false);
    expect(v.reason).toContain('起動コードが走っていない');
  });

  it('会場の外に刺さっている → 親の名前を出す(1回目の原因)', () => {
    const v = charaLiveVerdict(okCensus({ inVenueStage: false, parent: 'body-ish' }));
    expect(v.visible).toBe(false);
    expect(v.reason).toContain('会場ステージの外');
    expect(v.reason).toContain('body-ish');
  });

  it('覆われている → 覆っている要素の名前と z を出す(2回目の原因)', () => {
    const v = charaLiveVerdict(okCensus({ coveredBy: 'nlsb-roster-panel', zIndex: '6' }));
    expect(v.visible).toBe(false);
    expect(v.reason).toContain('nlsb-roster-panel');
    expect(v.reason).toContain('6');
  });

  it('hidden のまま → そう言う', () => {
    expect(charaLiveVerdict(okCensus({ hidden: true })).reason).toContain('hidden');
  });

  it('display:none → そう言う', () => {
    expect(charaLiveVerdict(okCensus({ display: 'none' })).reason).toContain('display:none');
  });

  it('大きさ0 → そう言う', () => {
    const v = charaLiveVerdict(okCensus({ rect: { x: 0, y: 0, w: 0, h: 0 } }));
    expect(v.reason).toContain('大きさが 0');
  });

  it('画像が読めていない → 壊れた枚数まで出す', () => {
    const v = charaLiveVerdict(okCensus({ imgLoaded: 0, imgBroken: 3 }));
    expect(v.reason).toContain('画像が1枚も読めていない');
    expect(v.reason).toContain('3');
  });
});

describe('実測の採取(DOMを読むだけ)', () => {
  it('要素が無ければ mounted=false(例外を投げない)', () => {
    document.body.innerHTML = '';
    const c = collectCharaLiveCensus(document);
    expect(c.mounted).toBe(false);
    expect(charaLiveVerdict(c).visible).toBe(false);
  });

  it('会場ステージ内にあれば inVenueStage=true・親の名前が取れる', () => {
    document.body.innerHTML = `
      <div class="nlsb-root">
        <section class="nlsb-stage">
          <div class="nlcl-stage">
            <div class="nlcl-chara"><img alt="a"></div>
            <div class="nlcl-chara"><img alt="b"></div>
            <div class="nlcl-chara"><img alt="c"></div>
          </div>
        </section>
      </div>`;
    const c = collectCharaLiveCensus(document);
    expect(c.mounted).toBe(true);
    expect(c.inVenueStage).toBe(true);
    expect(c.parent).toBe('nlsb-stage');
    expect(c.charaCount).toBe(3);
  });

  it('DOM を書き換えない(観測が対象を変えない)', () => {
    document.body.innerHTML = `<section class="nlsb-stage"><div class="nlcl-stage"></div></section>`;
    const before = document.body.innerHTML;
    collectCharaLiveCensus(document);
    expect(document.body.innerHTML).toBe(before);
  });
});
