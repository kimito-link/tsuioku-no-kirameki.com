import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { readYtRelatedChipSnapshot, ytVideoIdFromHref } from './ytRelatedChipSnapshot.js';

function doc(html) {
  const win = new Window({ url: 'https://www.youtube.com/watch?v=abcdefghijk' });
  win.document.write(html);
  return win.document;
}

describe('ytVideoIdFromHref', () => {
  it('watch と shorts の ID を取る', () => {
    expect(ytVideoIdFromHref('/watch?v=abcdefghijk&list=RDx')).toBe('abcdefghijk');
    expect(ytVideoIdFromHref('https://www.youtube.com/shorts/bcdefghijkl')).toBe('bcdefghijkl');
    expect(ytVideoIdFromHref('/channel/UC123')).toBe('');
  });
});

describe('readYtRelatedChipSnapshot', () => {
  it('選ばれているチップと、見えているカードだけを読む。クリックはしない', () => {
    const snap = readYtRelatedChipSnapshot(doc(`<!doctype html><html><body><div id="related">
      <yt-related-chip-cloud-renderer>
        <yt-chip-cloud-chip-renderer aria-selected="true">すべて</yt-chip-cloud-chip-renderer>
        <yt-chip-cloud-chip-renderer>関連動画</yt-chip-cloud-chip-renderer>
        <yt-chip-cloud-chip-renderer>おすすめ</yt-chip-cloud-chip-renderer>
        <yt-chip-cloud-chip-renderer>最近アップロード</yt-chip-cloud-chip-renderer>
      </yt-related-chip-cloud-renderer>
      <ytd-compact-video-renderer>
        <a id="video-title" href="/watch?v=ownvideo0001" title="歌枠 本編">歌枠 本編</a>
        <ytd-channel-name><div id="text">君斗りんく</div></ytd-channel-name>
        <span id="text" class="ytd-thumbnail-overlay-time-status-renderer">8:20</span>
      </ytd-compact-video-renderer>
      <ytd-compact-video-renderer>
        <a id="video-title" href="/watch?v=othervideo01" title="夜に聴く">夜に聴く</a>
        <ytd-channel-name><div id="text">海辺のラジオ</div></ytd-channel-name>
      </ytd-compact-video-renderer>
    </div></body></html>`), {
      operatorChannelName: '君斗りんく',
      nowMs: 1,
    });
    expect(snap.chipLabel).toBe('すべて');
    expect(snap.chipLabels).toEqual(['すべて', '関連動画', 'おすすめ', '最近アップロード']);
    expect(snap.videos).toHaveLength(2);
    expect(snap.videos[0].isOwn).toBe(true);
    expect(snap.videos[1].isOwn).toBe(false);
    expect(snap.ownCount).toBe(1);
  });

  it('チップもカードも無いページでは null', () => {
    expect(readYtRelatedChipSnapshot(doc('<!doctype html><html><body><div id="content">本文だけ</div></body></html>'))).toBeNull();
  });
});
