import { describe, it, expect, vi } from 'vitest';
import {
  isForbiddenDocumentElementSubtree,
  createMutationObserverHub,
} from './mutationObserverHub.js';

function createFakeClock() {
  let now = 1000;
  let nextId = 1;
  /** @type {Map<number, { fn: () => void, nextAt: number }>} */
  const timers = new Map();

  return {
    now: () => now,
    setNow: (t) => {
      now = t;
    },
    setTimeoutFn: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, nextAt: now + ms });
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
        timers.delete(earliestId);
        entry.fn();
      }
      now = target;
    },
    activeTimerCount: () => timers.size,
  };
}

function createFakeObserverFactory() {
  /** @type {{ cb: (recs: any[]) => void, observed: any[], disconnected: number }[]} */
  const instances = [];
  return {
    instances,
    createObserver: (cb) => {
      const inst = {
        cb,
        observed: /** @type {any[]} */ ([]),
        disconnected: 0,
        observe(target, init) {
          inst.observed.push({ target, init });
        },
        disconnect() {
          inst.disconnected += 1;
        },
      };
      instances.push(inst);
      return inst;
    },
  };
}

describe('isForbiddenDocumentElementSubtree', () => {
  it('HTML 要素への subtree: true は既定で禁止する', () => {
    const htmlRoot = { nodeType: 1, tagName: 'HTML' };
    expect(isForbiddenDocumentElementSubtree(htmlRoot, { childList: true, subtree: true })).toBe(true);
    expect(isForbiddenDocumentElementSubtree(htmlRoot, { childList: true, subtree: false })).toBe(false);
    expect(isForbiddenDocumentElementSubtree(htmlRoot, { childList: true, subtree: true }, true)).toBe(false);
  });

  it('コメントコンテナなど通常の要素は許可する', () => {
    const divRoot = { nodeType: 1, tagName: 'DIV' };
    expect(isForbiddenDocumentElementSubtree(divRoot, { childList: true, subtree: true })).toBe(false);
  });
});

describe('createMutationObserverHub', () => {
  it('ルート付け替えで旧 Observer を必ず disconnect し、同一ルート重複接続は無視する', () => {
    const clock = createFakeClock();
    const factory = createFakeObserverFactory();
    const onBatch = vi.fn();
    const hub = createMutationObserverHub({
      onBatch,
      createObserver: factory.createObserver,
      now: clock.now,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });

    const rootA = { nodeType: 1, tagName: 'DIV', id: 'chat-a' };
    const rootB = { nodeType: 1, tagName: 'DIV', id: 'chat-b' };

    expect(hub.attach(rootA)).toBe(true);
    expect(hub.attach(rootA)).toBe(false); // 同一ルートは重複接続しない
    expect(factory.instances).toHaveLength(1);

    expect(hub.attach(rootB)).toBe(true);
    expect(factory.instances).toHaveLength(2);
    expect(factory.instances[0].disconnected).toBe(1);
    expect(hub.getRoot()).toBe(rootB);

    hub.detach();
    expect(factory.instances[1].disconnected).toBe(1);
    expect(hub.isAttached()).toBe(false);
  });

  it('大量の MutationRecord を minIntervalMs と maxBatchSize で分割し、maxQueueSize 超過時は overflow を通知する', () => {
    const clock = createFakeClock();
    const factory = createFakeObserverFactory();
    /** @type {{ len: number, meta: any }[]} */
    const received = [];
    const hub = createMutationObserverHub({
      minIntervalMs: 50,
      maxBatchSize: 3,
      maxQueueSize: 5,
      onBatch: (recs, meta) => received.push({ len: recs.length, meta }),
      createObserver: factory.createObserver,
      now: clock.now,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });

    const root = { nodeType: 1, tagName: 'DIV' };
    hub.attach(root);

    // 7 件投入 → maxQueueSize=5 で先頭 2 件ドロップ
    factory.instances[0].cb([1, 2, 3, 4, 5, 6, 7]);
    expect(hub.pendingCount()).toBe(5);

    clock.advance(50);
    expect(received).toHaveLength(1);
    expect(received[0].len).toBe(3);
    expect(received[0].meta.overflow).toBe(true);
    expect(received[0].meta.droppedCount).toBe(2);
    expect(received[0].meta.remaining).toBe(2);

    clock.advance(50);
    expect(received).toHaveLength(2);
    expect(received[1].len).toBe(2);
    expect(received[1].meta.overflow).toBe(false);
    expect(received[1].meta.remaining).toBe(0);
  });

  it('スクロール中は domHarvestScrollDefer に従って見送り、窓が明けたら処理する', () => {
    const clock = createFakeClock();
    const factory = createFakeObserverFactory();
    const lastScrollAt = 1000;
    const onBatch = vi.fn();
    const hub = createMutationObserverHub({
      minIntervalMs: 50,
      scrollDeferMs: 220,
      getLastScrollAt: () => lastScrollAt,
      onBatch,
      createObserver: factory.createObserver,
      now: clock.now,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });

    hub.attach({ nodeType: 1, tagName: 'DIV' });
    factory.instances[0].cb([{ type: 'childList' }]);

    // t=1050 は lastScrollAt=1000 から 50ms < 220ms なので見送り
    clock.advance(50);
    expect(onBatch).toHaveBeenCalledTimes(0);
    expect(hub.stats().deferredScroll).toBe(1);

    // t=1220 以上で窓が明けて実行される
    clock.advance(200);
    expect(onBatch).toHaveBeenCalledTimes(1);
  });

  it('pauseWhenHidden=true のとき裏タブでは保留し、復帰後の kick() で再開する', () => {
    const clock = createFakeClock();
    const factory = createFakeObserverFactory();
    let hidden = true;
    const onBatch = vi.fn();
    const hub = createMutationObserverHub({
      minIntervalMs: 50,
      pauseWhenHidden: true,
      isHidden: () => hidden,
      onBatch,
      createObserver: factory.createObserver,
      now: clock.now,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });

    hub.attach({ nodeType: 1, tagName: 'DIV' });
    factory.instances[0].cb([{ id: 1 }]);
    clock.advance(100);
    expect(onBatch).toHaveBeenCalledTimes(0);
    expect(hub.pendingCount()).toBe(1);

    hidden = false;
    hub.kick();
    clock.advance(0);
    expect(onBatch).toHaveBeenCalledTimes(1);
  });

  it('isAlive()=false で自動 dispose して切断・キュー破棄する', () => {
    const clock = createFakeClock();
    const factory = createFakeObserverFactory();
    let alive = true;
    const onBatch = vi.fn();
    const hub = createMutationObserverHub({
      minIntervalMs: 50,
      isAlive: () => alive,
      onBatch,
      createObserver: factory.createObserver,
      now: clock.now,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });

    hub.attach({ nodeType: 1, tagName: 'DIV' });
    alive = false;
    factory.instances[0].cb([{ id: 1 }]);
    expect(factory.instances[0].disconnected).toBe(1);
    expect(hub.isAttached()).toBe(false);
    expect(hub.pendingCount()).toBe(0);
    expect(hub.attach({ nodeType: 1, tagName: 'DIV' })).toBe(false);
  });
});
