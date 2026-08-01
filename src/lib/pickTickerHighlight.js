/**
 * コメントティッカーに「留める1件」を選ぶ純関数(v0.1.1226)。
 *
 * 【何を解決するか】
 * ニコ生のコメントは流れて埋もれる。読み上げ(音声)は1件2.5〜3.0秒かかり
 * 【1分20件が物理上限】で、実測では需要31.8件/分に対し供給21.1件/分＝
 * **毎分10件前後は音声では絶対に届かない**。この欠損を視覚で補う。
 *
 * 【設計の核: キューを持たない・状態を持たない】
 * 現在時刻を BUCKET_MS で丸めた「バケット」ごとに、直近 LOOKBACK_MS の候補から
 * 決定的に argmax を取る。持ち越しが無いので **溢れも遅延も原理的に起きない**
 * (読み上げがキュー+3種dropで戦っている破綻を、表示側で再演しない)。
 * 遅延の上界はバケット幅で厳密に有界。
 *
 * ★同一バケット内なら何度呼んでも同じ答えを返す。これにより
 *   ①POP / ②passive dock / ③純Web live-view が **別タイミングで呼んでも一致する**
 *   ＝面ごとのタイマー状態も、鏡への新フィールド追加も一切不要。
 *   (鏡に新フィールドを足す設計だと「能動だけ着飾り passive/Web は素のまま」という
 *    中継落ちの穴が開く。2026-08-01 に同型の穴を5回踏んだ)
 *
 * 【drop連動を採らなかった理由】
 * 当初案は「読み上げから漏れた(drop)コメントを拾う」だったが撤回した:
 *   (1) drop は合成速度の都合であって **内容の重要性とは無関係**(スパムも等しく落ちる)
 *   (2) `voicePlayer._notifyDropped` は引数なしで、**捨てた本文を保持していない**(実コード確認)
 * drop の実測は「この機能が要る理由」としてのみ使い、**選定には一切使わない**。
 *
 * 正本: docs/handoff/comment-pickup-ticker-DESIGN.md
 * @module pickTickerHighlight
 */

import { pickLatestCommentEntry } from './pickLatestComment.js';

/** バケット幅(=最小表示秒数)。これ未満の頻度では切り替わらない。 */
export const TICKER_BUCKET_MS = 7000;

/** 候補を集める遡り幅。バケット幅+1秒で境界の取りこぼしを防ぐ。 */
export const TICKER_LOOKBACK_MS = 8000;

/** これ未満の本文はスパム扱いで候補外(「w」「888」等)。ギフトは免除。 */
export const TICKER_MIN_TEXT_LEN = 4;

/** ここまでの長さは読みやすいとして加点する上限。 */
export const TICKER_SWEET_LEN_MAX = 60;

/** 窓内で同一本文がこの回数以上なら「合唱」とみなし候補外。 */
export const TICKER_DUP_EXCLUDE = 3;

/**
 * @typedef {{
 *   ts: number, kind: string, text: string, userId: string, commentNo: string, src: any
 * }} TickerCandidate
 */

/**
 * 本文を比較用に正規化する(空白圧縮+小文字化)。連投判定の同一性はこれで見る。
 * @param {unknown} text
 * @returns {string}
 */
function normalizeText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * ①の entry 形と ②③の鏡 row 形の両方を1つの形に正規化する。
 *
 * ★2つの形が実在する(実コードで確認済み):
 *   ①displayEntries: { capturedAt, text, userId, nickname, commentNo, ... }
 *   ②③鏡row       : { at, text, userId, name, kind, avatarUrl }  ← commentNo を持たない
 *
 * @param {unknown} row
 * @returns {TickerCandidate|null}
 */
