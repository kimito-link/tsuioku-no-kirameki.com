/**
 * 鏡バンドルの全キーが「自己書き込み」として登録されているかの機械照合(v0.1.1344)。
 *
 * ★なぜ要るか(2026-08-12・コードだけで確定した真因)
 *   2026-08-04 に「1コメントあたり77回の描き直し」を根治した際、
 *   refresh 自身が書くキーを selfWrittenStorageKeys.js に列挙してループを断った。
 *   ★その後【鏡が4種→9種に増え】、リストの更新が漏れた。
 *
 *   isAllSelfWrittenRenderArtifacts は every() なので、
 *   **未登録の鏡が1つ混ざるだけでスキップ判定が丸ごと false** になる。
 *   さらに popupStorageRefreshCoalesce の allHighFreq も false になり
 *   450ms スロットルまで素通りする＝穴1と穴2が再び噛み合う。
 *
 *   実測(2026-08-12): 1コメントあたり30回の描き直し・表示遅延5秒で再発していた。
 *
 * ★このテストがあれば「鏡を足したがリストを忘れた」を人間の記憶に頼らず検出できる。
 */
import { describe, expect, it } from 'vitest';
import { SECTION_TO_LEGACY_KEY } from './mirrorBundleFlushScheduler.js';
import { laneMirrorKeyFor, laneReceiptKeyFor } from './laneMirrorKey.js';
import { isSelfWrittenRenderArtifactKey } from './selfWrittenStorageKeys.js';

describe('鏡バンドル ⇄ 自己書き込みリストの網羅', () => {
  it('★鏡バンドルが書く全キーが自己書き込みとして登録されている', () => {
    const keys = Object.values(SECTION_TO_LEGACY_KEY || {});
    expect(keys.length).toBeGreaterThan(0);
    const missing = keys.filter((k) => !isSelfWrittenRenderArtifactKey(k));
    // 落ちたときに「どの鏡が漏れたか」がそのまま出るように配列で比較する。
    expect(missing).toEqual([]);
  });

  it('鏡は9種ある(増減したらこのテストごと見直す合図)', () => {
    expect(Object.keys(SECTION_TO_LEGACY_KEY || {}).length).toBe(9);
  });

  /*
   * ★v0.1.1345: per-live 版(配信IDが末尾に付く)も必ず登録されていること。
   *
   * v0.1.1344 はここを見落とし、実機で 1コメントあたり31回の描き直しが残った。
   *   計器の名指し: storage_changed:nls_lane_mirror_v2_*+nls_lane_receipt_v1_* が 69%
   * 原因は `/^nls_lane_mirror_v\d+$/` の **`$` 終端**。定数名だけ見て正規表現を書くと
   * per-live 版(実際に高頻度で書かれている方)に一致しない。
   * ★だから「定数」ではなく【キービルダーの実出力】で照合する。
   */
  it('★per-live 版の鏡キー(実出力)も自己書き込みとして登録されている', () => {
    const lid = 'lv351156267';
    const perLive = [laneMirrorKeyFor(lid), laneReceiptKeyFor(lid)];
    // ビルダーが実際に返す文字列であることを固定(名前だけの照合にしない)。
    expect(perLive[0]).toBe('nls_lane_mirror_v2_lv351156267');
    expect(perLive[1]).toBe('nls_lane_receipt_v1_lv351156267');
    const missing = perLive.filter((k) => !isSelfWrittenRenderArtifactKey(k));
    expect(missing).toEqual([]);
  });

  it('無関係なキーは自己書き込み扱いにしない(取りこぼしを作らない)', () => {
    // コメント本体・設定など外部由来は必ず再描画を通す。
    expect(isSelfWrittenRenderArtifactKey('nls_comments_lv123')).toBe(false);
    expect(isSelfWrittenRenderArtifactKey('nls_voice_reading_enabled_v1')).toBe(false);
    expect(isSelfWrittenRenderArtifactKey('nls_cdb_summary_lv123')).toBe(false);
  });
});
