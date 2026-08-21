# 実物のDOMを丸ごと採る手順（拡張を足さずに・DevTools だけで）

> ★ユーザー指示(2026-08-21)「まず MCP デベロッパーツールで現在の DOM を全部把握して、
> それを計器に入れる基本から見直すべき」への回答。
> ★**新しい拡張は入れない**。入れると content script が1つ増え、
> いま追っている「メインスレッド停止」を**悪化させうる**。

---

## 0. なぜ画像ではダメか

`DOM Capture` のような拡張が出すのは **見た目の画像(PNG/PDF)**。
★黒い画面を画像で撮っても「黒い」としか分からない（それは既にスクショで判明済み）。

**必要なのは構造と数字**：何個あるか・何が覆っているか・いつ変わったか。
それは **DevTools の Console で1行**で採れる。

---

## 1. サイドパネルの中身を採る（★黒の調査はこれ）

サイドパネルは `sidepanel.html` が `popup.html` を iframe で包む二重構造。
**中身は別文書**なので、DevTools の実行対象を切り替える必要がある。

1. サイドパネルを右クリック →「検証」
2. Console タブを開く
3. ★上部の **`top ▾`** と書かれたドロップダウンで **`popup.html`** を選ぶ
   （これをやらないと外側の `sidepanel.html` を見てしまい、`iframe` しか出ない）
4. 下を貼って Enter

```js
copy(JSON.stringify({
  総要素数: document.getElementsByTagName('*').length,
  タイル: document.getElementsByClassName('nl-story-userlane-cell').length,
  枠だけ: document.getElementsByClassName('nl-story-userlane-cell--hollow').length,
  html属性: [...document.documentElement.attributes].map(a => a.name + '=' + a.value.length + '字'),
  body class: document.body.className,
  中央の重なり: (() => {
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    const out = [];
    for (let c = el, i = 0; c && i < 12; i++, c = c.parentElement) {
      const s = getComputedStyle(c);
      out.push({
        tag: c.tagName + (c.id ? '#' + c.id : '') + (c.className ? '.' + String(c.className).split(' ')[0] : ''),
        bg: s.backgroundColor, opacity: s.opacity, z: s.zIndex, pos: s.position
      });
    }
    return out;
  })()
}, null, 2))
```

★`copy(...)` は**クリップボードに入る**。そのまま貼ってください。

---

## 2. 配信ページ側を採る（`<html>` に何が書かれているか）

watch ページの Console で：

```js
copy([...document.documentElement.attributes]
  .map(a => `${a.name} = ${a.value.length}字`)
  .sort((a, b) => parseInt(b.split('= ')[1]) - parseInt(a.split('= ')[1]))
  .join('\n'))
```

★**どの属性が何字か**が大きい順に出る。
v0.1.1460 で上限を付けた `data-nls-ndgr-unknown-samples` が
本当に小さくなったかは、これで確認できる。

---

## 3. ★黒いその瞬間に採る（いちばん価値が高い）

黒くなってからでは戻っていることがある。**黒い最中**に自動で記録する：

```js
// 貼ったあと放置。黒くなった瞬間の状態が自動で残る。
window.__nlWatch = [];
setInterval(() => {
  const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  const s = el ? getComputedStyle(el) : null;
  window.__nlWatch.push({
    t: new Date().toLocaleTimeString(),
    tag: el ? el.tagName + (el.id ? '#' + el.id : '') : 'なし',
    bg: s ? s.backgroundColor : '',
    要素数: document.getElementsByTagName('*').length
  });
  if (window.__nlWatch.length > 120) window.__nlWatch.shift();
}, 500);

// 黒くなった【あと】にこれを実行して貼る
copy(JSON.stringify(window.__nlWatch, null, 2))
```

★これなら **黒い瞬間の中央の色と要素数**が時系列で残る。

---

## 4. 他の拡張が同居していないか（★「(拡張の外)」の切り分け）

`chrome://extensions` を開き、**有効になっている拡張の名前**を控える。
★ニコ生のページに content script を入れる拡張があれば、
**同じメインスレッドを共有**する＝停止の原因になりうる。

一番速い切り分け：
1. `chrome://extensions` で **このアプリ以外を全部オフ**
2. 黒が出るか試す
3. 出なければ **他の拡張が原因**。1つずつ戻して犯人を特定

★これは**コードを1行も触らずに**答えが出る。
