# 引き継ぎ: 純Web /live-view を 拡張内 応援ライブビューと「まったく同じ」にコピーする

## ⭐ 新チャットへの最重要メッセージ
ユーザーは最初からずっと **「コピー」「同じものにしろ」「1個ずつ足すな」** と言い続けている。
**セクション別 paint（per-section mirror）方式は廃止が確定。** 次にやるのは下の【確定1案】の実装だけ。
会議ハーネスで4体回し、司令塔が実コードで裏取りして1案に収束済み。設計はもう固まっている＝**実装に入ってよい**。

- 確定設計の正本: [council/confirm-copy-SYNTHESIS.md](council/confirm-copy-SYNTHESIS.md)（会議統合＋裏取り）
- 方針の正本: [memory/reference_liveview_popup_wholesale_copy.md](memory/reference_liveview_popup_wholesale_copy.md)（冒頭の★★最終確定方針★★を読む）
- 会議の生データ: council/confirm-copy-answers.json / -stdout.txt / -question.txt

---

## 確定1案（丸ごとHTML鏡方式＝真のコピー）

**popup が今描いている `.nl-main` の outerHTML を【1スナップショット】で publish → 純Web は `#nl-main` に貼るだけ。**
全セクションが同時・同一・鮮度1つ＝per-section の「揃わない」を構造的に根絶。

### なぜ per-section がダメだったか（実データで確定）
各鏡(laneMirror/statCardsMirror/northStarMirror/topSupporters)が【別々のタイミング・別々の鮮度】で送られるため
純Webで「数字カードは17分前で鮮度切れ・応援者ランキングは未送信・りんく段が空」のように**永久に揃わない**。
1個ずつ paint を足すほど穴が増える。これがユーザーの「ひどい」の正体。

### 司令塔の裏取り（実コードで確認済み・これを前提に実装してよい）
1. **inline style はほぼ無い** = タイル/レーンは完全に class 駆動（personTileDom.js・renderStoryUserLaneDom.js は `.style` 0件）。
   例外は paintTopSupportRankStyleIntoElement.js の1箇所 `style="--nl-rank-accent:<色>"` だけ。
   → sanitize は **class 全保持＋style は CSS変数(--nl-*)と color/background-color だけ許可**で足りる。複雑な whitelist 不要。
   → 純Web の app/live-view.html は popup.html 丸ごとコピー＝`<style>` が全部ある。class さえ残れば CSS で同一に描ける。
2. **`<a href>` 許可が必要** = personTileDom.js:65 が `cell.href = userPageUrl`。既存 sanitizeMirrorHtml は href 全削除＝
   タイルが非クリックになる。丸ごと sanitize は **href を http/https のみ許可**(javascript:/data: は削る)。
3. **画像は解決済み** = app/live-view.html に `<base href="/app/">` と `<meta name=referrer content=no-referrer>` 注入済み。
   相対 images/... は /app/images/ に解決、cross-origin 顔画像(secure-dcdn)と data:image/svg(匿名identicon)は絶対値でそのまま出る。
4. **サイズは関門でない** = per-section データで45KB。丸ごとHTML 推定100〜200KB。Upstash(MB級)/Vercel(body 4.5MB)に余裕。
   レーン48・ランキング10 で cap 済み描画を撮る＝肥大は構造上抑制。超える兆候が出たら gzip/段cap を後置。
5. **popup.js は純Webで不要化できる** = HTML を貼るだけ。但し app/live-view.html(popup コピー)は初期ロード幕
   #nlInitialLoadShade と利用規約ゲート #usageTermsGate を持つ＝**軽い JS で幕を外し/ゲートを隠す処理だけ残す**。
6. **鮮度は1つ** = domMirror に capturedAt 1つ。純Web は3分ガードで終わった配信の残骸を隠す（全体に効く）。

### 実装骨子（この順で）
**A. 拡張側（publish）**
- 新 `src/lib/sanitizeFullHtml.js`（既存 sanitizeMirrorHtml は触らない・小フラグメント用のまま）:
  - 許可タグ: 構造(div/section/header/footer/main/aside/ul/ol/li/span/p/small/strong/em/b/i/h1-h4)＋`a`＋`img`＋`button`＋SVG一式。
  - 許可属性: class,id,role,aria-*,data-*,title,alt,src,width,height,loading,decoding,referrerpolicy＋`a`の href(http/https)＋
    `style`は `--nl-*` CSS変数 と color/background-color のみ。
  - 削除: script/iframe/object/embed/style(タグ)/link/meta/base, on*, 危険protocol(javascript:/data:href)。
    ★`[hidden]` は**残す**(popup の hidden セクションはそのまま hidden で来る＝余計な物を出さない)。data:image/svg は**許可**(identicon)。
    id は nonce rename(既存同様・衝突防止)。
  - unit test: script/on*/危険href を削る・a href http許可・class保持・style は CSS変数のみ・[hidden]保持・data:svg許可。
- publish 経路: 公開ボタン押下時(or status の publish タイミング)に **publish 直前に最新描画を1回確定**してから
  `.nl-main` の outerHTML を sanitizeFullHtml→`KEY_LIVEVIEW_DOM_MIRROR`(新キー)へ。status が jsonBlob に
  `domMirror:{ html, liveId, capturedAt }` を1つ相乗り。per-section 鏡の送信は当面残してよいが純Webは使わない。
  - ★publish 取得は記録の心臓部に近い＝慎重に。各段で実データ突合。

