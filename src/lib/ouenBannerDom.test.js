import { describe, it, expect } from 'vitest';
import { applyOuenBanner } from './ouenBannerDom.js';

/** 最小のDOMスタブ（jsdom無しでも回る） */
function makeDoc() {
  const mk = (id) => ({
    id, textContent: '', attrs: { hidden: '' },
    setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute(k) { delete this.attrs[k]; },
  });
  const els = {
    ouenBanner: mk('ouenBanner'),
    ouenBannerTitle: mk('ouenBannerTitle'),
    ouenBannerNote: mk('ouenBannerNote'),
    ouenBannerWhen: mk('ouenBannerWhen'),
  };
  return { els, getElementById: (id) => els[id] ?? null };
}

const GOOD = { show: true, title: 'T', note: 'N', when: 'W', url: 'https://ok.example/x' };

describe('applyOuenBanner', () => {
  it('正常なら hidden を外して中身を入れる', async () => {
    const doc = makeDoc();
    const ok = await applyOuenBanner(doc, async () => GOOD);
    expect(ok).toBe(true);
    expect(doc.els.ouenBanner.attrs.hidden).toBeUndefined();
    expect(doc.els.ouenBanner.attrs.href).toBe('https://ok.example/x');
    expect(doc.els.ouenBannerTitle.textContent).toBe('T');
  });

  // ★ここが肝: 何が起きても本体を止めない・空枠を出さない
  it('JSONの取得が失敗しても throw せず、hidden のまま', async () => {
    const doc = makeDoc();
    const ok = await applyOuenBanner(doc, async () => { throw new Error('network'); });
    expect(ok).toBe(false);
    expect(doc.els.ouenBanner.attrs.hidden).toBe('');
  });

  it('show=false なら hidden のまま', async () => {
    const doc = makeDoc();
    const ok = await applyOuenBanner(doc, async () => ({ ...GOOD, show: false }));
    expect(ok).toBe(false);
    expect(doc.els.ouenBanner.attrs.hidden).toBe('');
  });

  it('要素が無いページでも throw しない', async () => {
    const ok = await applyOuenBanner({ getElementById: () => null }, async () => GOOD);
    expect(ok).toBe(false);
  });

  it('危険なURLは反映しない', async () => {
    const doc = makeDoc();
    const ok = await applyOuenBanner(doc, async () => ({ ...GOOD, url: 'javascript:alert(1)' }));
    expect(ok).toBe(false);
    expect(doc.els.ouenBanner.attrs.href).toBeUndefined();
  });
});
