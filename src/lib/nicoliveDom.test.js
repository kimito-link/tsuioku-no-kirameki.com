/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import {
  parseCommentLineText,
  parseCommentElement,
  parseNicoLiveTableRow,
  closestHarvestableNicoCommentRow,
  extractCommentsFromNode,
  extractUserIdFromLinks,
  extractUserIdFromDataAttributes,
  extractUserIdFromOuterHtml,
  extractUserIdFromIconSrc,
  extractUserIconUrlFromElement,
  extractUserIdFromReactFiber,
  resolveUserIdForNicoLiveCommentRow,
  NICO_USER_ICON_IMG_LAZY_ATTRS,
  collectNicoUserIconUrlPartsFromImg,
  absoluteNicoUserIconFromImg
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

  it('プロフィールリンクの title から nickname を拾う', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="table-row" role="row" data-comment-type="normal">
        <a class="user-link" href="https://www.nicovideo.jp/user/12345678" title="表示テスト名">icon</a>
        <span class="comment-number">12</span>
        <span class="comment-text">本文です</span>
      </div>`;
    const row = wrap.querySelector('.table-row');
    expect(parseNicoLiveTableRow(row)).toEqual({
      commentNo: '12',
      text: '本文です',
      userId: '12345678',
      nickname: '表示テスト名'
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

  it('番号は1〜18桁まで受理（長時間配信の commentNo）、19桁以上は拒否', () => {
    const ok = document.createElement('div');
    ok.innerHTML = `
      <div class="table-row" data-comment-type="normal">
        <span class="comment-number">1234567890</span>
        <span class="comment-text">ten digits</span>
      </div>`;
    expect(parseNicoLiveTableRow(ok.querySelector('.table-row'))).toEqual({
      commentNo: '1234567890',
      text: 'ten digits',
      userId: null
    });
    const ok13 = document.createElement('div');
    ok13.innerHTML = `
      <div class="table-row" data-comment-type="normal">
        <span class="comment-number">1234567890123</span>
        <span class="comment-text">13 digits</span>
      </div>`;
    expect(parseNicoLiveTableRow(ok13.querySelector('.table-row'))).toEqual({
      commentNo: '1234567890123',
      text: '13 digits',
      userId: null
    });
    const bad = document.createElement('div');
    bad.innerHTML = `
      <div class="table-row" data-comment-type="normal">
        <span class="comment-number">1234567890123456789</span>
        <span class="comment-text">too long</span>
      </div>`;
    expect(parseNicoLiveTableRow(bad.querySelector('.table-row'))).toBeNull();
  });

  it('generalSystemMessage でも comment-number が空なら null', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="table-row" data-comment-type="generalSystemMessage">
        <span class="comment-number"></span>
        <span class="comment-text">「雑談」が好きな1人が来場しました</span>
      </div>`;
    expect(parseNicoLiveTableRow(wrap.querySelector('.table-row'))).toBeNull();
  });

  it('generalSystemMessage で番号・本文が取れれば抽出する', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="table-row" role="row" data-comment-type="generalSystemMessage">
        <span class="comment-number">535</span>
        <span class="comment-text">「料理」が好きな1人が来場しました</span>
      </div>`;
    expect(parseNicoLiveTableRow(wrap.querySelector('.table-row'))).toEqual({
      commentNo: '535',
      text: '「料理」が好きな1人が来場しました',
      userId: null
    });
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

  it('遅延: data-lazy-src のみでも avatarUrl と userId を拾う', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="table-row" role="row" data-comment-type="normal">
        <img alt="" src="" data-lazy-src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/10000111.jpg">
        <span class="comment-number">3</span>
        <span class="comment-text">lazy</span>
      </div>`;
    const row = wrap.querySelector('.table-row');
    expect(parseNicoLiveTableRow(row)).toEqual({
      commentNo: '3',
      text: 'lazy',
      userId: '10000111',
      avatarUrl:
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/10000111.jpg'
    });
  });
});

