# 拡張 bump チェックリスト — popup が出ない事故を防ぐ 4 ステップ

> 単独運営者向けの操作手順。「定期的に POP がでない」と感じたときに
> 順に潰す。だいたい **手順 4 の watch タブ F5 漏れ**が真因。

## 完全 4 ステップ

bump（version + 機能変更）を ship するときは **必ずこの順で**:

### 1. ローカル整合チェック

```bash
npm run verify:bump
```

これで以下を自動検証:
- manifest.json の version が valid
- `extension/dist/{popup,content,page-intercept}.js` が存在し非空
- dist の build 時刻が manifest より新しい（build 忘れ検出）
- popup.js に必要な popup-entry シンボルが含まれる
- flamboyant worktree が同じ commit にいる + dist がバイト一致

**1 件でも失敗したら ship しない。**

### 2. push と flamboyant 同期

```bash
git push origin HEAD
# 別ターミナルで
git -C "<flamboyant 絶対パス>" fetch origin <my-branch>
git -C "<flamboyant 絶対パス>" merge --ff-only FETCH_HEAD
```

その後もう一度 `npm run verify:bump` で確認すると安心。

### 3. Chrome の拡張更新

`chrome://extensions` を開いて、この拡張のカード右下の **更新** ボタン
（リロードアイコン）をクリック。

manifest.json と dist/{popup,content,page-intercept}.js が読み直される。

### 4. ★ 開いている watch タブを F5 リロード

**ここを忘れがち**。Chrome MV3 の仕様で、拡張更新だけでは
**既存タブには content script が再注入されない**。

ニコ生 watch ページを開いていたタブを **F5（または Ctrl+R）** でリロード
すると、新しい content.js が注入されて inline panel が出る。

## 「POP がでない」報告を受けたときの調査順

1. `chrome-extension://<拡張 ID>/popup.html` を URL バーに直接入力 → 開く
   - **動く** → popup-entry.js は無罪。手順 4 を疑う
   - **動かない** → JS 起動段階のバグ。dist 不整合 / Chrome キャッシュ
2. ニコ生 watch タブの URL バーが `https://live.nicovideo.jp/watch/lv...` か確認
   - 違うページ（ランキング・トップ・終了済み配信）→ inline panel 出ないのが正
3. その watch タブを F5 リロード → 出れば手順 4 漏れで確定
4. それでも出ないなら、その watch タブで DevTools → Console で
   `nls-inline-popup-host` を含むエラーがないか確認

## 「リロードしてもバージョンかわらない」を受けたときの調査順

1. `npm run verify:bump` で dist と flamboyant の同期状況を確認
   - flamboyant の HEAD が違う → 手順 2 漏れ
   - flamboyant の dist がバイト不一致 → flamboyant で `npm run build` 必要
2. Chrome の拡張カードの「ID」を確認、その ID で
   `chrome-extension://<ID>/manifest.json` を開いて version を確認
   - 古い → Chrome の更新ボタン押下漏れ
3. それでも古い → 拡張を **削除** して **パッケージ化されていない拡張機能を
   読み込む** で flamboyant の `extension/` ディレクトリを再指定
4. それでもダメ → Chrome 自体を再起動

## 例外: ip 系 niconico ドメイン

content_scripts の matches は `https://*.nicovideo.jp/*`。
`live.nicovideo.jp` 以外の niconico ドメイン（`sp.live.nicovideo.jp` 等）でも
`/watch/` を含めば動く。逆に `nicovideo.jp` の動画ページは inline panel
の対象外（live のみ）。

## 関連メモリ

- `feedback_extension_build_required.md` — 0.1.94 build 忘れ事故
- `feedback_extension_reload_includes_tab_refresh.md` — 0.1.101 タブ F5 漏れ事故