function toCandidate(row) {
  const o = /** @type {Record<string, unknown>} */ (row && typeof row === 'object' ? row : null);
  if (!o) return null;
  // 鏡は at、能動は capturedAt。どちらか有効な方を採る。
  const atRaw = Number(o.at);
  const capRaw = Number(o.capturedAt);
  const ts = Number.isFinite(atRaw) && atRaw > 0
    ? atRaw
    : (Number.isFinite(capRaw) && capRaw > 0 ? capRaw : 0);
  return {
    ts,
    kind: String(o.kind || 'comment'),
    text: String(o.text ?? '').replace(/\s+/g, ' ').trim(),
    userId: String(o.userId ?? '').trim(),
    commentNo: String(o.commentNo ?? '').trim(),
    src: row
  };
}

/**
 * ティッカーに留める1件を決定的に選ぶ。
 *
 * @param {readonly unknown[]|null|undefined} list ①displayEntries または ②③鏡rows
 * @param {unknown} nowMs 現在時刻(epoch ms)
 * @param {{ lastUserId?: unknown }} [opts]
 *   lastUserId: 直前バケットで選ばれた userId(1人占拠の防止用・任意)
 * @returns {{
 *   entry: any,
 *   why: 'gift'|'scored'|'fallback'|'none',
 *   bucketAt: number,
 *   stats: {
 *     candidates: number,
 *     filteredTooShort: number,
 *     filteredDup: number,
 *     filteredSameUser: number
 *   }
 * }}
 */
export function pickTickerHighlightEntry(list, nowMs, opts = {}) {
  const rows = Array.isArray(list) ? list : [];
  const now = Number(nowMs);
  const nowSafe = Number.isFinite(now) && now > 0 ? now : 0;
  // ★決定性の核: 時刻をバケットに丸める。同一バケット内は何度呼んでも同じ答え。
  const bucketAt = nowSafe > 0 ? nowSafe - (nowSafe % TICKER_BUCKET_MS) : 0;
  const stats = {
    candidates: 0,
    filteredTooShort: 0,
    filteredDup: 0,
    filteredSameUser: 0
  };
  const fallback = () => {
    const latest = pickLatestCommentEntry(/** @type {any} */ (rows));
    return {
      entry: latest || null,
      why: /** @type {'fallback'|'none'} */ (latest ? 'fallback' : 'none'),
      bucketAt,
      stats
    };
  };
  if (!rows.length || bucketAt <= 0) return fallback();

  // 窓: (bucketAt - LOOKBACK, bucketAt]。bucketAt より後の到着は次のバケットの担当。
  const windowFrom = bucketAt - TICKER_LOOKBACK_MS;
  /** @type {TickerCandidate[]} */
  const inWindow = [];
  for (const row of rows) {
    const c = toCandidate(row);
    if (!c || c.ts <= windowFrom || c.ts > bucketAt) continue;
    inWindow.push(c);
  }
  if (!inWindow.length) return fallback();

  // 窓内の同一本文の出現数(合唱の検出)。
  /** @type {Map<string, number>} */
  const dupCount = new Map();
  for (const c of inWindow) {
    const key = normalizeText(c.text);
    if (!key) continue;
    dupCount.set(key, (dupCount.get(key) || 0) + 1);
  }

  const lastUserId = String(opts?.lastUserId ?? '').trim();
  /** @type {{ c: TickerCandidate, score: number }|null} */
  let best = null;

  for (const c of inWindow) {
    const isGift = c.kind === 'gift';
    const norm = normalizeText(c.text);
    const len = Array.from(c.text).length;

    // フィルタ1: 極短スパム(「w」「888」)。ギフトは本文が無くても意味があるので免除。
    if (!isGift && len < TICKER_MIN_TEXT_LEN) {
      stats.filteredTooShort += 1;
      continue;
    }
    // フィルタ2: 合唱(同一本文の連発)。候補から外すだけで、フォールバック経由では従来どおり出る。
    const dup = norm ? (dupCount.get(norm) || 0) : 0;
    if (!isGift && dup >= TICKER_DUP_EXCLUDE) {
      stats.filteredDup += 1;
      continue;
    }
    // フィルタ3: 1人占拠の防止。★匿名(空userId)には適用しない=匿名を巻き添えにしない。
    if (!isGift && lastUserId && c.userId && c.userId === lastUserId) {
      stats.filteredSameUser += 1;
      continue;
    }

    stats.candidates += 1;
    let score = isGift ? 100 : 0;
    if (len >= TICKER_MIN_TEXT_LEN && len <= TICKER_SWEET_LEN_MAX) score += 10;
    else if (len <= 120) score += 5;
    score -= Math.max(0, dup - 1) * 8;

    if (score <= 0) continue;
    if (!best) {
      best = { c, score };
      continue;
    }
    // 同点は ts 降順 → commentNo 数値降順(決定的)。
    if (score > best.score) {
      best = { c, score };
    } else if (score === best.score) {
      if (c.ts > best.c.ts) best = { c, score };
      else if (c.ts === best.c.ts) {
        const a = /^\d+$/.test(c.commentNo) ? Number(c.commentNo) : -1;
        const b = /^\d+$/.test(best.c.commentNo) ? Number(best.c.commentNo) : -1;
        if (a > b) best = { c, score };
      }
    }
  }

  if (!best) return fallback();
  return {
    entry: best.c.src,
    why: best.c.kind === 'gift' ? 'gift' : 'scored',
    bucketAt,
    stats
  };
}

