/**
 * venueBubbleBurst.js — 会場の吹き出しが「一気に出る」瞬間を数える計器(観測のみ・2026-11-04)。
 *
 * 背景: りんく「ニコニコでも一気に出るときがある。コメントが多いので本当のこともあるけど」。
 *   吹き出しは processSpeechRows に届いた1束の新着を同じ瞬間に全部出す(最大 24・同時表示 12)。
 *   コードを読むと、本当に一気に来た以外に「一気に見える」経路が3つある:
 *     (1) 過去ログ取り込み(backfill)の行も persistCommentRows → onLiveComments を通る
 *         =何十分も前のコメントが「新着」として 800 件束で届く(最新 24 件を吹く)。
 *     (2) 別窓の会場(venue.html / status 埋め込み)はテール書き込み(~1.5秒・大配信 ~6秒・
 *         放送タブが裏だと最大 120 秒)ごとにしか新着を知らない=その間の分がまとめて出る。
 *     (3) 本当に一気にコメントが来た(弾幕)。
 *   本計器は、束ごとに「何件出たか・どの経路か・取り込み元・その時の実際の流量」を記録し、
 *   (1)(2)(3) のどれだったかを状態速報の1行で読めるようにする。描画・データには一切触れない。
 *
 * 実際の流量: commentNo は配信全体の通し番号なので、最大 commentNo の進み方=配信の本当の
 *   コメント量(会場に届かなかった分も含む)。束の件数をこれと比べる。
 *
 * @module venueBubbleBurst
 */

/** これ以上を同時に出した束を「一気に出た」と数える。 */
export const VENUE_BURST_MIN = 5;
/** 最大 commentNo よりこれ以上小さい番号は「過去のコメント」(取り込み・再送)とみなす。 */
export const VENUE_OLD_NO_GAP = 100;
/** 実際の流量を測る窓。 */
const RATE_WINDOW_MS = 10_000;
/** 直近の「一気に出た」束を何件まで覚えるか。 */
const RECENT_MAX = 5;

/**
 * @typedef {{ batches: number, bubbles: number, bursts: number, oldBubbles: number }} BurstPathStat
 * @typedef {{ at: number, path: string, source: string, shown: number, fresh: number,
 *   oldN: number, gapMs: number, ratePerSec: number, kind: string }} BurstRecord
 */

export function createVenueBubbleBurstState() {
  return {
    batches: 0,
    bubbles: 0,
    bursts: 0,
    capDropped: 0,
    maxShown: 0,
    /** @type {Record<string, BurstPathStat>} */
    byPath: {},
    /** @type {Record<string, number>} 「一気に出た」束の取り込み元別件数 */
    burstBySource: {},
    /** @type {Record<string, number>} 「一気に出た」束の分類別件数(old/batched/flood) */
    burstByKind: {},
    /** @type {BurstRecord[]} */
    recent: [],
    hiNo: 0,
    /** @type {Array<{ at: number, no: number }>} 最大 commentNo の推移(流量用) */
    hiTrail: [],
    /** @type {Record<string, number>} 経路ごとの前回の束の時刻 */
    lastAtByPath: {},
    peakRatePerSec: 0,
    /** 同じ人の同じ文がもう一度吹いた回数(別キー=読み直しの疑い) */
    sameTextRepeat: 0,
    /** v0.1.1862: 過去の番号として吹き出さなかった件数 */
    skippedOld: 0,
    /** commentNo を持たない合成キー(c:…)で吹いた件数(読み直しが起きうるキー) */
    noCommentNo: 0,
    /** @type {Map<string, string>} 人+文 → 最後に吹いたキー(上限 REPEAT_MEMO_MAX) */
    lastKeyByText: new Map()
  };
}

const REPEAT_MEMO_MAX = 600;

