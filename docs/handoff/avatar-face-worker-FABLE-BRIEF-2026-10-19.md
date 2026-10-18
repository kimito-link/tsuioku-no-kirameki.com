# 匿名の顔の合成を Worker へ移す — Fable への素材(司令塔作成・2026-10-19)

> 3段構え(会議→Fable設計→実装引き継ぎ)の手順1の産物。会議=無料13体のうち5体召集(`council-answers-face.json`)・司令塔が実測で裏取り済み。

## 問題
Chrome 拡張(ニコ生コメント可視化・MV3)。匿名ユーザーの顔アイコンを canvas で合成(`src/lib/avatarPartsComposer.js` の `composeAvatarPartsDataUrl`)。
永続キャッシュ(IndexedDB・`src/lib/avatarFaceStore.js`・PR #421)で 2 回目以降は解決したが、**キャッシュが空の最初の1回**(拡張更新後・生配信中に新しい匿名ユーザーが増えるたび)が主スレッドを詰まらせる。

## 実測した事実(司令塔)
1. 実機の保存データ(コメント14,000件の配信)を写したヘッドレスで V8 CPU プロファイル: 主スレッドが 150ms 以上詰まる区間のサンプルの約98%が `blob`(=canvas.toBlob)。1回の開閉で約2.7秒。冷スタートの1回目は 4〜5 秒ぶん。永続キャッシュ後の2回目以降は忙しい区間がほぼ無い(65〜115ms)。
2. **実験(2026-10-19・同じ60通りの顔・同一ヘッドレス)**:
   - 現行(メインスレッドの canvas.toBlob): 60枚 459ms・長いタスク3件(合計220ms)・心拍の最大遅れ 71ms
   - **Worker(OffscreenCanvas + convertToBlob + FileReader→data URL)**: 60枚 221ms・**長いタスク 0件**・心拍の最大遅れ 1ms
   - **ピクセル比較: 60/60 枚が data URL 文字列まで完全一致**(バイト数も同じ 26,722)。差は 0。
   → 会議の批判役の主張「convertToBlob はメインスレッドでエンコードする」「Worker だとピクセルがずれる」は**実測で否定**された。
3. 顔の組み合わせ=髪8×目6×口6×頬3×髪色12=10,368通り。合成は 128×128 canvas に 顔の円→頬→目→口→髪(別 canvas で multiply 色付け→destination-in でマスク→重ねる)。出力は約23KB の PNG data URL。
4. 既存の仕組み: 画面の上下400px以内のタイルだけ合成(IntersectionObserver)・同時3つ・メモリ256件・即時表示は SVG identicon → 合成できたら PNG に差し替え。永続キャッシュ(IDB 2000件)は PR #421。
5. 過去の却下案(再提案不可): toDataURL(同期でメイン3〜4秒)・canvas を software(willReadFrequently)にする(blob 665→1565ms と悪化)・blob: URL 化(解放されず漏れ→FileReader の data URL 文字列で解消)・画面外も全員合成。
6. 拡張プロセスのメインスレッドは拡張の全ページで共有(popup・サイドパネル・status・会場…)。他の文書が忙しいと新しいパネルの最初の描画も待たされる(実測)。

## 制約
MV3・CSP `script-src 'self'`(拡張URLの Worker は可・`blob:` Worker は不可)・esbuild IIFE バンドル(`scripts/build.mjs` の targets に1つ足す)・ストア ZIP は `dist/` を同梱(`stage-submission.py`)・最終画像は変えない・既存資産を再利用(`AVATAR_PART_ANCHORS`・`selectAvatarParts`・永続キャッシュ)・新しい巨大機構は作らない・特定ベンダー非依存。
Service Worker からは Worker を作れない(`Worker` 未定義)=会議の「SW で常駐させ全ページで共有」案は不可。

## 会議の結論(要約・司令塔の裁定つき)
- 推奨は A(OffscreenCanvas+Worker)が5体中3体。B(2層分解=SVG/CSSで重ねる)は 1体が推奨・2体が「multiply+destination-in の再現不可・DOM増・既存 data:image/svg+xml 判定への影響」で却下。C(64px)・D(予熱)は補助/却下。
- 批判役の事実主張の裏取り: ①convertToBlob がメイン(→実測で否定)②ピクセルずれ(→実測で否定)③Worker は web_accessible_resources が要る(拡張ページから自拡張の Worker は不要・未確認だが設計では実測でファイルを `chrome.runtime.getURL` で開けた)④SW 共有(→不可)。
- 残る論点: Worker の起動・生存・並列・タイムアウト・フォールバック・メモリ(ImageBitmap の close)・複数文書(popup-watch と sidepanel)が各自 Worker を持つことの是非・Chrome のバージョン下限・テストの型。

## 必答論点(会議の批判を「設計で塞げ」)
1. 冷スタートを最小リスクで消す最良の設計(A 単独/A+永続キャッシュ/A+予熱など)。B を捨てる理由は妥当か。
2. Worker 設計: 1文書1Worker か共有か・同時数・メッセージ・タイムアウト・失敗時フォールバック(メインスレッド合成=既存コード)・Worker が死んだ後の扱い・ImageBitmap の寿命。
3. 永続キャッシュとの合流(読む→無ければ Worker→書く)と、Worker から直接 IDB に書くべきか。
4. 検証の型: ピクセル同一(実験済み)の自動化・冷スタートの主スレッド時間の合否(数値)・フォールバックの動作確認。
5. 最小で安全な実装順(1版1変更)と、却下すべき案とその理由。**過剰設計を強く戒める**。

## 出力指定
設計書本文のみ(前置き不要)。A.推奨の設計 B.Worker とメインの境界・メッセージ・フォールバックの具体 C.永続キャッシュとの合流 D.検証と合否の数値 E.実装順(1版1変更) F.捨てた案と理由 G.地雷と回避策。コードは書かず、ファイル名・関数名・値の粒度で。
