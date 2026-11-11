import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const popup = readFileSync(new URL('./popup-entry.js', import.meta.url), 'utf8');
const venue = readFileSync(new URL('./venueBar.js', import.meta.url), 'utf8');
const comeview = readFileSync(new URL('./comeview-entry.js', import.meta.url), 'utf8');

describe('読み上げボタンは会場とパネルで同じ ON/OFF', () => {
  it('パネルの「読み上げ」は保存キーを切り替え、コメビュ窓は開かない', () => {
    expect(popup).toContain('chrome.storage.local.set({ [KEY_VOICE_READING_ENABLED]: next }');
    expect(popup).not.toContain("openComeviewVoiceBtn')?.addEventListener('click', () => openComeviewWindow(true))");
  });
  it('会場とコメビュのボタンは、接続中でも disabled にしない', () => {
    expect(venue).toContain('voicePlayer.readingWanted');
    expect(venue).not.toContain('voiceBtn.disabled = toggleBusy');
    expect(comeview).toContain('if (_voiceReadingWanted)');
    expect(comeview).not.toContain('button.disabled = _voiceToggleBusy');
  });
});
