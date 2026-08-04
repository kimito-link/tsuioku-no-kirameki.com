# SYNTHESIS: 応援ライブビューを純Web(レスポンシブ)でサーバー公開する

会議4体(批判 qwen3-32b / 統括 gemma / 発散 qwen3.5-122b / 爆速 llama)+ 司令塔の実コード裏取りで確定。
全員一致で **案1(鏡スナップショット送信 + 純Web再描画)**。

## ユーザー確定事項(尊重・蒸し返さない)
- 個人情報の懸念はクリア(ニコ生コメント/ユーザーは公開情報・コメビュ文化・OSINT 範囲)=外部公開して問題ない。
- レスポンシブ1枚で PC/スマホ共通。
- 「そっくり(popup の見た目)」は妥協不可。

## 採用 = 案1(鏡スナップショット送信 + 純Web再描画)
理由(会議+裏取り): 本物の描画関数 paintStoryUserLaneDomFilled / buildPersonTileEl が chrome 非依存=
純Webでそのまま import して描ける。lane mirror スナップショットが既に顔/名前込みの純データ。status Web版
(app/app.js)と同じ綺麗なパターンに乗る=実装/保守コスト最小・drift しない。
- 案2(HTML文字列送信)却下=popup CSS は狭い幅前提でPC で崩れる・HTML 信頼性が脆い。
- 案3(サーバー版popup派生ビルド/SSR)却下=chrome.* 181箇所の置換・新技術スタックで逸脱大。

## 司令塔の裏取り(=会議が挙げた2大リスクは既に解決済み)
会議全員が「①アバターが純Webで出るか(CDN referrer/hotlink) ②popup の幅前提がレスポンシブで崩れないか」を
最大リスクに挙げた。実コードで確認:
- ✅ **①は解決済み**: src/lib/personTileDom.js:92 が既に `img.referrerPolicy = 'no-referrer'` を付ける。本物
  タイルをそのまま純Webで使えば、niconico CDN(secure-dcdn.cdn.nimg.jp)の referrer チェックを回避=アバターは出る。
  念のため app の HTML `<head>` に `<meta name="referrer" content="no-referrer">` も足す(二重の安全)。
- ✅ **スナップショットに avatar あり**: laneMirror.js の LaneMirrorCell は {displaySrc(=avatar URL), title,
  idLine, nameLine, userId} = buildPersonTileEl が要る5点を既に持つ。restoreLaneMirrorBuckets で復元できる。
- ✅ **サーバー変更ほぼゼロ**: api/status.js:78 は `payload = {...body}`(v 以外を丸ごと保存)=POST に laneMirror/
  statCardsMirror を足すだけで保存・GET で返る。api 側のコード変更不要。
- ⚠️ **②(レスポンシブ)が唯一の本物の作業**: popup の応援レーン CSS は狭い幅前提。PC 全画面で間延びしない
  ように、コンテナに max-width を付け中央寄せ + person-tile を flex-wrap で折り返す CSS を純Web側に新規で書く。
  これは新規 CSS なので popup/拡張には一切影響しない(最小ブラスト半径)。

## 実装方針(案1・status Web版を手本に・段階)
データ流れ: 拡張(lane mirror 送信) → api/status.js(無変更で保存) → 純Web app/live-view.js(fetch+本物描画)。

1. **拡張側(送信)**: status.html「📱スマホへ送信」の jsonBlob に lane mirror / stat cards mirror スナップショット
   を相乗りさせる(status-entry.js の uploadStatusSnapshot 周辺)。既存の loadLaneMirrorSafe / loadStatCardsMirrorSafe
   が読んだ値を payload に足すだけ。新規エンドポイント不要。
   - ★lv 別: 鏡はグローバルキー(lv を含まない=popup が最後に開いた配信ぶん)。Web 側は1配信ぶんでよい(まず
     「いま見ている1配信のそっくり」を出す)。複数配信対応は後段。
2. **サーバー**: 変更なし(payload を丸ごと保存・GET で返す既存挙動で足りる)。
3. **純Web側(新規 app/live-view.html + app/live-view.js)**: app.js が手本。
   - ?v=token で GET /api/status?v=token → data.laneMirror / data.statCardsMirror を取り出す。
   - restoreLaneMirrorBuckets → 本物 paintStoryUserLaneDomFilled + buildPersonTileEl で描く(status/拡張 live-view
     と同じ recipe・似せて自作しない)。数字カード鏡も同様。
   - popup の応援レーン CSS(.nl-story-userlane*)を app 側に移植(status.html がやったのと同じ verbatim コピー)。
   - ★レスポンシブ CSS は新規: コンテナ max-width(例 480px) 中央寄せ + @media で PC は左右に余白・スマホは全幅。
     person-tile は flex-wrap。`--nl-*` 変数も移植(裸要素化の轍を踏まない)。
   - `<meta name="referrer" content="no-referrer">` を head に追加。
   - 60秒ポーリング(app.js と同じ)。
4. **ビルド**: scripts/build.mjs に app/live-view.js ターゲット追加(app/dist/live-view.js)。
5. **拡張内 live-view からの導線**: 既存の拡張内 live-view(iframe 版)はそのまま残す(拡張ユーザー用)。純Web版は
   「スマホへ送信」後に URL(app.../live-view?v=token)で開く別物。両立する。

## 検証
- 純Web app/live-view.html を Playwright(file://)で開き、ダミーの lane mirror JSON を流し込んで本物タイルが
  描けるか目視(アバターは CDN 直リンクなのでネット要・referrer no-referrer で出るか確認)。
- レスポンシブ: ウィンドウ幅を変えて PC/スマホ両方で崩れないか。
- ユーザー実機: 拡張で「スマホへ送信」→ スマホ/PC で URL を開き「popup そっくりの応援レーンが顔付きで出る」を確認。

## 未解決・要設計(着手前にユーザー確認 or 後段)
- viewToken が URL 露出(共有時)。今はビルド時固定。公開GET の是非=ユーザーは「公開OK(OSINT)」と確定済=許容。
- Upstash 無料枠(月3万コマンド)・送信頻度(手動のまま? 自動定期?)。まず手動で実証。
- まず1配信ぶん(いま見ている配信)。複数配信・過去アーカイブは後段。
- status Web版(app.js)と live-view の fetch+render 重複は、動いてから共通化(早すぎる抽象化はしない)。
