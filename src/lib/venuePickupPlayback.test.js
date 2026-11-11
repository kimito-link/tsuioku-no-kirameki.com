import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { KEY_VOICE_NOW_PLAYING } from './voiceKeys.js';
import { acceptVoiceNowPlaying, buildVoiceNowPlaying, spokenPickupPicked } from './venuePickupPlayback.js';
import { createVenuePickupVoiceLink } from '../extension/venuePickupVoice.js';

describe('PICK UP は声が鳴り始めたコメントだけに切り替わる', () => {
  it('本文が空の件は出さない', () => {
    expect(spokenPickupPicked({ text: '  ', name: 'A' })).toBeNull();
    expect(spokenPickupPicked({ text: 'こんにちは', name: 'りん' })?.entry.text).toBe('こんにちは');
  });

  it('遅い合成のあいだは枠を変えず、再生開始でそのコメントに変える。次の再生まで残す', () => {
    /** @type {string[]} */
    const shown = [];
    const set = vi.fn().mockResolvedValue(undefined);
    const link = createVenuePickupVoiceLink({
      getLiveId: () => 'lv1',
      apply: (picked) => { shown.push(picked.entry.text); },
      storage: { local: { set }, onChanged: { addListener() {} } },
      now: () => 5000
    });
    link.noteWanted(true);
    expect(link.follows()).toBe(true);
    // 届いただけでは枠を触らない(呼び出し側が follows() のとき選び直しをしない)。
    expect(shown).toEqual([]);
    expect(set).not.toHaveBeenCalled();
    link.onSpoken({ text: 'いちばん', name: 'A', userId: '1', key: 'a' });
    expect(shown).toEqual(['いちばん']);
    link.onSpoken({ text: '   ', name: '捨てた' });
    expect(shown).toEqual(['いちばん']);
    link.onSpoken({ text: 'にばん', name: 'B', userId: '2', key: 'b' });
    expect(shown).toEqual(['いちばん', 'にばん']);
    expect(set).toHaveBeenCalledTimes(2);
    expect(set.mock.calls[0][0][KEY_VOICE_NOW_PLAYING].text).toBe('いちばん');
  });

  it('読み上げ OFF のあとは、声が鳴っても枠を声では切り替えない', () => {
    /** @type {string[]} */
    const shown = [];
    const link = createVenuePickupVoiceLink({
      getLiveId: () => 'lv1',
      apply: (picked) => { shown.push(picked.entry.text); },
      storage: null
    });
    link.noteWanted(false);
    link.onSpoken({ text: 'オフ', name: 'A', userId: '1' });
    expect(shown).toEqual([]);
    expect(link.follows()).toBe(false);
  });

  it('同じ配信をコメビュが読んでいるときは、その再生開始で枠が変わる。別配信は無視する', () => {
    /** @type {string[]} */
    const shown = [];
    /** @type {(changes: any, area: string) => void} */
    let listener = () => {};
    const link = createVenuePickupVoiceLink({
      getLiveId: () => 'lv9',
      apply: (picked) => { shown.push(picked.entry.text); },
      storage: { local: { set: vi.fn() }, onChanged: { addListener: (fn) => { listener = fn; } } },
      now: () => 8000
    });
    link.noteWanted(true);
    listener({
      [KEY_VOICE_NOW_PLAYING]: { newValue: { text: 'コメビュの声', name: 'C', userId: '3', key: 'c', liveId: 'lv9', at: 8000 } }
    }, 'local');
    expect(shown).toEqual(['コメビュの声']);
    listener({
      [KEY_VOICE_NOW_PLAYING]: { newValue: { text: '別の配信', name: 'D', userId: '4', liveId: 'lv1', at: 8000 } }
    }, 'local');
    expect(shown).toEqual(['コメビュの声']);
  });

  it('読み上げ OFF のあいだは、もう片方の再生開始でも枠を変えない', () => {
    /** @type {string[]} */
    const shown = [];
    /** @type {(changes: any, area: string) => void} */
    let listener = () => {};
    const link = createVenuePickupVoiceLink({
      getLiveId: () => 'lv9',
      apply: (picked) => { shown.push(picked.entry.text); },
      storage: { onChanged: { addListener: (fn) => { listener = fn; } } },
      now: () => 8000
    });
    listener({
      [KEY_VOICE_NOW_PLAYING]: { newValue: buildVoiceNowPlaying({ text: '聞こえる', name: 'E', userId: '5' }, 'lv9', 8000) }
    }, 'local');
    expect(shown).toEqual([]);
  });

  it('会場とコメビュは、再生開始の合図を枠へつなぐ', () => {
    const venue = readFileSync(new URL('../extension/venueBar.js', import.meta.url), 'utf8');
    const comeview = readFileSync(new URL('../extension/comeview-entry.js', import.meta.url), 'utf8');
    expect(venue).toContain('if (pickupVoice.follows()) return;');
    expect(venue).toContain('onAudible: () => pickupVoice.onSpoken(speech)');
    expect(venue).toContain('if (!enabled) updatePickupBanner(null);');
    expect(venue).toContain('updatePickupBanner(null);');
    expect(comeview).toContain("addEventListener('playing'");
    expect(comeview).toContain('publishVoiceNowPlaying');
  });

  it('配信 id が無い知らせは受け取らない', () => {
    expect(buildVoiceNowPlaying({ text: 'kick' }, '', 1)).toBeNull();
    expect(acceptVoiceNowPlaying({ text: 'kick', liveId: '', at: 1 }, 'lv1', 1)).toBeNull();
    expect(acceptVoiceNowPlaying({ text: '古い', liveId: 'lv1', at: 1 }, 'lv1', 40000)).toBeNull();
  });
});
