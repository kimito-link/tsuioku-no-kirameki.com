import { describe, expect, it } from 'vitest';
import {
  addSongToSetlist,
  advanceSetlist,
  buildObsSetlistText,
  emptySongSetlist,
  extractSongRequest,
  ingestSongRequests,
  moveSetlistSong,
  normalizeRequestWords,
  removeSetlistSong,
  settleSongRequest
} from './songSetlist.js';

describe('extractSongRequest', () => {
  it('言葉が先頭で、区切りのあとが曲名', () => {
    expect(extractSongRequest('リク 夜空', ['リク'])).toEqual({ word: 'リク', title: '夜空' });
    expect(extractSongRequest('リク：夜空', ['リク'])?.title).toBe('夜空');
  });

  it('言葉の途中や、文の途中には反応しない', () => {
    expect(extractSongRequest('リクエストです', ['リク'])).toBeNull();
    expect(extractSongRequest('今日のリク 夜空', ['リク'])).toBeNull();
    expect(extractSongRequest('ただのコメント', ['リク'])).toBeNull();
  });

  it('言葉が空なら何もリクエストにしない', () => {
    expect(extractSongRequest('リク 夜空', [])).toBeNull();
    expect(normalizeRequestWords('\n\n  \n')).toEqual([]);
  });
});

describe('ingestSongRequests', () => {
  it('同じコメント番号は二度拾わない', () => {
    const words = addSongToSetlist(emptySongSetlist(), 'ダミー');
    const withWords = { ...words, requestWords: ['リク'] };
    const once = ingestSongRequests(withWords, [
      { no: '1', text: 'リク 一番', name: 'リスナー', userId: '10', at: 1 }
    ]);
    const twice = ingestSongRequests(once.state, [
      { no: '1', text: 'リク 一番', name: 'リスナー', userId: '10', at: 1 }
    ]);
    expect(once.added).toBe(1);
    expect(twice.added).toBe(0);
    expect(twice.state.requests.filter((r) => r.status === 'open')).toHaveLength(1);
  });
});

describe('セットリストの操作', () => {
  it('採用すると曲順の末尾に足し、却下は足さない', () => {
    let state = { ...emptySongSetlist(), requestWords: ['リク'] };
    state = ingestSongRequests(state, [{ no: '8', text: 'リク 二番', userId: '3', name: 'リスナー', at: 2 }]).state;
    const id = state.requests[0].id;
    state = settleSongRequest(state, id, 'accepted');
    expect(state.songs.map((s) => s.title)).toEqual(['二番']);
    expect(state.order).toHaveLength(1);
    state = ingestSongRequests(state, [{ no: '9', text: 'リク 三番', userId: '4', at: 3 }]).state;
    const rejectId = state.requests.find((r) => r.title === '三番')?.id || '';
    state = settleSongRequest(state, rejectId, 'rejected');
    expect(state.songs.map((s) => s.title)).toEqual(['二番']);
  });

  it('次へで表示が移り、OBSの文字は曲名だけ', () => {
    let state = addSongToSetlist(emptySongSetlist(), '朝の曲');
    state = addSongToSetlist(state, '昼の曲');
    const before = buildObsSetlistText(state);
    expect(before).toContain('いま\n朝の曲');
    expect(before).toContain('つぎ\n昼の曲');
    state = advanceSetlist(state);
    expect(buildObsSetlistText(state)).toContain('いま\n昼の曲');
    expect(buildObsSetlistText(state)).not.toMatch(/https?:/);
  });

  it('入れ替えと削除は元の配列を壊さない', () => {
    const state = addSongToSetlist(addSongToSetlist(emptySongSetlist(), 'A'), 'B');
    const moved = moveSetlistSong(state, state.order[1], -1);
    expect(moved.order[0]).not.toBe(state.order[0]);
    expect(state.order).toHaveLength(2);
    const removed = removeSetlistSong(moved, moved.order[0]);
    expect(removed.order).toHaveLength(1);
  });
});