**B. 純Web側 app/live-view.js = 「貼るだけ」に作り直し**
- per-section paint(paintStatCardsMirror/paintLaneMirror/paintNorthStarMirror/paintSupporterRanking)と
  chromeシム＋本物 popup-entry の dynamic import を**全廃**。
- ?v= で GET → domMirror.capturedAt 鮮度ガード(3分) → domMirror.html を `#nl-main`(or `.nl-main`) に innerHTML 注入 →
  初期ロード幕/ゲートを隠す軽い処理 → 60秒ポーリングで再GET&再注入(前回HTMLと同一なら skip＝白フラッシュ防止)。
- build.mjs の app/live-view.js ターゲットは esm/define そのままでよい（popup-entry を import しなくなるなら define 不要になる可能性）。

**C. 確実化**
- 1つのHTML・1つの鮮度・1回の注入＝セクション差/欠落が原理的に起きない。
- 実機: ローカル http + 本番 domMirror で「左(拡張)と右(純Web)が全体一致」を Chrome DevTools で目視。piece-by-piece でなく全体で見る。

### 会議で不採用（理由つき）
- DOMPurify 導入(llama-3.3) → 依存ゼロ方針に反する。自前 sanitizeFullHtml で足りる。
- style 広域 CSS-property whitelist(gpt-oss) → 過剰。実コードで inline style ほぼ無い。
- video/audio/form 許可(gpt-oss) → popup に無い＝攻撃面を増やさない。
- data: 画像一律禁止(gpt-oss) → 補正: data:image/svg は許可(identicon)、href の data: だけ禁止。

---

## 今セッションで push 済み（master・v0.1.942〜947・全て per-section 方式＝丸ごとHTML移行時に撤去予定）
- v0.1.942 純Web /live-view を popup 丸ごとコピー(app/live-view.html)＋chromeシムで本物 popup-entry 起動
- v0.1.943 「WEBサイトURLで共有」が popup そっくりの /live-view を開く(自動オープン先を liveViewUrl に)
- v0.1.944 共有結果に「✓これが そっくりの画面URLです」+URL大表示+開く/コピー。**build が .env を読む(process.loadEnvFile)＝空キービルド防止**
- v0.1.945 応援ライブビュー上に「🌐 このURLをWEBでも公開する」ボタン(KEY_LIVEVIEW_PUBLISH_PAYLOAD で status→live-view 中継)
- v0.1.946 過去ログ取得のローディング/固着誤検知を改善(ndgrBackfillCrawl で seed/seek 中に bridging yield)
- v0.1.947 純Web に応援者ランキング+ギフト貢献度を本物 strip 描画(renderTopSupportRankStripInto)で表示
  ※v0.1.947 の per-section paint は丸ごとHTML方式に移行したら撤去する。

## ★解決済みの重要インフラ事項（再発防止）
- **WEB公開 401 解決**: Vercel の env `STATUS_INGEST_KEY` が .env と不一致だった。vercel CLI(ログイン info-44441025)で
  プロジェクト **tsuioku-no-kirameki-com-i5pp**(app.tsuioku-no-kirameki.com を配信)の Production を .env 値に揃え＋
  `vercel deploy --prod`。今は一致(401解消)。Preview 環境は未変更=Preview で401出たら同様に揃える。
- **build は .env を自動で読む**ようになった(v0.1.944)。空キービルドだと status 共有ボタンが出ない/効かないので注意。
- dist/status.js には共有キーが焼かれる＝コミット対象(既存 HEAD と同じ運用・ユーザー承認済み)。git add で classifier が止めるので
  ユーザー承認のもと dangerouslyDisableSandbox で staging する運用。

## ★取り込み(コメント記録)の別件（今回 push 済み＋未解決）
- 真因確定: **6配信を同時に開くと裏タブの過去ログ一括取得(backfill)が設計上押さえられる**(429/負荷防止)。
  `maybeRearmBackfillForGapCatchup` が `document.visibilityState!=='visible'` で return(content-entry.js:16207)＝裏タブは起動しない。
  → **1配信だけ前面で開けば103%取得を実機確認済み**。多タブ同時で全部一気に取りたい要望は別タスク(task_bc8b1f5d)。
- 表示「記録N」が実保存に追従しない件(status-entry.js:1788 が panel_summary を読む)も別途。

## 反映3手順（毎回ユーザーに伝える）
1. git pull(司令塔が代わりにやる＝feedback_always_reflect_to_browser) → 2. chrome://extensions リロード(🔄) → 3. watch タブ F5。
拡張変更は push だけでは届かない。純Web は Vercel push 連動デプロイ。copy:ext で C:\nicolive-ext にも反映する。

## 最重要の戒め（今セッションでユーザーに何度も叱られた）
- **「コピー」=1個ずつ足すな。同じものでないとひどい。** 丸ごとHTML方式が唯一の正解。
- **実機で確認するまで「できた」と言うな。** popup の【操作の動作】(ボタンを押した結果)は表示だけでなく実機で見る。
  ⚠私のツールでは chrome-extension:// ページを開けない(Chrome がブロック)＝拡張のボタン動作は私が直接見られない。
  確認が要るときは「診断JSON/AI共有用コピー」をユーザーに貼ってもらう、が確実。
- ユーザーの実機環境(watch タブ/backfill)を勝手に navigate して触らない。
