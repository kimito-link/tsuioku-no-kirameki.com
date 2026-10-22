import { describe, expect, it, vi } from 'vitest';
import { startPhonePostRelay } from './phonePostRelay.js';

const creds = {
  mode: 'device',
  viewToken: 'tok12345',
  appOrigin: 'https://app.example',
  headers: { 'Content-Type': 'application/json', 'x-device-id': 'd'.repeat(22), 'x-write-key': 'w'.repeat(43) }
};
const json = (body, ok = true) => ({ ok, json: async () => body });

function setup({ optedIn = true, key = 'k'.repeat(43), pull, post }) {
  const calls = [];
  const fetchImpl = vi.fn(async (url, init) => {
    calls.push({ url, init });
    if (String(url).endsWith('?action=pull')) return pull();
    return json({ ok: true });
  });
  const relay = startPhonePostRelay({
    getCreds: () => creds,
    isOptedIn: () => optedIn,
    readPostKey: async () => key,
    post: post || (async () => ({ ok: true, error: '' })),
    fetchImpl,
    setTimer: () => {}
  });
  return { relay, calls, fetchImpl };
}

describe('phonePostRelay: PC がスマホのコメントを受け取って投稿する(v0.1.1734)', () => {
  it('★取り出した1件を放送タブへ投稿し、成功を返す。スマホが入力中なら次は2秒後', async () => {
    const post = vi.fn(async () => ({ ok: true, error: '' }));
    const { relay, calls } = setup({
      pull: () => json({ ok: true, active: true, items: [{ id: 'phone0001', text: 'わこつ', lv: 'lv123', at: Date.now() }] }),
      post
    });
    expect(await relay.tickNow()).toBe(2_000);
    expect(post).toHaveBeenCalledWith('わこつ', 'lv123');
    const ack = calls.find((c) => String(c.url).endsWith('?action=ack'));
    expect(JSON.parse(ack.init.body)).toEqual({ id: 'phone0001', state: 'sent' });
    expect(ack.init.headers['x-device-id']).toBe(creds.headers['x-device-id']);
  });

  it('★投稿に失敗したら理由コードだけ返す(画面の文言は送らない)', async () => {
    const { relay, calls } = setup({
      pull: () => json({ ok: true, active: false, items: [{ id: 'phone0001', text: 'a', lv: 'lv1', at: Date.now() }] }),
      post: async () => ({ ok: false, error: 'watchタブが見つかりません。' })
    });
    await relay.tickNow();
    const ack = calls.find((c) => String(c.url).endsWith('?action=ack'));
    expect(JSON.parse(ack.init.body)).toEqual({ id: 'phone0001', state: 'failed', reason: 'no_tab' });
  });

  it('★同意 OFF・スマホからコメントする OFF(鍵なし)では通信しない', async () => {
    const a = setup({ optedIn: false, pull: () => json({ items: [] }) });
    expect(await a.relay.tickNow()).toBe(10_000);
    expect(a.fetchImpl).not.toHaveBeenCalled();
    const b = setup({ key: '', pull: () => json({ items: [] }) });
    await b.relay.tickNow();
    expect(b.fetchImpl).not.toHaveBeenCalled();
  });

  it('ふだん(入力中でない・何も無い)は10秒・サーバーが断ったら60秒あける', async () => {
    expect(await setup({ pull: () => json({ ok: true, active: false, items: [] }) }).relay.tickNow()).toBe(10_000);
    expect(await setup({ pull: () => json({}, false) }).relay.tickNow()).toBe(60_000);
  });

  it('形の壊れた1件は投稿しない(残りは投稿する)', async () => {
    const post = vi.fn(async () => ({ ok: true, error: '' }));
    const { relay } = setup({
      pull: () => json({ ok: true, items: [{ id: 'x', text: '', lv: 'bad' }, { id: 'phone0002', text: 'ok', lv: 'lv2', at: Date.now() }] }),
      post
    });
    await relay.tickNow();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('ok', 'lv2');
  });
});
