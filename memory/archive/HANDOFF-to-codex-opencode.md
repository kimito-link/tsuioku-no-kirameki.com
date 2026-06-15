# 引継ぎ → Codex: 無料LLM/APIで「気軽な自律コーディング(GitHub連携)」環境の完成

## Codex 追記（2026-05-25 14時台）

### 実証完了
- ✅ `opencode --version` は sandbox 外の実機実行で **1.15.10**。
- ✅ `opencode models` で `local` / `groq` / `nvidia` / `openrouter` を認識。
- ❌ `local/qwen2.5-coder:14b` は、相対パス `./fizzbuzz.py` を強く指定しても **tool-call を JSON コードブロックとして本文出力**するだけで、ファイルを作れなかった。
- ❌ `nvidia/qwen/qwen2.5-coder-32b-instruct` は **410 Gone**。NVIDIA 側で 2026-05-12 に EOL。
- ✅ `nvidia/deepseek-ai/deepseek-v4-flash` は **OpenCode の Write tool を実行できた**。
  - 実証先: `C:\tmp\opencode-test\nvidia-run2\fizzbuzz.py`
  - `python C:\tmp\opencode-test\nvidia-run2\fizzbuzz.py` で 1〜100 の FizzBuzz 出力を確認済み。

### 追加したランチャ
- `start-opencode.bat`
  - 既定おすすめ: `nvidia/deepseek-ai/deepseek-v4-flash`
  - 選択肢: Groq Qwen3 32B / local Qwen3 14B / local Qwen2.5 Coder 14B
  - ダブルクリックでこのリポジトリを作業ディレクトリにして OpenCode TUI を起動する。

### 現時点の結論
「無料で気軽な自律コーディング」は、**普段の実ファイル編集は NVIDIA DeepSeek V4 Flash**、機密・無限試行はローカル 14B を「相談・下書き」寄りに使うのが現実解。

## ゴール（ユーザーの言葉そのまま）
「無料のLLMや無料分のAPIを存分に活かして、**Manus AI みたいに気軽に**
自律コーディング(GitHub連携)を、できればPCでもスマホでも使いたい」。
最優先キーワード = **「無料」「気軽に」**。

きっかけ: kimito-link.com 技術部の記事 `/claude-code-free-llm-integration/`(2026-05-20)
「AIを用途で4つに分ける(①本家Claudeでコード ②機密はローカルAider ③相談はOpen WebUI ④AI会議)」。
記事内で「RTX 4070 Ti = 14B快適の鉄板機」とユーザーPCが名指し推奨されている。

---

## ユーザーPC（確定済み）
- RTX 4070 Ti / **VRAM 12GB**、RAM 80GB、Intel 第13世代、Windows 11 Home
- Ollama 0.24.0、シェルは PowerShell 7
- 導入済モデル: `qwen3:14b`(実測42.6tok/s), `qwen2.5-coder:14b`, `deepseek-r1:14b`,
  `qwen2.5:14b`, `hermes3:8b`, `gpt-oss:20b`(VRAM超過), `gemma4:31b`(VRAM超過),
  `qwen-coder-quality:latest`
- ⚠️ 20B超・VRAM33GB級は**載らない**→巨大モデルは NVIDIA/OpenRouter API に逃がす

## 無料の弾（2026-05-25 実際に叩いて生存確認済み）
| 弾 | 状態 | 制約 |
|---|---|---|
| ローカル Ollama | ✅ 無制限 | 電気代のみ。文脈は `OLLAMA_CONTEXT_LENGTH` 次第 |
| Groq API | ✅ HTTP200 | **無料枠 TPM=12,000トークン/分**と小さい（重要） |
| NVIDIA API | ✅ HTTP200 | DeepSeek-V4(v4-flash/v4-pro)が無料経由で使える・文脈大 |
| OpenRouter API | ⚠️有効(73文字) | 429/404 多くモデル名要調整。失効ではない |

3キーとも `setx` 永続済: `OPENROUTER_API_KEY` / `GROQ_API_KEY` / `NVIDIA_API_KEY`

---

## ここまで完了したこと
1. ✅ **Open WebUI（③チャット）**: ユーザーは 2026-05-21 から既に使用中だった。
   `localhost:8080` で**認証なし**稼働。`start-open-webui.bat` は `WEBUI_AUTH=False`。
   ⚠️ cp932 で起動ロゴ(█)が UnicodeEncodeError → bat に `PYTHONUTF8=1` / `PYTHONIOENCODING=utf-8` 織込済。
2. ✅ **OpenCode 導入**（`npm i -g opencode-ai`、**v1.15.10**）= 記事①④に相当する「無料Manus」本体。
3. ✅ **4プロバイダ接続**。設定ファイルは **`~/.config/opencode/opencode.jsonc` が正**
   （★ `%APPDATA%` 側ではなく `.config` 側を OpenCode が読む。最初ここでハマった）。
   - ⚠️ プロバイダ名 `"ollama"` は組み込みと衝突して0件 → **`"local"` にリネーム**で解決
     （`local/qwen3:14b`, `local/qwen2.5-coder:14b`）。
   - 現在の opencode.jsonc は `local` のみ明示。groq/nvidia/openrouter は環境変数キーで認識。
4. ✅ **`OLLAMA_CONTEXT_LENGTH=32768` を User 環境変数に setx 済**（このセッションで設定）。
   ⚠️ ただし**現在走っている Ollama サーバ(PID は起動済)はこの値を読んでいない**
   （env を入れる前に起動済のため）。**Ollama を再起動するか、リクエストごとに num_ctx 指定が必要**。

---

## 🔴 最重要の実証結果（ここが Codex の出発点）

