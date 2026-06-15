# reference: 読み上げ「全部読んでくれない」強化 v0.1.703 実装ブリーフ（会議確定・Codex向け正本）

> 2026-06-12 設計会議（Fable3視点+Codex gpt-5.5+ローカルLLM gpt-oss/qwen の5席）で確定。
> 設計4本柱はユーザー確定済み・再交渉しない。本書は HOW の最終仕様。

## 対象ファイル

- `src/extension/comeview-entry.js`（162行 `_voiceQueue` / 275行 `stopVoicePlayback` / 324行 `drainVoiceQueue` / 397行 `enqueueVoiceTimelineItems`）
- `src/lib/voiceReadQueue.js` + `voiceReadQueue.test.js`
- `src/lib/voicevoxClient.js` + `voicevoxClient.test.js`

## キューitemの形（変更）

`{ userKey, name, body, count }`
- `body` = 正規化済み本文（切り詰め前・「ほか○件」付与前）。マージのマッチキー。
- `name` = enqueue時に解決済みの読み上げ用名前（`_voiceReadNameEnabled ? nickname : ''`・現行踏襲）
- `count` = 同文集約数（初期1）
- enqueue時は `buildVoiceReadingText` を1回呼んで**空文判定だけ**行い、保存は body のまま（テキスト焼き込み禁止）

## ①並行プリフェッチ（1スロット固定・最重要）

- 状態: `_voiceQueue` の隣に `let _voicePrefetch = null; // { item, generation, promise }` を1本だけ。
  **1スロット固定は設計判断**（VOICEVOXはローカルCPU直列・N>=2は両方遅くなりtimeout率だけ上がる）— コードコメントに明記。
- **kick位置**: drainVoiceQueue 内、wavガード（既存343-349）通過後・objectURL生成と再生Promiseの**直前**に `startVoicePrefetch(generation)` を1箇所だけ挿入。
  ```js
  function startVoicePrefetch(generation) {
    const next = _voiceQueue[0];
    if (!next || generation !== _voiceGeneration) { _voicePrefetch = null; return; }
    const congestion = computeVoiceCongestion(_voiceQueue.length);
    const assigned = resolveVoiceForUser(next.userKey, _voiceAssignments, _voiceStyleIds);
    _voicePrefetch = {
      item: next, generation,
      promise: synthesizeVoice(
        buildMergedVoiceText(next, { maxChars: congestion.maxChars }),
        { ...assigned, speedOffset: assigned.speedOffset + congestion.speedBoost }
      ).catch(() => null) // unhandledrejection保険・必須
    };
  }
  ```
- **消費位置**: shift直後の synthesizeVoice 直呼びを consume-or-synth に置換:
  ```js
  const pf = _voicePrefetch; _voicePrefetch = null;
  const wav = isVoicePrefetchUsable(pf, item, generation)
    ? await pf.promise
    : await synthesizeVoice(buildMergedVoiceText(item, { maxChars: congestion.maxChars }), {...});
  ```
- 純関数 `isVoicePrefetchUsable(prefetch, item, generation)` を voiceReadQueue.js へ:
  **`prefetch.item === item`（参照同一性）&& `prefetch.generation === generation`** の2条件。
  （mergeは新オブジェクト差し替えなので参照不一致→自動再合成。text比較は不要=この2条件で完結）
- `stopVoicePlayback`（275行）の `_voiceGeneration += 1;` 直後に **`_voicePrefetch = null;` 追加（必須）**。
- 既存の最終ガード（343-349 `!wav || !_voiceReadingEnabled || generation !== ... || isObsMode()`）は不触で温存。
- `_voicePlaying` ゲート（325行）と finally 再kick（391-394行）は**一切触らない**（二重drain防止の生命線）。
- objectURL生成は再生直前のまま（プリフェッチはArrayBuffer段階で保持=リーク経路増えない）。revoke位置も不触。

## ②同文バースト集約 mergeRepeatedVoiceItem

- voiceReadQueue.js に純関数追加（pushVoiceQueueと同じimmutable流儀）:
  `mergeRepeatedVoiceItem(queue, candidate) => { queue, merged: boolean }`
  - **キュー全体を走査**（末尾連続限定にしない・会議裁定: 実バーストは他コメが挟まるため）。O(12)で無視できる。
  - 同 `body` のエントリがあれば、その位置を `{ ...existing, count: existing.count + 1 }` の**新オブジェクト**で差し替えた新配列を返す（merged: true）。←プリフェッチ整合の要。
  - userKey不問（別人の8888もまとめる=渋滞解消の目的に合う。テストで仕様明文化）。
  - 不正入力（非配列等）は既存流儀どおり空キュー扱い。入力非破壊。
