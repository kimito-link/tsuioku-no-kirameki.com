import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(root, 'extension-youtube/src/venue-inline-entry.js'), 'utf8');

describe('会場は視聴キーの一瞬の欠落では閉じない', () => {
  it('視聴ページ判定は共通の判定を使い、すぐ close-btn を押さない', () => {
    expect(src).toContain("from '../../src/lib/venueWatchPageVisibility.js'");
    expect(src).toContain('venueRootVisibilityAction');
    expect(src).toContain('act.closeVenue');
  });
});
