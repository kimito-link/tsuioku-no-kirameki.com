import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

describe('言葉の演出の配線', () => {
  const lib = read('src/lib/wordEffect.js');
  const overlay = read('src/extension/wordEffectOverlay.js');
  const entry = read('src/extension/word-effect-entry.js');
  const venue = read('src/extension/venueBar.js');
  const html = read('extension/word-effect.html');
  const manifest = read('extension/manifest.json');
  const host = read('src/extension/wordEffectIngestHost.js');
  const content = read('src/extension/content-entry.js');
  const ytBg = read('extension-youtube/src/background-entry.js');

  it('会場が透明な層を載せ、物理演算と毎フレーム計算をしない', () => {
    expect(venue).toContain("from './wordEffectOverlay.js'");
    expect(venue).toContain('mountWordEffectOverlay(root');
    expect(overlay).not.toContain('requestAnimationFrame');
    expect(overlay).toContain('prefers-reduced-motion');
    expect(overlay).toContain('transform:');
    expect(overlay).not.toMatch(/animation[^;{]*\b(top|left|width|height|filter|box-shadow)\b/);
  });

  it('別窓は透過指定があり、保存キーは版付き', () => {
    expect(entry).toContain("getURL('word-effect.html?obs=1')");
    expect(entry).toContain("get('obs') === '1'");
    expect(html).toContain('body.is-obs #nl-word-effect-panel');
    expect(lib).toContain("export const KEY_WORD_EFFECT = 'nls_word_effect_v1'");
    expect(overlay).toContain('KEY_WORD_EFFECT');
    expect(manifest).toContain('word-effect.html');
  });

  it('コメントは取り込み口から渡し、テールキーには頼らない', () => {
    expect(host).toContain('buildWordEffectIngestMessage');
    expect(host).not.toContain('tailStorageKey');
    expect(content).toContain('publishWordEffectIngest(liveId || \'\', filtered, { source: sourceKey })');
    expect(overlay).toContain('WORD_EFFECT_INGEST_TYPE');
    expect(overlay).toContain('applyWordEffectIngest');
    const chatAt = ytBg.indexOf("message.type === 'YT_CHAT_ITEMS'");
    const backfillAt = ytBg.indexOf("message.type === 'YT_BACKFILL_ITEMS'");
    const publishAt = ytBg.indexOf('publishWordEffectIngest(', chatAt);
    expect(backfillAt).toBeGreaterThan(-1);
    expect(publishAt).toBeGreaterThan(chatAt);
    expect(ytBg.slice(backfillAt, chatAt)).not.toContain('publishWordEffectIngest');
    for (const rel of [
      'extension-youtube/src/content-chat-entry.js',
      'extension-youtube/src/tw-content-entry.js',
      'extension-youtube/src/kick-content-entry.js',
      'extension-youtube/src/ww-content-entry.js',
      'extension-youtube/src/sr-content-entry.js',
      'extension-youtube/src/mx-content-entry.js',
      'extension-youtube/src/tt-content-entry.js'
    ]) {
      expect(read(rel), rel).toContain("type: 'YT_CHAT_ITEMS'");
    }
  });
});
