// @ts-nocheck — 任意の jsonBlob を段階的に間引く動的整形
/**
 * 純Web公開ペイロード(jsonBlob)の容量 prune はしご純関数
 *   (HANDOFF-robust-architecture-IMPL.md 着手2 = Phase 1 MVP)。
 *
 * 真犯人 = KEY_LIVEVIEW_PUBLISH_PAYLOAD(0.5MB級ジャンボキー)を短間隔で set → onChanged
 *   ファンアウトで browser process の storage/IPC を輻輳させ、無関係な postMessage 配達や
 *   入力まで巻き添えにする。min-gap 3000→12000 で頻度を絞るのと対で、1枚あたりのサイズも
 *   上限(448KB)を超えたら段階的に削って蛇口を細くする。
 *
 * ★設計の核(嘘をつかない):
 *   - 削ったら必ず pruned[] に {section, before, after} を残し、呼び出し側が
 *     blob.snapshotMeta.pruned に載せる。自己診断(liveviewPublishSelfDiag)がそれを見て
 *     「削ったから件数が減っている=正常」と判定でき、①vs③件数突合が嘘の🔴を出さない
 *     (地雷: lane-limit-200-mirror-cap-parity)。
 *   - totalSeen 等の「本当は何件あったか」は据え置き=誠実に元件数を残す。
 *   - laneMirror.js:30 の cap 半減パターンが手本。ここは複数セクションを優先順で削る版。
 *
 * 削る順(価値の低い順・SYNTHESIS.md B2-6):
 *   ⓪ giftHistoryMirror.ledgerRows を 20→8→0 に半減(投げ明細はランキングより価値低=最優先で削る)。
 *   ① commentTimelineMirror.rows を半減(最新側=末尾を残す)。複数回まで。
 *   ② giftHistoryMirror.rooms を 10→5 に削る。
 *   ③ topSupporters.rows を 10→5 に削る。
 *   ④ statusReport(fullText 文字列)を末尾切詰め+「※容量超過のため切詰め」注記。
 *
 * 純関数・chrome 非依存・副作用なし(入力 blob は破壊しない=浅い clone で作業する)。
 *
 * @module pruneLiveViewPublishBlob
 */

/** 既定の1枚あたり上限(bytes)。KEY_LIVEVIEW_PUBLISH_PAYLOAD の実測肥大を抑える閾値。 */
export const LIVEVIEW_PUBLISH_MAX_JSON_BYTES = 448 * 1024;
/** topSupporters を削るときの下限件数(② 10→5)。 */
const TOP_SUPPORTERS_FLOOR = 5;
/** commentTimelineMirror.rows を半減し続けるときの下限件数。 */
const COMMENT_ROWS_FLOOR = 8;
/** giftHistoryMirror.ledgerRows を半減し続けるときの下限件数(20→8→...→0=投げ明細は最優先で削る)。 */
const GIFT_LEDGER_ROWS_FLOOR = 8;
/** giftHistoryMirror.rooms を削るときの下限件数(② 10→5)。 */
const GIFT_ROOMS_FLOOR = 5;
/** statusReport 切詰め時に末尾へ足す注記(この分の余白を残して切る)。 */
const TRUNCATE_NOTE = '\n\n※容量超過のため切詰め（純Web公開ペイロードのサイズ上限による）';

/** JSON バイト長(stringify 不能なら 0)。 */
function jsonBytes(v) {
  try {
    return JSON.stringify(v).length;
  } catch {
    return 0;
  }
}

/**
 * 純Web公開ペイロードを容量上限に収まるよう段階的に削る。
 * @param {object|null|undefined} blob 純Webへ送る jsonBlob(_lastRenderedBundle.jsonBlob)
 * @param {{ maxBytes?: number }} [opts]
 * @returns {{ blob: object, pruned: Array<{section:string, before:number, after:number}> }}
 */
