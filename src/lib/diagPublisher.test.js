import { describe, it, expect, vi } from 'vitest';
import { createDiagPublisher } from './diagPublisher.js';
import { copyDiagBySchema } from './diagSchemaCopy.js';
import { CANONICAL_TIME_FIELD } from './timeAuthority.js';

/** @type {import('./diagSchemaCopy.js').DiagSchema} */
const SCHEMA = [
  { name: 'okCount', kind: 'count' },
  { name: 'lastMs', kind: 'ms' }
];

/** @param {Record<string, unknown>} extra */
function makePublisher(extra = {}) {
  const calls = [];
  const publish = createDiagPublisher({
    key: 'test_key_v1',
    source: 'popup',
    buildSnapshot: (state, now) => copyDiagBySchema(SCHEMA, state, { [CANONICAL_TIME_FIELD]: now }),
    setItems: (items) => calls.push(items),
    now: () => 1000,
    ...extra
  });
  return { publish, calls };
}

describe('createDiagPublisher: ★無条件 publish(失敗#6 を塞ぐ)', () => {
  it('件数が0でも必ず書く(異常時ほど計器が要る)', () => {
    const { publish, calls } = makePublisher();
    publish({ okCount: 0 });
    expect(calls.length).toBe(1);
    expect(calls[0].test_key_v1.okCount).toBe(0);
  });

  it('state が null でも書く(「キーが無い」を作らない)', () => {
    const { publish, calls } = makePublisher();
    publish(null);
    expect(calls.length).toBe(1);
    expect(calls[0].test_key_v1).toMatchObject({ okCount: 0, lastMs: -1, source: 'popup' });
  });

  it('source(面名)を必ず載せる(失敗#8: 同名フィールドが2面にある)', () => {
    const { publish, calls } = makePublisher({ source: 'venue' });
    publish({ okCount: 5 });
    expect(calls[0].test_key_v1.source).toBe('venue');
  });

  it('時点フィールドに now() の値が載る', () => {
    const { publish, calls } = makePublisher();
    publish({});
    expect(calls[0].test_key_v1[CANONICAL_TIME_FIELD]).toBe(1000);
  });

  it('buildSnapshot が例外を投げても「書かない」で終わらせない', () => {
    const { publish, calls } = makePublisher({
      buildSnapshot: () => {
        throw new Error('boom');
      }
    });
    publish({});
    expect(calls.length).toBe(1);
    expect(calls[0].test_key_v1.source).toBe('popup');
  });

  it('setItems が例外を投げても本体を壊さない', () => {
    const publish = createDiagPublisher({
      key: 'k',
      source: 'popup',
      buildSnapshot: () => ({}),
      setItems: () => {
        throw new Error('storage down');
      }
    });
    expect(() => publish({})).not.toThrow();
  });

  it('設定が不完全なら何もしない(key/buildSnapshot/setItems 欠落)', () => {
    const setItems = vi.fn();
    createDiagPublisher({ key: '', source: 'popup', buildSnapshot: () => ({}), setItems })({});
    expect(setItems).not.toHaveBeenCalled();
  });
});
