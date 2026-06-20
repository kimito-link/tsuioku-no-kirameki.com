import { describe, it, expect } from 'vitest';
import { findHarmWordsInInfoCards, HARM_WORDS } from './diagWordingGuard.js';

describe('findHarmWordsInInfoCards', () => {
  it('info カードに実害語があれば検出', () => {
    const hits = findHarmWordsInInfoCards([
      { id: 'x', severity: 'info', cause: '公式値レーンが混乱することがある' }
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: 'x', word: '混乱', field: 'cause' });
  });

  it('info カードでも実害語が無ければ空', () => {
    const hits = findHarmWordsInInfoCards([
      { id: 'x', severity: 'info', cause: '記録にも表示にも影響しません', action: '気になる場合だけ閉じてください' }
    ]);
    expect(hits).toEqual([]);
  });

  it('severity が bad/warn のカードは対象外(実害ありの位置づけなので)', () => {
    const hits = findHarmWordsInInfoCards([
      { id: 'y', severity: 'bad', cause: '記録が破壊される' },
      { id: 'z', severity: 'warn', cause: 'データが汚染される' }
    ]);
    expect(hits).toEqual([]);
  });

  it('cause と action 両方を見る', () => {
    const hits = findHarmWordsInInfoCards([
      { id: 'a', severity: 'info', cause: '正常です', action: '放置すると壊れます' }
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0].field).toBe('action');
  });

  it('現行 stale-dom カードの新文言は実害語ゼロ(回帰防止)', () => {
    // statusActionAdvisor.js v0.1.834 の訂正後文言。
    const hits = findHarmWordsInInfoCards([
      {
        id: 'stale-dom',
        severity: 'info',
        symptom: '過去に開いた配信の履歴が残っています',
        cause: '記録にも表示にも影響しません。今見ている配信のデータだけを使うので、過去タブの履歴が残っていても表示は混ざりません（古い履歴は数時間で自動的に消えます）',
        action: '気になる場合だけ、使っていないニコ生タブを閉じてください（閉じなくても問題ありません）'
      }
    ]);
    expect(hits).toEqual([]);
  });

  it('null/非配列 → 空(安全)', () => {
    expect(findHarmWordsInInfoCards(null)).toEqual([]);
    expect(findHarmWordsInInfoCards(undefined)).toEqual([]);
    expect(findHarmWordsInInfoCards('x')).toEqual([]);
  });

  it('HARM_WORDS は凍結配列', () => {
    expect(Object.isFrozen(HARM_WORDS)).toBe(true);
    expect(HARM_WORDS).toContain('混乱');
  });
});
