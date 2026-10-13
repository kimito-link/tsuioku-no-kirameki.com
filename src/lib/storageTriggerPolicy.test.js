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
    expect(src).toMatch(/import \{ isSlowStorageKey, isThrottledExtraStorageKey \} from '\.\.\/lib\/storageTriggerPolicy\.js';/);
  });
  it('★遅い側の判定結果が schedule に渡されている(結果が使われている)', () => {
    const i = src.indexOf('function scheduleCoalescedStorageRefresh');
    const body = src.slice(i, src.indexOf('\n}\n', i));
    expect(body).toMatch(/const allSlow = keysForFreq\.length > 0 && keysForFreq\.every\(\(k\) => isSlowStorageKey\(k\)\);/);
    expect(body).toMatch(/\{ allHighFreq, allSlow, initialDone: refreshEverStarted \}/);
  });
});

import { isSlowStorageKey } from './storageTriggerPolicy.js';
import { createCoalescedRefreshScheduler } from './popupStorageRefreshCoalesce.js';

describe('設計V3b: 遅い側(3秒に1回)のキー', () => {
  it('★実キーで照合: 描画が読むが頻繁に書かれるキーは遅い側', () => {
    for (const k of ['nls_live_broadcaster_ctx_v1', 'nls_live_ended_lv351581496', 'nls_event_dom_lv351581496']) {
      expect(isSlowStorageKey(k)).toBe(true);
    }
  });
  it('★コメント本文系・設定・未知は遅い側にしない(取りこぼし/遅延を作らない)', () => {
    for (const k of ['', null, 'nls_comments_lv1', 'nls_ctail_lv1', 'nls_panel_summary_lv1', 'nls_voice_autosend_v1', 'nls_unknown_future_key']) {
      expect(isSlowStorageKey(k)).toBe(false);
    }
  });
  it('★診断(score_announce_diag/report_preview/recording_watchdog)は描き直さない', () => {
    for (const k of ['nls_score_announce_diag_v1', 'nls_report_preview_v1', 'nls_recording_watchdog_v1']) {
      expect(isSelfWrittenRenderArtifactKey(k)).toBe(true);
    }
  });
});

describe('設計V3b: スケジューラの遅い側', () => {
  function make() {
    let t = 1000;
    const timers = [];
    const runs = [];
    const s = createCoalescedRefreshScheduler({
      deps: { now: () => t, setTimer: (fn, ms) => { timers.push({ fn, at: t + ms }); return timers.length; }, clearTimer: () => {} }
    });
    return { s, runs, advance: (ms) => { t += ms; for (const x of timers.splice(0)) { if (x.at <= t) x.fn(); else timers.push(x); } }, timers };
  }
  it('★遅い側だけの変更は 3 秒に1回(1秒あたり何度来ても)', () => {
    const { s, runs, advance } = make();
    s.schedule({ allHighFreq: false, allSlow: true, initialDone: true }, () => runs.push('a')); // 先行
    for (let i = 0; i < 20; i += 1) { advance(100); s.schedule({ allHighFreq: false, allSlow: true, initialDone: true }, () => runs.push('b')); }
    expect(runs.length).toBe(1); // 2 秒間はスロットル中
    advance(1500);
    expect(runs.length).toBe(2); // 末尾の1回が 3 秒以内に必ず走る
  });
  it('★遅い側でない非高頻度(設定トグル等)は従来どおり即時', () => {
    const { s, runs } = make();
    s.schedule({ allHighFreq: false, initialDone: true }, () => runs.push('1'));
    s.schedule({ allHighFreq: false, initialDone: true }, () => runs.push('2'));
    expect(runs).toEqual(['1', '2']);
  });
  it('★高頻度側は従来どおり 450ms(遅い側に巻き込まれない)', () => {
    const { s, runs, advance } = make();
    s.schedule({ allHighFreq: true, allSlow: true, initialDone: true }, () => runs.push('1'));
    advance(500);
    s.schedule({ allHighFreq: true, allSlow: true, initialDone: true }, () => runs.push('2'));
    expect(runs.length).toBe(2);
  });
});

describe('v0.1.1608: 最後に視聴した URL の書き合い(複数タブ)', () => {
  it('★nls_last_watch_url は遅い側(3秒に1回)', () => {
    expect(isSlowStorageKey('nls_last_watch_url')).toBe(true);
    expect(isSlowStorageKey('nls_last_watch_url_x')).toBe(false);
  });
  const csrc = fs.readFileSync(path.resolve('src/extension/content-entry.js'), 'utf8');
  const i = csrc.indexOf('function rememberWatchPageUrl(');
  const body = csrc.slice(i, i + 1800);
  it('★同じ URL を毎ティック書き直さない(URL が変わったときだけ・force で上書き)', () => {
    expect(body).toMatch(/if \(force !== true && window\.location\.href === _lastRememberedWatchHref\) return;/);
    expect(body).toMatch(/_lastRememberedWatchHref = window\.location\.href;/);
  });
  it('★前面に来たら書き直す(focus / visibilitychange=visible)', () => {
    expect(body).toMatch(/window\.addEventListener\('focus', \(\) => rememberWatchPageUrl\(true\)\)/);
    expect(body).toMatch(/document\.visibilityState === 'visible'\) rememberWatchPageUrl\(true\)/);
  });
});
