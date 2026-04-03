/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  parseCommentLineText,
  parseCommentElement,
  parseNicoLiveTableRow,
  extractCommentsFromNode,
  extractUserIdFromLinks,
  extractUserIdFromDataAttributes,
  extractUserIdFromOuterHtml,
  extractUserIdFromIconSrc
} from './nicoliveDom.js';

describe('parseCommentLineText', () => {
  it('番号と本文を分離', () => {
    expect(parseCommentLineText('1011 こんにちは')).toEqual({
      commentNo: '1011',
      text: 'こんにちは'
    });
  });

  it('本文に空白を含む', () => {
    expect(parseCommentLineText('3 a b c')).toEqual({
      commentNo: '3',
      text: 'a b c'
    });
  });

  it('合致しない', () => {
    expect(parseCommentLineText('abc')).toBeNull();
  });
});

describe('parseCommentElement', () => {
  it('li の innerText を解析', () => {
    const li = document.createElement('li');
    li.textContent = '999 テスト';
    expect(parseCommentElement(li)).toEqual({
      commentNo: '999',
      text: 'テスト',
      userId: null
    });
  });

  it('data-user-id を拾う', () => {
    const li = document.createElement('li');
    li.setAttribute('data-user-id', 'u42');
    li.textContent = '1 hello';
    expect(parseCommentElement(li)?.userId).toBe('u42');
  });

  it('プロフィールリンクから user id', () => {
    const li = document.createElement('li');
    li.innerHTML =
      '88 本文です <a href="https://www.nicovideo.jp/user/999">▶</a>';
    const p = parseCommentElement(li);
    expect(p?.userId).toBe('999');
    expect(p?.commentNo).toBe('88');
  });
});

describe('extractUserIdFromDataAttributes', () => {
  it('子孫の data-*user* から数値ID', () => {
    const li = document.createElement('li');
    li.innerHTML =
      '<span data-live-comment-user-id="5566778899"></span>1 hello';
    expect(extractUserIdFromDataAttributes(li)).toBe('5566778899');
  });
});

describe('extractUserIdFromOuterHtml', () => {
  it('埋め込まれた userId JSON 断片', () => {
    const li = document.createElement('li');
    li.innerHTML =
      '<span class="meta">"userId":"1234567"</span> 2 body';
    expect(extractUserIdFromOuterHtml(li)).toBe('1234567');
  });
});

describe('extractUserIdFromLinks', () => {
  it('子の a タグから user id', () => {
    const li = document.createElement('li');
    li.innerHTML =
      '<a href="https://www.nicovideo.jp/user/12345">x</a> 999 hello';
    expect(extractUserIdFromLinks(li)).toBe('12345');
  });
});

describe('parseNicoLiveTableRow', () => {
  it('PC watch: table-row + comment-number + comment-text', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="table-row" role="row" data-comment-type="normal">
        <span class="table-cell" role="gridcell">
          <span class="comment-number">761</span>
          <div class="content-area">
            <span class="comment-text">借金生活は終わったんじゃないのか</span>
          </div>
        </span>
      </div>`;
    const row = wrap.querySelector('.table-row');
    expect(parseNicoLiveTableRow(row)).toEqual({
      commentNo: '761',
      text: '借金生活は終わったんじゃないのか',
      userId: null
    });
    const textEl = wrap.querySelector('.comment-text');
    expect(parseNicoLiveTableRow(textEl)).toEqual({
      commentNo: '761',
      text: '借金生活は終わったんじゃないのか',
      userId: null
    });
  });

  it('generalSystemMessage は無視', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="table-row" data-comment-type="generalSystemMessage">
        <span class="comment-number"></span>
        <span class="comment-text">「雑談」が好きな1人が来場しました</span>
      </div>`;
    expect(parseNicoLiveTableRow(wrap.querySelector('.table-row'))).toBeNull();
  });

  it('アイコン URL から user id', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="table-row" data-comment-type="normal">
        <img src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/8625/86255751.jpg" alt="">
        <span class="comment-number">1</span>
        <span class="comment-text">hi</span>
      </div>`;
    expect(parseNicoLiveTableRow(wrap.querySelector('.table-row'))?.userId).toBe(
      '86255751'
    );
  });
});

describe('extractUserIdFromIconSrc', () => {
  it('usericon パスから末尾のユーザーID', () => {
    const d = document.createElement('div');
    d.innerHTML =
      '<img src="https://x/nicoaccount/usericon/s/12/12345678.jpg">';
    expect(extractUserIdFromIconSrc(d)).toBe('12345678');
  });
});

describe('extractCommentsFromNode', () => {
  it('ul 以下の複数 li', () => {
    const ul = document.createElement('ul');
    ul.innerHTML =
      '<li>1011 あ</li><li>1012 い</li><li>not a comment</li>';
    const list = extractCommentsFromNode(ul);
    expect(list).toHaveLength(2);
    expect(list[0].commentNo).toBe('1011');
    expect(list[1].commentNo).toBe('1012');
  });

  it('コメントパネル内の table-row を抽出（実DOMに近い）', () => {
    const panel = document.createElement('div');
    panel.className = 'comment-panel ga-ns-comment-panel';
    panel.innerHTML = `
      <div class="table" role="rowgroup">
        <div class="table-row" role="row" data-comment-type="normal">
          <span role="gridcell">
            <span class="comment-number">756</span>
            <div class="content-area"><span class="comment-text">京都</span></div>
          </span>
        </div>
        <div class="table-row" role="row" data-comment-type="generalSystemMessage">
          <span class="comment-text">システム</span>
        </div>
      </div>`;
    const list = extractCommentsFromNode(panel);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ commentNo: '756', text: '京都' });
  });

  it('MutationObserver が行要素だけ渡したときも拾う', () => {
    const row = document.createElement('div');
    row.className = 'table-row';
    row.setAttribute('role', 'row');
    row.setAttribute('data-comment-type', 'normal');
    row.innerHTML =
      '<span class="comment-number">10</span><span class="comment-text">単独行</span>';
    const list = extractCommentsFromNode(row);
    expect(list).toEqual([
      { commentNo: '10', text: '単独行', userId: null }
    ]);
  });
});
