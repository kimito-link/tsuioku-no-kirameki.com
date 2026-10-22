// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { PHONE_POST_CONSENT_TEXT, SMARTPHONE_CONSENT_TEXT, buildSmartphoneCard } from './statusSmartphoneCard.js';

const DEVICE = { mode: 'device', viewToken: 'v'.repeat(32), appOrigin: 'https://app.example', headers: {} };
const SHARED = { mode: 'shared', viewToken: 'tok12345', appOrigin: 'https://app.example', headers: {} };
const flush = () => new Promise((r) => setTimeout(r, 0));

const mk = (over = {}) => {
  let creds = over.creds ?? null;
  const deps = {
    optedIn: false,
    getCreds: () => creds,
    setOptIn: vi.fn(async () => {}),
    registerNow: vi.fn(async () => { creds = over.issue ?? null; }),
    rotate: vi.fn(async () => 'n'.repeat(32)),
    openUrl: vi.fn(),
    ...over.deps
  };
  return { deps, el: buildSmartphoneCard(deps), setCreds: (c) => { creds = c; } };
};

describe('📱 スマホで見る(v0.1.1732)', () => {
  it('★同意の説明に「何を・どれだけ残し・誰が見られ・OFFで消す」を書く(privacy.html 4-3 と揃える)', () => {
    for (const w of ['視聴者のID・表示名・コメント本文', '24時間', 'URLを知っている人', 'サーバーのデータも消します', '約20秒', '約2分']) {
      expect(SMARTPHONE_CONSENT_TEXT).toContain(w);
    }
  });
  it('★既定は OFF でURLを出さない', () => {
    const { el } = mk();
    expect(el.querySelector('input').checked).toBe(false);
    expect(el.textContent).not.toContain('/live-view?v=');
  });
  it('★ON にすると同意を保存し、鍵を受け取ってから自分の閲覧URLを出す', async () => {
    const { el, deps } = mk({ issue: DEVICE });
    const cb = el.querySelector('input');
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    await flush(); await flush();
    expect(deps.setOptIn).toHaveBeenCalledWith(true);
    expect(deps.registerNow).toHaveBeenCalled();
    expect(el.textContent).toContain(`https://app.example/live-view?v=${DEVICE.viewToken}`);
    expect(el.textContent).toContain('URLを作り直す');
  });
  it('鍵を受け取れなかったら、自動で再挑戦すると書く', async () => {
    const { el } = mk({ issue: null });
    const cb = el.querySelector('input');
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    await flush(); await flush();
    expect(el.textContent).toContain('もう一度試します');
  });
  it('★OFF にすると同意を外し、利用者の鍵ならサーバーのデータを消したと出す', async () => {
    const { el, deps } = mk({ creds: DEVICE, deps: { optedIn: true } });
    const cb = el.querySelector('input');
    cb.checked = false;
    cb.dispatchEvent(new Event('change'));
    await flush();
    expect(deps.setOptIn).toHaveBeenCalledWith(false);
    expect(el.textContent).toContain('サーバーのデータを消しました');
    expect(el.textContent).not.toContain('/live-view?v=');
  });
  it('共有キー(開発者)では URL の作り直しを出さず、OFF でも「消した」とは書かない', async () => {
    const { el } = mk({ creds: SHARED, deps: { optedIn: true } });
    expect(el.textContent).toContain('/live-view?v=tok12345');
    expect(el.textContent).not.toContain('URLを作り直す');
    const cb = el.querySelector('input');
    cb.checked = false;
    cb.dispatchEvent(new Event('change'));
    await flush();
    expect(el.textContent).toContain('送信を止めました');
    expect(el.textContent).not.toContain('消しました');
  });
  it('URLを作り直すと新しいURLに描き直す', async () => {
    const { el, deps, setCreds } = mk({ creds: DEVICE, deps: { optedIn: true } });
    deps.rotate.mockImplementation(async () => { setCreds({ ...DEVICE, viewToken: 'n'.repeat(32) }); return 'n'.repeat(32); });
    const btn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('作り直す'));
    btn.click();
    await flush();
    expect(el.textContent).toContain(`v=${'n'.repeat(32)}`);
  });
});

describe('✍️ スマホからコメントする(v0.1.1734)', () => {
  const PK = 'p'.repeat(43);
  const phone = (key = '') => {
    let cur = key;
    return {
      readKey: vi.fn(async () => cur),
      enable: vi.fn(async () => { cur = PK; return PK; }),
      disable: vi.fn(async () => { cur = ''; }),
      forget: vi.fn(async () => { cur = ''; })
    };
  };
  it('★説明に「誰のアカウントで流れるか・本文がどれだけ残るか」を書く', () => {
    for (const w of ['このPCのブラウザでログインしているアカウント', '最長1分', 'PCが受け取ったら消します']) {
      expect(PHONE_POST_CONSENT_TEXT).toContain(w);
    }
  });
  it('★既定は OFF。ON にすると自分専用のURL(#pk=)と QR を出す。見るだけのURLは別に残る', async () => {
    const pp = phone();
    const { el } = mk({ creds: DEVICE, deps: { optedIn: true, phonePost: pp } });
    await flush(); await flush();
    const boxes = el.querySelectorAll('input[type=checkbox]');
    expect(boxes.length).toBe(2);
    expect(boxes[1].checked).toBe(false);
    expect(el.textContent).not.toContain('#pk=');
    boxes[1].checked = true;
    boxes[1].dispatchEvent(new Event('change'));
    await flush(); await flush();
    expect(pp.enable).toHaveBeenCalled();
    expect(el.textContent).toContain('自分専用');
    expect(el.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\//);
    expect(el.textContent).toContain(`https://app.example/live-view?v=${DEVICE.viewToken}`);
  });
  it('★OFF にするとサーバーの鍵を消し、もう送れないと書く', async () => {
    const pp = phone(PK);
    const { el } = mk({ creds: DEVICE, deps: { optedIn: true, phonePost: pp } });
    await flush(); await flush();
    const cb = el.querySelectorAll('input[type=checkbox]')[1];
    expect(cb.checked).toBe(true);
    cb.checked = false;
    cb.dispatchEvent(new Event('change'));
    await flush(); await flush();
    expect(pp.disable).toHaveBeenCalled();
    expect(el.textContent).toContain('もう送れません');
  });
});
