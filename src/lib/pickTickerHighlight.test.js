import { describe, expect, it } from 'vitest';
import {
  TICKER_BUCKET_MS,
  pickTickerHighlightEntry,
  tickerHighlightKey
} from './pickTickerHighlight.js';
import {
  buildCommentTimelineMirrorSnapshot,
  restoreCommentTimelineRows
} from './commentTimelineMirror.js';

/**
 * v0.1.1226: コメントティッカーの「留める1件」の選定。
 * 正本: docs/handoff/comment-pickup-ticker-DESIGN.md
 */

/** 能動(①displayEntries)側の形。 */
function entry(capturedAt, text, opts = {}) {
  return {
    capturedAt,
    text,
    userId: opts.userId ?? '111',
    nickname: opts.nickname ?? 'だるま',
    commentNo: opts.commentNo ?? '',
    liveId: 'lv1'
  };
}

const BASE = 1_000_000 * TICKER_BUCKET_MS; // バケット境界ちょうど

describe('pickTickerHighlightEntry — 決定性(3画面パリティの根拠)', () => {
  it('同一バケット内なら何度呼んでも同じ結果', () => {
    const list = [
      entry(BASE - 1000, 'こんばんはー'),
      entry(BASE - 2000, 'たのしいね')
    ];
    const a = pickTickerHighlightEntry(list, BASE + 100);
    const b = pickTickerHighlightEntry(list, BASE + 6900);
    expect(a.entry).toBe(b.entry);
    expect(a.bucketAt).toBe(b.bucketAt);
  });

  it('★バケットを跨ぐと選び直される(留まる時間の上界=バケット幅)', () => {
    const list = [
      entry(BASE - 1000, 'ひとつめのコメント'),
      entry(BASE + 1000, 'ふたつめのコメント')
    ];
    const a = pickTickerHighlightEntry(list, BASE + 100);
    const b = pickTickerHighlightEntry(list, BASE + TICKER_BUCKET_MS + 100);
    expect(a.bucketAt).not.toBe(b.bucketAt);
  });

  it('同じ入力・同じ時刻なら常に同じ(乱数を使っていない)', () => {
    const list = [entry(BASE - 500, 'あいうえお'), entry(BASE - 400, 'かきくけこ')];
    const r1 = pickTickerHighlightEntry(list, BASE + 10);
    const r2 = pickTickerHighlightEntry(list, BASE + 10);
    expect(r1.entry).toBe(r2.entry);
    expect(r1.why).toBe(r2.why);
  });
});

describe('pickTickerHighlightEntry — フォールバック(最悪ケースが現状維持)', () => {
  it('候補が窓に無ければ最新1件へフォールバック(枠は空にならない)', () => {
    // 窓(直近8秒)から大きく外れた古い行だけ
    const list = [entry(BASE - 999_000, 'ずっと前のコメント')];
    const r = pickTickerHighlightEntry(list, BASE + 100);
    expect(r.why).toBe('fallback');
    expect(r.entry).not.toBeNull();
  });

  it('★全部フィルタされてもフォールバックする(entry が null にならない)', () => {
    // 全部「w」= 極短スパムで候補外
    const list = [entry(BASE - 100, 'w'), entry(BASE - 200, 'w'), entry(BASE - 300, 'w')];
    const r = pickTickerHighlightEntry(list, BASE + 100);
    expect(r.why).toBe('fallback');
    expect(r.entry).not.toBeNull();
    expect(r.stats.filteredTooShort).toBeGreaterThan(0);
  });

  it('空リストは none(判定不能を明示する)', () => {
    const r = pickTickerHighlightEntry([], BASE + 100);
    expect(r.why).toBe('none');
    expect(r.entry).toBeNull();
  });

  it('null/undefined でも壊れない', () => {
    expect(pickTickerHighlightEntry(null, BASE).why).toBe('none');
    expect(pickTickerHighlightEntry(undefined, BASE).why).toBe('none');
  });
});