/** @param {unknown} row */
function commentNoOf(row) {
  const r = /** @type {any} */ (row);
  const n = Number(r?.commentNo ?? r?.no);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * 1束ぶんを記録する(processSpeechRows の末尾で1回呼ぶ)。
 * @param {ReturnType<typeof createVenueBubbleBurstState>|null|undefined} state
 * @param {{ at: number, path: string, source?: string,
 *   rows?: ReadonlyArray<unknown>, speeches?: ReadonlyArray<{ key?: string, speakerKey?: string, text?: string }>,
 *   fresh?: number, shown?: number, skippedOld?: number }} obs
 */
export function observeVenueSpeechBatch(state, obs) {
  if (!state || typeof state !== 'object' || !obs || typeof obs !== 'object') return;
  const at = Number(obs.at) || 0;
  const path = String(obs.path || 'unknown');
  const source = String(obs.source || '') || (path === 'live' ? 'unknown' : path);
  const rows = Array.isArray(obs.rows) ? obs.rows : [];
  // v0.1.1862: 過去の番号として吹き出さずに既読にした件数(直した後に効いているかを見る)。
  state.skippedOld += Math.max(0, Math.floor(Number(obs.skippedOld) || 0));
  const speeches = Array.isArray(obs.speeches) ? obs.speeches : [];

  // 過去判定は「この束が来る前の最大番号」と比べる(束の中の新しい行で自分を古く見せない)。
  const prevHi = state.hiNo;
  let batchHi = 0;
  for (const r of rows) {
    const n = commentNoOf(r);
    if (n > batchHi) batchHi = n;
  }
  let oldN = 0;
  for (const sp of speeches) {
    const spAny = /** @type {any} */ (sp);
    const key = String(sp?.key || '');
    if (key.startsWith('c:')) state.noCommentNo += 1;
    const memoKey = `${String(spAny?.speakerKey || '')}|${String(spAny?.text || '')}`;
    if (memoKey !== '|') {
      const prevKey = state.lastKeyByText.get(memoKey);
      if (prevKey && prevKey !== key) state.sameTextRepeat += 1;
      state.lastKeyByText.delete(memoKey);
      state.lastKeyByText.set(memoKey, key);
      if (state.lastKeyByText.size > REPEAT_MEMO_MAX) {
        const firstKey = state.lastKeyByText.keys().next().value;
        if (firstKey !== undefined) state.lastKeyByText.delete(firstKey);
      }
    }
    const m = /^no:(\d+)$/.exec(key);
    const n = m ? Number(m[1]) : 0;
    if (n > 0 && prevHi > 0 && n < prevHi - VENUE_OLD_NO_GAP) oldN += 1;
  }
  if (batchHi > state.hiNo) state.hiNo = batchHi;

  // 実際の流量(配信の通し番号の進み)。番号を初めて知った束は基準にするだけ(0→N の跳びを流量にしない)。
  if (prevHi <= 0) state.hiTrail.length = 0;
  if (state.hiNo > 0) state.hiTrail.push({ at, no: state.hiNo });
  while (state.hiTrail.length > 2 && at - state.hiTrail[0].at > RATE_WINDOW_MS) state.hiTrail.shift();
  if (state.hiTrail.length > 64) state.hiTrail.splice(0, state.hiTrail.length - 64);
  const first = state.hiTrail[0];
  const spanMs = first ? at - first.at : 0;
  const ratePerSec = first && spanMs >= 2000 ? Math.max(0, (state.hiNo - first.no) / (spanMs / 1000)) : 0;
  if (ratePerSec > state.peakRatePerSec) state.peakRatePerSec = ratePerSec;

  const shown = Math.max(0, Math.floor(Number(obs.shown ?? speeches.length) || 0));
  const fresh = Math.max(shown, Math.floor(Number(obs.fresh) || 0));
  const prevAt = state.lastAtByPath[path] || 0;
  const gapMs = prevAt > 0 ? at - prevAt : 0;
  if (fresh > 0) state.lastAtByPath[path] = at;
  if (fresh <= 0) return;

  state.batches += 1;
  state.bubbles += shown;
  state.capDropped += fresh - shown;
  if (shown > state.maxShown) state.maxShown = shown;
  const ps = state.byPath[path] || (state.byPath[path] = { batches: 0, bubbles: 0, bursts: 0, oldBubbles: 0 });
  ps.batches += 1;
  ps.bubbles += shown;
  ps.oldBubbles += oldN;

  if (shown < VENUE_BURST_MIN) return;
  // 分類: 半分以上が過去のコメント=old / 前の束から1秒以上空いて溜まった=batched / それ以外=flood(本当に一気)
  const kind = oldN * 2 >= shown ? 'old' : gapMs >= 1000 ? 'batched' : 'flood';
  state.bursts += 1;
  ps.bursts += 1;
  state.burstBySource[source] = (state.burstBySource[source] || 0) + 1;
  state.burstByKind[kind] = (state.burstByKind[kind] || 0) + 1;
  state.recent.push({
    at, path, source, shown, fresh, oldN, gapMs,
    ratePerSec: Math.round(ratePerSec * 10) / 10,
    kind
  });
  if (state.recent.length > RECENT_MAX) state.recent.splice(0, state.recent.length - RECENT_MAX);
}

const KIND_LABEL = /** @type {Record<string, string>} */ ({
  old: '過去ログ',
  batched: 'まとめ届き',
  flood: '本当に一気'
});

/**
 * 状態速報の1行+材料。束が1つも無ければ⚪(誤報しない)。
 * @param {ReturnType<typeof createVenueBubbleBurstState>|null|undefined} state
 * @param {number} now
 */
export function toVenueBubbleBurstDiag(state, now) {
  if (!state || typeof state !== 'object') return null;
  let line;
  if (state.batches <= 0) {
    line = '吹き出しの一気出し ⚪ 未観測';
  } else {
    const kinds = Object.entries(state.burstByKind)
      .map(([k, n]) => `${KIND_LABEL[k] || k}${n}`)
      .join('・');
    const srcs = Object.entries(state.burstBySource)
      .map(([k, n]) => `${k}${n}`)
      .join('・');
    const paths = Object.entries(state.byPath)
      .map(([k, p]) => `${k}:束${p.batches}/吹${p.bubbles}/一気${p.bursts}/過去${p.oldBubbles}`)
      .join(' ');
    const last = state.recent[state.recent.length - 1];
    const lastStr = last
      ? ` / 直近の一気: ${Math.max(0, Math.round((now - last.at) / 1000))}秒前 ${last.shown}件(${KIND_LABEL[last.kind] || last.kind}・${last.path}/${last.source}・間隔${Math.round(last.gapMs / 100) / 10}秒・その時の流量${last.ratePerSec}件/秒)`
      : '';
    line =
      `吹き出しの一気出し ${state.bursts > 0 ? '🟡' : '🟢'} ${VENUE_BURST_MIN}件以上まとめて${state.bursts}回` +
      (kinds ? `(${kinds})` : '') +
      (srcs ? ` 元:${srcs}` : '') +
      ` / 最大${state.maxShown}件同時 / 上限で出さず${state.capDropped}件` +
      ` / 配信の流量 最大${Math.round(state.peakRatePerSec * 10) / 10}件/秒` +
      ` / 同じ人の同じ文${state.sameTextRepeat}回・番号なし${state.noCommentNo}件` +
      ` / 過去の番号で出さず${state.skippedOld}件` +
      ` / ${paths}` +
      lastStr;
  }
  return {
    line,
    batches: state.batches,
    bubbles: state.bubbles,
    bursts: state.bursts,
    capDropped: state.capDropped,
    maxShown: state.maxShown,
    peakRatePerSec: Math.round(state.peakRatePerSec * 10) / 10,
    sameTextRepeat: state.sameTextRepeat,
    noCommentNo: state.noCommentNo,
    skippedOld: state.skippedOld,
    byPath: { ...state.byPath },
    burstBySource: { ...state.burstBySource },
    burstByKind: { ...state.burstByKind },
    recent: state.recent.slice()
  };
}
