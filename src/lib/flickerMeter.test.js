import { describe, expect, it } from 'vitest';
import { createFlickerMeter, formatFlickerLine, FLICKER_MAX_REGIONS, FLICKER_OPEN_WINDOW_MS, FLICKER_FLIP_WINDOW_MS } from './flickerMeter.js';

const clock = () => { let t = 1_000_000; return { now: () => t, tick: (ms) => { t += ms; } }; };
const attr = (region, el, name, oldValue, newValue) => ({ kind: 'attr', region, el, name, oldValue, newValue });

describe('createFlickerMeter', () => {
  it('★A→B→A(行って戻る)を「往復」として数える=明滅の直接の証拠', () => {
    const c = clock(); const m = createFlickerMeter({ now: c.now });
    const el = {};
    m.record(attr('.icon', el, 'src', 'svg', 'png')); c.tick(100);
    m.record(attr('.icon', el, 'src', 'png', 'svg')); c.tick(100);
    m.record(attr('.icon', el, 'src', 'svg', 'png'));
    const s = m.snapshot().regions['.icon'];
    expect(s.flips).toBe(2);
    expect(s.mut).toBe(3);
    expect(s.src).toBe(3);
  });

  it('★一方向の変化(A→B→C)は往復ではない', () => {
    const c = clock(); const m = createFlickerMeter({ now: c.now });
    const el = {};
    m.record(attr('.x', el, 'src', 'a', 'b')); c.tick(50);
    m.record(attr('.x', el, 'src', 'b', 'c'));
    expect(m.snapshot().regions['.x'].flips).toBe(0);
  });

  it('★往復の時間幅(3秒)を超えた戻りは、往復と数えない(ゆっくりした切り替えは明滅ではない)', () => {
    const c = clock(); const m = createFlickerMeter({ now: c.now });
    const el = {};
    m.record(attr('.x', el, 'class', 'a', 'b')); c.tick(FLICKER_FLIP_WINDOW_MS + 1000);
    m.record(attr('.x', el, 'class', 'b', 'a'));
    expect(m.snapshot().regions['.x'].flips).toBe(0);
  });

  it('★同じ値の書き直し(画像なら再読み込みを起こしうる)は同値として数え、往復にはしない', () => {
    const m = createFlickerMeter();
    const el = {};
    for (let i = 0; i < 5; i++) m.record(attr('.img', el, 'src', 'same', 'same'));
    const s = m.snapshot().regions['.img'];
    expect(s.same).toBe(5);
    expect(s.flips).toBe(0);
  });

  it('★別の要素どうしの値の行き来は、往復にならない(要素ごとに履歴を持つ)', () => {
    const c = clock(); const m = createFlickerMeter({ now: c.now });
    m.record(attr('.t', {}, 'src', 'a', 'b')); c.tick(10);
    m.record(attr('.t', {}, 'src', 'b', 'a'));
    expect(m.snapshot().regions['.t'].flips).toBe(0);
  });

  it('文字の往復(— ↔ 123)も数える', () => {
    const c = clock(); const m = createFlickerMeter({ now: c.now });
    const node = {};
    m.record({ kind: 'text', region: '#count', el: node, oldValue: '—', newValue: '123' }); c.tick(100);
    m.record({ kind: 'text', region: '#count', el: node, oldValue: '123', newValue: '—' });
    const s = m.snapshot().regions['#count'];
    expect(s.flips).toBe(1);
    expect(s.text).toBe(2);
  });

  it('作り直し(子の足し・消し)を数える', () => {
    const m = createFlickerMeter();
    m.record({ kind: 'childList', region: '.lane', added: 30, removed: 28 });
    const s = m.snapshot().regions['.lane'];
    expect(s.add).toBe(30);
    expect(s.rem).toBe(28);
  });

  it('★領域は上限(400)まで。超えたら「その他」にまとめる=台帳が育ち続けない', () => {
    const m = createFlickerMeter();
    for (let i = 0; i < FLICKER_MAX_REGIONS + 20; i++) m.record(attr(`.r${i}`, {}, 'class', 'a', 'b'));
    const keys = Object.keys(m.snapshot().regions);
    expect(keys.length).toBeLessThanOrEqual(FLICKER_MAX_REGIONS + 1);
    expect(keys).toContain('(その他)');
  });

  it('★開いて15秒の時点の写しを凍結する(開いた直後のちらつきを後から読める)', () => {
    const c = clock(); const m = createFlickerMeter({ now: c.now });
    const el = {};
    m.record(attr('.early', el, 'src', 'a', 'b')); c.tick(FLICKER_OPEN_WINDOW_MS + 10);
    m.record(attr('.late', {}, 'src', 'a', 'b'));
    const s = m.snapshot();
    expect(s.open && Object.keys(s.open)).toEqual(['.early']);
    expect(Object.keys(s.regions).sort()).toEqual(['.early', '.late']);
  });

  it('takeDirty は変化があったときだけ true(書き込みの要否)', () => {
    const m = createFlickerMeter();
    expect(m.takeDirty()).toBe(false);
    m.record(attr('.x', {}, 'src', 'a', 'b'));
    expect(m.takeDirty()).toBe(true);
    expect(m.takeDirty()).toBe(false);
  });
});

describe('formatFlickerLine', () => {
  it('★記録が無い・壊れた入力は空(速報に何も足さない)', () => {
    expect(formatFlickerLine(null, 0)).toBe('');
    expect(formatFlickerLine(/** @type {any} */ ({}), 0)).toBe('');
  });

  it('★往復の多い領域が先頭に来る・場所の名前と数が出る(原因は断定しない)', () => {
    const c = clock(); const m = createFlickerMeter({ now: c.now });
    const el = {};
    for (let i = 0; i < 6; i++) { m.record(attr('.nl-story-growth-icon', el, 'src', i % 2 ? 'png' : 'svg', i % 2 ? 'svg' : 'png')); c.tick(50); }
    for (let i = 0; i < 40; i++) m.record(attr('.quiet', { i }, 'class', 'a', 'b'));
    const line = formatFlickerLine(m.snapshot(), c.now());
    expect(line).toContain('ちらつき計');
    const first = line.indexOf('.nl-story-growth-icon');
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(line.indexOf('.quiet'));
    expect(line).toMatch(/往復\d+/);
    expect(line).not.toMatch(/原因|せい/);
  });

  it('計器自身が使った時間(ms)を出す(計器が症状にならないことを速報で確かめられる)', () => {
    const m = createFlickerMeter();
    m.record(attr('.x', {}, 'src', 'a', 'b'), 3);
    m.addSelfMs(4);
    expect(formatFlickerLine(m.snapshot(), Date.now())).toContain('計器自身7ms');
  });
});
