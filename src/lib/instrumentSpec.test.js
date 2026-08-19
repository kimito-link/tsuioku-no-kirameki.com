import { describe, it, expect } from 'vitest';
import {
  INSTRUMENT_SPEC,
  INSTRUMENT_DOCS,
  INSTRUMENT_UNITS,
  INSTRUMENT_WINDOWS,
  INSTRUMENT_RESET_TRIGGERS,
  specKey,
  findInstrumentSpec,
  judgeInstrumentSpec
} from './instrumentSpec.js';

/**
 * ★計器の「宣言テーブル」(2026-08-20・ユーザー提案)。
 *
 * ■ なぜ要るか
 *   ユーザーがメール転送管理のExcelを示して言った:
 *   「計器もこういう厳密な管理体制の方がいっそうずれがない」
 *   そのシートは1行で
 *     サイト | 送信元 | 件名 | 送信先 | 送信内容(範囲)
 *   が並び、**1行読めば経路が確定する**ようになっていた。
 *
 * ■ ★この提案が正しいと分かる根拠 = 実際に起きた誤診4件
 *   1. **どの文書か**が無い → `domNodes`(watchページ本体)を
 *      13,682(popup.html)の再現に使えると誤認した
 *   2. **何を数えるか**が無い → `sentCount`(回数) と `receivedCount`(iframe延べ数)を
 *      割って「1.51倍=二重注入」と誤診。単位が違うので比較自体が無意味だった
 *   3. **いつからの値か**が無い → リセット経路の無い生涯累計を「いまの状態」と誤読
 *   4. **何を数えるか**(再) → `tanu332` は鏡データの件数なのに
 *      「タイルが332枚」とDOM枚数としてコメントに書いた
 *
 *   ★4件とも「列が足りない」ことが原因。実装の欠陥ではない。
 *
 * ■ ユーザー決定「正確さがほしい。それを中心に」
 *   → 便利さより厳密さ。**未記入は赤**。デフォルト値は用意しない
 *     (`diagChannelRegistry` が3ヶ月「登録1件」で死んだ理由がそれ)。
 */
describe('★計器の宣言テーブル(厳密な管理体制)', () => {
  it('★全行が7列すべてを持つ(未記入は許さない=デフォルト値を用意しない)', () => {
    for (const row of INSTRUMENT_SPEC) {
      for (const col of ['id', 'doc', 'unit', 'window', 'resetTrigger', 'sourceRef', 'normal']) {
        expect(row[col], `${row.id}: ${col} が未記入`).toBeTruthy();
      }
    }
  });

  it('★enum 列は決められた値しか取れない(自由文字列を許すと台帳が濁る)', () => {
    for (const row of INSTRUMENT_SPEC) {
      expect(INSTRUMENT_DOCS, `${row.id}: doc=${row.doc}`).toContain(row.doc);
      expect(INSTRUMENT_UNITS, `${row.id}: unit=${row.unit}`).toContain(row.unit);
      expect(INSTRUMENT_WINDOWS, `${row.id}: window=${row.window}`).toContain(row.window);
      expect(INSTRUMENT_RESET_TRIGGERS, `${row.id}: resetTrigger=${row.resetTrigger}`)
        .toContain(row.resetTrigger);
    }
  });

  it('★★主キーは id+doc(同名計器を別文書で別行にできる)', () => {
    /*
     * ★これが誤診①の構造的な塞ぎ。
     *   `dom-nodes` は watch と popup の【両方に存在しうる】。
     *   id だけを主キーにすると、どちらの数字か分からないまま1行に潰れる。
     */
    const keys = INSTRUMENT_SPEC.map(specKey);
    expect(new Set(keys).size, `重複キー: ${keys.join(', ')}`).toBe(keys.length);
  });

  it('★sourceRef は「ファイル:行」の形(実装へ辿れない台帳は死ぬ)', () => {
    for (const row of INSTRUMENT_SPEC) {
      expect(row.sourceRef, `${row.id}: sourceRef=${row.sourceRef}`).toMatch(/\.js:\d+|\.js$/);
    }
  });

  it('★誤診を生んだ計器が登録されている(着手範囲・ユーザー決定)', () => {
    const ids = new Set(INSTRUMENT_SPEC.map((r) => r.id));
    for (const id of [
      'dom-nodes', 'memory-pressure', 'host-duplicate', 'host-move',
      'lane-tick', 'lane-paint', 'instant-reject'
    ]) {
      expect(ids.has(id), `${id} が spec に無い`).toBe(true);
    }
  });

  it('★★`dom-nodes` は watch と popup で別行になっている(誤診①の当事者)', () => {
    const rows = INSTRUMENT_SPEC.filter((r) => r.id === 'dom-nodes');
    const docs = rows.map((r) => r.doc).sort();
    expect(docs, 'watch と popup の両方が要る').toEqual(['popup', 'watch']);
  });

  it('★instantPush の3つは単位が【違う】ことが宣言されている(誤診②の当事者)', () => {
    const find = (id) => INSTRUMENT_SPEC.find((r) => r.id === id);
    const sent = find('instant-push-sent');
    const received = find('instant-push-received');
    expect(sent, 'instant-push-sent が無い').toBeTruthy();
    expect(received, 'instant-push-received が無い').toBeTruthy();
    // ★単位が違う＝割ってはいけないことが台帳から読める。
    expect(sent.unit).not.toBe(received.unit);
  });

  it('★リセット経路が無い累計は resetTrigger:none と宣言されている(誤診③の当事者)', () => {
    const push = INSTRUMENT_SPEC.find((r) => r.id === 'instant-push-sent');
    expect(push.window).toBe('lifetime');
    expect(push.resetTrigger).toBe('none');
  });

  it('★見かけ上リセットされるものは none と書かない(laneRepaint は popup 再開で0に戻る)', () => {
    const lane = INSTRUMENT_SPEC.find((r) => r.id === 'lane-repaint');
    expect(lane, 'lane-repaint が無い').toBeTruthy();
    // ★storage 上のリセット経路は無いが、popup を開き直すとモジュールごと作り直される。
    //   'none' と書くと「ずっと積み上がる」と誤読する。
    expect(lane.resetTrigger).toBe('popup_reopen');
  });
});

