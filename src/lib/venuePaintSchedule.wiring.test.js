import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(fileURLToPath(import.meta.url));
const venueBar = readFileSync(join(root, '../extension/venueBar.js'), 'utf8');
const mxSend = readFileSync(join(root, '../../extension-youtube/src/mx-content-entry.js'), 'utf8');

describe('会場の軽い描画とミクチャの発言の配線', () => {
  it('会場モード本体は共有の間引き・席の上限・使っていない席を触らない処理を使う', () => {
    expect(venueBar).toContain("from '../lib/venuePaintSchedule.js'");
    expect(venueBar).toContain('createVenuePaintSchedule');
    expect(venueBar).toContain('unusedSeatNeedsCleanup');
    expect(venueBar).toContain('shouldAnimateVenueCrowd');
    expect(venueBar).toContain('shouldSyncVenueSeatCommit');
    expect(venueBar).toContain('growVenueSeatNodes');
    expect(venueBar).toContain('createVenueCrowdMotion');
    expect(venueBar).toContain('isVenuePageHidden');
    expect(venueBar).toContain('resolveVenueSpeechPaintSkip');
    expect(venueBar).not.toMatch(/for \(let i = 0; i < VENUE_FULLSCREEN_MAX_SEATS; i \+= 1\)/);
  });

  it('ミクチャのコメント送信は公式欄の探し方と、会場を一時的にしまう処理を使う', () => {
    expect(mxSend).toContain("from '../../src/lib/mixch/mxCommentInput.js'");
    expect(mxSend).toContain('findMxCommentInput');
    expect(mxSend).toContain('revealMxOfficialComposer');
    expect(mxSend).toContain('findMxSendButton');
  });
});
