/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest';
import { regionKeyOf, startFlickerMeter } from './flickerMeterBoot.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('regionKeyOf', () => {
  it('★近い祖先の id を場所の名前にする', () => {
    document.body.innerHTML = '<div id="liveStat"><span><b id="x"></b></span></div>';
    expect(regionKeyOf(document.getElementById('x'), new WeakMap())).toBe('#x');
    document.body.innerHTML = '<div id="liveStat"><span><em class="z"></em></span></div>';
    expect(regionKeyOf(document.querySelector('em'), new WeakMap())).toBe('#liveStat');
  });

  it('★nl- で始まる class を名前にする・無ければタグ名・文字ノードは親で数える', () => {
    document.body.innerHTML = '<ul><li class="foo nl-story-growth-icon"><i></i></li></ul><p>t</p>';
    expect(regionKeyOf(document.querySelector('i'), new WeakMap())).toBe('.nl-story-growth-icon');
    expect(regionKeyOf(document.querySelector('p'), new WeakMap())).toBe('p');
    expect(regionKeyOf(document.querySelector('p').firstChild, new WeakMap())).toBe('p');
  });
});

describe('startFlickerMeter(実際の DOM の書き換えを数える)', () => {
  it('★画像の src が A→B→A と行き来すると「往復」として数えられ、session に写しが書かれる', async () => {
    document.body.innerHTML = '<div id="lane"><img class="nl-icon" src="data:a"></div>';
    const set = vi.fn(() => Promise.resolve());
    let publish = () => {};
    const m = startFlickerMeter({ doc: document, MutationObserverCtor: MutationObserver, session: { set }, setIntervalRef: (fn) => { publish = fn; return 0; } });
    const img = document.querySelector('img');
    for (const v of ['data:b', 'data:a', 'data:b', 'data:a']) {
      img.setAttribute('src', v);
      await tick();
    }
    const s = m.meter.snapshot().regions['.nl-icon'];
    expect(s.flips).toBeGreaterThanOrEqual(2);
    expect(s.src).toBe(4);
    publish();
    expect(set).toHaveBeenCalledTimes(1);
    const written = /** @type {any} */ (set.mock.calls[0])[0];
    expect(Object.keys(written)).toEqual(['nls_flicker_meter_sidepanel_v1']);
    m.stop();
  });

  it('★同じ値を書き直しても「同値の書き直し」として数える', async () => {
    document.body.innerHTML = '<img class="nl-i" src="data:a">';
    const m = startFlickerMeter({ doc: document, MutationObserverCtor: MutationObserver, session: { set: vi.fn() }, setIntervalRef: () => 0 });
    const img = document.querySelector('img');
    for (let i = 0; i < 3; i++) {
      img.setAttribute('src', 'data:a');
      await tick();
    }
    expect(m.meter.snapshot().regions['.nl-i'].same).toBe(3);
    m.stop();
  });

  it('★子の足し・消し(作り直し)と文字の変更を数える', async () => {
    document.body.innerHTML = '<div id="lane"></div><span id="n">1</span>';
    const m = startFlickerMeter({ doc: document, MutationObserverCtor: MutationObserver, session: { set: vi.fn() }, setIntervalRef: () => 0 });
    const lane = document.getElementById('lane');
    lane.innerHTML = '<i></i><i></i><i></i>';
    await tick();
    lane.innerHTML = '<i></i>';
    await tick();
    /** @type {any} */ (document.getElementById('n')).firstChild.data = '2';
    await tick();
    const r = m.meter.snapshot().regions;
    expect(r['#lane'].add).toBe(4);
    expect(r['#lane'].rem).toBe(3);
    expect(r['#n'].text).toBe(1);
    m.stop();
  });

  it('変化が無ければ書き込まない(storage を無駄に叩かない)', async () => {
    document.body.innerHTML = '<div></div>';
    const set = vi.fn(() => Promise.resolve());
    let publish = () => {};
    const m = startFlickerMeter({ doc: document, MutationObserverCtor: MutationObserver, session: { set }, setIntervalRef: (fn) => { publish = fn; return 0; } });
    publish();
    expect(set).not.toHaveBeenCalled();
    m.stop();
  });

  it('★storage の失敗(拡張更新後など)で例外を出さない', async () => {
    document.body.innerHTML = '<img class="nl-i" src="data:a">';
    let publish = () => {};
    const m = startFlickerMeter({ doc: document, MutationObserverCtor: MutationObserver, session: { set: () => { throw new Error('invalidated'); } }, setIntervalRef: (fn) => { publish = fn; return 0; } });
    document.querySelector('img').setAttribute('src', 'data:b');
    await tick();
    expect(() => publish()).not.toThrow();
    m.stop();
  });
});