describe('pickTickerHighlightEntry — ノイズ潰し', () => {
  it('★合唱(同一本文が3回以上)は候補外。ただし消しはしない(fallbackには出る)', () => {
    const list = [
      entry(BASE - 100, '８８８８', { userId: 'a' }),
      entry(BASE - 200, '８８８８', { userId: 'b' }),
      entry(BASE - 300, '８８８８', { userId: 'c' }),
      entry(BASE - 400, 'これはちゃんとした感想です', { userId: 'd' })
    ];
    const r = pickTickerHighlightEntry(list, BASE + 100);
    expect(r.why).toBe('scored');
    expect(r.entry.text).toBe('これはちゃんとした感想です');
    expect(r.stats.filteredDup).toBeGreaterThan(0);
  });

  it('極短スパムより通常コメントが選ばれる', () => {
    const list = [
      entry(BASE - 100, 'w', { userId: 'a' }),
      entry(BASE - 200, 'なるほどと思った', { userId: 'b' })
    ];
    const r = pickTickerHighlightEntry(list, BASE + 100);
    expect(r.entry.text).toBe('なるほどと思った');
  });

  it('★ギフトは最優先(極短でも免除される)', () => {
    const list = [
      { at: BASE - 100, text: '', userId: 'g', kind: 'gift', name: 'ギフト主' },
      { at: BASE - 200, text: 'ふつうのコメントです', userId: 'b', kind: 'comment' }
    ];
    const r = pickTickerHighlightEntry(list, BASE + 100);
    expect(r.why).toBe('gift');
  });

  it('★1人占拠を防ぐ(直前と同じuserIdは候補外)', () => {
    const list = [
      entry(BASE - 100, 'おなじひとの発言', { userId: 'same' }),
      entry(BASE - 200, 'べつのひとの発言', { userId: 'other' })
    ];
    const r = pickTickerHighlightEntry(list, BASE + 100, { lastUserId: 'same' });
    expect(r.entry.userId).toBe('other');
    expect(r.stats.filteredSameUser).toBe(1);
  });

  it('★匿名(空userId)は占拠防止の巻き添えにしない', () => {
    const list = [entry(BASE - 100, 'とくめいのはつげん', { userId: '' })];
    // lastUserId が空でも、空userId 同士を「同一人物」と誤判定しないこと
    const r = pickTickerHighlightEntry(list, BASE + 100, { lastUserId: '' });
    expect(r.why).toBe('scored');
    expect(r.stats.filteredSameUser).toBe(0);
  });
});

describe('pickTickerHighlightEntry — ②③鏡row形（本番producerの実出力を使う）', () => {
  /**
   * ★手書きfixtureを使わない。本番の buildCommentTimelineMirrorSnapshot が作った
   *   row をそのまま食わせる。手書きだと「余分なキーが無い」ので中継落ちを
   *   永久に検出できない([[integration-test-must-import-real-code]])。
   */
  const snap = buildCommentTimelineMirrorSnapshot({
    liveId: 'lv1',
    capturedAt: BASE,
    // ★鏡producerの入力は `at`(実コード: toTimelineRow が it.at ?? it.date ?? it.vpos を読む)。
    //   capturedAt は読まれず at:0 になる=ここを取り違えると窓に入らない(実際にこのテストで踏んだ)。
    comments: [
      { at: BASE - 100, text: 'かがみ経由のコメント', userId: '222', nickname: 'ねこ' },
      { at: BASE - 200, text: 'w', userId: '333', nickname: 'いぬ' }
    ],
    giftEvents: []
  });
  const rows = restoreCommentTimelineRows(snap);

  it('前提: 本番producerが row を作れている(テストの前提が崩れていない)', () => {
    expect(rows.length).toBeGreaterThan(0);
    // 鏡row は at を使う(capturedAt ではない)。この差を選定が吸収できることが本題。
    expect(Number(rows[0].at)).toBeGreaterThan(0);
  });

  it('★鏡row(at形)でも能動(capturedAt形)と同じように選定できる', () => {
    const r = pickTickerHighlightEntry(rows, BASE + 100);
    expect(r.why).toBe('scored');
    expect(String(r.entry.text)).toBe('かがみ経由のコメント');
  });

  it('鏡rowは commentNo を持たないが選定は壊れない', () => {
    const r = pickTickerHighlightEntry(rows, BASE + 100);
    expect(r.entry).toBeTruthy();
    expect(tickerHighlightKey(r)).toContain('scored');
  });
});

describe('tickerHighlightKey — diff-skip(ちらつき/重さ対策)', () => {
  it('同じ選定結果なら同じキー(=DOM書き換えをスキップできる)', () => {
    const list = [entry(BASE - 100, 'あいうえおかきくけこ')];
    const a = pickTickerHighlightEntry(list, BASE + 100);
    const b = pickTickerHighlightEntry(list, BASE + 200);
    expect(tickerHighlightKey(a)).toBe(tickerHighlightKey(b));
  });

  it('選定が変われば違うキー', () => {
    const one = pickTickerHighlightEntry([entry(BASE - 100, 'ひとつめのはつげん')], BASE + 100);
    const two = pickTickerHighlightEntry([entry(BASE - 100, 'ふたつめのはつげん', { userId: '999' })], BASE + 100);
    expect(tickerHighlightKey(one)).not.toBe(tickerHighlightKey(two));
  });

  it('★「消す側」(none/fallback)もキーを持つ=消す経路もdiff-skipを通る', () => {
    const none = pickTickerHighlightEntry([], BASE + 100);
    expect(tickerHighlightKey(none)).toBe('none::');
    expect(() => tickerHighlightKey(null)).not.toThrow();
  });
});
