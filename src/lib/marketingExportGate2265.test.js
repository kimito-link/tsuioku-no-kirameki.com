// v0.1.2265: コメントが0件と分かっているときはマーケのボタンを押せない。分からないあいだは点滅させない
import { describe, expect, it } from 'vitest';
import { marketingExportDisabledReason } from './marketingExportGate.js';
import { readFileSync } from 'node:fs';

describe('marketingExportDisabledReason', () => {
  it('配信 id が無いときは押せない', () => {
    expect(marketingExportDisabledReason({})).toBe('配信が決まっていません');
    expect(marketingExportDisabledReason({ liveId: '  ' })).toBe('配信が決まっていません');
  });
  it('件数まだ不明のときは、配信 id があれば押せる(読み込み中に消さない)', () => {
    expect(marketingExportDisabledReason({ liveId: 'lv1' })).toBe('');
    expect(marketingExportDisabledReason({ liveId: 'lv1', commentCount: 0 })).toBe('');
  });
  it('0件と分かっているときは押せない', () => {
    expect(marketingExportDisabledReason({ liveId: 'lv1', commentCount: 0, commentsKnown: true }))
      .toBe('コメントが0件です。');
  });
  it('1件以上なら押せる', () => {
    expect(marketingExportDisabledReason({ liveId: 'lv1', commentCount: 1, commentsKnown: true })).toBe('');
  });
  it('popup-entry は理由があればボタンを押せない見た目にする', () => {
    const src = readFileSync(`${process.cwd()}/src/extension/popup-entry.js`, 'utf8');
    expect(src).toContain('applyMarketingExportGate');
  });
});