describe('judgeInstrumentSpec(比較してよいかを構造で返す純関数)', () => {
  it('★単位が違う2つは【比較不可】と返す(1.51倍の誤診を機械的に止める)', () => {
    /*
     * ★同じ popup 文書の中で単位だけが違う2つを使う。
     *   `instant-push-sent`(watch/batches) と `instant-push-received`(popup/iframe_events)は
     *   **文書も単位も違う**ので「文書が違う」で先に落ちる＝単位の検査にならない
     *   (私が最初そう書いて赤にした)。
     */
    const v = judgeInstrumentSpec(
      { id: 'instant-push-received', doc: 'popup' }, // iframe_events
      { id: 'lane-repaint', doc: 'popup' }           // repaints
    );
    expect(v.comparable).toBe(false);
    expect(v.reason).toContain('単位');
  });

  it('★★1.51倍の誤診そのものが止まる(sent と received は比較不可)', () => {
    const v = judgeInstrumentSpec('instant-push-sent', 'instant-push-received');
    expect(v.comparable, 'この2つを割って1.51倍と誤診した').toBe(false);
  });

  it('★文書が違う2つも【比較不可】(domNodes の取り違え)', () => {
    const v = judgeInstrumentSpec(
      { id: 'dom-nodes', doc: 'watch' },
      { id: 'dom-nodes', doc: 'popup' }
    );
    expect(v.comparable).toBe(false);
    expect(v.reason).toContain('文書');
  });

  it('★単位も文書も窓も同じなら比較してよい', () => {
    const v = judgeInstrumentSpec(
      { id: 'dom-nodes', doc: 'popup' },
      { id: 'dom-nodes', doc: 'popup' }
    );
    expect(v.comparable).toBe(true);
  });

  it('★台帳に無いものは【判定不能】(推測で断定しない)', () => {
    const v = judgeInstrumentSpec('存在しない計器', 'dom-nodes');
    expect(v.comparable).toBe(false);
    expect(v.reason).toContain('台帳に無い');
  });

  it('★findInstrumentSpec は id+doc で引ける', () => {
    expect(findInstrumentSpec({ id: 'dom-nodes', doc: 'popup' })?.doc).toBe('popup');
    expect(findInstrumentSpec({ id: 'dom-nodes', doc: 'watch' })?.doc).toBe('watch');
    expect(findInstrumentSpec({ id: 'ない', doc: 'popup' })).toBeNull();
  });
});
