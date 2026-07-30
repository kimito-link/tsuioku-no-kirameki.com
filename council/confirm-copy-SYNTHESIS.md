# 会議 統合（司令塔 Claude が裏取りして1案に収束）: 「確実にコピーする」

お題: 拡張内の応援ライブビュー(popup を iframe で丸ごと=完璧)と「まったく同じ画面」を、純Web公開ページに【確実にコピー】する最善策。
会議: `node scripts/meeting.mjs council/confirm-copy-question.txt`（COUNCIL_QUALITY=1・4体・批判2/修正/統合）。成功4/4。
生データ: council/confirm-copy-answers.json / -stdout.txt / -log.txt。

## 会議の一致（4/4）
**丸ごと HTML 鏡方式で進める。** popup が今描いている `.nl-main` の outerHTML を【1スナップショット】で publish→純Web は
`#nl-main` に貼るだけ。全セクションが同時・同一・鮮度1つ＝per-section の「揃わない」を構造的に根絶。実装は最小（取得→POST
→GET→innerHTML、コア数十行）。popup.js を純Web で動かす必要は無くなる（HTML を貼るだけ）。sanitize は丸ごと用に別モジュール化
（既存 sanitizeMirrorHtml は小フラグメント用のまま残す）。

## 司令塔の裏取り（実コードで確認・会議の誤り/過剰を補正）

1. **inline style 依存はほぼ無い（会議の「style 全許可 CSS-property whitelist」は過剰）**
   - personTileDom.js: `.style`/`style=` 0件。renderStoryUserLaneDom.js: 0件。タイル/レーンは【全部 class 駆動】。
   - 例外は paintTopSupportRankStyleIntoElement.js の **1箇所だけ**: `style="--nl-rank-accent:<color>"`(順位アクセント色の CSS変数)。
   - ⇒ **sanitize は「class 全部保持＋style は CSS変数/安全な色だけ許可」で足りる**。複雑な CSS-property whitelist は不要。
   - 根拠: 純Web の app/live-view.html は popup.html 丸ごとコピー＝`<style>`(CSS)が全部ある。class さえ残れば CSS で同一に描ける。
