import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computePseudoLvForVideoId } from './ytPseudoLv.js';
import { recordingKeyForPanelStream, streamKeyMatchesPanel } from './ytPanelExportTarget.js';

const YT = '3p_1GrkzQ6k';
const TW = 'tw.sasatikk.1711';
const SR = 'sr.551215.904';

/** タブは閉じている。記録だけが3本残っている。SHOWROOM がいちばん新しい。 */
const summaries = {
  [TW]: { updatedAt: 1_700_000_001_000 },
  [YT]: { updatedAt: 1_700_000_002_000 },
  [SR]: { updatedAt: 1_700_000_003_000 },
  'tw.sasatikk.00000': { updatedAt: 1_700_000_009_000 },
};

describe('タブを閉じたあと、選んだ配信の記録だけを書き出す', () => {
  it('Twitch の欄は Twitch の記録。新しい SHOWROOM にはしない', () => {
    const key = recordingKeyForPanelStream('twitch:sasatikk', summaries);
    expect(key).toBe(TW);
    expect(computePseudoLvForVideoId(key)).not.toBe(computePseudoLvForVideoId(SR));
    expect(key).not.toBe(YT);
  });

  it('YouTube の欄は、その動画の記録', () => {
    const key = recordingKeyForPanelStream(`yt:${YT}`, summaries);
    expect(key).toBe(YT);
    expect(computePseudoLvForVideoId(key)).not.toBe(computePseudoLvForVideoId(SR));
  });

  it('その配信の記録が無いときは空。別のサービスでは埋めない', () => {
    expect(recordingKeyForPanelStream('twitch:nobody', summaries)).toBe('');
    expect(recordingKeyForPanelStream('yt:aaaaaaaaaaa', summaries)).toBe('');
    expect(recordingKeyForPanelStream('showroom:551215', { 'tw.sasatikk.1': { updatedAt: 9 }, 'sr.551215.00000': { updatedAt: 9 } })).toBe('');
  });

  it('開いている別のサービスのタブは、この欄の配信ではない', () => {
    expect(streamKeyMatchesPanel('twitch:sasatikk', TW)).toBe(true);
    expect(streamKeyMatchesPanel('twitch:sasatikk', SR)).toBe(false);
    expect(streamKeyMatchesPanel(`yt:${YT}`, YT)).toBe(true);
    expect(streamKeyMatchesPanel(`yt:${YT}`, SR)).toBe(false);
  });

  it('横の欄は、焼いた配信の記録だけを最後に見た配信として返す', () => {
    const shim = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
    expect(shim).toContain('recordingKeyForPanelStream(PANEL_STREAM_KEY');
    expect(shim).toContain('streamKeyMatchesPanel(PANEL_STREAM_KEY');
  });
});
