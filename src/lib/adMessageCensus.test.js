import { describe, expect, it } from 'vitest';
import {
  AD_MESSAGE_SAMPLE_MAX,
  createAdMessageCensusState,
  formatAdMessageCensusLine,
  observeAdMessage
} from './adMessageCensus.js';

describe('広告メッセージ計器', () => {
  it('message が入っていれば数える', () => {
    const st = createAdMessageCensusState();
    observeAdMessage(st, { advertiserName: 'りんく', point: 100, message: 'がんばって' });
    expect(st.seen).toBe(1);
    expect(st.withMessage).toBe(1);
    expect(st.byKey.message).toBe(1);
  });

  it('★どのフィールド名で来たかを記録する(実際の名前を確定するため)', () => {
    const st = createAdMessageCensusState();
    observeAdMessage(st, { adMessage: 'あ' });
    observeAdMessage(st, { advertiserMessage: 'い' });
    expect(st.byKey.adMessage).toBe(1);
    expect(st.byKey.advertiserMessage).toBe(1);
  });

  it('本文が無い/空白だけなら数えない', () => {
    const st = createAdMessageCensusState();
    observeAdMessage(st, { advertiserName: 'りんく', point: 100 });
    observeAdMessage(st, { message: '   ' });
    expect(st.seen).toBe(2);
    expect(st.withMessage).toBe(0);
  });

  it('★標本は先頭だけ・上書きしない(後の観測が先の証拠を消さない)', () => {
    const st = createAdMessageCensusState();
    observeAdMessage(st, { message: '最初のメッセージ' });
    observeAdMessage(st, { message: 'あとから来たもの' });
    expect(st.sample).toBe('最初のメッセージ');
  });

  it('★標本は長さを切る(PIIを増やしすぎない)', () => {
    const st = createAdMessageCensusState();
    const long = 'あ'.repeat(200);
    observeAdMessage(st, { message: long });
    expect(st.sample.length).toBe(AD_MESSAGE_SAMPLE_MAX);
    expect(st.maxLen).toBe(200); // 長さ自体は記録する
  });

  it('壊れた入力でも落ちない', () => {
    const st = createAdMessageCensusState();
    expect(() => observeAdMessage(st, null)).not.toThrow();
    expect(() => observeAdMessage(st, undefined)).not.toThrow();
    expect(() => observeAdMessage(null, { message: 'x' })).not.toThrow();
    expect(st.seen).toBe(0);
  });

  it('★未観測(0件)は「無い」と言わない', () => {
    const line = formatAdMessageCensusLine(createAdMessageCensusState());
    expect(line).toContain('まだ広告/ギフトが1件も届いていません');
    expect(line).not.toContain('入っていません');
  });

  it('★観測したうえで0なら「画面から読む必要がある」と次の一手を出す', () => {
    const st = createAdMessageCensusState();
    observeAdMessage(st, { advertiserName: 'りんく' });
    const line = formatAdMessageCensusLine(st);
    expect(line).toContain('入っていません');
    expect(line).toContain('画面(広告ページ)から読む方式');
  });

  it('★見つかったらフィールド名と例を出す(人が確かめられる)', () => {
    const st = createAdMessageCensusState();
    observeAdMessage(st, { message: 'grokが正直に言うね' });
    const line = formatAdMessageCensusLine(st);
    expect(line).toContain('✅');
    expect(line).toContain('message:1');
    expect(line).toContain('grokが正直に言うね');
    expect(line).toContain('この経路で記録できます');
  });
});
