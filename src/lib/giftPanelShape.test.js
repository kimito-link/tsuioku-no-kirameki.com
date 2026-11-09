// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { captureGiftPanelShape, frameCensus, listFrames } from './giftPanelShape.js';

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
  it('窓の数え上げと iframe 一覧(中身が拾えないときの手がかり)', () => {
    document.body.innerHTML = `<div class="___web-view-panel___x"><iframe src="https://gift.nicovideo.jp/embed?x=1" name="g"></iframe></div><img src="https://a/b.png"><canvas></canvas>`;
    const c = frameCensus(document);
    expect(c.imgs).toBe(1);
    expect(c.canvases).toBe(1);
    expect(c.iframes).toBe(1);
    const f = listFrames(document);
    expect(f[0].src).toBe('gift.nicovideo.jp/embed');
    expect(f[0].name).toBe('g');
    expect(f[0].inPanel).toBe(true);
  });
  it('数字と pt が別の部品でも拾う', () => {
    document.body.innerHTML = `<ul><li><button><img src="https://cdn.example/a.png"><span>う</span><p><span>100</span><span>pt</span></p></button></li></ul>`;
    const s = captureGiftPanelShape(document);
    expect(s?.tiles.length).toBe(1);
    expect(s?.tiles[0].pt).toBe('100pt');
    expect(s?.ptSkel?.[0]).toMatch(/^span\./);
  });
});
