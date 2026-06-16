import { describe, expect, it } from 'vitest';
import {
  BACKFILL_HEARTBEAT_INDEX_MAX,
  BACKFILL_HEARTBEAT_KEY_PREFIX,
  BACKFILL_HEARTBEAT_MIN_GAP,
  BACKFILL_HEARTBEAT_STALE_MS,
  KEY_BACKFILL_BG_KICK_ENABLED,
  KEY_BACKFILL_HEARTBEAT_INDEX,
  backfillHeartbeatKey,
  buildBackfillHeartbeat,
  isBackfillHeartbeatKey,
  mergeHeartbeatLidIndex,
  normalizeHeartbeatLid,
  normalizeHeartbeatLidIndex,
  parseBackfillHeartbeat,
  shouldSwKickBackfillForLive
} from './backfillHeartbeat.js';

describe('storage キー(正本)', () => {
  it('接頭辞と有効化キーが安定している', () => {
    expect(BACKFILL_HEARTBEAT_KEY_PREFIX).toBe('nls_backfill_hb_');
    expect(KEY_BACKFILL_BG_KICK_ENABLED).toBe('nls_backfill_bg_kick_enabled_v1');
  });
  it('backfillHeartbeatKey は lid を小文字 trim で付ける', () => {
    expect(backfillHeartbeatKey('LV12345')).toBe('nls_backfill_hb_lv12345');
    expect(backfillHeartbeatKey(' lv678 ')).toBe('nls_backfill_hb_lv678');
  });
  it('isBackfillHeartbeatKey は接頭辞+lid 部があるものだけ true', () => {
    expect(isBackfillHeartbeatKey('nls_backfill_hb_lv1')).toBe(true);
    expect(isBackfillHeartbeatKey('nls_backfill_hb_')).toBe(false); // lid 部なし
    expect(isBackfillHeartbeatKey('nls_other_lv1')).toBe(false);
    expect(isBackfillHeartbeatKey(123)).toBe(false);
  });
  it('normalizeHeartbeatLid は null/数値も安全に文字列化', () => {
    expect(normalizeHeartbeatLid(null)).toBe('');
    expect(normalizeHeartbeatLid(undefined)).toBe('');
    expect(normalizeHeartbeatLid(' LV9 ')).toBe('lv9');
  });
});

describe('buildBackfillHeartbeat', () => {
  const base = {
    lid: 'lv350000001',
    viewBase: 'https://mpn.live.nicovideo.jp/api/view/v4/x',
    programBeginAtMs: 1_700_000_000_000,
    officialCount: 500,
    recordedCount: 100,
    deterministic: true,
    foreground: false,
    now: 1_700_000_100_000
  };

  it('正常値をそのまま正規化して返す(v=1)', () => {
    expect(buildBackfillHeartbeat(base)).toEqual({
      v: 1,
      lid: 'lv350000001',
      viewBase: 'https://mpn.live.nicovideo.jp/api/view/v4/x',
      programBeginAtMs: 1_700_000_000_000,
      officialCount: 500,
      recordedCount: 100,
      deterministic: true,
      foreground: false,
      ts: 1_700_000_100_000
    });
  });

  it('viewBase が http(s) でなければ空文字に倒す', () => {
    expect(buildBackfillHeartbeat({ ...base, viewBase: 'ws://x' }).viewBase).toBe('');
    expect(buildBackfillHeartbeat({ ...base, viewBase: '' }).viewBase).toBe('');
    expect(
      buildBackfillHeartbeat({ ...base, viewBase: '  https://a/b ' }).viewBase
    ).toBe('https://a/b');
  });

  it('officialCount 不明(null/NaN)は null・recordedCount 不正は 0', () => {
    expect(buildBackfillHeartbeat({ ...base, officialCount: null }).officialCount).toBeNull();
    expect(buildBackfillHeartbeat({ ...base, officialCount: 'x' }).officialCount).toBeNull();
    expect(buildBackfillHeartbeat({ ...base, recordedCount: -5 }).recordedCount).toBe(0);
    expect(buildBackfillHeartbeat({ ...base, recordedCount: 'x' }).recordedCount).toBe(0);
  });

  it('programBeginAtMs が 0 以下/不正は null', () => {
    expect(buildBackfillHeartbeat({ ...base, programBeginAtMs: 0 }).programBeginAtMs).toBeNull();
    expect(buildBackfillHeartbeat({ ...base, programBeginAtMs: -1 }).programBeginAtMs).toBeNull();
    expect(buildBackfillHeartbeat({ ...base, programBeginAtMs: 'x' }).programBeginAtMs).toBeNull();
  });

  it('deterministic/foreground は true 厳密一致のみ true', () => {
    expect(buildBackfillHeartbeat({ ...base, deterministic: 1, foreground: 'yes' })).toMatchObject({
      deterministic: false,
      foreground: false
    });
    expect(buildBackfillHeartbeat({ ...base, foreground: true }).foreground).toBe(true);
  });
});

