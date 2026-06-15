/**
 * SW backfill モード(実験)の起動判定純関数。
 *
 * PR1-b-3: content が既存 backfill 経路の代わりに SW エンジン
 * (backfill-sw-entry.js) へ起動メッセージを送るべきかを判定する。
 * フラグ KEY_BACKFILL_SW_MODE は既定 OFF(明示 true のみ有効)で、
 * OFF のときは従来経路と完全同一動作(即ロールバック可能)。
 *
 * @module swBackfillTrigger
 */

/** SW backfill モード(実験)の opt-in storage キー。既定 OFF。 */
export const KEY_BACKFILL_SW_MODE = 'nls_backfill_sw_mode_v1';

/**
 * SW 起動メッセージを送るべきか判定する。
 * fire=false の reason:
 *   - 'disabled': SW モード OFF(従来経路を使う)
 *   - 'bad_lid': liveId が lv 形式でない
 *   - 'no_view_base': NDGR view base 未観測(次 tick で再試行可能)
 *   - 'already_triggered': この live では送信済み(ワンショット guard)
 *
 * @param {{
 *   swModeEnabled: boolean,
 *   lid: string,
 *   viewBase: string,
 *   triggeredLiveId: string
 * }} args
 * @returns {{ fire: boolean, reason: string }}
 */
export function shouldTriggerSwBackfill({
  swModeEnabled,
  lid,
  viewBase,
  triggeredLiveId
}) {
  if (swModeEnabled !== true) return { fire: false, reason: 'disabled' };
  const normalizedLid = String(lid || '');
  if (!/^lv\d{1,15}$/.test(normalizedLid)) {
    return { fire: false, reason: 'bad_lid' };
  }
  if (!/^https?:\/\//i.test(String(viewBase || '').trim())) {
    return { fire: false, reason: 'no_view_base' };
  }
  if (String(triggeredLiveId || '') === normalizedLid) {
    return { fire: false, reason: 'already_triggered' };
  }
  return { fire: true, reason: 'ok' };
}
