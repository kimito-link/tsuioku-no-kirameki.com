import { describe, it, expect, vi } from 'vitest';
import {
  evaluatePageWatchTask,
  shouldReconnectSilentSocket,
  createPageWatchScheduler,
} from './pageWatchScheduler.js';

function createFakeClock() {
  let now = 0;
  let nextId = 1;
  /** @type {Map<number, { fn: () => void, ms: number, nextAt: number, repeat: boolean }>} */
  const timers = new Map();

  return {
    now: () => now,
    setIntervalFn: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, ms, nextAt: now + ms, repeat: true });
      return id;
    },
    clearIntervalFn: (id) => {
      timers.delete(Number(id));
    },
    setTimeoutFn: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, ms, nextAt: now + ms, repeat: false });
      return id;
    },
    clearTimeoutFn: (id) => {
      timers.delete(Number(id));
    },
    advance(ms) {
      const target = now + ms;
      while (true) {
        let earliestId = null;
        let earliestAt = Infinity;
        for (const [id, t] of timers.entries()) {
          if (t.nextAt <= target && t.nextAt < earliestAt) {
            earliestAt = t.nextAt;
            earliestId = id;
          }
        }
        if (earliestId == null) break;
        const entry = timers.get(earliestId);
        if (!entry) break;
        now = entry.nextAt;
        if (entry.repeat) {
          entry.nextAt = now + entry.ms;
        } else {
          timers.delete(earliestId);
        }
        entry.fn();
      }
      now = target;
    },
    activeTimerCount: () => timers.size,
  };
}

describe('evaluatePageWatchTask', () => {
  it('裏タブ既定（pause）では実行しない', () => {
    expect(
      evaluatePageWatchTask({
        now: 10_000,
        lastRunAt: 0,
        intervalMs: 1000,
        hidden: true,
      })
    ).toEqual({ run: false, skipReason: 'hidden' });
  });

  it('裏タブ throttle では hiddenIntervalMs を満たすまで待つ', () => {
    expect(
      evaluatePageWatchTask({
        now: 5000,
        lastRunAt: 0,
        intervalMs: 1000,
        hidden: true,
        hiddenMode: 'throttle',
        hiddenIntervalMs: 10_000,
      })
    ).toEqual({ run: false, skipReason: 'interval' });

    expect(
      evaluatePageWatchTask({
        now: 10_000,
        lastRunAt: 0,
        intervalMs: 1000,
        hidden: true,
        hiddenMode: 'throttle',
        hiddenIntervalMs: 10_000,
      })
    ).toEqual({ run: true, skipReason: '' });
  });

  it('しまった状態（paused）で pausedMode=pause なら止める', () => {
    expect(
      evaluatePageWatchTask({
        now: 10_000,
        lastRunAt: 0,
        intervalMs: 1000,
        paused: true,
        pausedMode: 'pause',
      })
    ).toEqual({ run: false, skipReason: 'paused' });
  });

  it('URL 変化時に runOnUrlChange=true なら間隔内でも即実行する', () => {
    expect(
      evaluatePageWatchTask({
        now: 100,
        lastRunAt: 0,
        intervalMs: 10_000,
        urlChanged: true,
        runOnUrlChange: true,
      })
    ).toEqual({ run: true, skipReason: '' });
  });
});

