import { describe, expect, it } from 'vitest';
import { SIDE_PANEL_WATCH_TAB_QUERY, pickLvFromTabs } from './sidePanelLvFromTabs.js';

/**
 * ★この検査が守っているのは「速くすること」ではなく
 *   【間違った配信を掴まないこと】。
 *   ユーザーにとって、別の配信のコメントが出るのは壊れているのと同じ。
 *   速さは二の次で、曖昧なら従来経路(遅いが正しい)に倒す。
 */

const tab = (url) => ({ url });

describe('1つに定まるときだけ採用する', () => {
  it('watchタブが1つなら、その配信IDを使う(待ち時間が消える)', () => {
    expect(pickLvFromTabs([tab('https://live.nicovideo.jp/watch/lv351201716')])).toEqual({
      lv: 'lv351201716',
      reason: 'single'
    });
  });

  it('★watchタブが複数なら【選ばない】(遅いが正しい方を選ぶ)', () => {
    const r = pickLvFromTabs([
      tab('https://live.nicovideo.jp/watch/lv111111111'),
      tab('https://live.nicovideo.jp/watch/lv222222222')
    ]);
    expect(r.lv).toBe('');
    expect(r.reason).toBe('ambiguous');
  });

  it('同じ配信が2タブで開いていても1つとみなす(重複は曖昧ではない)', () => {
    const r = pickLvFromTabs([
      tab('https://live.nicovideo.jp/watch/lv351201716'),
      tab('https://live.nicovideo.jp/watch/lv351201716?ref=x')
    ]);
    expect(r).toEqual({ lv: 'lv351201716', reason: 'single' });
  });

  it('watchタブが無ければ採用しない', () => {
    expect(pickLvFromTabs([tab('https://www.nicovideo.jp/')]).reason).toBe('none');
    expect(pickLvFromTabs([]).reason).toBe('none');
  });
});

describe('★active に頼らない(過去の事故の再発防止)', () => {
  /*
   * popup-entry.js:1013-1016 の記録:
   *   「裏タブでは tabs.query({active,currentWindow}) が前面の別タブを返す
   *     ＝パネルが永久に固まる」
   * ★実測でも、パネル自身がタブとして開いていると active は自分を返した。
   */
  it('active フラグは判断に一切使わない', () => {
    const r = pickLvFromTabs([
      { url: 'https://live.nicovideo.jp/watch/lv351201716', active: false },
      { url: 'chrome-extension://xxxx/sidepanel.html', active: true }
    ]);
    // active=true の拡張ページに引きずられず、watch タブを選ぶ
    expect(r).toEqual({ lv: 'lv351201716', reason: 'single' });
  });

  it('拡張自身のページは候補にならない', () => {
    expect(pickLvFromTabs([tab('chrome-extension://xxxx/sidepanel.html')]).reason).toBe('none');
  });
});

describe('URLの形を厳密に見る(誤った配信を掴まない)', () => {
  it('スマホ版の watch も拾う', () => {
    expect(pickLvFromTabs([tab('https://sp.live.nicovideo.jp/watch/lv999')]).lv).toBe('lv999');
  });

  it('クエリ・ハッシュ付きでも正しく抜く', () => {
    expect(pickLvFromTabs([tab('https://live.nicovideo.jp/watch/lv123456?a=1#b')]).lv).toBe(
      'lv123456'
    );
  });

  it('watch 以外のページは拾わない', () => {
    expect(pickLvFromTabs([tab('https://live.nicovideo.jp/ranking')]).reason).toBe('none');
    expect(pickLvFromTabs([tab('https://example.com/watch/lv123')]).lv).toBe('lv123'); // URLの形だけ見る(呼び出し側が絞る)
  });

  it('★lv の書式が不正なものは採用しない(16桁以上・数字以外)', () => {
    expect(pickLvFromTabs([tab('https://live.nicovideo.jp/watch/lv1234567890123456')]).reason).toBe(
      'none'
    );
    expect(pickLvFromTabs([tab('https://live.nicovideo.jp/watch/abc123')]).reason).toBe('none');
  });

  it('壊れた入力でも落ちない', () => {
    expect(() => pickLvFromTabs(null)).not.toThrow();
    expect(() => pickLvFromTabs([null, undefined, {}, { url: 123 }])).not.toThrow();
    expect(pickLvFromTabs(null).reason).toBe('none');
  });
});

describe('★問い合わせ条件は url で絞る(active を条件にしない)', () => {
  it('watch の URL パターンだけを条件にしている', () => {
    expect(SIDE_PANEL_WATCH_TAB_QUERY.url).toContain('https://live.nicovideo.jp/watch/*');
    expect(Object.keys(SIDE_PANEL_WATCH_TAB_QUERY)).toEqual(['url']);
  });
});