`opencode run --model local/qwen2.5-coder:14b "Create fizzbuzz.py ..."` を
`C:\tmp\opencode-test` で実行した（exit 0）。**結果ログ全文**:

```
> build · qwen2.5-coder:14b
{
  "name": "write",
  "arguments": {
    "content": "# fizzbuzz.py\n\nfor i in range(1, 101):\n    if i % 3 == 0 and i % 5 == 0:\n        print('FizzBuzz')\n    ...",
    "filePath": "/absolute/path/to/fizzbuzz.py"
  }
}
```

### 何が分かったか（事実のみ・推測でない）
- ✅ ローカル 14B は**タスクを理解し、正しい FizzBuzz コードを生成**できた。
- ❌ しかし **tool-call を「実行」せず、JSONをテキストとして吐いた**だけ。
  さらに `filePath` が**プレースホルダ `/absolute/path/to/fizzbuzz.py`**（実パスを埋められていない）。
- ❌ 結果、**ファイルは作られていない**（`C:\tmp\opencode-test` には `run1.log` のみ）。

→ これは「**ローカル小型モデルは agentic tool-calling が不安定**」という既知の弱点が実機で出た形。
   `qwen2.5-coder:14b` の Ollama 実装はネイティブ tool-calling のフォーマット追従が弱い。

---

## ⏳ 残・未完了（Codex はここから）

### A. OpenCode で「実際にファイルが作られる」のを実証する（最優先）
ローカルが上記でコケたので、**次の順で**潰す:

1. **Ollama を再起動して `OLLAMA_CONTEXT_LENGTH=32768` を効かせ、再度ローカルで試す。**
   - 再起動コマンド例（PowerShell）:
     `Get-Process 'ollama','ollama app' | Stop-Process -Force; Start-Process "ollama app"`
     （※ユーザーの Open WebUI が裏で Ollama を使っている可能性あり。落とす前に一言確認推奨）
   - それでも tool-call をテキスト出力するなら、ローカル単体での agentic 実行は諦めて 2 へ。
2. **NVIDIA 無料の大型モデルで試す**（tool-calling 追従が 14B より遥かに固い）:
   - `opencode run --model nvidia/qwen2.5-coder-32b "Create fizzbuzz.py in the current directory"`
   - or `nvidia/deepseek-v4-flash`。
   - ⚠️ opencode.jsonc に `nvidia` プロバイダの models 定義が要るかも。
     baseURL は NVIDIA の OpenAI 互換エンドポイント `https://integrate.api.nvidia.com/v1`。
3. **プロンプトで実パスを明示**（プレースホルダ対策）:
   「Create a file at the **relative path `fizzbuzz.py`** in the current working directory」のように、
   絶対パスを発明させない言い回しにする。
4. 成功判定 = **`C:\tmp\opencode-test\fizzbuzz.py` が実在し中身が FizzBuzz**。
   `python C:\tmp\opencode-test\fizzbuzz.py` が 1..100 を出せば完全勝利。

### B. GitHub 連携の「気軽さ」を確認
- OpenCode はリポジトリ上で動くので、`git` が通れば PR まで行ける。
- 「気軽に」= わざわざ叩かなくても起動できる **`.bat` ランチャ**を用意すると良い
  （Open WebUI と同じ思想。例: `start-opencode.bat` でモデル選択して `opencode` TUI 起動）。

### C. メモリ記録（まだ未記録）
`C:\Users\info\.claude\projects\C--Users-info-OneDrive--------Resilio-github-tsuioku-no-kirameki-com\memory\reference_local_llm_hardware_4070ti.md`
に以下を追記:
- OpenCode 起動手順（`~/.config/opencode/opencode.jsonc` が正・`local` リネームの罠）
- 4プロバイダと**どの場面でどの弾**か（下記「使い分け」）
- 上記の**ローカル tool-call テキスト出力問題**（同じ轍を踏まないため）
- MEMORY.md にも1行ポインタ追加。

### D.「スマホでも」
OpenCode は基本ターミナル/PC用でスマホ直アクセスは弱い、と調査済。
「気軽」最優先なので**当面はPCで完成**させ、スマホは欲しくなったら別途、とユーザーに説明済。

---

## 使い分けの完成イメージ（ユーザーに最後に示す形）
- 機密コード / 無限に試す → **local（¥0）**
- 賢さ欲しい → **Groq 無料**（ただし TPM 12k の枠小・長い文脈は弾かれる）
- 巨大モデル(DeepSeek-V4) → **NVIDIA 無料**（文脈大・tool-call も固い）
- 枠切れ → **OpenRouter 激安従量**

---

## 厳守ルール（ユーザーの作業ルール）
- ⭐ **実コマンド/実ブラウザで実証してから「できた」と報告**（pure test や推測で完了報告しない）。
- ⭐ **承認を待たず自走**、最善判断で完走し結果報告。AskUser で承認ゲートを作らない。
- ⭐ 推測で「直した」と言わない。捏造改修は不可。
- ⭐ Bash 承認プロンプト回避: `cd` を prefix に付けない / py 編集は Write 直書き / heredoc 禁止。
- ⛔ CWS 申請フローは回さない。実機確認をユーザーに頼まない。

## 参考パス
- OpenCode 設定: `C:\Users\info\.config\opencode\opencode.jsonc`
- 実証用ディレクトリ: `C:\tmp\opencode-test`（Resilio 射程外で安全）
- Open WebUI ランチャ: `start-open-webui.bat`（リポジトリ内 or ユーザーが場所把握）
- ハード/モデルのメモリ: 上記 reference_local_llm_hardware_4070ti.md
