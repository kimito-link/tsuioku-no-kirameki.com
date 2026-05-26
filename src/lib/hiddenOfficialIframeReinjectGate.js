/**
 * hidden audition iframe を「再 inject してよいか」を判定する純関数（v0.1.394）。
 *
 * 背景（会議 D-PR3・2026-05-26）: イベント順位は audition richview iframe の relay でしか
 * 取れず、従来は「liveId ごとに1回 inject→60秒で破棄」で ~60 秒分しか更新されなかった
 * （「開き直さないと変わらない」）。イベント参加中に限り、クールダウンを置いて再 inject を
 * 許し、イベント順位を定期更新する。常に1本・60秒破棄＝v0.1.323 の「3本常駐で重い」再発を
 * 避けるため、判定を純関数に切り出して unit で固定する（負荷の安全性をテストで担保）。
 *
 * 副作用なし・DOM 非依存。
 */

/**
 * @param {{
 *   optInEnabled: boolean,        // ギフトランキング取得 opt-in（OFF default）。false なら常に不可。
 *   liveId: string,               // 対象 lv（空なら不可）。
 *   alreadyInjectedLiveId: string,// 直近に inject 済みの lv（once-per-liveId 状態）。
 *   isEventParticipating: boolean,// イベント参加中か（false なら再 inject しない＝従来挙動）。
 *   iframeStillPresent: boolean,  // 前回 iframe がまだ DOM に残っているか（true なら同時2本防止で不可）。
 *   lastInjectAtMs: number,       // 直近 inject 時刻（epoch ms）。
 *   nowMs: number,                // 現在時刻（epoch ms）。
 *   cooldownMs: number,           // 再 inject の最小間隔（ms）。
 * }} p
 * @returns {{ inject: boolean, reason: string }}
 *   inject=true なら inject 実行。reason は判定理由（診断/テスト用）。
 */
export function decideHiddenOfficialIframeInject(p) {
  if (!p || typeof p !== 'object') return { inject: false, reason: 'bad-args' };
  if (p.optInEnabled !== true) return { inject: false, reason: 'opt-out' };
  const lid = String(p.liveId || '').trim();
  if (!lid) return { inject: false, reason: 'no-live-id' };

  // 初回（この lv でまだ inject していない）＝従来どおり 1 回 inject。
  if (p.alreadyInjectedLiveId !== lid) {
    return { inject: true, reason: 'first-inject' };
  }

  // 以降は「同じ lv で既に inject 済み」。再 inject はイベント参加中のみ。
  if (p.isEventParticipating !== true) {
    return { inject: false, reason: 'already-injected-non-event' };
  }
  // 前回 iframe がまだ残っていれば同時 2 本になるので不可。
  if (p.iframeStillPresent === true) {
    return { inject: false, reason: 'iframe-still-present' };
  }
  // クールダウン未経過なら不可（負荷 bound）。
  const last = Number(p.lastInjectAtMs);
  const now = Number(p.nowMs);
  const cd = Number(p.cooldownMs);
  if (!Number.isFinite(now) || !Number.isFinite(cd)) {
    return { inject: false, reason: 'bad-time' };
  }
  const sinceLast = now - (Number.isFinite(last) ? last : 0);
  if (sinceLast < cd) {
    return { inject: false, reason: 'cooldown' };
  }
  return { inject: true, reason: 're-inject-event' };
}
