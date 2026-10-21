import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startStatusPublisherHost } from './statusPublisherHost.js';

/** 2026-10-15: サイドパネルの中へ、見えない状態画面(送信担当)を1つ置く処理。 */

const makeEnv = ({ cfg, optIn, deviceCred, lockHeld = false, hidden = false, existingMarker = false } = {}) => {
  const appended = [];
  const document = {
    visibilityState: hidden ? 'hidden' : 'visible',
    body: { appendChild: (el) => appended.push(el) },
    querySelector: (sel) => (existingMarker && sel.includes('data-nl-status-publisher') ? {} : null),
    createElement: () => {
      const attrs = {};
      return { attrs, style: { cssText: '' }, setAttribute: (k, v) => { attrs[k] = v; } };
    }
  };
  const store = { nls_status_upload_config_v1: cfg, nls_web_publish_opt_in: optIn, nls_status_device_cred_v1: deviceCred };
  const state = { held: lockHeld };
  return {
    appended, state,
    deps: {
      document,
      storage: { get: async () => store },
      locks: { query: async () => ({ held: state.held ? [{ name: 'nls-status-publisher' }] : [] }) },
      getUrl: (p) => `chrome-extension://abc/${p}`,
      setTimeout: (cb) => { cb(); return 1; }, // 待ちなしで即実行
      setInterval: () => 1,
      delayMs: 0
    }
  };
};
const KEYS = { ingestKey: 'k', viewToken: 't' };
const tick = () => new Promise((r) => setTimeout(r, 5));

describe('startStatusPublisherHost', () => {
  it('★キーと同意があれば、見えない iframe を body の末尾へ1つ置く(1px・透明・操作不能・読み上げ対象外)', async () => {
    const env = makeEnv({ cfg: KEYS, optIn: true });
    const h = startStatusPublisherHost(env.deps);
    await tick();
    expect(h.state.started).toBe(true);
    expect(env.appended).toHaveLength(1);
    const f = env.appended[0];
    expect(f.attrs.src).toBe('chrome-extension://abc/status.html?publisher=1');
    expect(f.attrs['aria-hidden']).toBe('true');
    expect(f.attrs.tabindex).toBe('-1');
    expect(f.style.cssText).toContain('width:1px');
    expect(f.style.cssText).toContain('opacity:0');
    expect(f.style.cssText).toContain('pointer-events:none');
  });
  it('★同意が無ければ何も置かない(キーがあっても)', async () => {
    const env = makeEnv({ cfg: KEYS, optIn: false });
    const h = startStatusPublisherHost(env.deps);
    await tick();
    expect(env.appended).toHaveLength(0);
    expect(h.state.lastReason).toBe('no_consent');
  });
  it('★キーが無ければ何も置かない(同意があっても)・片方だけでも置かない', async () => {
    for (const cfg of [undefined, {}, { ingestKey: 'k' }, { viewToken: 't' }, { ingestKey: ' ', viewToken: 't' }]) {
      const env = makeEnv({ cfg, optIn: true });
      startStatusPublisherHost(env.deps);
      await tick();
      expect(env.appended).toHaveLength(0);
    }
  });
  it('★v0.1.1731: 共有キーが無くても、利用者ごとの鍵があれば置く(壊れた鍵では置かない)', async () => {
    const cred = { deviceId: 'd'.repeat(22), writeKey: 'w'.repeat(43), viewToken: 'v'.repeat(32) };
    const env = makeEnv({ cfg: undefined, optIn: true, deviceCred: cred });
    startStatusPublisherHost(env.deps);
    await tick();
    expect(env.appended).toHaveLength(1);
    const broken = makeEnv({ cfg: undefined, optIn: true, deviceCred: { deviceId: 'x' } });
    startStatusPublisherHost(broken.deps);
    await tick();
    expect(broken.appended).toHaveLength(0);
    const noConsent = makeEnv({ cfg: undefined, optIn: false, deviceCred: cred });
    startStatusPublisherHost(noConsent.deps);
    await tick();
    expect(noConsent.appended).toHaveLength(0);
  });
  it('★別のパネルが担当している(ロック保持中)なら置かない', async () => {
    const env = makeEnv({ cfg: KEYS, optIn: true, lockHeld: true });
    const h = startStatusPublisherHost(env.deps);
    await tick();
    expect(env.appended).toHaveLength(0);
    expect(h.state.lastReason).toBe('another_publisher');
  });
  it('★この文書に印つきの iframe が既にあれば二重に置かない', async () => {
    const env = makeEnv({ cfg: KEYS, optIn: true, existingMarker: true });
    const h = startStatusPublisherHost(env.deps);
    await tick();
    expect(env.appended).toHaveLength(0);
    expect(h.state.lastReason).toBe('already_in_dom');
  });
  it('★パネルが隠れているときは置かない', async () => {
    const env = makeEnv({ cfg: KEYS, optIn: true, hidden: true });
    startStatusPublisherHost(env.deps);
    await tick();
    expect(env.appended).toHaveLength(0);
  });
  it('★2回確認しても1つしか置かない・起動後は保存データを読み直さない', async () => {
    const env = makeEnv({ cfg: KEYS, optIn: true });
    let gets = 0;
    const inner = env.deps.storage.get;
    env.deps.storage = { get: async (k) => { gets += 1; return inner(k); } };
    const h = startStatusPublisherHost(env.deps);
    await tick();
    const afterStart = gets;
    await h.tick(); await h.tick();
    expect(env.appended).toHaveLength(1);
    expect(gets).toBe(afterStart);
  });
  it('★あとからロックが空いたら引き継ぐ(再確認)', async () => {
    const env = makeEnv({ cfg: KEYS, optIn: true, lockHeld: true });
    const h = startStatusPublisherHost(env.deps);
    await tick();
    expect(env.appended).toHaveLength(0);
    env.state.held = false;
    await h.tick();
    expect(env.appended).toHaveLength(1);
  });
  it('★storage が壊れていても例外を投げない(何も置かない)', async () => {
    const env = makeEnv({ cfg: KEYS, optIn: true });
    env.deps.storage = { get: async () => { throw new Error('boom'); } };
    const h = startStatusPublisherHost(env.deps);
    await tick();
    expect(env.appended).toHaveLength(0);
    expect(h.state.lastReason).toBe('error');
  });
});