/**
 * diff-skip 用のキーを作る。同じキーなら innerHTML 代入をスキップする
 * (paint のたびに DOM を書き換えるのを防ぐ＝ちらつきと重さの両方に効く)。
 *
 * ★「消す側」(フォールバックへ落ちる遷移)も同じ機構を通す。
 *   ちらつき7版の真犯人は「消す/空にする側に計器も diff-skip も無かった」ことだった。
 *
 * @param {{ entry?: any, why?: string }|null|undefined} picked
 * @returns {string}
 */
export function tickerHighlightKey(picked) {
  const p = picked && typeof picked === 'object' ? picked : null;
  if (!p || !p.entry) return `${p?.why || 'none'}::`;
  const e = /** @type {Record<string, unknown>} */ (p.entry);
  const ts = Number(e.at) || Number(e.capturedAt) || 0;
  return [
    String(p.why || ''),
    String(e.commentNo ?? ''),
    String(ts),
    String(e.userId ?? '')
  ].join(':');
}

/**
 * v0.1.1226 計器: ピックアップが「効いたか」を後から検算するための累計を作る。
 *
 * ★why別に数えるのが要点。gift+scored が 0 のままなら「一度も発火していない
 *   (＝従来と同じ最新1件表示のまま)」と断言できる。filtered三兄弟は
 *   「なぜ候補から消えたか」を原因まで一意に示す(症状でなく原因を出す)。
 *   domWriteTotal は「現状より軽くなった」ことの数値証拠(理論上限=経過秒/バケット幅+α)。
 *
 * @returns {{ gift: number, scored: number, fallback: number, none: number,
 *   filteredTooShort: number, filteredDup: number, filteredSameUser: number,
 *   domWriteTotal: number, lastWhy: string, lastBucketAt: number }}
 */
export function makeTickerPickDiag() {
  return {
    gift: 0, scored: 0, fallback: 0, none: 0,
    filteredTooShort: 0, filteredDup: 0, filteredSameUser: 0,
    domWriteTotal: 0, lastWhy: '', lastBucketAt: 0
  };
}

/**
 * 選定結果を計器へ1件記録する(計器の失敗は描画を止めない)。
 * @param {ReturnType<typeof makeTickerPickDiag>} diag
 * @param {{ why?: string, bucketAt?: number, stats?: Record<string, number> }|null|undefined} picked
 */
export function recordTickerPick(diag, picked) {
  if (!diag || typeof diag !== 'object') return;
  try {
    const why = String(picked?.why || '');
    if (why && Object.prototype.hasOwnProperty.call(diag, why)) {
      diag[/** @type {'gift'} */ (why)] += 1;
    }
    diag.lastWhy = why;
    diag.lastBucketAt = Number(picked?.bucketAt) || 0;
    const st = picked?.stats || {};
    diag.filteredTooShort += Number(st.filteredTooShort) || 0;
    diag.filteredDup += Number(st.filteredDup) || 0;
    diag.filteredSameUser += Number(st.filteredSameUser) || 0;
  } catch { /* 計器の失敗は本体を止めない */ }
}

