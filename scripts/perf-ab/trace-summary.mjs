/**
 * Chrome のトレース(CDP Tracing)を取って、メインスレッドごとに「自分の時間(self time)」を名前別に集計する。
 *
 * 背景(2026-10-16): 黒い幕の重い回で、V8 の CPU プロファイルは (program)=JS に数えられないブラウザ内部の処理 を約4秒と
 *   出すだけで、中身(レイアウト/描画の確定/画像/保存データの受け取り…)が分からなかった。Performance.getMetrics でも
 *   「その他」が9割。Chrome 自身のトレース(Performance パネルと同じ元データ)で分解する=既製の方法。
 *
 * 使い方(boot-profile.mjs --trace 1 から呼ばれる): startTrace(port) → ... → await stopTraceAndSummarize(handle, {top})
 * 依存: Node 22 の標準 WebSocket。remote-debugging-port が必要(launchWithExtension({ debugPort }))。
 *
 * 読み方: 「self ms」は、その名前のイベントの【中の子を除いた】時間。上位が犯人候補。
 *   RunTask は入れ物(子を除くと残りの時間=名前の付かない仕事)なので、その self は「その他」。
 */

/** @param {number} port */
export async function startTrace(port) {
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  /** @type {Array<(m: any) => void>} */
  const listeners = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    else for (const l of listeners) l(m);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { id += 1; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel', 'blink.user_timing'] }
  });
  return { ws, send, listeners };
}

/**
 * @param {{ ws: WebSocket, send: Function, listeners: Array<Function> }} h
 * @param {{ top?: number }} [opts]
 */
export async function stopTraceAndSummarize(h, opts = {}) {
  const top = opts.top || 14;
  const done = new Promise((resolve) => h.listeners.push((m) => { if (m.method === 'Tracing.tracingComplete') resolve(m.params); }));
  await h.send('Tracing.end');
  const { stream } = await done;
  let text = '';
  for (;;) {
    const r = await h.send('IO.read', { handle: stream, size: 1 << 20 });
    text += r.data || '';
    if (r.eof) break;
  }
  try { h.ws.close(); } catch { /* no-op */ }
  const events = JSON.parse(text).traceEvents || [];
  return summarizeTraceEvents(events, top);
}

/**
 * トレースのイベント配列を、スレッドごとの self time 集計にする(純関数・テスト用に分離)。
 * @param {any[]} events
 * @param {number} [top]
 * @returns {Array<{ pid: number, tid: number, thread: string, busyMs: number, rows: Array<[string, number]> }>}
 */
export function summarizeTraceEvents(events, top = 14) {
  /** @type {Map<string, string>} */
  const threadNames = new Map();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') threadNames.set(`${e.pid}:${e.tid}`, e.args?.name || '');
  /** @type {Map<string, any[]>} */
  const byThread = new Map();
  for (const e of events) {
    if (e.ph !== 'X' || !(e.dur >= 0)) continue;
    const key = `${e.pid}:${e.tid}`;
    if (!byThread.has(key)) byThread.set(key, []);
    byThread.get(key).push(e);
  }
  const out = [];
  for (const [key, list] of byThread) {
    const thread = threadNames.get(key) || '';
    if (!/Main/i.test(thread)) continue; // メインスレッドだけ(CrRendererMain / CrBrowserMain)
    list.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
    /** @type {Map<string, number>} */
    const self = new Map();
    /** @type {Array<{ end: number, name: string, childUs: number, dur: number }>} */
    const stack = [];
    const popTo = (ts) => {
      while (stack.length && stack[stack.length - 1].end <= ts) {
        const top0 = /** @type {any} */ (stack.pop());
        self.set(top0.name, (self.get(top0.name) || 0) + Math.max(0, top0.dur - top0.childUs));
        if (stack.length) stack[stack.length - 1].childUs += top0.dur;
      }
    };
    for (const e of list) { popTo(e.ts); stack.push({ end: e.ts + e.dur, name: e.name, childUs: 0, dur: e.dur }); }
    popTo(Infinity);
    const [pid, tid] = key.split(':').map(Number);
    const busyUs = [...self.values()].reduce((a, b) => a + b, 0);
    const rows = [...self.entries()].map(([n, us]) => /** @type {[string, number]} */ ([n, Math.round(us / 1000)])).sort((a, b) => b[1] - a[1]).slice(0, top);
    out.push({ pid, tid, thread, busyMs: Math.round(busyUs / 1000), rows });
  }
  return out.sort((a, b) => b.busyMs - a.busyMs);
}