describe('parseBackfillHeartbeat', () => {
  it('round-trip(build→parse)で同一になる', () => {
    const hb = buildBackfillHeartbeat({
      lid: 'lv1',
      viewBase: 'https://a/b',
      programBeginAtMs: 1,
      officialCount: 10,
      recordedCount: 2,
      deterministic: false,
      foreground: true,
      now: 99
    });
    expect(parseBackfillHeartbeat(hb)).toEqual(hb);
  });
  it('壊れた値は null', () => {
    expect(parseBackfillHeartbeat(null)).toBeNull();
    expect(parseBackfillHeartbeat('x')).toBeNull();
    expect(parseBackfillHeartbeat({})).toBeNull();
    expect(parseBackfillHeartbeat({ v: 2, lid: 'lv1' })).toBeNull();
    expect(parseBackfillHeartbeat({ v: 1, lid: 'co1' })).toBeNull(); // lv 形式でない
  });
});

describe('shouldSwKickBackfillForLive', () => {
  const NOW = 1_700_000_100_000;
  const freshHb = (overrides = {}) =>
    buildBackfillHeartbeat({
      lid: 'lv350000001',
      viewBase: 'https://mpn.live.nicovideo.jp/api/view/v4/x',
      programBeginAtMs: 1_700_000_000_000,
      officialCount: 500,
      recordedCount: 100,
      deterministic: false,
      foreground: false,
      now: NOW,
      ...overrides
    });
  const args = (overrides = {}) => ({
    heartbeat: freshHb(),
    now: NOW,
    swAlreadyCrawling: false,
    hasForegroundTab: false,
    enabled: true,
    ...overrides
  });

  it('全条件OK(全タブ裏・新鮮・gap あり・未 crawl)なら kick=true', () => {
    expect(shouldSwKickBackfillForLive(args())).toEqual({ kick: true, reason: 'ok' });
  });

  it('enabled=false(キルスイッチ)は disabled', () => {
    expect(shouldSwKickBackfillForLive(args({ enabled: false }))).toEqual({
      kick: false,
      reason: 'disabled'
    });
  });

  it('v0.1.796: enabled 未指定/true 以外は既定 OFF(disabled)=記録保護の opt-in', () => {
    // enabled を渡さない(undefined)→ disabled
    expect(
      shouldSwKickBackfillForLive({
        heartbeat: freshHb(),
        now: NOW,
        swAlreadyCrawling: false,
        hasForegroundTab: false
      }).reason
    ).toBe('disabled');
    // truthy だが true 厳密一致でない値も disabled
    expect(shouldSwKickBackfillForLive(args({ enabled: 1 })).reason).toBe('disabled');
  });

  it('hb 無し/壊れは no_hb', () => {
    expect(shouldSwKickBackfillForLive(args({ heartbeat: null })).reason).toBe('no_hb');
    expect(shouldSwKickBackfillForLive(args({ heartbeat: {} })).reason).toBe('no_hb');
  });

  it('viewBase 空(DOM 未観測)は no_view_base', () => {
    expect(
      shouldSwKickBackfillForLive(args({ heartbeat: freshHb({ viewBase: '' }) })).reason
    ).toBe('no_view_base');
  });

  it('hb が stale(maxStaleMs 超過)は stale_hb=掘らない', () => {
    const old = freshHb({ now: NOW - BACKFILL_HEARTBEAT_STALE_MS - 1 });
    expect(shouldSwKickBackfillForLive(args({ heartbeat: old })).reason).toBe('stale_hb');
  });

  it('前面タブが居る配信は foreground_present(v0.1.758 前面優先を壊さない)', () => {
    expect(
      shouldSwKickBackfillForLive(args({ hasForegroundTab: true })).reason
    ).toBe('foreground_present');
  });

  it('既に SW が crawl 中なら already_crawling', () => {
    expect(
      shouldSwKickBackfillForLive(args({ swAlreadyCrawling: true })).reason
    ).toBe('already_crawling');
  });

  it('ギャップが minGap 未満なら no_gap(ほぼ取り切っている)', () => {
    const nearDone = freshHb({ officialCount: 500, recordedCount: 500 - 1 });
    expect(shouldSwKickBackfillForLive(args({ heartbeat: nearDone })).reason).toBe('no_gap');
  });

  it('officialCount 不明(null)なら gap で間引かず掘る側に倒す', () => {
    const noOfficial = freshHb({ officialCount: null, recordedCount: 1 });
    expect(shouldSwKickBackfillForLive(args({ heartbeat: noOfficial })).kick).toBe(true);
  });

  it('境界: gap == minGap は掘る(>= で残ギャップ十分)', () => {
    const atBoundary = freshHb({
      officialCount: 1000,
      recordedCount: 1000 - BACKFILL_HEARTBEAT_MIN_GAP
    });
    expect(shouldSwKickBackfillForLive(args({ heartbeat: atBoundary })).kick).toBe(true);
  });

  it('判定順序: 前面タブ優先は gap より先(前面なら gap 関係なく譲る)', () => {
    const nearDone = freshHb({ officialCount: 500, recordedCount: 499 });
    expect(
      shouldSwKickBackfillForLive(
        args({ heartbeat: nearDone, hasForegroundTab: true })
      ).reason
    ).toBe('foreground_present');
  });
});

