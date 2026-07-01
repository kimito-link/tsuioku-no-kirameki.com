/**
 * アイコン画像(usericon)の【実際のロード失敗】を状態速報の対処候補カードに出す純関数(v0.1.1026)。
 *
 * 背景(ユーザー実機 2026-07-01「画像が取れたりおかしい。これも診断に反映させて」):
 *   応援者ランキング等でアイコン画像が壊れて表示される(ニコニコ CDN のアイコンURLが 404/失敗)。
 *   popup 診断には avatarLoadDiag(usericonFailed/usericonSucceeded/failedUsericonSamples)があり実測できるのに、
 *   状態速報の本文はこれを名指ししていなかった=ユーザーが目で見て気づくしかなかった。
 *   健全度パネルの「アバター解決」は【データの名寄せ率】で、これとは別物(画像URLのロード成否は見ていない)。
 *
 * 原則: 観測のみ(avatarLoadDiag を読むだけ・新規取得ゼロ)。失敗0なら空配列(ノイズにしない)。
 *   ニコニコ CDN 側/削除済みアイコンが原因の【status の外】=直せないが「なぜ画像が変か」を説明する(fixableHere:'no')。
 *   他の *ToActionCards と同じ形の症状カードを返す(aiShareFullText が push)。
 *
 * @module avatarLoadReport
 */

/** @param {unknown} v */
function n(v) {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0;
}

/**
 * @param {{ usericonFailed?: number, usericonSucceeded?: number, failedUsericonSamples?: string[] }|null|undefined} avatarLoadDiag
 * @returns {Array<{ id: string, severity: 'warn'|'info', symptom: string, cause: string, action: string, fixableHere: 'no' }>}
 */
export function avatarLoadDiagToActionCards(avatarLoadDiag) {
  const d = avatarLoadDiag && typeof avatarLoadDiag === 'object' ? avatarLoadDiag : null;
  if (!d) return [];
  const failed = n(d.usericonFailed);
  if (failed <= 0) return [];
  const ok = n(d.usericonSucceeded);
  const total = failed + ok;
  const pct = total > 0 ? Math.round((failed / total) * 100) : 0;
  const samples = Array.isArray(d.failedUsericonSamples) ? d.failedUsericonSamples : [];
  const sample = samples.find((s) => typeof s === 'string' && s.trim());
  const sampleText = sample ? `(例: ${String(sample).slice(0, 80)})` : '';
  // 失敗率が高い(半分超)ときだけ 🟡、それ以外は ⚪(数個の 404 は日常茶飯=不安にさせない)。
  const severity = /** @type {'warn'|'info'} */ (pct >= 50 ? 'warn' : 'info');
  return [{
    id: 'usericon-load-failed',
    severity,
    symptom: `アイコン画像が ${failed} 件読み込めていません(成功 ${ok} 件・失敗率 ${pct}%)${sampleText}`,
    cause: 'ニコニコのアイコン配信(CDN)側の 404 や削除済みアイコンが原因です。壊れて見えるアイコンはこれが理由です。',
    action: '拡張では直せません(statusの外)。時間を置くと直ることもあります。頻発するなら NG やゆっくり顔で代替されます。',
    fixableHere: 'no'
  }];
}