2. **`<a href>`(ユーザーページリンク)を許可する必要がある（既存 sanitize は href 全削除＝タイルが非クリックになる）**
   - personTileDom.js:65 が `cell.href = pageUrl`(https://www.nicovideo.jp/user/…)。丸ごと sanitize は **href を http/https のみ許可**(javascript:/data: は削る)。
3. **画像: `<base href="/app/">` は既に app/live-view.html に注入済み**＝注入HTML内の相対 `images/...` は `/app/images/...` に解決される。
   - cross-origin 顔画像(secure-dcdn)は **絶対URL**なので base 無関係＝そのまま出る（referrerpolicy=no-referrer の meta も注入済みでhotlink回避）。
   - data:svg(匿名 identicon)も絶対値＝そのまま。⇒ 画像は base+既存meta で解決済み。追加対応ほぼ不要。
4. **サイズは関門にならない**: per-section データで45KB。丸ごとHTML は会議推定100〜200KB。Upstash 値は MB級可・Vercel body 4.5MB＝余裕。
   - 念のため publish 時に「件数 cap 済みの描画(レーン48・ランキング10)」を撮る＝肥大は構造上抑制済み。超える兆候が出たら gzip/段cap を後置。
5. **popup.js は純Web で不要化できる**: HTML を貼るだけなら chrome シム＋本物 popup-entry 起動は撤去可。
   - 但し app/live-view.html(popup.html コピー)は初期ロード幕(#nlInitialLoadShade)と利用規約ゲート(#usageTermsGate)を持つ＝**軽い JS で
     幕を外し/ゲートを隠す**処理だけ残す(popup.js 全体は要らない)。
6. **鮮度・取りこぼし**: domMirror に capturedAt 1つ。純Web は3分ガードで終わった配信の残骸を隠す（1つで全体に効く＝per-section の鮮度バラけ解消）。
   - publish は「公開ボタン押下時に最新描画を1回確定してから .nl-main を撮る」＝薄いスナップショット防止。

## 最終1案（確実版・実装骨子）

### A. 拡張側（publish）
- 新 `src/lib/sanitizeFullHtml.js`（既存 sanitizeMirrorHtml はそのまま）:
  - 許可タグ: 構造(div/section/header/footer/main/aside/ul/ol/li/span/p/small/strong/em/b/i/h1-h4)＋`a`＋`img`＋`button`＋SVG一式。
  - 許可属性: `class,id,role,aria-*,data-*,title,alt,src,width,height,loading,decoding,referrerpolicy`＋`a`の`href`(http/https のみ)＋
    `style`は **`--nl-*` CSS変数と `color/background-color` のみ**(それ以外の style プロパティは捨てる)。
  - 削除: `script,iframe,object,embed,style(タグ),link,meta,base` / `on*` / 危険protocol(javascript:/data:href) / `[hidden]`は**残す**
    (popup の hidden セクションはそのまま hidden で来る＝純Web でも hidden＝余計な物を出さない)。id は衝突防止に nonce rename(既存同様)。
- publish 経路: 公開ボタン押下時(または status の publish タイミング)で `.nl-main` の outerHTML を sanitizeFullHtml→
  `KEY_LIVEVIEW_DOM_MIRROR`(新)へ。status が jsonBlob に `domMirror:{ html, liveId, capturedAt }` として1つ相乗り。
  ※ per-section の鏡(laneMirror/statCardsMirror/northStarMirror/topSupporters)送信は**当面残してよい**が、純Web は使わなくなる。
- ★publish 直前に「該当 live の最新描画を1回確定」してから撮る(薄いスナップショット防止)。

### B. 純Web側（app/live-view.js）= 「貼るだけ」に作り直し
- per-section paint(paintStatCardsMirror/paintLaneMirror/paintNorthStarMirror/paintSupporterRanking)と
  chrome シム＋本物 popup-entry の dynamic import を**全廃**。
- やること: ?v= で GET → `domMirror.capturedAt` 鮮度ガード(3分) → `domMirror.html` を `#nl-main`(or .nl-main) に innerHTML 注入 →
  初期ロード幕/利用規約ゲートを隠す軽い処理 → 60秒ポーリングで再GET&再注入(diff-skip で白フラッシュ防止)。
- 配信者カード/数字カード/応援レーン/北極星/応援者ランキングは domMirror に**全部入っている**＝1回の注入で同時に出る。

### C. 移行・確実化
- 失敗の構造的根絶: 「1つのHTML・1つの鮮度・1回の注入」＝セクションごとのタイミング差/欠落が**原理的に起きない**。
- テスト: sanitizeFullHtml の unit test(script/on*/危険href を削る・a href http許可・class保持・style は CSS変数のみ・[hidden]保持)。
- 実機: ローカル http + 本番 domMirror で「左(拡張)と右(純Web)が同一」を Chrome DevTools で目視＋ piece-by-piece でなく全体一致を確認。

## 会議で出た不採用/補正
- 「DOMPurify を入れる」(llama-3.3) → 不採用。プロジェクトはランタイム依存ゼロ方針。自前 sanitizeFullHtml で足りる(既存 sanitizeMirrorHtml の拡張版)。
- 「style を CSS-property whitelist で広く許可」(gpt-oss) → 過剰。実コードで inline style はほぼ無い＝CSS変数+色だけで足りる。
- 「video/audio/form 許可」(gpt-oss) → popup に無い＝許可しない(攻撃面を増やさない)。
- 「data: 画像を一律禁止」(gpt-oss) → 補正: 匿名 identicon が data:image/svg＝**data:image/svg+xml は許可**(href の data: だけ禁止)。

## 次の一手
この1案で実装する。記録の心臓部(publish 取得)は慎重に・各段で実データ突合。app/live-view.js は per-section を撤去し「貼るだけ」へ。
