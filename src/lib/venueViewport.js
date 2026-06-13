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
 * 映像セーフエリアを守りつつ同時表示するアリーナ席数を決める。
 * 「横にはみ出さない列数 × 段数」を上限に、論理人数で頭打ちする。
 * これにより横スクロールが構造的に出ない & 映像を覆う面積を一定に保つ。
 *
 * @param {object} opts
 * @param {number} opts.totalCount 論理参加者数(全員)
 * @param {number} opts.perRow 1行に収まる席数(seatsPerRow の結果)
 * @param {number} [opts.rows=3] ひな壇の段数(会議確定 2〜3 段)
 * @param {number} [opts.hardCap=40] 同時表示の絶対上限(会議確定 24〜40)
 * @returns {number} 同時表示する席数
 */
export function resolveVisibleArenaCount(opts) {
  const total = Math.max(0, Math.floor(Number(opts?.totalCount) || 0));
  const perRow = Math.max(1, Math.floor(Number(opts?.perRow) || 1));
  const rows = Math.max(1, Math.floor(Number(opts?.rows ?? 3)));
  const hardCap = Math.max(1, Math.floor(Number(opts?.hardCap ?? 40)));
  const byGrid = perRow * rows;
  return Math.min(total, byGrid, hardCap);
}

/**
 * 観客席(顔の帯)に同時に並べる顔数を決める。
 * 映像を覆わないよう「1〜2行に収まる数」に厳しく絞る。残りは「ほか観客 N 人」へ。
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
