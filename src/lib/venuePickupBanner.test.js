import { describe, expect, it } from 'vitest';
import {
  applyVenuePickupView,
  buildVenuePickupView,
  createVenuePickupBanner
} from './venuePickupBanner.js';

/**
 * v0.1.1230: 会場のピックアップ枠(BSP風)。
 * ★出し先を①POPのtickerから会場ヘッダー直下へ移した理由:
 *   会場を見ている間 ticker はスクロール外で目に入らず、
 *   「埋もれるコメントを拾う」のに拾った先がまた埋もれていた。
 */

/** 最小の DOM スタブ(jsdom 非依存で書ける範囲に留める)。 */
function makeDocStub() {
  const mk = () => {
    const el = {
      className: '',
      textContent: '',
      dataset: {},
      children: [],
      attrs: {},
      append(...kids) { this.children.push(...kids); },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      removeAttribute(k) { delete this.attrs[k]; }
    };
    return el;
  };
  return { createElement: mk };
}

describe('createVenuePickupBanner', () => {
  it('枠・本文・メタの3要素を作る(DOMは1回だけ作って以後 remove しない前提)', () => {
    const els = createVenuePickupBanner(/** @type {any} */ (makeDocStub()));
    expect(els.root).toBeTruthy();
    expect(els.body).toBeTruthy();
    expect(els.meta).toBeTruthy();
    expect(els.root.className).toContain('nlsb-pickup');
  });

  it('読み上げソフト向けの属性が付く', () => {
    const els = createVenuePickupBanner(/** @type {any} */ (makeDocStub()));
    expect(els.root.attrs.role).toBe('status');
    expect(els.root.attrs['aria-live']).toBe('polite');
  });
});

describe('buildVenuePickupView', () => {
  it('本文が無ければ案内文を出す(枠は死に画面にしない)', () => {
    const v = buildVenuePickupView(null);
    expect(v.empty).toBe(true);
    expect(v.text).toContain('ここに1件ずつ');
  });

  it('選ばれたコメントの本文を出す', () => {
    const v = buildVenuePickupView({ entry: { text: 'これはえらばれたコメント' }, why: 'scored' });
    expect(v.empty).toBe(false);
    expect(v.text).toBe('これはえらばれたコメント');
  });

  it('★長文は切る(枠が伸びて下の段を押さないため)', () => {
    const long = 'あ'.repeat(200);
    const v = buildVenuePickupView({ entry: { text: long }, why: 'scored' }, { maxChars: 20 });
    expect(Array.from(v.text).length).toBeLessThanOrEqual(21); // 20 + 省略記号
    expect(v.text.endsWith('…')).toBe(true);
  });

  it('名前があれば添える', () => {
    const v = buildVenuePickupView({ entry: { text: 'やっほー', name: 'だるま' }, why: 'scored' });
    expect(v.meta).toBe('だるま');
  });

  it('★匿名は名前を出さない(無い名前を捏造しない)', () => {
    const v = buildVenuePickupView({ entry: { text: 'とくめいの発言', name: '' }, why: 'scored' });
    expect(v.meta).toBe('');
  });

  /**
   * ★実データで踏んだ穴: 会場の行は【ギフトでも text:'' のことがある】。
   *   案内文にフォールバックすると「選ばれているのに動いていない」ように見える。
   *   実装前に probe スクリプトで検出できた(手書きテストだけでは気づけなかった)。
   */
  it('★本文が空のギフトでも案内文に落ちない(選ばれた事実を言葉にする)', () => {
    const v = buildVenuePickupView({ entry: { text: '', name: 'ギフト主', kind: 'gift' }, why: 'gift' });
    expect(v.empty).toBe(false);
    expect(v.text).toContain('ギフト主');
    expect(v.meta).toContain('ギフト');
  });

  it('名前の無いギフトでも文になる', () => {
    const v = buildVenuePickupView({ entry: { text: '', name: '' }, why: 'gift' });
    expect(v.empty).toBe(false);
    expect(v.text).toContain('ギフト');
  });

  it('ギフトはギフトとして示す', () => {
    const v = buildVenuePickupView({ entry: { text: 'ありがとう', name: 'g' }, why: 'gift' });
    expect(v.meta).toContain('ギフト');
  });

  it('改行や連続空白は1つに畳む(枠が伸びない)', () => {
    const v = buildVenuePickupView({ entry: { text: 'あ   い\n\nう' }, why: 'scored' });
    expect(v.text).toBe('あ い う');
  });
});

describe('applyVenuePickupView — diff-skip', () => {
  it('同じ内容なら DOM を書き換えない', () => {
    const els = createVenuePickupBanner(/** @type {any} */ (makeDocStub()));
    const view = buildVenuePickupView({ entry: { text: 'おなじ本文' }, why: 'scored' });
    expect(applyVenuePickupView(els, view)).toBe(true);
    expect(applyVenuePickupView(els, view)).toBe(false); // 2回目は書き換えない
  });

  it('内容が変われば書き換える', () => {
    const els = createVenuePickupBanner(/** @type {any} */ (makeDocStub()));
    applyVenuePickupView(els, buildVenuePickupView({ entry: { text: 'ひとつめ' } }));
    expect(applyVenuePickupView(els, buildVenuePickupView({ entry: { text: 'ふたつめ' } }))).toBe(true);
  });

  it('★「消す側」(空へ戻る)も同じ経路を通る', () => {
    const els = createVenuePickupBanner(/** @type {any} */ (makeDocStub()));
    applyVenuePickupView(els, buildVenuePickupView({ entry: { text: 'なにか' } }));
    const back = applyVenuePickupView(els, buildVenuePickupView(null));
    expect(back).toBe(true);
    expect(els.root.attrs['data-empty']).toBe('1');
  });

  it('壊れた入力でも例外を投げない', () => {
    expect(() => applyVenuePickupView(null, buildVenuePickupView(null))).not.toThrow();
  });
});

describe('venuePickupPlacement(PICK UP を映像の上端中央へ)', () => {
  it('映像の中心に合わせ、幅は映像から余白を引いた分まで', async () => {
    const { venuePickupPlacement } = await import('./venuePickupBanner.js');
    // PC 実測(YouTube 1400px): 映像 x16 w960・会場 x0 → 中心 496・幅 936 は上限 860 で止まる
    expect(venuePickupPlacement({ left: 16, top: 68, width: 960, height: 540 }, { left: 0, top: 56, width: 1400 })).toEqual({ left: 496, top: 20, width: 860 });
    // 映像が狭いと映像の幅に収める
    expect(venuePickupPlacement({ left: 0, top: 200, width: 600, height: 338 }, { left: 0, top: 56, width: 1000 })).toEqual({ left: 300, top: 152, width: 576 });
  });
  it('映像が見つからない・小さすぎるときは null(CSS の既定のまま)', async () => {
    const { venuePickupPlacement } = await import('./venuePickupBanner.js');
    expect(venuePickupPlacement(null, { left: 0, top: 0, width: 1000 })).toBeNull();
    expect(venuePickupPlacement({ left: 0, top: 0, width: 100, height: 60 }, { left: 0, top: 0, width: 1000 })).toBeNull();
  });
});
