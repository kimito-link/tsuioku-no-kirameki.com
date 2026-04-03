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
  extractUserIdFromIconSrc,
  extractUserIdFromReactFiber
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

  it('空・空白のみは null', () => {
    expect(parseCommentLineText('')).toBeNull();
    expect(parseCommentLineText('   ')).toBeNull();
  });

  it('番号だけで本文が無いと null', () => {
    expect(parseCommentLineText('12')).toBeNull();
  });

  it('改行だけの本文は null', () => {
    expect(parseCommentLineText('5\n\n')).toBeNull();
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

  it('comment-number が空・不正なら null', () => {
    const mk = (num, txt) => {
      const w = document.createElement('div');
      w.innerHTML = `
        <div class="table-row" role="row" data-comment-type="normal">
          <span class="comment-number">${num}</span>
          <span class="comment-text">${txt}</span>
        </div>`;
      return w.querySelector('.table-row');
    };
    expect(parseNicoLiveTableRow(mk('', 'a'))).toBeNull();
    expect(parseNicoLiveTableRow(mk('  ', 'a'))).toBeNull();
    expect(parseNicoLiveTableRow(mk('abc', 'a'))).toBeNull();
  });

  it('comment-text が空・空白のみなら null', () => {
    const w = document.createElement('div');
    w.innerHTML = `
      <div class="table-row" data-comment-type="normal">
        <span class="comment-number">1</span>
        <span class="comment-text">   </span>
      </div>`;
    expect(parseNicoLiveTableRow(w.querySelector('.table-row'))).toBeNull();
  });

  it('番号が10桁超は拒否（1〜9桁）', () => {
    const w = document.createElement('div');
    w.innerHTML = `
      <div class="table-row" data-comment-type="normal">
        <span class="comment-number">1234567890</span>
        <span class="comment-text">overflow</span>
      </div>`;
    expect(parseNicoLiveTableRow(w.querySelector('.table-row'))).toBeNull();
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

  it('同一番号・同一本文は重複除去', () => {
    const panel = document.createElement('div');
    panel.innerHTML = `
      <div class="table-row" data-comment-type="normal">
        <span class="comment-number">1</span><span class="comment-text">dup</span>
      </div>
      <div class="table-row" data-comment-type="normal">
        <span class="comment-number">1</span><span class="comment-text">dup</span>
      </div>`;
    const list = extractCommentsFromNode(panel);
    expect(list).toHaveLength(1);
  });

  it('.program-recommend-panel 内の li は無視', () => {
    // table-row があるとルート結合 innerText パースをスキップし、ROW_QUERY 経路の除外だけを検証する
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="table-row" data-comment-type="normal">
        <span class="comment-number">1</span><span class="comment-text">本編</span>
      </div>
      <div class="program-recommend-panel"><li>999 おすすめ</li></div>
      <li>1000 本物</li>`;
    const list = extractCommentsFromNode(root);
    const nos = list.map((r) => r.commentNo).sort();
    expect(nos).toContain('1');
    expect(nos).toContain('1000');
    expect(nos).not.toContain('999');
  });

  it('article.program-card 内も無視', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="table-row" data-comment-type="normal">
        <span class="comment-number">1</span><span class="comment-text">本編</span>
      </div>
      <article class="program-card"><li>1 カード</li></article>
      <li>2 通常</li>`;
    const list = extractCommentsFromNode(root);
    const texts = new Set(list.map((r) => r.text));
    expect(texts.has('本編')).toBe(true);
    expect(texts.has('通常')).toBe(true);
    expect(texts.has('カード')).toBe(false);
  });
});

describe('extractUserIdFromReactFiber', () => {
  it('fiber の memoizedProps.userId を取得', () => {
    const el = document.createElement('div');
    el['__reactFiber$test123'] = {
      memoizedProps: { userId: '8765432' },
      return: null
    };
    expect(extractUserIdFromReactFiber(el)).toBe('8765432');
  });

  it('fiber のネストされた comment.userId を取得', () => {
    const el = document.createElement('div');
    el['__reactFiber$abc'] = {
      memoizedProps: { comment: { userId: '1234567' } },
      return: null
    };
    expect(extractUserIdFromReactFiber(el)).toBe('1234567');
  });

  it('親 fiber を遡って userId を発見', () => {
    const el = document.createElement('div');
    el['__reactFiber$xyz'] = {
      memoizedProps: {},
      return: {
        memoizedProps: { data: { hashedUserId: 'abcdefghij1234567890' } },
        return: null
      }
    };
    expect(extractUserIdFromReactFiber(el)).toBe('abcdefghij1234567890');
  });

  it('fiber が無い要素は null', () => {
    const el = document.createElement('div');
    expect(extractUserIdFromReactFiber(el)).toBeNull();
  });

  it('userId が短すぎると無視', () => {
    const el = document.createElement('div');
    el['__reactFiber$short'] = {
      memoizedProps: { userId: '123' },
      return: null
    };
    expect(extractUserIdFromReactFiber(el)).toBeNull();
  });

  it('__reactInternalInstance$ キーでも動作', () => {
    const el = document.createElement('div');
    el['__reactInternalInstance$legacy'] = {
      memoizedProps: { uid: '9988776' },
      return: null
    };
    expect(extractUserIdFromReactFiber(el)).toBe('9988776');
  });

  it('parseNicoLiveTableRow が fiber 経由で userId を返す', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="table-row" role="row" data-comment-type="normal">
        <span class="comment-number">42</span>
        <span class="comment-text">fiber test</span>
      </div>`;
    const row = wrap.querySelector('.table-row');
    row['__reactFiber$fiberKey'] = {
      memoizedProps: { comment: { userId: '5544332' } },
      return: null
    };
    const result = parseNicoLiveTableRow(row);
    expect(result).toEqual({
      commentNo: '42',
      text: 'fiber test',
      userId: '5544332'
    });
  });
});