describe('closestHarvestableNicoCommentRow', () => {
  it('IMG から番号・本文付き table-row に辿る', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="table-row" role="row" data-comment-type="generalSystemMessage">
        <img src="" alt="">
        <span class="comment-number">12</span>
        <span class="comment-text">sys</span>
      </div>`;
    const img = wrap.querySelector('img');
    const row = wrap.querySelector('.table-row');
    expect(closestHarvestableNicoCommentRow(/** @type {Element} */ (img))).toBe(row);
  });

  it('comment-number が無い行は null', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="table-row" role="row" data-comment-type="generalSystemMessage">
        <span class="comment-text">only text</span>
      </div>`;
    const el = wrap.querySelector('.comment-text');
    expect(closestHarvestableNicoCommentRow(/** @type {Element} */ (el))).toBeNull();
  });
});

describe('NICO_USER_ICON_IMG_LAZY_ATTRS / collectNicoUserIconUrlPartsFromImg', () => {
  it('定数に列挙した属性は collect で拾われる（MutationObserver.attributeFilter と同期）', () => {
    const icon =
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/10000222.jpg';
    const img = document.createElement('img');
    for (const a of NICO_USER_ICON_IMG_LAZY_ATTRS) {
      img.setAttribute(a, `${icon}?via=${a}`);
    }
    const parts = collectNicoUserIconUrlPartsFromImg(img);
    for (const a of NICO_USER_ICON_IMG_LAZY_ATTRS) {
      expect(parts).toContain(`${icon}?via=${a}`);
    }
  });
});

