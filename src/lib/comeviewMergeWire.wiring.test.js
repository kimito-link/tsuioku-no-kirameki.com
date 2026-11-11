import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('まとめてコメビュの配線', () => {
  const comeview = read('src/extension/comeview-entry.js');
  const host = read('src/extension/comeviewMergeHost.js');
  const sw = read('extension/background.js');
  const yt = read('extension-youtube/src/background-entry.js');

  it('コメビュはまとめ中、1配信の描き直しと読み上げを止める', () => {
    expect(comeview).toContain("import { startComeviewMerge } from './comeviewMergeHost.js'");
    expect(comeview).toContain('function mergeViewActive()');
    expect(comeview).toContain('if (mergeViewActive()) return;');
    expect(comeview).toContain('_comeviewMerge.ingestNico(_lv, rows)');
    expect(host).toContain('MERGED_RECENT_COMMENTS_MESSAGE');
    expect(read('src/lib/mergedComeview.js')).toContain("MERGED_RECENT_COMMENTS_MESSAGE = 'YT_GET_RECENT_STREAM_COMMENTS'");
    expect(yt).toContain('MERGED_RECENT_COMMENTS_MESSAGE');
    expect(yt).toContain('getYtStreamCommentsTail');
  });

  it('まとめて読みは選んだ配信の読み手を引き取れる', () => {
    expect(sw).toContain('msg.force === true');
    expect(read('extension-youtube/src/background-nico-relay.js')).toContain('msg.force === true');
    expect(read('src/lib/voiceReaderLease.js')).toContain('force: true');
  });
});
