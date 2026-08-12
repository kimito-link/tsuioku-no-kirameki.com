/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】応援レーンのタイル数が「振れた(増→減→増)」ことの検出と要約
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】タイル数の振動判定はこのファイルのみ
 *
 * ★なぜ要るか(2026-08-12・ユーザー報告「動かした瞬間に点滅」)
 *   既存の縮小ガード(shrinkDetectedCount)は【前回より減ったか】しか見ない。
 *   実測: domTilesPainted=2 / entriesLen=56 / shrinkDetectedCount=0
 *   ＝56件あるのに2件しか描いておらず、しかも 2→2 なので「縮小していない」と判定される。
 *   ★「少ないまま安定している」と「多い⇄少ないを往復している」を区別できていなかった。
 *
 *   さらに供給元が light_summary と heavy_refresh の【2つが交互】に来ており、
 *   どちらも provisional(暫定)。暫定同士は上書きし合うため、
 *   供給の切り替わりがそのままタイル数の往復＝点滅として見える可能性がある。
 *
 * ★settled state を測ると一瞬の症状は必ず正常に見える、の対策。
 *   直近の paint 履歴(件数と供給元)をリングで持ち、往復の【回数】と【振れ幅】を出す。
 *
 * @module laneTileOscillation
 */

/** 履歴として持つ paint の最大数(軽さのため小さく保つ)。 */
export const OSC_HISTORY_CAP = 12;

/**
 * 「振れた」と見なす最小の変化量(タイル数)。
 * 1枚の増減は通常の入退場なので数えない。
 */
export const OSC_MIN_DELTA = 2;

/**
 * paint 1回分の記録を履歴へ積む(純関数・新しい配列を返す)。
 *
 * @param {ReadonlyArray<{tiles:number, origin:string}>|null|undefined} history
 * @param {{ tiles?: unknown, origin?: unknown }} sample
 * @returns {{tiles:number, origin:string}[]}
 */
export function pushLaneTileSample(history, sample) {
  const list = Array.isArray(history) ? history.slice() : [];
  const tilesRaw = Number(sample?.tiles);
  const tiles = Number.isFinite(tilesRaw) && tilesRaw >= 0 ? Math.floor(tilesRaw) : 0;
  const origin = String(sample?.origin ?? '').trim();
  list.push({ tiles, origin });
  return list.length > OSC_HISTORY_CAP ? list.slice(list.length - OSC_HISTORY_CAP) : list;
}

/**
 * 履歴から「往復(増→減 または 減→増)」の回数と振れ幅を要約する。
 *
 * ★点滅の定義: 方向が反転した回数。単調に増えるだけ(入場が続く)は点滅ではない。
 *
 * @param {ReadonlyArray<{tiles:number, origin:string}>|null|undefined} history
 * @returns {{
 *   samples: number,
 *   reversals: number,
 *   maxTiles: number,
 *   minTiles: number,
 *   amplitude: number,
 *   originsSeen: string[],
 *   drops: number,
 *   worstDrop: number,
 *   worstDropFrom: number,
 *   worstDropTo: number,
 *   worstDropOrigin: string,
 *   monotonicGrowth: boolean,
 *   line: string
 * }}
 */