describe('createPageWatchScheduler', () => {
  it('複数タスクを 1 本のベースタイマーで駆動し、それぞれの間隔を守る', () => {
    const clock = createFakeClock();
    const fast = vi.fn();
    const slow = vi.fn();
    const sched = createPageWatchScheduler({
      baseTickMs: 1000,
      now: clock.now,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });
    sched.register({ id: 'fast', intervalMs: 1000, run: fast });
    sched.register({ id: 'slow', intervalMs: 3000, run: slow });
    sched.start();

    expect(clock.activeTimerCount()).toBe(1);

    clock.advance(1000);
    expect(fast).toHaveBeenCalledTimes(1);
    expect(slow).toHaveBeenCalledTimes(1);

    clock.advance(2000); // t=3000
    expect(fast).toHaveBeenCalledTimes(3);
    expect(slow).toHaveBeenCalledTimes(1);

    clock.advance(1000); // t=4000 (lastRunAt=1000 から 3000ms 経過)
    expect(fast).toHaveBeenCalledTimes(4);
    expect(slow).toHaveBeenCalledTimes(2);

    sched.stop();
    expect(clock.activeTimerCount()).toBe(0);
  });

  it('裏タブでは pause タスクを止め、表タブ復帰後の kick() で再開し、連続 kick() は 1 回に束ねる', () => {
    const clock = createFakeClock();
    let hidden = true;
    const uiTask = vi.fn();
    const keepaliveTask = vi.fn();
    const sched = createPageWatchScheduler({
      baseTickMs: 1000,
      now: clock.now,
      isHidden: () => hidden,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });
    sched.register({ id: 'ui', intervalMs: 1000, hiddenMode: 'pause', run: uiTask });
    sched.register({
      id: 'keepalive',
      intervalMs: 1000,
      hiddenMode: 'throttle',
      hiddenIntervalMs: 5000,
      run: keepaliveTask,
    });
    sched.start();

    clock.advance(10_000);
    expect(uiTask).toHaveBeenCalledTimes(0);
    // t=1000(初回) と t=6000(5000ms後) の 2 回のみ
    expect(keepaliveTask).toHaveBeenCalledTimes(2);

    hidden = false;
    expect(sched.kick()).toBe('scheduled');
    expect(sched.kick()).toBe('coalesced');
    expect(sched.kick()).toBe('coalesced');
    clock.advance(0);

    expect(uiTask).toHaveBeenCalledTimes(1);
    expect(uiTask.mock.calls[0][0].reason).toBe('kick');
    sched.stop();
  });

  it('URL 変化を検知して onUrlChange と runOnUrlChange タスクを即座に発火する', () => {
    const clock = createFakeClock();
    let url = 'https://example.com/watch/a';
    const onUrlChange = vi.fn();
    const syncTask = vi.fn();
    const sched = createPageWatchScheduler({
      baseTickMs: 1000,
      now: clock.now,
      getUrl: () => url,
      onUrlChange,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });
    sched.register({
      id: 'sync',
      intervalMs: 10_000,
      runOnUrlChange: true,
      run: syncTask,
    });
    sched.start({ runImmediately: true });
    expect(syncTask).toHaveBeenCalledTimes(1);

    url = 'https://example.com/watch/b';
    clock.advance(1000);
    expect(onUrlChange).toHaveBeenCalledWith('https://example.com/watch/b', 'https://example.com/watch/a');
    expect(syncTask).toHaveBeenCalledTimes(2);
    expect(syncTask.mock.calls[1][0].reason).toBe('url');
    sched.stop();
  });

  it('1 タスクが例外を投げても他タスクを止めず、isAlive()=false で自動停止する', () => {
    const clock = createFakeClock();
    let alive = true;
    const onError = vi.fn();
    const okTask = vi.fn();
    const sched = createPageWatchScheduler({
      baseTickMs: 1000,
      now: clock.now,
      isAlive: () => alive,
      onError,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });
    sched.register({
      id: 'broken',
      intervalMs: 1000,
      run: () => {
        throw new Error('boom');
      },
    });
    sched.register({ id: 'ok', intervalMs: 1000, run: okTask });
    sched.start();

    clock.advance(1000);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(okTask).toHaveBeenCalledTimes(1);

    alive = false;
    clock.advance(1000);
    expect(sched.isRunning()).toBe(false);
    expect(clock.activeTimerCount()).toBe(0);
    expect(okTask).toHaveBeenCalledTimes(1);
  });

  it('pagehide 相当の stop() 後、pageshow(persisted) 相当の start()+kick() で監視が再開する', () => {
    const clock = createFakeClock();
    const task = vi.fn();
    const sched = createPageWatchScheduler({
      baseTickMs: 1000,
      now: clock.now,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });
    sched.register({ id: 'watch', intervalMs: 1000, run: task });
    sched.start();

    clock.advance(1000);
    expect(task).toHaveBeenCalledTimes(1);

    // pagehide で停止
    sched.stop();
    expect(sched.isRunning()).toBe(false);
    expect(clock.activeTimerCount()).toBe(0);
    clock.advance(5000);
    expect(task).toHaveBeenCalledTimes(1);

    // bfcache から pageshow(persisted=true) で再開
    sched.start();
    expect(sched.isRunning()).toBe(true);
    expect(sched.kick()).toBe('scheduled');
    clock.advance(0);
    expect(task).toHaveBeenCalledTimes(2);
    expect(task.mock.calls[1][0].reason).toBe('kick');

    // 以後も定期監視が 1 本のタイマーで継続する
    clock.advance(1000);
    expect(task).toHaveBeenCalledTimes(3);
    expect(clock.activeTimerCount()).toBe(1);
    sched.stop();
  });
});

describe('shouldReconnectSilentSocket', () => {
  it('接続中かつ無通信時間が silenceMs を超えたら true、通信ありや閉鎖中は false', () => {
    expect(shouldReconnectSilentSocket({ open: true, lastActivityAt: 1000, now: 332_000, silenceMs: 330_000 })).toBe(true);
    expect(shouldReconnectSilentSocket({ open: true, lastActivityAt: 1000, now: 331_000, silenceMs: 330_000 })).toBe(false);
    expect(shouldReconnectSilentSocket({ open: false, lastActivityAt: 1000, now: 999_999, silenceMs: 330_000 })).toBe(false);
    expect(shouldReconnectSilentSocket({ open: true, lastActivityAt: 0, now: 999_999, silenceMs: 330_000 })).toBe(false);
  });

  it('pageWatchScheduler と組み合わせて裏タブでは 60s に粗く見張り、表復帰の kick() で即無通信を検知する', () => {
    const clock = createFakeClock();
    let hidden = true;
    const closeSocket = vi.fn();
    const lastActivityAt = 0;
    const sched = createPageWatchScheduler({
      baseTickMs: 10_000,
      now: clock.now,
      isHidden: () => hidden,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });
    sched.register({
      id: 'silence-watch',
      intervalMs: 10_000,
      hiddenMode: 'throttle',
      hiddenIntervalMs: 60_000,
      run: ({ now }) => {
        if (shouldReconnectSilentSocket({ open: true, lastActivityAt: lastActivityAt || 1, now, silenceMs: 30_000 })) {
          closeSocket();
        }
      },
    });
    sched.start();

    // t=10s(初回実行: まだ 30s 未満) → t=40s(裏タブなので 60s 間隔の間引きでまだ未検査)
    clock.advance(40_000);
    expect(closeSocket).toHaveBeenCalledTimes(0);

    // 表に戻った瞬間の kick() で即検査され、40s > 30s を検知して再接続トリガ
    hidden = false;
    sched.kick();
    clock.advance(0);
    expect(closeSocket).toHaveBeenCalledTimes(1);
    sched.stop();
  });
});