describe('配線', () => {
  const read = (p) => fs.readFileSync(path.resolve(p), 'utf8').split('\r\n').join('\n');
  const side = read('src/extension/sidepanel-entry.js');
  const status = read('src/extension/status-entry.js');
  it('★サイドパネルは startStatusPublisherHost を fire-and-forget の try/catch で呼ぶ', () => {
    const at = side.indexOf('startStatusPublisherHost({');
    expect(at).toBeGreaterThan(0);
    expect(side.slice(at - 12, at)).toContain('try {');
    expect(side.slice(at, at + 400)).toContain('locks: typeof navigator');
    expect(side.slice(at, at + 500)).toContain('} catch {');
  });
  it('★状態画面は、共有キーを読んだ後・鍵ファイルの取り込みの前に、送信担当モードのロックを取る(取れなければ止まる)', () => {
    const keys = status.indexOf('await refreshUploadConfigCache();\n  // v0.1.1629');
    const gate = status.indexOf('if (isStatusPublisherMode(location.search) && !(await acquireStatusPublisherLock(navigator.locks))) return;');
    const seed = status.indexOf('if (await seedShareKeysFromLocalFile()) await refreshUploadConfigCache();');
    expect(keys).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(keys);
    expect(seed).toBeGreaterThan(gate);
  });
});

describe('配線: 自動送信の連打止め(自分の送信開始時刻を覚える)', () => {
  const status = fs.readFileSync(path.resolve('src/extension/status-entry.js'), 'utf8').split('\r\n').join('\n');
  const at = status.indexOf('function maybeAutoPublishStatusSnapshot(');
  const body = status.slice(at, at + 1700);
  it('★判定には記録だけでなく自分の送信開始時刻を渡し、送ると決めたらその時刻を更新する', () => {
    expect(at).toBeGreaterThan(0);
    expect(body).toContain('lastSentAtMs: latestPublishTime(publishOutcomeRec && publishOutcomeRec.at, _autoPublishLastLaunchAtMs)');
    expect(body).toContain('everSent: outcome.everSent || _autoPublishLastLaunchAtMs > 0');
    const stamp = body.indexOf('_autoPublishLastLaunchAtMs = Date.now();');
    const launch = body.indexOf('void uploadStatusSnapshot()');
    expect(stamp).toBeGreaterThan(0);
    expect(launch).toBeGreaterThan(stamp);
  });
});
