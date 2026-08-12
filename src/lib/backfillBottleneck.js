/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】過去ログ取り込み(backfill)の【律速】を1つに名指しする判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】backfill の律速判定はこのファイルのみ。文字列リテラルでの再判定を他所で書かない
 *
 * backfillBottleneck.js — 「取り込みが遅い」ではなく【何が律速か】を名指しする純関数。
 *
 * ■ なぜ要るか(2026-08-12 ユーザー実機)
 *   過去コメント3000件が以前は一気に取れたのに 0.5件/秒・33%で停滞。
 *   律速の候補は3つ(裏タブ / 譲りすぎ / 空区画の橋渡し)で、その数字は
 *   すべて状態速報に出ていた。しかし【どれが律速かは人間が毎回暗算していた】。
 *   ★ユーザー確定の判定基準: 「計器をみれば解決しないなら測定値がひくい」。
 *     数字の羅列は "読んで直せる" を満たさない=名指しが要る。
 *
 * ■ 律速ポインタ方式
 *   判定表を上から評価し【1つだけ】採用する。複数を並べると人間が優先順位を
 *   考える羽目になり、結局暗算に戻るため。
 *
 * ■ 「詰まると計器が黙る」を反転させる(最重要)
 *   旧実装は詰まると ts 更新が止まり、status 側の鮮度ゲート(15秒)で行ごと消えていた
 *   =一番知りたい瞬間に計器が自分を消していた。v0.1.1356 で心拍(5秒)を入れたので、
 *   ここでは「走行中(running=1)なのに ts が古い」を **bad として名指しする**。
 *   ★沈黙そのものが停滞の指紋。na(灰)に落とさない。
 *
 * @module backfillBottleneck
 */

/** 走行中なのに計器が沈黙していると見なす上限[ms]。心拍(5秒)3回分。 */
export const METER_SILENT_MS = 15_000;

/** yield 待ちが占める割合: これ以上は「メインスレッド枯渇」= bad。 */
export const YIELD_STARVED_RATIO = 0.6;

/** 同: 予兆として warn を出す割合。 */
export const YIELD_WARN_RATIO = 0.3;

/** 橋渡し(空区画)が実区画に対してこの倍率を超えたら「seek過多」= warn。 */
export const BRIDGE_WASTE_RATIO = 0.5;

/**
 * 橋渡し比を評価するのに必要な最小の実区画数。
 * ★開始直後は実区画が数個しかなく比率が暴れる(1件でも橋渡しがあれば比率が跳ねる)。
 *   ここを下回る間は橋渡し律速と断定しない=偽陽性を出さない。
 */
export const BRIDGE_MIN_DATA_SEGS = 10;

/** @param {unknown} x @returns {number} */
function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @typedef {'stale-meter'|'bg-tab'|'yield-starved'|'yield-warn'|'bridge-waste'|'healthy'|'idle'|'no-data'} BackfillBottleneckReason
 * @typedef {{ level: 'ok'|'warn'|'bad'|'na', text: string, reason: BackfillBottleneckReason }} BackfillBottleneckVerdict
 */

/**
 * 取り込みの律速を1つ名指しする。
 *
 * ★text の掟(設計 A-1): 症状語だけを書かない。原因トークン＋次の一手を必ず含む。
 * ★na の text は「— 対象なし:」で始める(設計 B の三義。灰の意味を文言で確定させる)。
 *
 * @param {{ running?: unknown, ts?: unknown, fg?: unknown, dataSegs?: unknown,
 *   bridgingSteps?: unknown, yields?: unknown, yieldWaitMsTotal?: unknown,
 *   elapsedMs?: unknown }|null|undefined} metric KEY_BACKFILL_LIVE_METRIC の値そのまま
 * @param {number} nowMs 現在時刻(Date.now()。★書き手の ts も Date.now 生成なので同じ時計)
 * @returns {BackfillBottleneckVerdict}
 */
export function judgeBackfillBottleneck(metric, nowMs) {
  const m = metric && typeof metric === 'object' ? metric : null;
  if (!m) {
    return { level: 'na', text: '— 対象なし: 取り込みの記録がありません', reason: 'no-data' };
  }

  const running = num(m.running) === 1;
  const ts = num(m.ts);
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const ageMs = ts > 0 && now > 0 ? Math.max(0, now - ts) : null;

  // 順1 ★走行中なのに計器が沈黙=停滞の指紋。灰にせず bad で名指しする。
  if (running && ageMs != null && ageMs > METER_SILENT_MS) {
    return {
      level: 'bad',
      text: `⚠ 計器故障: 走行中なのに計器が${Math.round(ageMs / 1000)}秒沈黙(取り込み自体の停滞を疑う)`,
      reason: 'stale-meter'
    };
  }

  // 順7 走っていない=対象外。★異常ではないので色を付けない。
  if (!running) {
    const agoText = ageMs != null ? `(最終${Math.round(ageMs / 60000)}分前)` : '';
    return { level: 'na', text: `— 対象なし: 取り込み停止中${agoText}`, reason: 'idle' };
  }

  const dataSegs = num(m.dataSegs);
  const bridgingSteps = num(m.bridgingSteps);
  const elapsedMs = num(m.elapsedMs);
  const yieldWaitMsTotal = num(m.yieldWaitMsTotal);

  // 順2 裏タブ扱い。★これが最頻の律速で、対処も一番簡単(タブを前面に出すだけ)。
  if (num(m.fg) === 0) {
    return {
      level: 'warn',
      text: '律速=裏タブ(速度約1/6) → watchタブを前面に',
      reason: 'bg-tab'
    };
  }

  // 順3/4 譲りすぎ(メインスレッドを他処理に奪われている)。
  const yieldRatio = elapsedMs > 0 ? yieldWaitMsTotal / elapsedMs : 0;
  if (yieldRatio >= YIELD_STARVED_RATIO) {
    return {
      level: 'bad',
      text: `律速=yield待ち${Math.round(yieldRatio * 100)}%(メインスレッド枯渇) → 同じタブの重い処理を疑う`,
      reason: 'yield-starved'
    };
  }
  if (yieldRatio >= YIELD_WARN_RATIO) {
    return {
      level: 'warn',
      text: `yield待ち${Math.round(yieldRatio * 100)}%(予兆・まだ律速ではない)`,
      reason: 'yield-warn'
    };
  }

  // 順5 空区画の橋渡しばかり掘っている(seek過多)。
  //   ★実区画が少ないうちは比率が暴れるので断定しない。
  if (dataSegs >= BRIDGE_MIN_DATA_SEGS && bridgingSteps / dataSegs > BRIDGE_WASTE_RATIO) {
    return {
      level: 'warn',
      text: `律速=空区画の橋渡し(橋${bridgingSteps}/実区画${dataSegs}) → seek過多`,
      reason: 'bridge-waste'
    };
  }

  // 順6 正常に走っている。★数値は「1区画あたり」に正規化して出す(件数だけでは速さが分からない)。
  const perSegMs = dataSegs > 0 ? Math.round(elapsedMs / dataSegs) : null;
  const speedText = perSegMs != null ? `約1区画${perSegMs}ms` : '取り込み中';
  return {
    level: 'ok',
    text: `${speedText}(実区画${dataSegs}・fg=1)`,
    reason: 'healthy'
  };
}