- 配線: enqueueVoiceTimelineItems の pushVoiceQueue 直前で merge を試し、merged=true なら push しない。
  merged=false のみ `pushVoiceQueue(_voiceQueue, item, { max: 12 })`（**上限5→12は呼び出し側で指定**・lib既定5は不変）。
- **mergedは showVoiceSkipped に数えない**（集約=読まれている。dropped のみ表示維持・UX退行防止）。

## ③速度段階+④40字切り詰め: computeVoiceCongestion（単一ソース）

- voiceReadQueue.js に純関数追加: `computeVoiceCongestion(queueLength) => { speedBoost, maxChars }`
  - 0-2件: `{ speedBoost: 0, maxChars: 60 }`
  - 3-4件: `{ speedBoost: 0.15, maxChars: 60 }`
  - 5-7件: `{ speedBoost: 0.3, maxChars: 40 }`（40字発動は+0.3帯=5件以上。会議裁定）
  - 8件以上: `{ speedBoost: 0.5, maxChars: 40 }`
  - 不正値/負数は0件扱い（既存流儀）。
- `computeVoiceQueueSpeedBoost` は `computeVoiceCongestion(n).speedBoost` への委譲に書き換え（速度と長さの渋滞判定が絶対にズレない単一定義）。既存テスト（0.1/0.2前提）は新4段に全面更新。
- 判定タイミング=**合成直前のqueue長**（drainはshift前スナップショット=現行329行と同点・プリフェッチは開始時の `_voiceQueue.length`）。enqueue時判定は禁止（切り詰め不可逆・渋滞状態が古い）。

## ④buildVoiceReadingText の opts.maxChars + buildMergedVoiceText

- `buildVoiceReadingText(row, { maxChars = 60 } = {})`: 182行 `.slice(0, 60)` → `.slice(0, maxChars)`。
  不正値は60にfallback。`Array.from` 維持（サロゲート安全）。**省略時は従来60字と完全一致**（後方互換・黄金値テスト）。
- voicevoxClient.js に純関数追加: `buildMergedVoiceText(item, { maxChars } = {})`
  = `buildVoiceReadingText({ name: item.name, text: item.body }, { maxChars })` + （count>1 なら `、ほか${count - 1}件`）
  - **適用順序: 40字切り詰め→サフィックス付与**（「ほか○件」は切り詰めで欠けない・件数情報は渋滞時こそ価値）。
  - 名前部は現行どおり切り詰め対象外（本文のみslice）。

## 必須テスト（既存流儀=日本語平叙文it名・不変性・不正入力）

voiceReadQueue.test.js:
- mergeRepeatedVoiceItem: 同文をキュー内任意位置で集約しcount+1 / 異なる本文はmerged:false / userKeyが違っても同文ならマージする / マージ結果は新オブジェクト（元と参照が異なる） / 空キューはマージしない / count未設定の既存項目は1として扱う / 入力キューを変更しない / 配列でない入力は空キュー扱い
- isVoicePrefetchUsable: 同一item参照・同一世代なら使える / itemが別参照（merge差し替え・drop後）なら使えない / 世代が進んだら使えない / prefetch自体がnullなら使えない
- computeVoiceCongestion: 境界 2/3/4/5/7/8 のspeedBoostとmaxChars / 4件→60字・5件→40字 / 不正値は0件扱い
- computeVoiceQueueSpeedBoost: 新4段に更新（2→0 / 3,4→0.15 / 5,7→0.3 / 8+→0.5・負数不正値0）
- pushVoiceQueue: max:12 で13件目に最古を落とす（既定5のテストは現状維持）

voicevoxClient.test.js:
- buildVoiceReadingText: maxChars未指定は従来60字と完全一致（黄金値） / maxChars=40で40字 / 不正maxCharsは60fallback / 名前は切り詰め対象外 / URL省略維持
- buildMergedVoiceText: count>1で「、ほか○件」末尾付与 / count=1は付与しない / 40字切り詰め後にサフィックスが付く（欠けない）

## 完了条件

- バージョン v0.1.703 へ bump + changelog（**summary 35字以内**・pre-pushで落ちる）
- `npm run build` で extension/dist 再生成（**dist再ビルド漏れは過去頻発の事故**）
- `npm run verify:cc` 全緑
- 実機チェック（司令塔がchrome-devtools-mcpで実施）: (a)読み上げ間の無音ギャップ消失 (b)8888連打→「8888、ほか○件」1回 (c)OFF即無音・再ONで古い音声が出ない (d)VOICEVOX kill→継続→再起動で復帰 (e)?obs=1 無影響

## 触らないもの（退行防止・会議全員一致）

`_voicePlaying` ゲート / finally再kick / 既存wavガード / objectURL revoke 2経路 / OBSガード / enqueueの kind==='comment' フィルタ / 名前読みトグルの既定OFF
