import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { buildGiftTimelineHtml } from './giftTimelineHtml.js';

const BASE = 1_000_000_000_000;

function g(offsetMs, userId, throwCount, extra = {}) {
  return {
    userId,
    nickname: `user${userId}`,
    capturedAt: BASE + offsetMs,
    throwCount,
    ...extra
  };
}

function parseSvg(html) {
  const window = new Window();
  window.document.body.innerHTML = html;
  return window.document.querySelector('svg');
}

describe('buildGiftTimelineHtml', () => {
  it('emits SVG with cumulative polyline', () => {
    const html = buildGiftTimelineHtml({
      liveId: 'lv1',
      durationMs: 60_000,
      gifts: [g(10_000, 'u1', 1), g(30_000, 'u2', 2), g(50_000, 'u3', 1)]
    });

    expect(html).toContain('<svg');
    expect(html).toContain('<polyline');
    const svg = parseSvg(html);
    const polyline = svg?.querySelector('polyline.mkt-gift-timeline__cumulative');
    expect(polyline?.getAttribute('points')?.trim().split(/\s+/).length).toBe(3);
  });

  it('handles empty gifts gracefully', () => {
    const html = buildGiftTimelineHtml({
      liveId: 'lv1',
      durationMs: 60_000,
      gifts: []
    });

    expect(html).toContain('<svg');
    expect(html).toContain('ギフト記録なし');
    expect(html).toContain('まだギフトの時系列記録がありません');
  });

  it('includes aria-label, role and viewBox', () => {
    const html = buildGiftTimelineHtml({
      liveId: 'lv999',
      durationMs: 120_000,
      gifts: [g(15_000, 'u1', 3)]
    });
    const svg = parseSvg(html);

    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toContain('lv999');
    expect(svg?.getAttribute('viewBox')).toMatch(/^0 0 (8\d\d|9[0-5]\d|960) (2[5-9]\d|3\d\d)$/);
  });

  it('uses the required dark mode color palette', () => {
    const html = buildGiftTimelineHtml({
      liveId: 'lv1',
      durationMs: 60_000,
      gifts: [g(10_000, 'u1', 1), g(20_000, 'u2', 4)]
    });

    expect(html).toContain('#0f172a');
    expect(html).toContain('#22c55e');
    expect(html).toContain('#fbbf24');
    expect(html).toContain('#a855f7');
    expect(html).toContain('#38bdf8');
    expect(html).toContain('#334155');
  });

  it('shows <title> tooltip on data points', () => {
    const html = buildGiftTimelineHtml({
      liveId: 'lv1',
      durationMs: 60_000,
      gifts: [g(20_000, 'u42', 5, { nickname: 'ギフター' })]
    });
    const svg = parseSvg(html);
    const title = svg?.querySelector('circle.mkt-gift-timeline__point title');

    expect(title?.textContent).toContain('ギフター');
    expect(title?.textContent).toContain('u42');
    expect(title?.textContent).toContain('5');
  });

  it('accepts recorded point/item gift events and highlights the busiest window', () => {
    const html = buildGiftTimelineHtml({
      liveId: 'lv-point',
      durationMs: 180_000,
      gifts: [
        g(10_000, 'u1', 1, {
          senderName: '送り主A',
          nickname: '',
          itemName: 'かわいい×100',
          points: 100
        }),
        g(70_000, 'u2', 1, {
          senderName: '送り主B',
          nickname: '',
          itemName: 'メガホン',
          point: 300
        }),
        g(80_000, 'u3', 1, {
          senderName: '送り主C',
          nickname: '',
          itemName: '拍手',
          points: 200
        })
      ]
    });
    const svg = parseSvg(html);
    const peak = svg?.querySelector('rect.mkt-gift-timeline__peak-window');
    const titles = [...svg.querySelectorAll('circle.mkt-gift-timeline__point title')].map(
      (node) => node.textContent || ''
    );

    expect(peak?.textContent).toContain('盛り上がり');
    expect(peak?.textContent).toContain('500pt');
    expect(titles.join('\n')).toContain('かわいい×100');
    expect(titles.join('\n')).toContain('送り主B');
    expect(titles.join('\n')).toContain('300pt');
    expect(svg?.getAttribute('aria-label')).toContain('600 pt');
  });

  it('escapes user supplied labels in SVG text and titles', () => {
    const html = buildGiftTimelineHtml({
      liveId: '<script>alert(1)</script>',
      durationMs: 60_000,
      gifts: [
        g(20_000, 'u1', 1, {
          nickname: '<img src=x onerror=alert(1)>'
        })
      ]
    });

    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
