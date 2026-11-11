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
    expect(host).toContain('assembleNicoRecentRows');
    expect(host).toContain('chunkIndexKey');
    expect(host).toContain('MERGED_RECENT_COMMENTS_MESSAGE');
    expect(read('src/lib/mergedComeview.js')).toContain("MERGED_RECENT_COMMENTS_MESSAGE = 'YT_GET_RECENT_STREAM_COMMENTS'");
    expect(yt).toContain('MERGED_RECENT_COMMENTS_MESSAGE');
    expect(yt).toContain('getYtStreamCommentsTail');
  });

  it('読み上げの初期値は保存が true か voice=1 のときだけ ON', () => {
    expect(comeview).toContain("get('voice') === '1'");
    expect(comeview).toContain('if (forceVoiceOn || bag[VOICE_READING_ENABLED_KEY] === true)');
    expect(comeview).not.toContain('forceOn: true');
    expect(host).not.toContain('VOICE_READING_ENABLED');
    expect(host).not.toContain('nls_voice_reading_enabled');
  });

  it('まとめて読みは選んだ配信の読み手を引き取れる', () => {
    expect(sw).toContain('msg.force === true');
    expect(read('extension-youtube/src/background-nico-relay.js')).toContain('msg.force === true');
    expect(read('src/lib/voiceReaderLease.js')).toContain('force: true');
  });
});
