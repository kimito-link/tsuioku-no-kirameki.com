import { describe, it, expect } from 'vitest';
import {
  isSelfWrittenRenderArtifactKey,
  isAllSelfWrittenRenderArtifacts,
  stripSelfWrittenRenderArtifacts
} from './selfWrittenStorageKeys.js';

/**
 * selfWrittenStorageKeys.js — refresh() 自身が書くキーの判定。
 *
 * 2026-08-04 実測: 1コメントあたり77回の描き直し(毎秒11回)。
 * 真因は refresh() → storage.set → onChanged → refresh() の自己フィードバックループ。
 */

/**
 * ★実測で確認した「refresh() 自身が書く8キー」。
 *   この配列がこのモジュールの存在理由そのものなので、テストの先頭に置く。
 *   popup-entry.js を実際に追って確認した(2026-08-04)。
 */
const SELF_WRITTEN_KEYS_OBSERVED = [
  'nls_perf_diag_lv351100897',
  'nls_paint_perf_ring_v1',
  'nls_lane_diag_v1',
  'nls_preview_render_ack_v1',
  'nls_lane_mirror_v1',
  'nls_stat_cards_mirror_v1',
  'nls_north_star_mirror_v1',
  'nls_comment_timeline_mirror_v1'
];

/** 外部由来=従来どおり再描画すべきキー(高頻度コメント系・設定系)。 */
const EXTERNAL_KEYS = [
  'nls_comments_lv351100897',
  'nls_csummary_lv351100897',
  'nls_panel_summary_lv351100897',
  'nls_cchunk_index_lv351100897',
  'nls_cdb_summary_lv351100897',
  'nls_ctail_lv351100897',
  'nls_gift_users_lv351100897',
  'nls_record_enabled',
  'nls_voice_enabled'
];

describe('isSelfWrittenRenderArtifactKey — 実測した8キーを全部拾う', () => {
  it.each(SELF_WRITTEN_KEYS_OBSERVED)('【実測】%s は自己書き込みと判定する', (key) => {
    expect(isSelfWrittenRenderArtifactKey(key)).toBe(true);
  });

  it.each(EXTERNAL_KEYS)('【外部由来】%s は自己書き込みではない(従来どおり描画する)', (key) => {
    expect(isSelfWrittenRenderArtifactKey(key)).toBe(false);
  });

  it('空/不正な値は false(誤ってスキップしない)', () => {
    expect(isSelfWrittenRenderArtifactKey('')).toBe(false);
    expect(isSelfWrittenRenderArtifactKey(null)).toBe(false);
    expect(isSelfWrittenRenderArtifactKey(undefined)).toBe(false);
    expect(isSelfWrittenRenderArtifactKey(123)).toBe(false);
  });

  // 前方一致で拾いすぎると、外部由来のキーまでスキップして
  // 「画面が更新されない」という更に悪い症状になる。
  it('似ているが別物のキーを誤って拾わない', () => {
    expect(isSelfWrittenRenderArtifactKey('nls_lane_mirror_v1_backup')).toBe(false);
    expect(isSelfWrittenRenderArtifactKey('xnls_lane_diag_v1')).toBe(false);
    expect(isSelfWrittenRenderArtifactKey('nls_perf_diagX')).toBe(false);
  });
});

describe('isAllSelfWrittenRenderArtifacts — ループを断つ判定', () => {
  it('【中核】実測8キーだけの変更なら true(=再描画しない=ループが閉じない)', () => {
    expect(isAllSelfWrittenRenderArtifacts(SELF_WRITTEN_KEYS_OBSERVED)).toBe(true);
  });

  // ここが安全弁。外部由来が1つでも混ざれば従来どおり描画する。
  it('外部由来が1つでも混ざれば false(取りこぼしを作らない)', () => {
    expect(
      isAllSelfWrittenRenderArtifacts([...SELF_WRITTEN_KEYS_OBSERVED, 'nls_comments_lv1'])
    ).toBe(false);
    expect(isAllSelfWrittenRenderArtifacts(['nls_lane_mirror_v1', 'nls_record_enabled'])).toBe(
      false
    );
  });

  it('外部由来だけなら false', () => {
    expect(isAllSelfWrittenRenderArtifacts(EXTERNAL_KEYS)).toBe(false);
  });

  it('空配列は false(何も変わっていないのにスキップ扱いにしない)', () => {
    expect(isAllSelfWrittenRenderArtifacts([])).toBe(false);
    expect(isAllSelfWrittenRenderArtifacts(null)).toBe(false);
  });
});

describe('stripSelfWrittenRenderArtifacts — 混在時に throttle を失う穴を塞ぐ', () => {
  // 実測で確認した穴: keys.every() 判定のため、高頻度キーと自己書き込みキーが
  // 同一 changes に混ざると全体が非高頻度扱いになり throttle を失っていた。
  it('【穴の再現】混在から自己書き込みを除くと、高頻度キーだけが残る', () => {
    const mixed = ['nls_comments_lv1', 'nls_lane_mirror_v1', 'nls_csummary_lv1'];
    expect(stripSelfWrittenRenderArtifacts(mixed)).toEqual([
      'nls_comments_lv1',
      'nls_csummary_lv1'
    ]);
  });

  it('自己書き込みだけなら空配列', () => {
    expect(stripSelfWrittenRenderArtifacts(SELF_WRITTEN_KEYS_OBSERVED)).toEqual([]);
  });

  it('外部由来だけならそのまま返る', () => {
    expect(stripSelfWrittenRenderArtifacts(['nls_comments_lv1'])).toEqual(['nls_comments_lv1']);
  });

  it('壊れた入力でも落ちない', () => {
    expect(stripSelfWrittenRenderArtifacts(null)).toEqual([]);
    expect(stripSelfWrittenRenderArtifacts([null, '', 'nls_comments_lv1'])).toEqual([
      'nls_comments_lv1'
    ]);
  });
});