/**
 * ティッカー1行の「表示本文」と「ツールチップ」を組み立てる純関数(v0.1.1226抽出)。
 *
 * popup-entry.js に直書きされていた整形ロジックをそのまま移した(pure refactor)。
 * 本文が空の行でも「（本文なし）」で潰れないようにするのが目的。
 *
 * @param {{ text?: unknown, commentNo?: unknown }|null|undefined} entry
 * @param {string} label 表示名(空なら名前部分を出さない)
 * @param {(t: string, n: number) => string} truncate 既存の truncateText を注入する
 * @param {number} [maxChars]
 * @returns {{ textShown: string, tip: string }}
 */
export function buildTickerTextAndTip(entry, label, truncate, maxChars = 72) {
  const rawText = String(entry?.text ?? '').trim();
  const noStr = String(entry?.commentNo ?? '').trim();
  const noPrefix = /^\d+$/.test(noStr) ? `No.${noStr} ` : '';
  const textFallback = rawText || (noStr ? `（本文なし・${noPrefix.trim()}）` : '（本文なし）');
  const shown = typeof truncate === 'function'
    ? truncate(rawText || textFallback, maxChars)
    : String(rawText || textFallback).slice(0, maxChars);
  const body = rawText || '（コメント本文なし）';
  return {
    textShown: shown,
    tip: label ? `${noPrefix}${label}：${body}` : `${noPrefix}${body}`
  };
}

/**
 * ティッカー描画後の仕上げ(v0.1.1226抽出): ツールチップ付与と referrerPolicy。
 *
 * innerHTML 代入の【直後】にだけ呼ぶ。DOM 走査は自分の segA 配下2要素のみで、
 * paint のたびの全走査は行わない(過去に拡張全体を重くした地雷を踏まないため)。
 *
 * @param {HTMLElement|null|undefined} segA
 * @param {{ tip?: string, avatarSrc?: string, isHttpUrl?: (u: string) => boolean }} opts
 */
export function decorateTickerLine(segA, opts = {}) {
  if (!segA || typeof segA.querySelector !== 'function') return;
  try {
    const line = /** @type {HTMLElement|null} */ (segA.querySelector('.nl-ticker-latest'));
    if (line && opts.tip) line.title = String(opts.tip);
    const avatar = /** @type {HTMLImageElement|null} */ (
      segA.querySelector('.nl-ticker-latest__avatar')
    );
    const src = String(opts.avatarSrc || '');
    const ok = typeof opts.isHttpUrl === 'function' ? opts.isHttpUrl(src) : /^https?:\/\//i.test(src);
    if (avatar && ok) avatar.referrerPolicy = 'no-referrer';
  } catch { /* 仕上げの失敗は描画本体を壊さない */ }
}

/**
 * 鏡row(②passive/③純Web)から `buildCommentTickerLatestHtml` の引数を組み立てる純関数
 * (v0.1.1226抽出)。②③で同じ整形を二重に書かないための共通化。
 *
 * @param {{ name?: unknown, avatarUrl?: unknown, text?: unknown }|null|undefined} row
 * @param {string} [userPageHref] 純Webは '' 固定(referrer 露出を避ける)
 * @param {number} [maxChars]
 * @returns {{ label: string, avatarSrc: string, textShown: string, userPageHref: string }}
 */
export function tickerArgsFromMirrorRow(row, userPageHref = '', maxChars = 72) {
  return {
    label: String(row?.name ?? ''),
    avatarSrc: String(row?.avatarUrl ?? ''),
    textShown: String(row?.text ?? '').slice(0, maxChars),
    userPageHref: String(userPageHref || '')
  };
}
