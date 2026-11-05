// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { captureGiftPanelShape } from './giftPanelShape.js';

describe('公式ギフト欄の作りを記録する計器', () => {
  it('画像と pt の枠・タブ・確認の窓を拾う(押さない)', () => {
    document.body.innerHTML = `
      <div><button role="tab">番組ギフト</button><button role="tab">マイギフト</button></div>
      <ul>
        <li class="item"><button class="item-btn" data-id="1"><img src="https://cdn.example/a.png" alt="う"><span>う</span><span>100 pt</span></button></li>
        <li class="item"><button class="item-btn" data-id="2"><img src="https://cdn.example/b.png"><span>300pt</span></button></li>
      </ul>
      <div role="dialog"><p>贈りますか</p><button>贈る</button><button>キャンセル</button></div>`;
    const s = captureGiftPanelShape(document);
    expect(s?.tiles.length).toBe(2);
    expect(s?.tiles[0].pt).toBe('100 pt');
    expect(s?.tiles[0].img.src).toBe('https://cdn.example/a.png');
    expect(s?.tiles[0].click.tag).toBe('button');
    expect(s?.tabs.map((t) => t.text)).toEqual(['番組ギフト', 'マイギフト']);
    expect(s?.dialogs[0].buttons).toEqual(['贈る', 'キャンセル']);
  });
  it('ギフト欄が無ければ null', () => {
    document.body.innerHTML = '<p>こんにちは</p>';
    expect(captureGiftPanelShape(document)).toBeNull();
  });
});
