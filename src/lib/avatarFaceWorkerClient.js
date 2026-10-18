/**
 * 【層】L2 配線層(Worker を持つ・DOM/chrome.* には触れない。Worker の作り方は deps で注入)
 * 【この箱に入るもの】顔の合成を専用 Worker に頼む窓口(要求の対応づけ・タイムアウト・故障の判定・アイドル終了)
 * 【この箱に入らないもの】顔の描画手順(avatarFaceRender.js)・キャッシュ・どの顔をいつ作るかの判断
 * 【書けるstorageキー】なし
 * 【正本宣言】Worker の生死と要求の管理はこのファイルのみ
 *
 * avatarFaceWorkerClient.js — v0.1.1681
 *
 * ■ 守ること
 *   - 失敗は全部 reject で返す=呼び手(avatarPartsComposer.js)が従来のメインスレッド合成に戻る。見た目も機能も失わない。
 *   - 故障(起動 throw・onerror・連続失敗 2 回)したら、その文書の寿命内では作り直さない(再起動ループを作らない)。
 *     1 件の失敗(素材の取得失敗など)では殺さない。
 *   - 3 秒返らなければ reject(実測 1 枚 約4ms)。遅れて返った応答は捨てる(二重 resolve しない)。
 *   - 30 秒使われなければ terminate(dead ではなく off)。次の要求で作り直す。
 *   - 状態は snapshot() で状態速報に出す(動いているつもりを検証不能にしない)。
 *
 * @module avatarFaceWorkerClient
 */

export const AVATAR_FACE_WORKER_TIMEOUT_MS = 3000;
export const AVATAR_FACE_WORKER_IDLE_MS = 30000;
export const AVATAR_FACE_WORKER_MAX_CONSECUTIVE_FAILURES = 2;

/**
 * @typedef {{ baseUrl: string, files: { hair: string, eyes: string, mouth: string, cheek: string|null }, hairHue: number }} FaceParts
 * @typedef {{
 *   makeWorker: () => any,
 *   timeoutMs?: number,
 *   idleMs?: number,
 *   maxConsecutiveFailures?: number,
 *   setTimeoutRef?: (fn: () => void, ms: number) => any,
 *   clearTimeoutRef?: (h: any) => void
 * }} WorkerClientDeps
 */

/** @param {WorkerClientDeps} deps */
export function createAvatarFaceWorkerClient(deps) {
  const timeoutMs = deps.timeoutMs ?? AVATAR_FACE_WORKER_TIMEOUT_MS;
  const idleMs = deps.idleMs ?? AVATAR_FACE_WORKER_IDLE_MS;
  const maxFail = deps.maxConsecutiveFailures ?? AVATAR_FACE_WORKER_MAX_CONSECUTIVE_FAILURES;
  const later = deps.setTimeoutRef || ((fn, ms) => setTimeout(fn, ms));
  const cancel = deps.clearTimeoutRef || ((h) => clearTimeout(h));

  /** @type {'off'|'ready'|'dead'} */
  let state = 'off';
  /** @type {any} */
  let worker = null;
  let nextId = 1;
  /** @type {Map<number, { resolve: (v: string) => void, reject: (e: Error) => void, timer: any }>} */
  const pending = new Map();
  /** @type {any} */
  let idleTimer = null;
  let consecutiveFailures = 0;
  const stats = { rendered: 0, failed: 0, timedOut: 0, started: 0 };
  let lastError = '';

  const clearIdle = () => {
    if (idleTimer != null) {
      cancel(idleTimer);
      idleTimer = null;
    }
  };

  /** 全部の待ちを reject して Worker を捨てる。dead=true なら以後作り直さない。 */
  const shutdown = (/** @type {boolean} */ dead, /** @type {string} */ reason) => {
    clearIdle();
    for (const [, p] of pending) {
      cancel(p.timer);
      p.reject(new Error(reason));
    }
    pending.clear();
    if (worker) {
      try { worker.terminate(); } catch { /* no-op */ }
      worker = null;
    }
    state = dead ? 'dead' : 'off';
    if (dead) lastError = reason;
  };

  const armIdle = () => {
    clearIdle();
    if (pending.size > 0) return;
    idleTimer = later(() => {
      idleTimer = null;
      if (pending.size === 0 && state === 'ready') shutdown(false, 'idle');
    }, idleMs);
  };

  const noteFailure = (/** @type {string} */ reason) => {
    stats.failed += 1;
    consecutiveFailures += 1;
    lastError = reason;
    if (consecutiveFailures >= maxFail) shutdown(true, `連続${maxFail}回失敗: ${reason}`);
  };

  const onMessage = (/** @type {any} */ ev) => {
    const d = ev && ev.data;
    if (!d || typeof d.id !== 'number') return;
    const p = pending.get(d.id);
    if (!p) return; // タイムアウト後に遅れて来た応答は捨てる
    pending.delete(d.id);
    cancel(p.timer);
    if (d.ok === true && typeof d.dataUrl === 'string' && d.dataUrl.startsWith('data:image/png;base64,')) {
      consecutiveFailures = 0;
      stats.rendered += 1;
      p.resolve(d.dataUrl);
    } else {
      const err = String((d && d.error) || 'bad response');
      // OffscreenCanvas が無い環境は、何度やっても無理=すぐ dead
      if (err === 'no-offscreencanvas') shutdown(true, err);
      else noteFailure(err);
      p.reject(new Error(err));
    }
    armIdle();
  };

  const ensureWorker = () => {
    if (state === 'dead') throw new Error('worker dead');
    if (worker) return worker;
    try {
      const w = deps.makeWorker();
      if (!w) throw new Error('worker unavailable');
      w.onmessage = onMessage;
      w.onerror = (/** @type {any} */ e) => shutdown(true, `onerror: ${String((e && e.message) || 'error')}`);
      w.onmessageerror = () => shutdown(true, 'onmessageerror');
      worker = w;
      state = 'ready';
      stats.started += 1;
      return w;
    } catch (e) {
      shutdown(true, `起動失敗: ${String((e && /** @type {any} */ (e).message) || e)}`);
      throw e;
    }
  };

  return {
    /**
     * @param {FaceParts} parts
     * @returns {Promise<string>} PNG の data URL。Worker 不可・故障・タイムアウト・失敗は reject。
     */
    render(parts) {
      return new Promise((resolve, reject) => {
        let w;
        try {
          w = ensureWorker();
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
          return;
        }
        clearIdle();
        const id = nextId++;
        const timer = later(() => {
          if (!pending.has(id)) return;
          pending.delete(id);
          stats.timedOut += 1;
          noteFailure('timeout');
          reject(new Error('timeout'));
          armIdle();
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        try {
          w.postMessage({ id, baseUrl: parts.baseUrl, files: parts.files, hairHue: parts.hairHue });
        } catch (e) {
          pending.delete(id);
          cancel(timer);
          noteFailure(`postMessage: ${String((e && /** @type {any} */ (e).message) || e)}`);
          reject(e instanceof Error ? e : new Error(String(e)));
          armIdle();
        }
      });
    },
    snapshot() {
      return { state, inFlight: pending.size, ...stats, lastError };
    },
    dispose() {
      shutdown(false, 'dispose');
    }
  };
}
