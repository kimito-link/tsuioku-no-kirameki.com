// venueViewport.js
// v0.1.715: 会場モードの「映像セーフエリア」と「同時表示人数」を決める純関数。
//
// 設計正本: memory/reference_venue_fullscreen_meeting.md(第3回会議・確定B)。
// ユーザー実機不満:
//   ①観客席の帯+ひな壇が大きすぎて、せっかく透けている配信映像をほぼ覆う。
//   ②席が横にはみ出して横スクロールバーが出る/位置がずれて変な動きで見えなくなる。
//
// 会議の全員一致:
//   - 中央に映像セーフエリアを確保し、UI は上下端に寄せる。
//   - 人数が増えても「縮小して読めなくする」のは原則違反(サムネ/名前/ID が潰れる)。
//     縮小ではなく【同時表示人数を減らす】。論理席は保持し、表示は一定数に絞る。
//   - 表示メンバーは安定選抜(毎回ランダムに入れ替えると会場がちらつく)。
//
// このファイルは数値・選抜ロジックだけ(DOM/CSS/chrome.* 非依存・テスト可能・Web/OBS版で共用)。

/**
 * 会場(ひな壇)の最大高さ(vh)。★人数によらず固定。
 *
 * 2026-08-11 会議確定: 人数連動(旧 48→56→64→72vh)を撤回し 48vh 固定にした。
 * 経緯と理由は `resolveVenueMaxHeightVh` の JSDoc を読むこと。
 *
 * 48 の根拠: 旧実装の「少人数のとき」の値。①の会議が
 * 「少人数は会場を低くして配信映像を広く見せる」と決めた値であり、
 * 映像が見える状態として既に一度合意されている数字。
 * 残り 52vh が映像セーフエリアになる。
 */
export const VENUE_MAX_HEIGHT_VH = 48;

/**
 * 1行に並べられる席数を、席の最小幅と利用可能幅から決める。
 * これを超えて並べると横スクロールが出る → 行に収まる数で頭打ちにするための土台。
 * @param {number} availableWidthPx 席エリアの利用可能幅(px)
 * @param {number} seatMinWidthPx 席1つの最小幅(px・gap込みの実効幅)
 * @returns {number} 1行に収まる最大席数(>=1)
 */
export function seatsPerRow(availableWidthPx, seatMinWidthPx) {
  const w = Math.max(0, Number(availableWidthPx) || 0);
  const sw = Math.max(1, Number(seatMinWidthPx) || 1);
  return Math.max(1, Math.floor(w / sw));
}

/**
 * 人数連動で「同時表示の上限席数」を動的に決める純関数(星野ロミ式・密度可視化)。
 *
 * 2026-06-14 会議(無料LLM4体・星野ロミ思想)確定: 人気配信(405人規模)で固定上限40だと
 *   ごく一部しか出ず満席感が出ない。人数が増えるほど表示席も増やす(満員の会場に見せる)。
 *   会議合意 hardCap ≈ clamp(base, floor(total*ratio), max)。3モデルが total*0.2 系で一致。
 *
 * 2026-06-14 実機検証(populated 会場・lv350656591/144人)で判明: 旧 base40/ratio0.2 だと
 *   50〜200人の配信で常に上限40に張り付き、8段ひな壇のうち4段しか埋まらず「会場が埋まらない」
 *   (672px の客席に272px しか中身が無い)。grid が許す席数まで出すべき。base60/ratio0.5 に上げ、
 *   実際の頭打ちは resolveVisibleArenaCount の byGrid(perRow×段数)に任せる(横溢れは出ない)。
 *   144人→72・300人以上→150(満席)。max150 は描画性能の天井。
 *
 * @param {number} total 論理参加者数
 * @param {{ base?: number, ratio?: number, max?: number }} [opts]
 *   base=下限(少人数でもこの席数は確保・既定60) / ratio=人数比(既定0.5) / max=絶対上限(既定150=席プール)
 * @returns {number}
 */
export function resolveDynamicArenaCap(total, opts = {}) {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  const base = Math.max(1, Math.floor(Number(opts.base ?? 60)));
  const ratio = Number(opts.ratio ?? 0.5) > 0 ? Number(opts.ratio ?? 0.5) : 0.5;
  const max = Math.max(base, Math.floor(Number(opts.max ?? 150)));
  const byRatio = Math.floor(n * ratio);
  return Math.min(max, Math.max(base, byRatio));
}

