import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(fileURLToPath(import.meta.url));
const venueBar = readFileSync(join(root, '../extension/venueBar.js'), 'utf8');
const mxSend = readFileSync(join(root, '../../extension-youtube/src/mx-content-entry.js'), 'utf8');
const srSend = readFileSync(join(root, '../../extension-youtube/src/sr-content-entry.js'), 'utf8');
const compose = readFileSync(join(root, './venueComposeBox.js'), 'utf8');
const shim = readFileSync(join(root, '../../extension-youtube/src/ytNicoShim.js'), 'utf8');
const venueInline = readFileSync(join(root, '../../extension-youtube/src/venue-inline-entry.js'), 'utf8');

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
    expect(venueBar).toContain('createVenueHiddenSpeechBuffer');
    expect(venueBar).toContain('hiddenSpeechBuf.push(');
    expect(venueBar).toContain('hiddenSpeechBuf.drain()');
    expect(venueBar).toContain('hiddenSpeechBuf.clear()');
    expect(venueBar).not.toMatch(/for \(let i = 0; i < VENUE_FULLSCREEN_MAX_SEATS; i \+= 1\)/);
  });

  it('ミクチャのコメント送信は公式欄の探し方と、会場を一時的にしまう処理を使う', () => {
    expect(mxSend).toContain("from '../../src/lib/mixch/mxCommentInput.js'");
    expect(mxSend).toContain('findMxCommentInput');
    expect(mxSend).toContain('withRevealedVenueOfficialComposer');
    expect(mxSend).toContain('findMxSendButton');
  });
});

  it('会場からの送信は、どのサービスでも公式の欄を出すために会場を一時的にしまう', () => {
    expect(compose).toContain("from './venueRevealOfficialComposer.js'");
    expect(compose).toContain('withRevealedVenueOfficialComposer');
    expect(srSend).toContain('withRevealedVenueOfficialComposer');
    expect(srSend).toContain('findSrCommentInput');
    expect(mxSend).toContain("from '../../src/lib/venueRevealOfficialComposer.js'");
  });

  it('ミクチャなどの新着は、仮の配信キーで開いた会場でも読み上げへ渡す', () => {
    expect(shim).toContain("from '../../src/lib/youtube/ytLiveRowsAccept.js'");
    expect(shim).toContain('shouldAcceptYtLiveRows');
    expect(shim).toContain('preferLiveStreamKey');
    expect(venueInline).toContain('nlsb-watch-key-ready');
  });
