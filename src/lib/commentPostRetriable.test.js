import { describe, it, expect } from 'vitest';
import { commentPostErrorWarrantsFrameDiscovery } from './commentPostRetriable.js';

describe('commentPostErrorWarrantsFrameDiscovery', () => {
  it('別フレーム探索が必要なエラー', () => {
    expect(
      commentPostErrorWarrantsFrameDiscovery('このフレームにはコメント欄がありません。')
    ).toBe(true);
    expect(
      commentPostErrorWarrantsFrameDiscovery('Receiving end does not exist.')
    ).toBe(true);
  });

  it('全フレーム走査しても改善しにくいエラー', () => {
    expect(
      commentPostErrorWarrantsFrameDiscovery(
        'コメント送信を確認できませんでした。watchページを前面に出し、必要なら再読み込みしてから再試行してください。'
      )
    ).toBe(false);
    expect(
      commentPostErrorWarrantsFrameDiscovery(
        '公式の送信ボタンを見つけられませんでした。watchページを再読み込みし、コメント欄が見える状態で再試行してください。'
      )
    ).toBe(false);
  });
});