/**
 * 会場(ひな壇)の最大高さ(vh)を人数連動で決める純関数(表示領域の可変拡大)。
 *
 * 2026-06-14 会議(無料LLM4体): 少人数は会場を低くして配信映像を広く見せ、人気配信(大人数)は
 *   会場を高くして客席を奥まで見せる(満席感)。映像セーフエリアを潰さないため上限は控えめ。
 *   ~16人=48vh・~64人=56vh・~150人=64vh・それ超=72vh。
 *
 * ★2026-08-11 撤回(会議4体・3対1で②を降ろすと確定)。人数連動をやめ【48vh 固定】にした。
 *
 * ■ なぜ撤回したか(ユーザー実機・2,769人の配信)
 *     ユーザー: 「これだと配信みれないですね。**配信の映像はちゃんとみたい**」
 *   2,769人 → 旧実装は 72vh を返す = 画面の72%が会場。残り28vh にも吹き出し・
 *   PICK UP・応援者トップバーが乗り、配信映像が実質ゼロになっていた。
 *
 * ■ これはバグではなく、3つの会議結論が積み重なった結果だった
 *   ① 2026-06-14「映像セーフエリア」: 中央に映像を残し UI は上下端へ。縮小は原則違反、
 *      減らすなら【同時表示人数】を減らす。★当時のユーザー不満は今回とほぼ同じ言葉:
 *      「観客席の帯+ひな壇が大きすぎて、せっかく透けている配信映像をほぼ覆う」
 *   ② 同日「満席感」: 人数↑ → 会場↑(この関数)
 *   ③ 2026-06-22「全員500人の顔を出す」: 同時表示の上限(~150)を撤廃し overflow-y へ
 *   → ①の「人数を減らして映像を守る」経路が③で開かれ、②が高さを押し上げた。
 *     誰も間違えていない。単体では3つとも正しい判断だった。
 *
 * ■ なぜ②を降ろしたか(会議の理由・統括役)
 *   ①は「読めなきゃ意味がない」という機能的ハード制約。
 *   ③は「推しが見える」というサービスの核心価値。
 *   ②は「心理的満足(満席感)」を【面積で買おうとした実装判断】に過ぎない。
 *   → 守るべき価値は①③。降ろせるのは②だけ。
 *
 * ■ 満席感はどこへ行ったか
 *   面積では表現しない。③(全員の顔・overflow-y スクロール)と、既存の
 *   `resolveVisibleArenaCount`(48vh に収まる席数)＋入場演出・吹き出しで表現する。
 *   ★席の重なり/奥行きによる密度表現は会議で案が出たが【未実装】。
 *     体感が寂しければそちらを足す(この関数を人数連動へ戻すのではなく)。
 *
 * ■ 引数 total を残している理由
 *   呼び出し側(venueBar.js)の署名を変えないため。人数連動へ戻す誘惑を断つべく、
 *   テストで「どの人数でも 48」を固定してある(venueViewport.test.js)。
 *
 * @param {number} [_total] 論理参加者数(現在は未使用・署名互換のため残置。
 *   `_` 始まりは lint の allowed unused args 規約。人数連動へ戻すなら
 *   まず上の JSDoc とテスト(venueViewport.test.js)を読むこと)
 * @returns {number} 最大高さ(vh単位の数値)
 */
export function resolveVenueMaxHeightVh(_total) {
  return VENUE_MAX_HEIGHT_VH;
}

/**
 * 映像セーフエリアを守りつつ同時表示するアリーナ席数を決める。
 * 「横にはみ出さない列数 × 段数」を上限に、論理人数で頭打ちする。
 * これにより横スクロールが構造的に出ない & 映像を覆う面積を一定に保つ。
 *
 * 2026-06-14: hardCap 未指定なら resolveDynamicArenaCap(total) で人数連動の上限を使う
 *   (満席感を出す)。明示 hardCap があればそれを最優先(後方互換)。
 *
 * @param {object} opts
 * @param {number} opts.totalCount 論理参加者数(全員)
 * @param {number} opts.perRow 1行に収まる席数(seatsPerRow の結果)
 * @param {number} [opts.rows=3] ひな壇の段数(会議確定 2〜3 段)
 * @param {number} [opts.hardCap] 同時表示の絶対上限(未指定なら人数連動)
 * @returns {number} 同時表示する席数
 */
export function resolveVisibleArenaCount(opts) {
  const total = Math.max(0, Math.floor(Number(opts?.totalCount) || 0));
  const perRow = Math.max(1, Math.floor(Number(opts?.perRow) || 1));
  const rows = Math.max(1, Math.floor(Number(opts?.rows ?? 3)));
  const hardCap =
    opts?.hardCap != null
      ? Math.max(1, Math.floor(Number(opts.hardCap)))
      : resolveDynamicArenaCap(total);
  const byGrid = perRow * rows;
  return Math.min(total, byGrid, hardCap);
}

