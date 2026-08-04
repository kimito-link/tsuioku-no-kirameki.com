# SYNTHESIS: popup-entry.js（21642行）リファクタ方針（会議素材・5頭脳収束）

作成 2026-07-02。council/popup-entry-refactor-answers.json（qwen3-32b/qwen3.6-27b/llama-70b/gpt-oss-120b）＋司令塔統合。
Fable 設計（Stage2）への入力。★は実コードで裏取り済み。

## 収束点（5頭脳ほぼ一致）
- **Q1 分割単位＝B（機能別モジュール）＋C（層別）のハイブリッド**。機能（応援レーン/北極星/数字カード/コメントティッカー/ギフト）
  ごとに描画ロジックを切り出しつつ、**副作用（DOM/chrome.storage/timer/onChanged）と純関数（src/lib・テスト可能）の境界を明確化**。
  1ファイル 200〜2000行程度に収める。A（モード別 entry 分割）は共有 global state で subtle bug＝波及地雷（過去 v1032）で却下寄り。
- **Q2 順序＝characterization test（現挙動固定）を先に敷く（フェーズ0）→ strangler fig で最も安全な単位から1つずつ**。
  最安全の初手＝(i)定数/enum/mode フラグ (ii)タイマー/interval 管理を scheduler module へ（副作用だが孤立・refresh 不触）。
  各段の検証ゲート＝verify:cc ＋「明滅ウォッチ（DOM 安定を時間で assert）」＋状態速報コピペ。
- **Q3 共有 entry を保ったまま内部 module 化**（別 entry 分割は共有 global state で波及・却下）。build-time 3 entry 化は build 複雑化リスクで後回し。
- **Q4 Port-Adapter / Pure Core + Side-Effect Adapters**。データフロー分離：inbound(chrome/storage/event)→core(純関数)→outbound(DOM/timer)。
  max-lines ラチェットは「抽出のたびに現行値へ下げる」＝自動ゲートで後戻り防止。
- **Q5 characterization test 必須**（変更前に現挙動を固定＝リファクタで壊れたら即検知）＋状態速報コピペ併用。実機目視は最後。

## 逆張り（gpt-oss-120b・記録）
「全く分割せず、まずテストだけ充実→安全な環境ができてから段階分割」。一理あるが max-lines が既に上限ちょうど＝新規1行も入らない限界なので、テスト充実と並行して抽出は必要（採用は「テスト先行」の部分のみ）。

## 地雷マップ（Fable/実装へ・繰り返し禁止）
- refresh()/paint の read path 不触（v948 2回却下）。盲目的 sig skip/早期return（v1032 別surfaceちらつき）。sig に時刻（v1022明滅）。
- ②INLINE_PASSIVE に storage 書込/キャッシュ（v1023 真っ白）＝②は"読むだけ"死守。
- 3画面が同一 popup-entry を共有＝片方向けの変更が他画面に波及（v1032 実例）。分割で共有 global state を散らすと subtle bug。
- 過剰設計（全面書き直し・フレームワーク導入・build 大改造）は避ける。星野ロミ式（摩擦ゼロ・段階導入・規律を自動ゲートに）。

## Fable への設計依頼（Stage2）
上記収束を土台に「最高の popup-entry.js 段階リファクタ設計」を出す:
- characterization test の具体（3画面それぞれで何を固定するか・現挙動スナップショット）。
- strangler fig の第1〜3段（最安全な抽出単位と順序・各段の検証ゲート・max-lines を下げる具体）。
- 機能別 module ＋ 副作用/純関数境界（Port-Adapter）の具体的なファイル構成案（src/extension/modules/ 等）。
- 「明滅を生む構造」（広告列が bundle/API 2ソースで再ペイント churn する等）をリファクタでどう構造的に防ぐか。
- 各段 1変更=1patch・挙動不変を保つ順序。過剰設計を避ける。
