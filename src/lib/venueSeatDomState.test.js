import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createEmptySeatState, flushVenueSeatState } from './venueSeatDomState.js';

/** DOM への書き込みを数える偽の席(MutationObserver が見る「変更の記録」と同じ数え方: 値が同じでも書けば1件)。 */
function fakeSeat() {
  const attrs = new Map([['aria-hidden', 'true']]);
  const classes = new Set(['nlsb-seat', 'nlsb-is-empty']);
  const dataset = {};
  const w = { n: 0 };
  return {
    w,
    attrs,
    classes,
    dataset,
    classList: {
      contains: (t) => classes.has(t),
      add: (t) => { w.n += 1; classes.add(t); },
      remove: (t) => { w.n += 1; classes.delete(t); }
    },
    getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
    setAttribute: (n, v) => { w.n += 1; attrs.set(n, String(v)); },
    removeAttribute: (n) => { w.n += 1; attrs.delete(n); }
  };
}

describe('flushVenueSeatState: 変わった項目だけ書く', () => {
  it('★空の席に空の状態を流しても、書き込みは0件', () => {
    const seat = fakeSeat();
    flushVenueSeatState(seat, createEmptySeatState());
    expect(seat.w.n).toBe(0);
  });

  it('★同じ最終状態を何度流しても、2回目以降の書き込みは0件(旧実装は毎回 約10件/席)', () => {
    const seat = fakeSeat();
    const next = { empty: false, link: true, vip: true, aria: 'false', title: 'ゆ〜き', streak: 2 };
    flushVenueSeatState(seat, next);
    const first = seat.w.n;
    expect(first).toBeGreaterThan(0);
    for (let i = 0; i < 50; i += 1) flushVenueSeatState(seat, { ...next });
    expect(seat.w.n).toBe(first);
  });

  it('★最終状態が正しく DOM に出る(空→飾り→空へ戻す)', () => {
    const seat = fakeSeat();
    flushVenueSeatState(seat, { empty: false, link: true, vip: true, aria: 'false', title: 'a', streak: 3 });
    expect([...seat.classes].sort()).toEqual(['nlsb-seat', 'nlsb-seat-link', 'nlsb-seat-vip']);
    expect(seat.attrs.get('aria-hidden')).toBe('false');
    expect(seat.attrs.get('title')).toBe('a');
    expect(seat.dataset.streak).toBe('3');
    flushVenueSeatState(seat, createEmptySeatState());
    expect([...seat.classes].sort()).toEqual(['nlsb-is-empty', 'nlsb-seat']);
    expect(seat.attrs.get('aria-hidden')).toBe('true');
    expect(seat.attrs.has('title')).toBe(false);
    expect(seat.dataset.streak).toBeUndefined();
  });

  it('★旧仕様の nlsb-seat-regular が付いていたら外す(無ければ何も書かない)', () => {
    const seat = fakeSeat();
    seat.classes.add('nlsb-seat-regular');
    flushVenueSeatState(seat, createEmptySeatState());
    expect(seat.classes.has('nlsb-seat-regular')).toBe(false);
    const before = seat.w.n;
    flushVenueSeatState(seat, createEmptySeatState());
    expect(seat.w.n).toBe(before);
  });

  it('★次の描画で title だけ変われば、title の1件だけを書く', () => {
    const seat = fakeSeat();
    const base = { empty: false, link: false, vip: false, aria: 'false', title: 'a', streak: 0 };
    flushVenueSeatState(seat, base);
    const n = seat.w.n;
    flushVenueSeatState(seat, { ...base, title: 'b' });
    expect(seat.w.n).toBe(n + 1);
  });

  it('★next が無い/席が無いときは何もしない(描画を止めない)', () => {
    expect(() => flushVenueSeatState(null, createEmptySeatState())).not.toThrow();
    expect(() => flushVenueSeatState(fakeSeat(), null)).not.toThrow();
  });
});

describe('配線: renderSeats は席へ直接書かず、最終状態を1回だけ flush する', () => {
  const src = fs.readFileSync(path.resolve('src/extension/venueBar.js'), 'utf8').split('\r\n').join('\n');
  const i = src.indexOf('const visibleSeatIndexSet = new Set(visibleSeats.map');
  const j = src.indexOf('_venueUnseatedCount = unseatedThisPaint;');
  const body = src.slice(i, j + 60);
  it('★席の class / aria-hidden / title / streak を renderSeats の本体で直接書いていない', () => {
    expect(body).not.toMatch(/node\.seat\.classList\.(add|remove|toggle)\(/);
    expect(body).not.toMatch(/node\.seat\.setAttribute\('aria-hidden'/);
    expect(body).not.toMatch(/node\.seat\.title\s*=/);
    expect(body).not.toMatch(/node\.seat\.removeAttribute\('title'\)/);
    expect(body).not.toMatch(/dataset\.streak\s*=/);
  });
  it('★装飾ループの後に全席を flush している(census は最終 DOM を数えるのでその前)', () => {
    expect(body).toMatch(/for \(let i = 0; i < seatNodes\.length; i \+= 1\) flushVenueSeatState\(seatNodes\[i\]\.seat, seatNodes\[i\]\.next\);\n\s*_venueUnseatedCount = unseatedThisPaint;/);
  });
  it('★空へ戻す側は next を作るだけ(createEmptySeatState)', () => {
    expect(body).toMatch(/node\.next = createEmptySeatState\(\);/);
  });
});
