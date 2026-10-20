// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSupportersGiftsRows, sectionSupportersGiftsHtml, SUPPORTERS_GIFTS_CSS } from './supportersGiftsSection.js';

const c = (userId, text, at, nickname = '') => ({ userId, text, capturedAt: at, nickname });

function mount(maskShare = false) {
  const rows = buildSupportersGiftsRows({
    comments: [c('111', 'こんばんは', 1000, 'たろう'), c('111', 'ありがとう', 2000, 'たろう'), c('222', 'おつかれ', 3000, 'はなこ')],
    giftRows: [],
    broadcasterUserId: '999'
  });
  const html = sectionSupportersGiftsHtml(rows, { maskShare, openTop: 10 });
  document.body.innerHTML = html.replace(/<script>[\s\S]*?<\/script>/, '');
  const script = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1];
  if (script) new Function(script)();
  return { html, hasScript: !!script };
}

describe('応援者とギフトの検索窓', () => {
  beforeEach(() => vi.useFakeTimers());

  it('コメント本文で絞り込み、一致した人の一致した行だけ残す。空に戻すと元に戻る', () => {
    mount();
    const input = /** @type {HTMLInputElement} */ (document.getElementById('mktSgSearch'));
    const items = Array.from(document.querySelectorAll('details.mkt-sg'));
    expect(items).toHaveLength(2);
    input.value = 'ありがとう';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(200);
    const visible = items.filter((d) => !d.hidden);
    expect(visible).toHaveLength(1);
    const rows = Array.from(visible[0].querySelectorAll('tbody tr'));
    expect(rows.filter((r) => !r.hidden)).toHaveLength(1);
    expect(document.getElementById('mktSgSearchResult').textContent).toContain('1名が一致');
    input.value = '';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(200);
    expect(items.every((d) => !d.hidden)).toBe(true);
    expect(Array.from(document.querySelectorAll('tbody tr')).every((r) => !r.hidden)).toBe(true);
  });

  it('名前・ID でも絞り込める', () => {
    mount();
    const input = /** @type {HTMLInputElement} */ (document.getElementById('mktSgSearch'));
    input.value = '222';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(200);
    expect(Array.from(document.querySelectorAll('details.mkt-sg')).filter((d) => !d.hidden)).toHaveLength(1);
  });

  it('一致しなければ 0名と出す', () => {
    mount();
    const input = /** @type {HTMLInputElement} */ (document.getElementById('mktSgSearch'));
    input.value = 'zzzz存在しない';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(200);
    expect(document.getElementById('mktSgSearchResult').textContent).toContain('0名が一致');
  });

  it('共有モード(伏せ字)では検索窓も script も出さない(本文を出していないため)', () => {
    const { html, hasScript } = mount(true);
    expect(html).not.toContain('mktSgSearch');
    expect(hasScript).toBe(false);
  });
});

describe('色(暗い背景でも読める)', () => {
  it('カードは明るい文字色を自分で指定し、白背景+薄い文字にならない', () => {
    expect(SUPPORTERS_GIFTS_CSS).toMatch(/\.mkt-sg\{[^}]*background:#0f172a[^}]*color:#e2e8f0/);
    expect(SUPPORTERS_GIFTS_CSS).not.toContain('var(--mkt-card');
  });
});