describe('ハートビート索引(SW の get(null) 回避)', () => {
  it('索引キーが安定している', () => {
    expect(KEY_BACKFILL_HEARTBEAT_INDEX).toBe('nls_backfill_hb_lids_v1');
  });

  it('normalizeHeartbeatLidIndex は lv 形式・重複排除・clamp', () => {
    expect(normalizeHeartbeatLidIndex(['lv1', 'LV1', 'co2', '', 'lv3'])).toEqual([
      'lv1',
      'lv3'
    ]);
    expect(normalizeHeartbeatLidIndex(null)).toEqual([]);
    expect(normalizeHeartbeatLidIndex('x')).toEqual([]);
  });

  it('上限 BACKFILL_HEARTBEAT_INDEX_MAX を超えたら新しい方(末尾)を残す', () => {
    const many = Array.from({ length: BACKFILL_HEARTBEAT_INDEX_MAX + 5 }, (_, i) => `lv${i + 1}`);
    const norm = normalizeHeartbeatLidIndex(many);
    expect(norm.length).toBe(BACKFILL_HEARTBEAT_INDEX_MAX);
    expect(norm[norm.length - 1]).toBe(`lv${BACKFILL_HEARTBEAT_INDEX_MAX + 5}`);
  });

  it('mergeHeartbeatLidIndex は lid を末尾(最近)に・既存は移動', () => {
    expect(mergeHeartbeatLidIndex(['lv1', 'lv2'], 'lv3')).toEqual(['lv1', 'lv2', 'lv3']);
    // 既存 lid を足すと末尾へ移動(重複しない)
    expect(mergeHeartbeatLidIndex(['lv1', 'lv2'], 'lv1')).toEqual(['lv2', 'lv1']);
    // 不正 lid は base をそのまま返す
    expect(mergeHeartbeatLidIndex(['lv1'], 'co9')).toEqual(['lv1']);
  });
});
