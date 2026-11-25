import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  TICKER_BUCKET_MS,
  createTickerLastUserTracker,
  pickTickerHighlightEntry,
  tickerHighlightKey
} from './pickTickerHighlight.js';

// v0.1.2226: ティッカーが同じバケットの中で A↔B を交互に書き直していた件(箱の実測で書き込みの約9割)。

const BASE = 1_000_000 * TICKER_BUCKET_MS;
const row = (capturedAt, userId, commentNo) => ({ capturedAt, text: `こんばんは${commentNo}です`, userId, nickname: `ファン${userId}`, commentNo: String(commentNo), liveId: 'lv1' });

/** popup の renderCommentTickerImpl と同じ手順(選ぶ → 鍵が同じなら書かない → 書いたら控える)。 */
function makeTicker() {
  const tracker = createTickerLastUserTracker();
  let key = '';
  let writes = 0;
  /** @type {string[]} */
  const shown = [];
  return {
    render(list, now) {
      const picked = pickTickerHighlightEntry(list, now, { lastUserId: tracker.lastUserIdFor(now) });
      const k = tickerHighlightKey(picked);
      if (k === key) return;
      key = k;
      writes += 1;
      shown.push(String(picked.entry?.userId || ''));
      tracker.noteShown(picked.entry?.userId);
    },
    get writes() { return writes; },
    shown
  };
}

describe('createTickerLastUserTracker — 同じバケットの中では書き直さない', () => {
  it('描き直し1回でティッカーを2回描いても、同じ一覧なら書くのは最初の1回だけ', () => {
    const list = [row(BASE - 3000, 'A', 1), row(BASE - 2000, 'B', 2), row(BASE - 1000, 'C', 3)];
    const t = makeTicker();
    for (let i = 0; i < 10; i += 1) {
      const now = BASE + 100 + i * 300;
      t.render(list, now); // 応援レーンの経路
      t.render(list, now); // 本体
    }
    expect(t.writes).toBe(1);
    expect(t.shown).toEqual(['C']);
  });

  it('1人占拠の防止はバケットをまたいで効く(前のバケットで出た人は次のバケットでは選ばない)', () => {
    const list = [row(BASE + 400, 'B', 2), row(BASE + 500, 'C', 4)];
    const t = makeTicker();
    t.render(list, BASE + 600);
    t.render(list, BASE + 600);
    expect(t.shown).toEqual(['C']);
    t.render(list, BASE + TICKER_BUCKET_MS + 100);
    t.render(list, BASE + TICKER_BUCKET_MS + 100);
    expect(t.shown).toEqual(['C', 'B']);
  });

  it('同じバケットの中は何度聞いても同じ「直前の人」', () => {
    const tr = createTickerLastUserTracker();
    expect(tr.lastUserIdFor(BASE + 1)).toBe('');
    tr.noteShown('A');
    expect(tr.lastUserIdFor(BASE + 2000)).toBe('');
    tr.noteShown('B');
    expect(tr.lastUserIdFor(BASE + 6999)).toBe('');
    expect(tr.lastUserIdFor(BASE + TICKER_BUCKET_MS)).toBe('B');
    tr.noteShown('C');
    expect(tr.lastUserIdFor(BASE + TICKER_BUCKET_MS + 10)).toBe('B');
  });

  it('popup は書いた瞬間に除外の人を更新しない(バケット単位の係を通す)', () => {
    const src = fs.readFileSync(new URL('../extension/popup-entry.js', import.meta.url), 'utf8');
    const at = src.indexOf('function renderCommentTickerImpl(');
    const body = src.slice(at, src.indexOf('\nfunction ', at + 10));
    expect(body).toContain('lastUserId: _tickerLastUser.lastUserIdFor(');
    expect(body).toContain('_tickerLastUser.noteShown(latest.userId)');
    expect(src).not.toMatch(/_tickerLastUserId\s*=/);
  });
});