export function pruneLiveViewPublishBlob(blob, opts = {}) {
  const src = blob && typeof blob === 'object' ? blob : {};
  const maxBytes = Number.isFinite(Number(opts?.maxBytes)) && Number(opts.maxBytes) > 0
    ? Math.floor(Number(opts.maxBytes))
    : LIVEVIEW_PUBLISH_MAX_JSON_BYTES;

  /** @type {Array<{section:string, before:number, after:number}>} */
  const pruned = [];

  // 上限以下ならそのまま返す(挙動不変)。※null/非オブジェクト入力もここで空 pruned で返る。
  if (!blob || typeof blob !== 'object' || jsonBytes(src) <= maxBytes) {
    return { blob: src, pruned };
  }

  // 入力を破壊しないため浅い clone(削る対象のコンテナだけ差し替える)。
  const out = { ...src };

  // ⓪ giftHistoryMirror.ledgerRows を 20→8→0 に半減(投げ明細=ランキングより価値低=最優先で削る)。
  //    まず floor(8) まで半減。それでも上限超過なら 0 まで落とす(明細を完全に諦めても rooms は残す)。
  {
    const gh = out.giftHistoryMirror;
    if (gh && typeof gh === 'object' && Array.isArray(gh.ledgerRows) && gh.ledgerRows.length > 0) {
      let rows = gh.ledgerRows;
      const before = rows.length;
      // 半減ループ(floor まで)。
      while (jsonBytes(out) > maxBytes && rows.length > GIFT_LEDGER_ROWS_FLOOR) {
        const nextLen = Math.max(GIFT_LEDGER_ROWS_FLOOR, Math.floor(rows.length / 2));
        if (nextLen >= rows.length) break;
        rows = rows.slice(0, nextLen); // 新しい側(先頭)を残す(ledgerRows は新しい順)
        // ledgerTotalCount は据え置き=「本当は何件あったか」を誠実に残す。
        out.giftHistoryMirror = { ...gh, ledgerRows: rows };
      }
      // floor でもまだ超過なら 0 まで落とす(明細を完全に諦める)。
      if (jsonBytes(out) > maxBytes && rows.length > 0) {
        rows = [];
        out.giftHistoryMirror = { ...gh, ledgerRows: rows };
      }
      if (rows.length < before) {
        pruned.push({ section: 'giftHistoryMirror.ledgerRows', before, after: rows.length });
      }
    }
  }

  // ① commentTimelineMirror.rows を半減(最新側=末尾を残す)。複数回まで。
  {
    const ctm = out.commentTimelineMirror;
    if (ctm && typeof ctm === 'object' && Array.isArray(ctm.rows) && ctm.rows.length > COMMENT_ROWS_FLOOR) {
      let rows = ctm.rows;
      const before = rows.length;
      while (jsonBytes(out) > maxBytes && rows.length > COMMENT_ROWS_FLOOR) {
        const nextLen = Math.max(COMMENT_ROWS_FLOOR, Math.floor(rows.length / 2));
        if (nextLen >= rows.length) break;
        rows = rows.slice(-nextLen); // 最新側(末尾)を残す
        // totalSeen は据え置き=「本当は何件あったか」を誠実に残す。
        out.commentTimelineMirror = { ...ctm, rows };
      }
      if (rows.length < before) {
        pruned.push({ section: 'commentTimelineMirror.rows', before, after: rows.length });
      }
    }
  }

  // ② giftHistoryMirror.rooms を 10→5 に削る(貢献者ランキングの尾を切る)。
  if (jsonBytes(out) > maxBytes) {
    const gh = out.giftHistoryMirror;
    if (gh && typeof gh === 'object' && Array.isArray(gh.rooms) && gh.rooms.length > GIFT_ROOMS_FLOOR) {
      const before = gh.rooms.length;
      const rooms = gh.rooms.slice(0, GIFT_ROOMS_FLOOR);
      out.giftHistoryMirror = { ...gh, rooms };
      pruned.push({ section: 'giftHistoryMirror.rooms', before, after: rooms.length });
    }
  }

  // ③ topSupporters.rows を 10→5 に削る。
  if (jsonBytes(out) > maxBytes) {
    const sup = out.topSupporters;
    if (sup && typeof sup === 'object' && Array.isArray(sup.rows) && sup.rows.length > TOP_SUPPORTERS_FLOOR) {
      const before = sup.rows.length;
      const rows = sup.rows.slice(0, TOP_SUPPORTERS_FLOOR);
      out.topSupporters = { ...sup, rows };
      pruned.push({ section: 'topSupporters.rows', before, after: rows.length });
    }
  }

  // ④ statusReport(fullText 文字列)を末尾切詰め+注記。上限に収まる長さを二分探索せず線形で詰める。
  if (jsonBytes(out) > maxBytes && typeof out.statusReport === 'string' && out.statusReport.length > 0) {
    const before = out.statusReport.length;
    // 上限超過ぶんのバイト数(=文字数と1:1でない可能性はあるが JSON 長で測るので安全側)。
    // out から statusReport を除いた土台サイズを測り、残せる文字数を出す。
    const withoutReport = { ...out, statusReport: '' };
    const baseBytes = jsonBytes(withoutReport); // "" の2バイト込み
    // JSON 文字列化で1文字が1〜6バイトになりうるため、保守的に「残余の半分」から始めて詰める。
    const budget = maxBytes - baseBytes - TRUNCATE_NOTE.length - 16; // 注記+JSONエスケープ余白
    let keep = Math.max(0, Math.min(before, budget > 0 ? budget : 0));
    out.statusReport = src.statusReport.slice(0, keep) + TRUNCATE_NOTE;
    // まだ超えていれば残せる文字数を段階的に減らす(エスケープ膨張の保険)。
    let guard = 0;
    while (jsonBytes(out) > maxBytes && keep > 0 && guard < 40) {
      keep = Math.floor(keep * 0.8);
      out.statusReport = src.statusReport.slice(0, keep) + TRUNCATE_NOTE;
      guard += 1;
    }
    if (out.statusReport.length < before) {
      pruned.push({ section: 'statusReport', before, after: out.statusReport.length });
    }
  }

  return { blob: out, pruned };
}
