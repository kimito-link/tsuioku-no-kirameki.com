import { describe, expect, it } from 'vitest';
import {
  youtubeVideoIdFromUrl,
  youtubeTabMatchesVideo,
  youtubeExportPageMatchesVideo,
} from './youtubeExportTabMatch.js';

const WANT = 'dQw4w9WgXcQ';
const OTHER = 'aaaaaaaaaaa';

describe('youtubeTabMatchesVideo（書き出しは同じ動画だけ）', () => {
  it('videoId が一致する watch / live / shorts だけ真', () => {
    expect(youtubeTabMatchesVideo(`https://www.youtube.com/watch?v=${WANT}`, WANT)).toBe(true);
    expect(youtubeTabMatchesVideo(`https://www.youtube.com/watch?v=${WANT}&list=RDxx`, WANT)).toBe(true);
    expect(youtubeTabMatchesVideo(`https://www.youtube.com/live/${WANT}`, WANT)).toBe(true);
    expect(youtubeTabMatchesVideo(`https://www.youtube.com/shorts/${WANT}`, WANT)).toBe(true);
    expect(youtubeVideoIdFromUrl(`https://www.youtube.com/watch?v=${WANT}`)).toBe(WANT);
  });

  it('別の動画タブは採用しない', () => {
    expect(youtubeTabMatchesVideo(`https://www.youtube.com/watch?v=${OTHER}`, WANT)).toBe(false);
    expect(youtubeTabMatchesVideo(`https://www.youtube.com/live/${OTHER}`, WANT)).toBe(false);
    expect(youtubeTabMatchesVideo('https://www.youtube.com/', WANT)).toBe(false);
    expect(youtubeTabMatchesVideo('https://www.twitch.tv/foo', WANT)).toBe(false);
  });

  it('videoId が分からないときは、唯一の視聴タブでも採用しない', () => {
    expect(youtubeTabMatchesVideo(`https://www.youtube.com/watch?v=${WANT}`, '')).toBe(false);
    expect(youtubeTabMatchesVideo(`https://www.youtube.com/watch?v=${WANT}`, null)).toBe(false);
    expect(youtubeTabMatchesVideo('https://www.youtube.com/watch?v=', '')).toBe(false);
  });

  it('スクレイプ直前の再確認: 途中で別動画へ移っていたら不一致', () => {
    expect(youtubeExportPageMatchesVideo(`https://www.youtube.com/watch?v=${WANT}`, WANT)).toBe(true);
    expect(youtubeExportPageMatchesVideo(`https://www.youtube.com/watch?v=${OTHER}`, WANT)).toBe(false);
    expect(youtubeExportPageMatchesVideo('https://www.youtube.com/', WANT)).toBe(false);
  });
});
