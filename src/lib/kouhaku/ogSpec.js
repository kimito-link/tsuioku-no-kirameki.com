/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】共有画像に描く文字列
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* / 画像の描画
 * 【書けるstorageキー】なし
 * 【正本宣言】1200×630 のカードに載せる文言はこのファイルのみ
 *
 * ogSpec.js — 描画側は受け取った文字列を置くだけ。
 */

/**
 * @param {{
 *   team?: string,
 *   teamLabel?: string,
 *   rank?: number,
 *   displayName?: string,
 *   scoreLabel?: string,
 *   gapLabel?: string,
 *   deltaLabel?: string
 * }} entry
 * @param {string} officialUpdateLabel
 * @returns {Record<string, string>}
 */
export function ogSpecForEntry(entry, officialUpdateLabel) {
  const team = entry && entry.team === 'shiro' ? 'shiro' : 'aka';
  return {
    title: '紅白歌枠合戦2026',
    team: entry && entry.teamLabel ? entry.teamLabel : (team === 'shiro' ? '白組' : '紅組'),
    teamId: team,
    rank: `${entry && entry.rank ? entry.rank : '—'}位`,
    name: entry && entry.displayName ? entry.displayName : '',
    score: entry && entry.scoreLabel ? `公式 ${entry.scoreLabel}` : '',
    gap: entry && entry.gapLabel ? entry.gapLabel : '',
    delta: entry && entry.deltaLabel ? entry.deltaLabel : '',
    updated: officialUpdateLabel ? `最終の公式更新 ${officialUpdateLabel}` : '公式は1日1回更新',
    footer: '公式は1日1回更新  ·  tsuioku-no-kirameki.com/live/kouhaku/'
  };
}

/**
 * @param {string} officialUpdateLabel
 * @returns {Record<string, string>}
 */
export function ogSpecForBoard(officialUpdateLabel) {
  return {
    title: '紅白歌枠合戦2026',
    team: '紅組・白組',
    teamId: 'both',
    rank: 'イベントpt',
    name: '応援ランキング',
    score: '公式の順位',
    gap: '次の順位まで、あと何ptか',
    delta: '前回の公式更新からの伸び',
    updated: officialUpdateLabel ? `最終の公式更新 ${officialUpdateLabel}` : '公式は1日1回更新',
    footer: '公式は1日1回更新  ·  tsuioku-no-kirameki.com/live/kouhaku/'
  };
}
