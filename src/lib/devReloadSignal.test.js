import { describe, it, expect } from 'vitest';
import {
  createDevReloadState,
  parseDevReloadId,
  applyDevReloadSignal
} from './devReloadSignal.js';

describe('parseDevReloadId', () => {
  it('数値 ms 文字列はそのまま採用（前後空白除去）', () => {
    expect(parseDevReloadId('1717200000000')).toBe('1717200000000');
    expect(parseDevReloadId('  1717200000000\n')).toBe('1717200000000');
  });

  it('英数・記号（hash 風）も許容', () => {
    expect(parseDevReloadId('0601-054054')).toBe('0601-054054');
    expect(parseDevReloadId('abc.123:def')).toBe('abc.123:def');
  });

  it('空・null・空白のみは null', () => {
    expect(parseDevReloadId('')).toBeNull();
    expect(parseDevReloadId('   ')).toBeNull();
    expect(parseDevReloadId(null)).toBeNull();
    expect(parseDevReloadId(undefined)).toBeNull();
  });

  it('不正文字（空白混じり・HTML 等）や長すぎは null', () => {
    expect(parseDevReloadId('<html>not found</html>')).toBeNull();
    expect(parseDevReloadId('123 456')).toBeNull();
    expect(parseDevReloadId('x'.repeat(200))).toBeNull();
  });
});

describe('applyDevReloadSignal（dev ホットリロードの状態機械）', () => {
  it('初回観測はベースライン採用のみ・リロードしない（ロード直後の無限ループ防止）', () => {
    const s0 = createDevReloadState();
    const r = applyDevReloadSignal(s0, '100');
    expect(r.shouldReload).toBe(false);
    expect(r.state.baselineId).toBe('100');
    expect(r.id).toBe('100');
  });

  it('同じ id を観測し続けてもリロードしない', () => {
    let s = createDevReloadState();
    s = applyDevReloadSignal(s, '100').state;
    const r1 = applyDevReloadSignal(s, '100');
    expect(r1.shouldReload).toBe(false);
    const r2 = applyDevReloadSignal(r1.state, '100');
    expect(r2.shouldReload).toBe(false);
  });

  it('id が変わったらリロードし、ベースラインを更新する', () => {
    const s = applyDevReloadSignal(createDevReloadState(), '100').state;
    const r = applyDevReloadSignal(s, '200');
    expect(r.shouldReload).toBe(true);
    expect(r.state.baselineId).toBe('200');
    // 更新後の 200 を再観測してもリロードしない（1 回だけ）。
    expect(applyDevReloadSignal(r.state, '200').shouldReload).toBe(false);
  });

  it('連続リビルド（100→200→300）でそれぞれ 1 回ずつリロード', () => {
    const s = applyDevReloadSignal(createDevReloadState(), '100').state;
    const r2 = applyDevReloadSignal(s, '200');
    expect(r2.shouldReload).toBe(true);
    const r3 = applyDevReloadSignal(r2.state, '300');
    expect(r3.shouldReload).toBe(true);
    expect(r3.state.baselineId).toBe('300');
  });

  it('読み取り失敗（空/不正）はベースラインを壊さず素通り', () => {
    const s = applyDevReloadSignal(createDevReloadState(), '100').state;
    const r = applyDevReloadSignal(s, '');
    expect(r.shouldReload).toBe(false);
    expect(r.state.baselineId).toBe('100');
    // 直後に正しい変化を観測すれば従来どおりリロードできる。
    expect(applyDevReloadSignal(r.state, '200').shouldReload).toBe(true);
  });

  it('初回が空なら baseline は null のまま（次の有効値で採用）', () => {
    const r0 = applyDevReloadSignal(createDevReloadState(), '');
    expect(r0.state.baselineId).toBeNull();
    const r1 = applyDevReloadSignal(r0.state, '100');
    expect(r1.shouldReload).toBe(false);
    expect(r1.state.baselineId).toBe('100');
  });

  it('state が不正でも安全に初期化して扱う', () => {
    // @ts-expect-error 故意の不正入力
    const r = applyDevReloadSignal(null, '100');
    expect(r.state.baselineId).toBe('100');
    expect(r.shouldReload).toBe(false);
  });
});
