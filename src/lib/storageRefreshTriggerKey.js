/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】storage 変更キーの群→「描き直しの引き金」タグ化
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】引き金タグの命名規則はこのファイルのみ
 *
 * ★なぜ要るか(2026-08-12 実機)
 *   状態速報の実測:
 *     描き直しの内訳(計2285回): storage_changed1891 / self_write_skipped352 / interval_poll42
 *     1コメントあたり30回 ← storage_changed が83%を占める
 *   ＝「storage_changed が犯人」までは既存計器(repaintReasonCensus)が特定できた。
 *   ★しかしその先が分からない。storage_changed は【どのキーが変わっても同じタグ】なので、
 *     1,891回の内訳が永久に見えない。
 *   ([[instrument-must-name-the-cause]]: 総数は症状・内訳が原因。ここはもう1段深い同じ問題)
 *
 * ■ 疑っている構造(popupStorageRefreshCoalesce.js:68-73)
 *     if (!ctx.allHighFreq) { runRefresh(); return; }   ← スロットルを【素通り】する
 *   allHighFreq は every() なので、高頻度キーに【非高頻度キーが1つ混ざるだけ】で
 *   450ms スロットルが丸ごと無効になる。どのキーが混ざっているかを名指しできれば確定する。
 *   ★このモジュールは「名指しできるようにする」だけで、直し方は決めない(まず測る)。
 *
 * @module storageRefreshTriggerKey
 */

/** タグに載せるキーの最大数(速報1行に収めるため)。 */
export const TRIGGER_KEY_MAX = 3;

/**
 * storage キーから配信IDなどの可変部を落として、集計できる形にする。
 *
 * 例: `nls_comments_lv351155151` → `nls_comments_*`
 *     `nls_cdb_summary_lv123`    → `nls_cdb_summary_*`
 *
 * ★生のキーのままだと配信ごとに別物として数えられ、内訳が読めなくなる。
 *
 * @param {unknown} key
 * @returns {string} 正規化キー(空なら '')
 */
export function normalizeStorageKeyForCensus(key) {
  const k = String(key ?? '').trim();
  if (!k) return '';
  // 末尾の lvNNN / 数値 / 明らかなIDらしき連なりを * に畳む。
  return k
    .replace(/lv\d{1,15}/gi, '*')
    .replace(/_\d{3,}$/g, '_*');
}

/**
 * 変更キーの群から「引き金タグ」を作る。
 *
 * ★出力例: `storage_changed:nls_comments_*+nls_panel_summary_*`
 *   タグは既存の repaintReasonCensus にそのまま渡せる文字列。
 *   ＝新しい計器を足さず、既存の内訳の粒度だけを上げる
 *   ([[instrument-spiral-25-versions]]: 計器を2版続けて足さない)。
 *
 * @param {ReadonlyArray<unknown>|null|undefined} keys 変更された storage キー
 * @param {{ base?: string, max?: number }} [opts]
 * @returns {string} 引き金タグ
 */
export function buildStorageRefreshTriggerTag(keys, opts = {}) {
  const base = String(opts.base || 'storage_changed');
  const maxRaw = Number(opts.max);
  const max = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.floor(maxRaw) : TRIGGER_KEY_MAX;
  const list = Array.isArray(keys) ? keys : [];
  /** @type {string[]} */
  const norm = [];
  for (const k of list) {
    const n = normalizeStorageKeyForCensus(k);
    if (!n) continue;
    if (!norm.includes(n)) norm.push(n);
  }
  if (!norm.length) return base;
  norm.sort();
  const shown = norm.slice(0, max);
  const rest = norm.length - shown.length;
  const suffix = rest > 0 ? `+他${rest}` : '';
  return `${base}:${shown.join('+')}${suffix}`;
}