/**
 * 観客席(顔の帯)に同時に並べる顔数を決める。
 * 映像を覆わないよう「1〜2行に収まる数」に厳しく絞る。残りは会場ヘッダーの「ほか N 人」へ。
 * @param {object} opts
 * @param {number} opts.totalFaces 顔つき観客の候補数
 * @param {number} opts.perRow 1行に収まる顔数
 * @param {number} [opts.rows=1] 観客帯の行数(映像を隠さない 1〜2)
 * @param {number} [opts.hardCap=40] 顔の絶対上限
 * @returns {number} 同時表示する観客の顔数
 */
export function resolveVisibleAudienceCount(opts) {
  const total = Math.max(0, Math.floor(Number(opts?.totalFaces) || 0));
  const perRow = Math.max(1, Math.floor(Number(opts?.perRow) || 1));
  const rows = Math.max(1, Math.floor(Number(opts?.rows ?? 1)));
  const hardCap = Math.max(1, Math.floor(Number(opts?.hardCap ?? 40)));
  return Math.min(total, perRow * rows, hardCap);
}

/**
 * 「直近に発言した人」を必ず含めつつ、表示メンバーを安定選抜する。
 * - 直近発言者(recentlySpokenKeys)は最優先で表示に入れる(会場が反応して見える)。
 * - 残り枠は元の並び順(優先度順に整列済みの想定)で安定して埋める。
 * - 毎回同じ入力なら同じ結果(ちらつき防止)。発言で順位が上がった人だけ入れ替わる。
 *
 * @template T
 * @param {T[]} ordered 優先度順に整列済みの参加者配列(seats など)
 * @param {number} visibleCount 同時表示する数
 * @param {Set<string>|string[]} [recentlySpokenKeys] 直近発言者のキー集合(必ず表示に入れる)
 * @param {(row: T) => string} [keyOf] 行→キー(既定: key || userId || name)
 * @returns {T[]} 表示する行(長さ <= visibleCount)・元順を保つ
 */
export function selectStableVisibleMembers(ordered, visibleCount, recentlySpokenKeys, keyOf) {
  const list = Array.isArray(ordered) ? ordered : [];
  const cap = Math.max(0, Math.floor(Number(visibleCount) || 0));
  if (cap === 0 || list.length === 0) return [];
  if (list.length <= cap) return list.slice();

  const getKey =
    typeof keyOf === 'function'
      ? keyOf
      : /** @param {any} row */ (row) =>
          String(row?.key || row?.userId || row?.name || '').trim();

  const spoken =
    recentlySpokenKeys instanceof Set
      ? recentlySpokenKeys
      : new Set(Array.isArray(recentlySpokenKeys) ? recentlySpokenKeys.map((k) => String(k)) : []);

  // 1) 直近発言者を元順のまま先に確保(枠を超えない範囲で)。
  const picked = [];
  const pickedIdx = new Set();
  if (spoken.size > 0) {
    for (let i = 0; i < list.length && picked.length < cap; i += 1) {
      const k = getKey(list[i]);
      if (k && spoken.has(k)) {
        picked.push(i);
        pickedIdx.add(i);
      }
    }
  }
  // 2) 残り枠を元順で安定して埋める。
  for (let i = 0; i < list.length && picked.length < cap; i += 1) {
    if (pickedIdx.has(i)) continue;
    picked.push(i);
    pickedIdx.add(i);
  }
  // 3) 表示は元の並び順に戻す(発言者が割り込んでも席順が飛ばない=安定)。
  picked.sort((a, b) => a - b);
  return picked.map((i) => list[i]);
}

/**
 * 「実サムネ持ちを先頭へ」安定パーティション(2026-06-15 ユーザー実機「サムネ持ちが最前列に
 * 来てない」根治)。tier 充填は配列の先頭から手前段に入るので、サムネ持ちを先頭に集めると
 * 必ず最前列(大きい段)から埋まる。group 内は元順を維持=同入力なら同出力でちらつかない。
 *
 * @template T
 * @param {T[]} list 表示する席エントリ配列(元順=安定済みの想定)
 * @param {(entry: T) => boolean} hasThumb 実サムネ持ちか判定する述語
 * @returns {T[]} サムネ持ち→それ以外 の順に並べ替えた新配列(各 group 内は元順維持)
 */
export function partitionThumbnailFirst(list, hasThumb) {
  const arr = Array.isArray(list) ? list : [];
  const pred = typeof hasThumb === 'function' ? hasThumb : () => false;
  const withThumb = [];
  const without = [];
  for (const entry of arr) {
    if (pred(entry)) withThumb.push(entry);
    else without.push(entry);
  }
  return [...withThumb, ...without];
}
