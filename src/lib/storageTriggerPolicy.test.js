import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isThrottledExtraStorageKey } from './storageTriggerPolicy.js';
import { isSelfWrittenRenderArtifactKey } from './selfWrittenStorageKeys.js';
import { giftSubAppHistoryStorageKey } from './storageKeys.js';
import { KEY_BACKFILL_LIVE_METRIC } from './storageKeys.js';
import { KEY_INSTANT_PUSH_DIAG } from './instantPushDiagKey.js';
import { KEY_VOICE_DIAG } from './voiceDiagKey.js';

/**
 * 設計 V3: 保存通知の分類。実測(2026-10-12・60秒)で即時側(間引き素通り)を引いていたキーが
 *   (a) 診断専用 → 描き直さない(self-written) (b) 書き込みの多いデータ → 間引き側 (c) それ以外は従来どおり即時側。
 */
describe('診断専用キー → 描き直しの引き金にしない', () => {
  it('★実キー(定数/ビルダーの実出力)で照合する', () => {
    const keys = [
      KEY_BACKFILL_LIVE_METRIC,
      KEY_INSTANT_PUSH_DIAG,
      KEY_VOICE_DIAG,
      'nls_comment_write_mode_diag_v1',
      'nls_comment_ingest_log_v1',
      'nls_mcp_live_latest_v1',
      'nls_mcp_live_snapshot_v1_lv351581496',
      'nls_venue_seats_diag_v1',
      'nls_gift_effect_diag_v1'
    ];
    expect(keys.filter((k) => !isSelfWrittenRenderArtifactKey(k))).toEqual([]);
  });

  it('★描画が読む実データは引き金のまま(取りこぼさない)', () => {
    for (const k of ['nls_live_broadcaster_ctx_v1', 'nls_comments_lv1', 'nls_panel_summary_lv1', 'nls_user_comment_profile_v1']) {
      expect(isSelfWrittenRenderArtifactKey(k)).toBe(false);
    }
  });
});

describe('isThrottledExtraStorageKey', () => {
  it('★書き込みの多いデータキーは間引き側(実出力で照合)', () => {
    expect(isThrottledExtraStorageKey('nls_user_comment_profile_v1')).toBe(true);
    expect(isThrottledExtraStorageKey('nls_gift_history_throws_lv351581496')).toBe(true);
    expect(isThrottledExtraStorageKey(giftSubAppHistoryStorageKey('lv351581496'))).toBe(true);
  });
  it('★未知のキー・設定トグルは即時側のまま(false)', () => {
    for (const k of ['', null, undefined, 'nls_voice_autosend_v1', 'nls_anonymous_identicon_v1', 'nls_unknown_future_key']) {
      expect(isThrottledExtraStorageKey(k)).toBe(false);
    }
  });
});

describe('配線', () => {
  const src = fs.readFileSync(path.resolve('src/extension/popup-entry.js'), 'utf8');
  it('★isHighFrequencyCommentRelatedStorageKey が末尾で判定を使っている(結果が使われている)', () => {
    const i = src.indexOf('function isHighFrequencyCommentRelatedStorageKey');
    const body = src.slice(i, src.indexOf('\n}\n', i));
    expect(body).toMatch(/return isThrottledExtraStorageKey\(k\);\s*$/);
    expect(src).toMatch(/import \{ isThrottledExtraStorageKey \} from '\.\.\/lib\/storageTriggerPolicy\.js';/);
  });
});
