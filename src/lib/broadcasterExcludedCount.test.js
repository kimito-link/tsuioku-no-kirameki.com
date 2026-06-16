import { describe, it, expect } from 'vitest';
import {
  createBroadcasterCountState,
  resolveBroadcasterExcludedCount
} from './broadcasterExcludedCount.js';

describe('resolveBroadcasterExcludedCount', () => {
  it('メイン経路: 配信者数を確定し、生総数から差し引く(398→314)', () => {
    const s = createBroadcasterCountState();
    const r = resolveBroadcasterExcludedCount(s, 'lv123', 398, 84);
    expect(r.displayCount).toBe(314);
    expect(s).toEqual({ lv: 'lv123', count: 84 });
  });

  it('panel 経路(breakdown 無し)は直近の記憶を流用して差し引く', () => {
    const s = createBroadcasterCountState();
    resolveBroadcasterExcludedCount(s, 'lv123', 398, 84); // メインで 84 確定
    const r = resolveBroadcasterExcludedCount(s, 'lv123', 390, undefined); // panel 生値 390
    expect(r.displayCount).toBe(306); // 390 - 84
  });

  it('配信者数が初確定したら、込みで固まったゲート max を全量 rebase する指示を返す', () => {
    const s = createBroadcasterCountState();
    // panel が先に 398(込み)を入れた後、メインで 84 が分かった状況を模す。
    const r = resolveBroadcasterExcludedCount(s, 'lv123', 398, 84);
    expect(r.rebaseGateBy).toBe(84);
  });

  it('同一 lv で配信者数が増えたら、増分だけ rebase する', () => {
    const s = createBroadcasterCountState();
    resolveBroadcasterExcludedCount(s, 'lv123', 398, 84);
    const r = resolveBroadcasterExcludedCount(s, 'lv123', 420, 90); // 84→90
    expect(r.rebaseGateBy).toBe(6);
    expect(r.displayCount).toBe(330); // 420 - 90
  });

  it('配信者数が減っても rebase は増やさない(ゲートは別途単調)', () => {
    const s = createBroadcasterCountState();
    resolveBroadcasterExcludedCount(s, 'lv123', 420, 90);
    const r = resolveBroadcasterExcludedCount(s, 'lv123', 410, 84); // 90→84
    expect(r.rebaseGateBy).toBe(0);
    expect(r.displayCount).toBe(326); // 410 - 84
  });

  it('breakdown=null は記憶をクリア(別配信/未取得)', () => {
    const s = createBroadcasterCountState();
    resolveBroadcasterExcludedCount(s, 'lv123', 398, 84);
    const r = resolveBroadcasterExcludedCount(s, 'lv999', 100, null);
    expect(s).toEqual({ lv: '', count: 0 });
    expect(r.displayCount).toBe(100); // 記憶クリア後は差し引かない
  });

  it('配信者0なら差し引かない(一般的なケース)', () => {
    const s = createBroadcasterCountState();
    const r = resolveBroadcasterExcludedCount(s, 'lv123', 250, 0);
    expect(r.displayCount).toBe(250);
    expect(r.rebaseGateBy).toBe(0);
  });

  it('rawCount が数値でなければ displayCount=null(文言素通し)', () => {
    const s = createBroadcasterCountState();
    const r = resolveBroadcasterExcludedCount(s, 'lv123', null, 84);
    expect(r.displayCount).toBeNull();
  });

  it('lv が非 lv のときは差し引かない(安全)', () => {
    const s = createBroadcasterCountState();
    const r = resolveBroadcasterExcludedCount(s, '', 398, 84);
    expect(r.displayCount).toBe(398);
  });

  it('差し引きすぎは 0 で止める', () => {
    const s = createBroadcasterCountState();
    const r = resolveBroadcasterExcludedCount(s, 'lv1', 50, 80);
    expect(r.displayCount).toBe(0);
  });
});
