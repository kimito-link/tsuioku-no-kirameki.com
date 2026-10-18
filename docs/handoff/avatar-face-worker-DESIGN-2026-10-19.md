# 匿名の顔の合成を Worker へ移す — 設計(2026-10-19)

> 設計=Fable / 素材=無料会議(5体)/ 裏取り・実験・実装=司令塔 / 3段構え(council-fable)の産物。
> 素材: [avatar-face-worker-FABLE-BRIEF-2026-10-19.md](avatar-face-worker-FABLE-BRIEF-2026-10-19.md)

## 結論
**A(OffscreenCanvas の専用 Worker)+ 既存の永続キャッシュ。** B(2層分解)・C(64px)・D(予熱)は採らない。
Worker は「合成の実行場所を変えるだけ」。何を・いつ・いくつ作るか(viewport gate・limiter 3・メモリ256・IDB 2000)は既存のまま。

## 会議の批判の裏取り(司令塔の実測)
| 批判役の主張 | 実測 |
|---|---|
| convertToBlob はメインスレッドでエンコードする | **否定**: 60枚で長いタスク 0 件・心拍の最大遅れ 1〜3ms(メイン合成は 459〜556ms・長いタスク2〜3件) |
| Worker 合成は画素がずれる | **否定**: 60/60 が data URL 文字列まで完全一致(`node scripts/avatar-face-parity.mjs`) |
| SW で Worker を常駐させ全ページで共有 | 不可(Service Worker に `Worker` が無い) |
| 常駐 Worker は web_accessible_resources が要る | 不要(拡張ページが自拡張の dist を読むだけ・実測で起動できた) |

## 構成(新規4・変更4)
- `src/lib/avatarPartAnchors.js` 座標の正本(composer は再エクスポート)
- `src/lib/avatarFaceRender.js` 純関数 `renderAvatarFace(msg, deps)`(Worker でもテストでも同じ手順)
- `src/extension/avatar-face-worker-entry.js` Worker 本体(IDB・chrome.* に触れない)
- `src/lib/avatarFaceWorkerClient.js` 窓口(タイムアウト 3000ms・連続失敗2回で dead・アイドル30秒で terminate・遅れた応答は捨てる)
- `src/lib/avatarPartsComposer.js` 順序: メモリ → 永続キャッシュ → **Worker** → (だめなら)従来のメインスレッド合成。撤回スイッチ `FACE_WORKER_ENABLED`
- `scripts/build.mjs` に target 1つ・`scripts/stage-submission.py` の必須ファイルに `dist/avatar-face-worker.js`

## 守ること
- Worker 失敗は全部「従来合成に戻る」。見た目も機能も失わない。
- Worker からは IDB に書かない(書き手はメインだけ)。`FACE_RENDER_VERSION` は上げない(画素が同一=既存の顔を使える)。
- 状態は `getAvatarComposeStats().worker` で状態速報に出る。

## 検証
- `node scripts/avatar-face-parity.mjs`: 60/60 一致が合格
- 冷スタート(IDB を空にして開く): 主スレッドの `blob` サンプルが 4,000〜8,000 → 0
- 単体: render 8・client 12・配線 9