export function summarizeLaneTileOscillation(history) {
  const list = (Array.isArray(history) ? history : []).filter(
    (h) => h && typeof h === 'object' && Number.isFinite(Number(h.tiles))
  );
  const samples = list.length;
  if (samples === 0) {
    return {
      samples: 0,
      reversals: 0,
      maxTiles: 0,
      minTiles: 0,
      amplitude: 0,
      originsSeen: [],
      drops: 0,
      worstDrop: 0,
      worstDropFrom: 0,
      worstDropTo: 0,
      worstDropOrigin: '',
      // ★未観測は「増え続けている」と言い切らない(測っていないだけ)。
      monotonicGrowth: false,
      line: 'レーンの人数 ⚪ 未観測'
    };
  }

  const counts = list.map((h) => Math.max(0, Math.floor(Number(h.tiles) || 0)));
  const maxTiles = Math.max(...counts);
  const minTiles = Math.min(...counts);
  const amplitude = maxTiles - minTiles;

  /** 方向が反転した回数(OSC_MIN_DELTA 未満の揺れは無視)。 */
  let reversals = 0;
  /** @type {number} 直前の有意な方向(+1 増 / -1 減 / 0 未定)。 */
  let lastDir = 0;
  for (let i = 1; i < counts.length; i += 1) {
    const delta = counts[i] - counts[i - 1];
    if (Math.abs(delta) < OSC_MIN_DELTA) continue;
    const dir = delta > 0 ? 1 : -1;
    if (lastDir !== 0 && dir !== lastDir) reversals += 1;
    lastDir = dir;
  }

  /** @type {string[]} */
  const originsSeen = [];
  for (const h of list) {
    const o = String(h.origin || '').trim();
    if (o && !originsSeen.includes(o)) originsSeen.push(o);
  }

  /*
   * ★v0.1.1355「途中で増えたり減ったりしてる/ふえつづけるように」(ユーザー実機・2026-08-12)
   *
   * ■ なぜ reversals(往復)だけでは足りないか
   *   往復は「増→減→増」と**戻ってきた**ときだけ数える。実測の速報はこうだった:
   *     レーンの点滅 ✅ 往復なし(2〜67枚・観測3回)
   *     ★タイルが減った直前の供給元: light_summary(暫定) 17枚→2枚
   *   ★17→2 の脱落が起きているのに「✅往復なし」と報告されていた。
   *   戻ってこない減少(=減ったまま)は往復に数えられず、計器が正常だと言ってしまう。
   *
   * ■ 設計原則(ユーザー確定): 応援レーンの名簿は**増え続ける**のが正しい。
   *   一度出た人は消えない([[lane-has-no-roster-accumulator-2026-08-02]] の狙い)。
   *   だから【減少は方向を問わず全部異常】として数え、最大の脱落幅を名指しする。
   *   ★増加だけの経過は正常(入場が続いているだけ)。
   */
  let drops = 0;
  let worstDrop = 0;
  let worstDropFrom = 0;
  let worstDropTo = 0;
  let worstDropOrigin = '';
  for (let i = 1; i < counts.length; i += 1) {
    const delta = counts[i] - counts[i - 1];
    if (delta >= 0) continue; // 増加・据え置きは正常(名簿は増え続ける)
    drops += 1;
    const size = -delta;
    if (size > worstDrop) {
      worstDrop = size;
      worstDropFrom = counts[i - 1];
      worstDropTo = counts[i];
      worstDropOrigin = String(list[i]?.origin || '').trim();
    }
  }
  const monotonicGrowth = drops === 0;

  const originNote = originsSeen.length > 1 ? ` / 供給元が${originsSeen.length}種(${originsSeen.join('⇄')})` : '';
  /*
   * ★減少は往復より重い。往復(戻ってきた)より「減ったまま」の方がユーザーには
   *   「消えた」と見えるので、行の先頭で名指しする。
   */
  const dropNote = drops > 0
    ? ` / ★減った${drops}回(最大${worstDropFrom}→${worstDropTo}枚=${worstDrop}枚減${worstDropOrigin ? `・直前の供給元${worstDropOrigin}` : ''})`
    : '';
  const line = drops > 0
    ? `レーンの人数 🔴 増え続けていない${dropNote}${reversals > 0 ? ` / 往復${reversals}回` : ''}${originNote}`
    : reversals > 0
      ? `レーンの点滅 🔴 往復${reversals}回(${minTiles}⇄${maxTiles}枚・振れ幅${amplitude})${originNote}`
      : `レーンの人数 ✅ 増え続けている(${minTiles}→${maxTiles}枚・観測${samples}回)${originNote}`;

  return {
    samples,
    reversals,
    maxTiles,
    minTiles,
    amplitude,
    originsSeen,
    // ★v0.1.1355: 「増え続けているか」を直接の事実として返す。
    drops,
    worstDrop,
    worstDropFrom,
    worstDropTo,
    worstDropOrigin,
    monotonicGrowth,
    line
  };
}
