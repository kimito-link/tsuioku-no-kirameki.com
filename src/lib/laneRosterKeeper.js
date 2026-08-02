/**
 * 応援レーンの「名簿キーパー」(v0.1.1232・Phase 2 蓄積器)。
 *
 * 【なぜ必要か】
 * ユーザー確定の不変条件:
 *   「とにかく1度出た人は制限がなくずっと出るように」
 *   = その配信に来た人は、増えることはあっても、減って消えることは絶対にない。
 *
 * ところが応援レーンは **毎 paint ゼロから候補を作り直す**。横断的な記憶は
 *   - 直前の描画内容の文字列(diff-skip 用)
 *   - 最後に描いた配信ID
 *   - DOM の childElementCount(個数だけ)
 * しかなく、**「一度出た人」を覚える仕組みがどこにも無かった**(lane-never-drop-MAP.md §4.1)。
 *
 * 上限48の撤廃(popup-entry.js)だけでは、
 *   「候補集合そのものから人が落ちた」場合に依然として消える。
 * その穴を埋めるのが本モジュール = 名簿(rows)に「最後に見た姿」を持ち、
 * 候補から落ちた人を毎 paint 復活合流させる。
 *
 * 【計器(laneRosterDelta)と分けている理由】
 * laneRosterDelta も everSeen:Set を持つが、あちらは「★挙動は一切変えない(観測のみ)」と
 * 宣言された審判。制御に流用すると「計器が壊れたら描画も壊れる」結合になるため、
 * **計器は審判のまま残し、描画用の名簿はこちらが持つ**(lane-never-drop-SPEC.md §2-A)。
 *
 * ★DOM は一切読まない(paint のたびの DOM 全走査は過去に拡張全体を重くした既知地雷)。
 * ★計算量は O(candidates + rows) / paint。
 *
 * 正本: lane-never-drop-SPEC.md §4 1-1 / 地図: lane-never-drop-MAP.md
 * @module laneRosterKeeper
 */

/**
 * @typedef {{
 *   entryIndex: number,
 *   profileTier: number,
 *   thumbScore: number,
 *   displaySrc: string,
 *   title: string,
 *   entry: { userId: string },
 *   recentTexts: string[],
 *   meta: { idLine: string, nameLine: string }
 * }} LaneCandidateRow
 */

/**
 * 候補行から userId を取り出す(laneRosterDelta.laneUserIdSet と同じ正規化)。
 * @param {unknown} row
 * @returns {string}
 */
function rowUserId(row) {
  const o = /** @type {{ entry?: { userId?: unknown } }} */ (
    row && typeof row === 'object' ? row : null
  );
  if (!o) return '';
  return String(o.entry?.userId ?? '').trim();
}

/**
 * 名簿キーパーの初期状態を作る。
 *
 * @returns {{ lid: string, rows: Map<string, LaneCandidateRow> }}
 */
export function makeLaneRosterKeeperState() {
  return {
    lid: '',
    /** ★uid → 最後に描いた候補行。候補から落ちた人を復活させるための唯一の記憶。 */
    rows: new Map()
  };
}

/**
 * 今回の候補に「過去に描いたが今回候補から落ちた人」を復活合流させ、名簿を更新する。
 *
 * - lid 変化 → 名簿を作り直す(前配信の人を持ち込まない)。
 *   「ずっと残る」は **同一配信の中での約束**(laneRosterDelta と同じ流儀)。
 * - 同一 lid → candidates に居ない名簿の行を末尾に足して返す(復活行は最後に見た姿)。
 *   その後、名簿を現行候補の最新行で上書きする(段昇格・アイコン後着観測を反映)。
 *
 * ★呼び出しは **sort の前**。復活行も現行 comparator で正しい位置に並ぶ
 *   (sort 後に足すと表示順契約 popup=venue を壊す)。
 *
 * @param {ReturnType<typeof makeLaneRosterKeeperState>} state
 * @param {{ liveId?: unknown, candidates?: readonly LaneCandidateRow[] }} args
 * @returns {{ merged: LaneCandidateRow[], revivedCount: number }}
 */
export function applyLaneRosterKeeper(state, args) {
  const candidates = Array.isArray(args?.candidates)
    ? /** @type {LaneCandidateRow[]} */ (args.candidates)
    : [];
  if (!state || typeof state !== 'object') return { merged: [...candidates], revivedCount: 0 };

  try {
    const lid = String(args?.liveId ?? '').trim().toLowerCase();

    // 配信が変わったら名簿をリセット(ユーザーが別番組へ移った=正当な切替)。
    if (lid !== state.lid) {
      state.lid = lid;
      state.rows = new Map();
      for (const row of candidates) {
        const uid = rowUserId(row);
        if (uid) state.rows.set(uid, row);
      }
      return { merged: [...candidates], revivedCount: 0 };
    }

    // 今回の候補に居る uid を集める(復活対象の判定用)。
    const presentUids = new Set();
    for (const row of candidates) {
      const uid = rowUserId(row);
      if (uid) presentUids.add(uid);
    }

    // 名簿に居て今回の候補に居ない人を復活させる(★これが「消えない」の実行者)。
    /** @type {LaneCandidateRow[]} */
    const revived = [];
    for (const [uid, row] of state.rows) {
      if (!presentUids.has(uid)) revived.push(row);
    }

    // 名簿を現行候補の最新行で上書き(段昇格・アイコン後着観測を反映)。
    for (const row of candidates) {
      const uid = rowUserId(row);
      if (uid) state.rows.set(uid, row);
    }

    return { merged: [...candidates, ...revived], revivedCount: revived.length };
  } catch {
    // fail-open: 名簿が壊れても現行候補は必ず描く(黙って全員を消さない)。
    return { merged: [...candidates], revivedCount: 0 };
  }
}
