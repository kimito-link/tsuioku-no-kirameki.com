import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve('src/extension/venueBar.js'), 'utf8');

describe('会場を閉じても読み上げ ON は実際に読む配線', () => {
  it('onLiveComments は実行テスト可能な共通handlerへ、音声処理と開閉状態を渡す', () => {
    const start = source.indexOf('const onLiveComments =');
    const end = source.indexOf('const pollSpeech =', start);
    const body = source.slice(start, end);
    expect(body).toContain('createVenueLiveCommentHandler({');
    expect(body).toContain('processSpeechRows,');
    expect(body).toContain('isOpen: () => open');
  });

  it('閉じた経路はVoicePlayerへ渡し、席や吹き出し処理の前にreturnする', () => {
    const start = source.indexOf('const processSpeechRows =');
    const end = source.indexOf('const scheduleRosterCommit =', start);
    const body = source.slice(start, end);
    const headless = body.indexOf('if (!open) {');
    const enqueue = body.indexOf('voicePlayer.enqueue', headless);
    const heat = body.indexOf('applyVenueHeat(rows)', headless);
    expect(headless).toBeGreaterThanOrEqual(0);
    expect(enqueue).toBeGreaterThan(headless);
    expect(heat).toBeGreaterThan(enqueue);
    expect(body.slice(headless, heat)).toContain('return;');
  });

  it('読み手leaseは会場の開閉でなく読み上げONに連動する', () => {
    expect(source).toContain('startVoiceReaderLease(() => voicePlayer.enabled');
  });

  it('配信者contextは会場集計を開く前から読み、閉会場の音声itemへ渡す', () => {
    expect(source).toContain('chrome.storage.local.get(KEY_LIVE_BROADCASTER_CTX)');
    expect(source).toContain('adoptVoiceBroadcasterCtx(changes[KEY_LIVE_BROADCASTER_CTX].newValue)');
    expect(source).toContain('buildVenueHeadlessVoiceItem(speech, {');
    expect(source).toContain('broadcasterUid: _lastBroadcasterUid');
  });
});