describe('absoluteNicoUserIconFromImg', () => {
  const base = 'https://live.nicovideo.jp/watch/lv1';
  const iconUrl =
    'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/10000333.jpg';

  it('小さい表示サイズの img は usericon URL を返す', () => {
    const img = document.createElement('img');
    img.setAttribute('src', iconUrl);
    vi.spyOn(img, 'getBoundingClientRect').mockReturnValue({
      width: 32,
      height: 32,
      top: 0,
      left: 0,
      bottom: 32,
      right: 32,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    expect(absoluteNicoUserIconFromImg(img, base)).toBe(iconUrl);
  });

  it('横幅または高さが 96px 超の img は usericon とみなさない（巨大画像の誤検知抑制）', () => {
    const img = document.createElement('img');
    img.setAttribute('src', iconUrl);
    vi.spyOn(img, 'getBoundingClientRect').mockReturnValue({
      width: 120,
      height: 40,
      top: 0,
      left: 0,
      bottom: 40,
      right: 120,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    expect(absoluteNicoUserIconFromImg(img, base)).toBe('');
  });
});

describe('extractUserIdFromIconSrc', () => {
  it('usericon パスから末尾のユーザーID', () => {
    const d = document.createElement('div');
    d.innerHTML =
      '<img src="https://x/nicoaccount/usericon/s/12/12345678.jpg">';
    expect(extractUserIdFromIconSrc(d)).toBe('12345678');
  });

  it('src が空でも data-src からユーザーID（遅延読み込み）', () => {
    const d = document.createElement('div');
    d.innerHTML =
      '<img alt="" src="" data-src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/99999111.jpg">';
    expect(extractUserIdFromIconSrc(d)).toBe('99999111');
  });

  it('img が無くても background-image の usericon URL からユーザーID', () => {
    const d = document.createElement('div');
    d.innerHTML =
      '<div class="avatar" style="background-image:url(https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/55/55667788.jpg)"></div>';
    expect(extractUserIdFromIconSrc(d)).toBe('55667788');
  });
});

describe('extractUserIconUrlFromElement', () => {
  it('src が空でも srcset から nicoaccount URL を拾う', () => {
    const d = document.createElement('div');
    d.innerHTML =
      '<img alt="" src="" srcset="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/12345.jpg 1x">';
    expect(
      extractUserIconUrlFromElement(
        d,
        'https://live.nicovideo.jp/watch/lv1'
      )
    ).toBe('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/12345.jpg');
  });

  it('相対 src を base で絶対化', () => {
    const d = document.createElement('div');
    d.innerHTML =
      '<img src="/nicoaccount/usericon/1/12345.jpg" alt="">';
    expect(
      extractUserIconUrlFromElement(
        d,
        'https://live.nicovideo.jp/watch/lv123'
      )
    ).toBe('https://live.nicovideo.jp/nicoaccount/usericon/1/12345.jpg');
  });

  it('表示サイズが 96px 超の img はスキップ', () => {
    const d = document.createElement('div');
    d.innerHTML =
      '<img src="https://x/nicoaccount/usericon/s/1/2.jpg" width="120" height="120">';
    const img = d.querySelector('img');
    expect(img).toBeTruthy();
    vi.spyOn(
      /** @type {HTMLElement} */ (img),
      'getBoundingClientRect'
    ).mockReturnValue({
      width: 120,
      height: 120,
      top: 0,
      left: 0,
      bottom: 120,
      right: 120,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    expect(
      extractUserIconUrlFromElement(/** @type {Element} */ (d), 'https://x/')
    ).toBe('');
  });

  it('img が無くても style の background-image から取得', () => {
    const d = document.createElement('div');
    d.innerHTML =
      '<div style="background-image:url(https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/7/7654321.jpg)"></div>';
    expect(
      extractUserIconUrlFromElement(
        d,
        'https://live.nicovideo.jp/watch/lv1'
      )
    ).toBe('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/7/7654321.jpg');
  });

  it('usericon パターン外でも avatar らしい小画像を拾う', () => {
    const d = document.createElement('div');
    d.innerHTML =
      '<img class="user-avatar" src="https://img.cdn.example.com/profile/avatar_abc123.png" width="24" height="24" alt="">';
    expect(
      extractUserIconUrlFromElement(
        d,
        'https://live.nicovideo.jp/watch/lv1'
      )
    ).toBe('https://img.cdn.example.com/profile/avatar_abc123.png');
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

  it('コメント番号が 12 桁超でも table-row を抽出する', () => {
    const row = document.createElement('div');
    row.className = 'table-row';
    row.setAttribute('role', 'row');
    row.innerHTML =
      '<span class="comment-number">1234567890123</span><span class="comment-text">高桁</span>';
    const list = extractCommentsFromNode(row);
    expect(list).toEqual([
      { commentNo: '1234567890123', text: '高桁', userId: null }
    ]);
  });

  it('コメントパネル内の table-row を抽出（実DOMに近い）', () => {
    const panel = document.createElement('div');
    panel.className = 'comment-panel ga-ns-comment-panel';
    panel.innerHTML = `
      <div class="table" role="rowgroup">
        <div class="table-row" role="row" data-comment-type="normal">
          <span role="gridcell">
            <img src="https://cdn.nimg.jp/nicoaccount/usericon/s/1/999.jpg" width="24" height="24" alt="">
            <span class="comment-number">756</span>
            <div class="content-area"><span class="comment-text">京都</span></div>
          </span>
        </div>
        <div class="table-row" role="row" data-comment-type="generalSystemMessage">
          <span role="gridcell">
            <span class="comment-number">757</span>
            <div class="content-area"><span class="comment-text">システム告知</span></div>
          </span>
        </div>
      </div>`;
    const list = extractCommentsFromNode(panel);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      commentNo: '756',
      text: '京都',
      avatarUrl: 'https://cdn.nimg.jp/nicoaccount/usericon/s/1/999.jpg'
    });
    expect(list[1]).toMatchObject({
      commentNo: '757',
      text: 'システム告知',
      userId: null
    });
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

  it('comment-data-grid ラッパーの結合テキストをコメントとして誤抽出しない', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="comment-data-grid">
        <div class="table-row" data-comment-type="normal">
          <span class="comment-number">2467</span><span class="comment-text">a</span>
        </div>
        <div class="table-row" data-comment-type="normal">
          <span class="comment-number">2468</span><span class="comment-text">b</span>
        </div>
      </div>`;
    const list = extractCommentsFromNode(root);
    expect(list).toEqual([
      { commentNo: '2467', text: 'a', userId: null },
      { commentNo: '2468', text: 'b', userId: null }
    ]);
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

describe('resolveUserIdForNicoLiveCommentRow', () => {
  it('親要素の React fiber userId は参照しない（配信者コンテキストの誤検知防止）', () => {
    const parent = document.createElement('div');
    parent['__reactFiber$parent'] = {
      memoizedProps: { userId: '11111111' },
      return: null
    };
    const row = document.createElement('div');
    row.className = 'table-row';
    row.setAttribute('data-comment-type', 'normal');
    row.innerHTML =
      '<span class="comment-number">1</span><span class="comment-text">a</span>';
    parent.appendChild(row);
    expect(resolveUserIdForNicoLiveCommentRow(row)).toBe(null);
  });

  it('行ルートはスキップし、行内子の fiber userId を採用', () => {
    const row = document.createElement('div');
    row.className = 'table-row';
    row.setAttribute('data-comment-type', 'normal');
    row['__reactFiber$shell'] = {
      memoizedProps: { userId: '11111111' },
      return: null
    };
    const cell = document.createElement('span');
    cell.className = 'content-area';
    cell.innerHTML =
      '<span class="comment-number">2</span><span class="comment-text">b</span>';
    cell['__reactFiber$cell'] = {
      memoizedProps: { userId: '87654321' },
      return: null
    };
    row.appendChild(cell);
    expect(resolveUserIdForNicoLiveCommentRow(row)).toBe('87654321');
  });

  it('行内子の fiber が行ルートへ return しても祖先 userId は採用しない', () => {
    const row = document.createElement('div');
    row.className = 'table-row';
    row.setAttribute('data-comment-type', 'normal');
    row['__reactFiber$row'] = {
      memoizedProps: { userId: '11111111' },
      return: null
    };
    const cell = document.createElement('span');
    cell.className = 'content-area';
    cell.innerHTML =
      '<span class="comment-number">3</span><span class="comment-text">c</span>';
    cell['__reactFiber$cell'] = {
      memoizedProps: {},
      return: row['__reactFiber$row']
    };
    row.appendChild(cell);
    expect(resolveUserIdForNicoLiveCommentRow(row)).toBe(null);
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

  it('parseNicoLiveTableRow が行内子の fiber 経由で userId を返す', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="table-row" role="row" data-comment-type="normal">
        <span class="content-area">
          <span class="comment-number">42</span>
          <span class="comment-text">fiber test</span>
        </span>
      </div>`;
    const row = wrap.querySelector('.table-row');
    const cell = wrap.querySelector('.content-area');
    cell['__reactFiber$fiberKey'] = {
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

  it('parseNicoLiveTableRow が行内子の fiber 経由で nickname を返す', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="table-row" role="row" data-comment-type="normal">
        <span class="content-area">
          <span class="comment-number">43</span>
          <span class="comment-text">nick fiber</span>
        </span>
      </div>`;
    const row = wrap.querySelector('.table-row');
    const cell = wrap.querySelector('.content-area');
    cell['__reactFiber$fiberKey'] = {
      memoizedProps: {
        comment: { userId: '5544332', name: 'fiber表示名テスト' }
      },
      return: null
    };
    const result = parseNicoLiveTableRow(row);
    expect(result).toEqual({
      commentNo: '43',
      text: 'nick fiber',
      userId: '5544332',
      nickname: 'fiber表示名テスト'
    });
  });
});
