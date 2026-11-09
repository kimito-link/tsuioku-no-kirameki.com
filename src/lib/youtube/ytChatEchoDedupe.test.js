import { describe, it, expect } from 'vitest';
import { createYtEchoDedupe, ytEchoKey } from './ytChatEchoDedupe.js';

const row = (id, text = 'もうすぐ10万登録いきそうですね', name = '@jptk6645') => ({ id, kind: 'text', channelId: 'UC' + name, name, text });

describe('ytChatEchoDedupe(自分の送ったコメントの仮の行→本物の行)', () => {
  it('仮の行が外れて本物の行が来たら同じコメント(2件目を送らない)', () => {
    const d = createYtEchoDedupe();
    const tmp = { isConnected: true };
    expect(d.classify(row('tmp-1'), tmp, { now: 1000 })).toBe('new');
    tmp.isConnected = false;
    expect(d.classify(row('real-1'), { isConnected: true }, { now: 1800 })).toBe('echo');
  });
  it('同じ要素の id が書き換わったら同じコメント', () => {
    const d = createYtEchoDedupe();
    const el = { isConnected: true };
    d.classify(row('tmp-1'), el, { now: 1000 });
    expect(d.classify(row('real-1'), el, { now: 1500 })).toBe('echo');
  });
  it('前の行がまだある間は待つ → 待った後に外れていれば同じコメント', () => {
    const d = createYtEchoDedupe();
    const tmp = { isConnected: true };
    const real = { isConnected: true };
    d.classify(row('tmp-1'), tmp, { now: 1000 });
    expect(d.classify(row('real-1'), real, { now: 1100 })).toBe('wait');
    tmp.isConnected = false;
    expect(d.classify(row('real-1'), real, { now: 2300, waited: true })).toBe('echo');
  });
  it('待っても前の行が残っている=本当に2回書いた(連投)は両方記録', () => {
    const d = createYtEchoDedupe();
    const a = { isConnected: true };
    const b = { isConnected: true };
    d.classify(row('a'), a, { now: 1000 });
    expect(d.classify(row('b'), b, { now: 3000 })).toBe('wait');
    expect(d.classify(row('b'), b, { now: 4200, waited: true })).toBe('new');
  });
  it('30秒より後・別の人・別の文は別のコメント', () => {
    const d = createYtEchoDedupe();
    const gone = { isConnected: false };
    d.classify(row('a'), gone, { now: 0 });
    expect(d.classify(row('b'), {}, { now: 40000 })).toBe('new');
    d.classify(row('c', 'こんばんは', 'A'), gone, { now: 50000 });
    expect(d.classify(row('d', 'こんばんは', 'B'), {}, { now: 50100 })).toBe('new');
    expect(d.classify(row('e', 'こんにちは', 'A'), {}, { now: 50200 })).toBe('new');
  });
  it('同じ id の読み直しは差し替えではない', () => {
    const d = createYtEchoDedupe();
    const el = { isConnected: true };
    d.classify(row('a'), el, { now: 0 });
    expect(d.classify(row('a'), el, { now: 100 })).toBe('new');
  });
  it('名前も文も無いものは見ない', () => {
    expect(ytEchoKey({ text: '' })).toBe('');
    expect(createYtEchoDedupe().classify({ id: 'x', text: '' }, {}, { now: 0 })).toBe('new');
  });
});
