/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest';
import { normalizeDownloadBasename, triggerAnchorBlobDownload } from './blobDownload.js';

describe('blobDownload', () => {
  it('normalizeDownloadBasename はパスと禁止文字を除去', () => {
    expect(normalizeDownloadBasename('2026-06-02_lv350663807.html')).toBe(
      '2026-06-02_lv350663807.html'
    );
    expect(normalizeDownloadBasename('foo/bar\\bad:name.html')).toBe('bad_name.html');
  });

  it('triggerAnchorBlobDownload は download 属性を付ける', () => {
    const click = vi.fn();
    const anchor = {
      href: '',
      download: '',
      rel: '',
      style: { display: '' },
      click,
      remove: vi.fn()
    };
    const appendChild = vi.fn();
    const createElement = vi.fn(() => anchor);
    const doc = /** @type {Document} */ ({
      body: { appendChild },
      createElement
    });
    const blob = new Blob(['<html></html>'], { type: 'text/html' });
    const res = triggerAnchorBlobDownload(blob, '2026-06-02_lv350663807.html', doc);
    expect(res.ok).toBe(true);
    expect(res.safeName).toBe('2026-06-02_lv350663807.html');
    expect(anchor.download).toBe('2026-06-02_lv350663807.html');
    expect(click).toHaveBeenCalled();
  });
});
