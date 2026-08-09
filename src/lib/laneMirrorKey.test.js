import { describe, expect, it } from 'vitest';
import {
  KEY_LANE_MIRROR,
  laneMirrorKeyFor,
  laneReceiptKeyFor,
  liveIdFromLaneMirrorKey
} from './laneMirrorKey.js';

/**
 * ★v0.1.1300: 配信ごとの鏡キー / 受領証キー。
 *
 * 単一グローバルキー(KEY_LANE_MIRROR)は
 *   - 多配信タブで最後の書き手が他配信を上書きする
 *   - 合流バッファの section 保持と相まって古い配信の lane を再同梱する
 * という2つの構造的欠陥を持つ。配信ごとに分けるとどちらも成立しなくなる。
 */
describe('laneMirrorKeyFor(配信ごとの鏡キー)', () => {
  it('liveId ごとに違うキーになる(=互いに上書きしない)', () => {
    const a = laneMirrorKeyFor('lv111');
    const b = laneMirrorKeyFor('lv222');
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('大文字小文字・前後空白を正規化する(同じ配信は同じキー)', () => {
    expect(laneMirrorKeyFor(' LV351133862 ')).toBe(laneMirrorKeyFor('lv351133862'));
  });

  it('空/不正な liveId は空文字(呼び手が「書かない」判断をできる)', () => {
    expect(laneMirrorKeyFor('')).toBe('');
    expect(laneMirrorKeyFor(null)).toBe('');
    expect(laneMirrorKeyFor(undefined)).toBe('');
  });

  it('★旧キーとは別物(移行中に旧読み手を壊さない)', () => {
    expect(laneMirrorKeyFor('lv1')).not.toBe(KEY_LANE_MIRROR);
  });

  it('既存 storage の命名慣習(nls_ 接頭辞)に従う', () => {
    expect(laneMirrorKeyFor('lv1')).toMatch(/^nls_/);
  });
});

describe('laneReceiptKeyFor(実DOM受領証キー)', () => {
  it('鏡キーとは別のキー(データと受領証を分離する)', () => {
    expect(laneReceiptKeyFor('lv1')).not.toBe(laneMirrorKeyFor('lv1'));
  });

  it('liveId ごとに違う / 空は空文字', () => {
    expect(laneReceiptKeyFor('lv1')).not.toBe(laneReceiptKeyFor('lv2'));
    expect(laneReceiptKeyFor('')).toBe('');
  });
});

describe('liveIdFromLaneMirrorKey(逆引き)', () => {
  it('鏡キーから liveId を取り出せる(往復する)', () => {
    expect(liveIdFromLaneMirrorKey(laneMirrorKeyFor('lv351133862'))).toBe('lv351133862');
  });

  it('鏡キーでないものは空文字(受領証キー・旧キー・無関係キー)', () => {
    expect(liveIdFromLaneMirrorKey(laneReceiptKeyFor('lv1'))).toBe('');
    expect(liveIdFromLaneMirrorKey(KEY_LANE_MIRROR)).toBe('');
    expect(liveIdFromLaneMirrorKey('nls_ctail_lv1')).toBe('');
    expect(liveIdFromLaneMirrorKey('')).toBe('');
  });
});
