/**
 * 【層】L0 判定層(ビルド旗と manifest を見るだけ。新しい権限は使わない)
 * 【この箱に入るもの】開発用の読み込みだけ、マーケ HTML の関所を通すかの判定
 * 【この箱に入らないもの】証明書の確認・課金の通信・画面の描画
 *
 * ストア提出ビルド(NL_STORE_BUILD=1 / stage-submission)と、Chromeウェブストアから入れた拡張
 * (manifest に update_url)では、絶対に通さない。chrome.management は使わない
 * (新しい権限が要るため)。ビルド旗が焼き込まれていない試験や古い束でも通さない。
 * @module devMarketingUnlock
 */

/**
 * manifest にストア用の update_url があるか。chrome.runtime.getManifest だけで足りる
 * (management 権限は不要)。読めなければ「無い」=通さない側の材料にはしない。
 * @returns {boolean}
 */
export function manifestHasUpdateUrl() {
  try {
    const m = globalThis.chrome?.runtime?.getManifest?.();
    return !!(m && typeof m.update_url === 'string' && m.update_url);
  } catch {
    return false;
  }
}

/**
 * 開発用の読み込み(未パック / ストア提出ではないビルド)なら true。
 * ストア提出ビルドと、ストアから入れた拡張では必ず false。
 *
 * @param {{
 *   storeBuild?: boolean,
 *   storeBuildDefined?: boolean,
 *   devHotReload?: boolean,
 *   hasUpdateUrl?: boolean
 * }} [opts]
 * @returns {boolean}
 */
export function isDevMarketingUnlock(opts = {}) {
  const storeBuildDefined = opts.storeBuildDefined ?? typeof NL_STORE_BUILD !== 'undefined';
  const storeBuild = opts.storeBuild ?? (storeBuildDefined && !!NL_STORE_BUILD);
  if (storeBuild) return false;

  const hasUpdateUrl = opts.hasUpdateUrl ?? manifestHasUpdateUrl();
  if (hasUpdateUrl) return false;

  if (storeBuildDefined) return !storeBuild;

  const devHotReload =
    opts.devHotReload ?? (typeof NL_DEV_HOTRELOAD !== 'undefined' && !!NL_DEV_HOTRELOAD);
  return !!devHotReload;
}
