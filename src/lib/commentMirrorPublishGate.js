/**
 * コメント鏡 publish の provisional ガード(純関数 + 状態ファクトリ・v0.1.1018)。
 *
 * 背景(多タブ30件フォールバック根治): 同じ配信を2タブで開くと storage read が競合し、popup が全記録でなく
 *   軽量サマリの直近30件(commentReadState==='summary')で描画・publish してしまう。その痩せた30件が
 *   コメント鏡として③WEBに送られると「コメントが薄い/進まない」不一致になる(実機 lv350863900: 記録4348件
 *   なのに鏡30件)。①POPの画面はサマリ30件で即応してよいが、③WEBの全件鏡を30件で潰さないのがこの判定。
 *
 * 判定: provisional(サマリ30件)のとき、同一配信の全件鏡を最近(guardMs 以内)publish 済みなら skip。
 *   全件鏡がまだ無い(初回/配信切替)なら暫定でも出す(空より30件がマシ=即応)。
 *   状態(最後に全件鏡を出した liveId/at)も lib 側に閉じ込め、popup-entry.js の行数を増やさない
 *   (max-lines 上限ギリギリ)。テストも lib 側で完結する。
 *
 * @module commentMirrorPublishGate
 */

const DEFAULT_GUARD_MS = 30_000;

/**
 * provisional を skip すべきか判定する純関数(状態を引数で受ける)。
 * @param {{ provisional?: boolean, liveId?: string, lastFull?: { liveId?: string, at?: number }|null, nowMs?: number, guardMs?: number }} input
 * @returns {boolean} true=見送る(全件鏡を守る) / false=publishしてよい
 */
export function shouldSkipProvisionalCommentMirror(input) {
  const a = input && typeof input === 'object' ? input : {};
  if (a.provisional !== true) return false; // 全件由来は常に出す。
  const lid = String(a.liveId || '').trim().toLowerCase();
  const last = a.lastFull && typeof a.lastFull === 'object' ? a.lastFull : null;
  const lastLid = String(last?.liveId || '').trim().toLowerCase();
  const lastAt = Number(last?.at) || 0;
  const now = Number(a.nowMs) || 0;
  const guardMs = Number(a.guardMs) > 0 ? Number(a.guardMs) : DEFAULT_GUARD_MS;
  if (!lid || lastLid !== lid || lastAt <= 0 || now <= 0) return false; // 全件鏡が無い/別配信=暫定を出す。
  return now - lastAt < guardMs; // 全件鏡が最近ある=暫定は見送る。
}

/** コメント鏡 publish の min-gap(描画のたびに書くが頻度を抑える)。 */
const DEFAULT_MIN_GAP_MS = 3000;

/**
 * 状態(最後の全件publish時刻・最後の書込時刻)を内部に閉じ込めたゲート。popup-entry はこれ1個を持ち、
 *   decide() 1回で「liveId検証・provisionalガード・min-gap」をまとめて判定+状態更新する
 *   (popup 側の変数宣言と分岐を増やさない=max-lines ラチェットを守る)。
 *
 * ★min-gap の外し方(v0.1.1036・鏡バンドル統合): `minGapMs: 0` を明示で渡すと min-gap を無効化する
 *   (0 を「未指定=既定3秒」に丸めない)。鏡バンドル統合後は min-gap を flush スケジューラに一元化するため、
 *   ここでは min-gap を切って provisional ガード+liveId 検証だけを担わせる。min-gap を残したまま flush 側にも
 *   置くと『gate が gap 窓のコメントを捨てる→次 flush でも載らない』二重ゲートで、まさに潰したい取りこぼしを
 *   コメントに再導入するため(F-1 の再来)。
 * @param {{ guardMs?: number, minGapMs?: number }} [opts]
 * @returns {{ decide: (p: {liveId: string, hasComments: boolean, provisional: boolean, nowMs: number}) => boolean }}
 */
export function createCommentMirrorPublishGate(opts = {}) {
  const guardMs = Number(opts?.guardMs) > 0 ? Number(opts.guardMs) : DEFAULT_GUARD_MS;
  // minGapMs は「明示 0 = 無効化」を許す(未指定 undefined のときだけ既定へ)。
  const rawGap = Number(opts?.minGapMs);
  const minGapMs = opts && opts.minGapMs != null && Number.isFinite(rawGap) && rawGap >= 0 ? rawGap : DEFAULT_MIN_GAP_MS;
  let lastFull = { liveId: '', at: 0 };
  let lastWriteAt = 0;
  return {
    /** @returns {boolean} true=publish してよい(状態も更新済み) / false=見送る */
    decide: (p) => {
      const now = Number(p?.nowMs) || 0;
      const lid = String(p?.liveId || '').trim().toLowerCase();
      if (!/^lv\d{1,15}$/.test(lid) || p?.hasComments !== true) return false;
      const provisional = p?.provisional === true;
      if (shouldSkipProvisionalCommentMirror({ provisional, liveId: lid, lastFull, nowMs: now, guardMs })) return false;
      if (minGapMs > 0 && now - lastWriteAt < minGapMs) return false;
      lastWriteAt = now;
      if (!provisional) lastFull = { liveId: lid, at: now };
      return true;
    }
  };
}
