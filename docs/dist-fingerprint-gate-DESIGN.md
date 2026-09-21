# 設計書: pre-push の buildId 無限差分ループの恒久対処

> 設計=Fable(claude-fable-5-1) / 会議素材収集=無料マルチLLM会議ハーネス(5体) / 裏取り=司令塔(Claude Sonnet 5)
> 日付=2026-09-21 / 3段構え(council-fable スキル)の手順2の産物
> 会議ログ: `council/auto/2026-09-21_11-20-52-design.json`

対象リポ: `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com`

## 背景・確定した真因

`.husky/pre-push`が`npm run verify`(=`test && lint && typecheck && build`)を実行し、
`scripts/build.mjs`が実行のたびに現在時刻(JST, MMDD-HHmmss)を`NL_BUILD_ID`として15本の
バンドル(`extension/dist/*.js`, `app/dist/*.js`)に埋め込む。そのため commit 前に build して
dist を含めて commit → push しても、pre-push フックが**再度** build を実行し新しい時刻が
埋め込まれ、push 直後に必ず buildId のみの dist 差分が作業ツリーに残る。

実例(2026-09-21): v0.1.1537 の commit → push → dist 差分発生 → `chore(dist): buildId 差分のみ同期`
commit で吸収 → 再 push → **また同じ dist 差分が発生**、を2回連続で確認した。既存運用は
この chore(dist) 追随 commit を都度作る対症療法だが、push する限り必ず新しい差分が生まれる
構造的自己再生産ループになっている。

## 動かせない制約(実コード裏取り済み)

- `src/lib/buildAgeCell.js`: `NL_BUILD_ID`(時刻)から「このビルドは何時間/日前か」を計算し、
  3日以上前なら「反映されていない可能性」を利用者向け診断に出す機能。2026-08-14に
  「7版出したが実機に1つも届いていなかった(8日前のビルドのまま)」事故の再発防止として
  実装済み。**NL_BUILD_ID が実時刻であることに本質的に依存しており、変更してはいけない。**
- 出荷ゲート(verify:cc)がdistとソースの整合性を検証する仕組み自体は失えない。
- Windows + Git Bash + PowerShell環境。
- 「ユーザーに手作業をさせない・反映は司令塔が最後までやる」という運用方針を壊さない。

## 会議(5体、gpt-oss-120b統合役)の収束点

pre-pushではbuildを再実行せず、「ソースハッシュ」と「distに埋め込まれた対応ハッシュ」を
比較し、一致すればbuild不要、不一致なら「build忘れ」としてpushを止める、という方向で収束。
批判役(cloudflare/gpt-oss-20b)から「ビルド環境(lockfile等)が変わった場合の見逃し」の懸念が
出たが、この懸念は下記Fable設計で「常時入力」として`package-lock.json`等を指紋に含めることで
解消している。

## Fable設計(採用・実装時はこのまま読んで着手できる粒度)

以下、Fableの設計書全文(司令塔が実コードと照合し、記載内容が現行コードと整合することを
確認済み: `scripts/build.mjs`のtargets数=15件・実在確認、`package.json`の`verify:bump`=
`node scripts/verify-bump.mjs`・実在確認、`.husky/pre-commit`の既存ゲート構成=実在確認)。

---

# 設計書: pre-push の buildId 無限差分ループの恒久対処

対象リポ: `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com`
裏取り済みの実ファイル: `.husky/pre-push`(`npm run verify` の1行)/ `.husky/pre-commit` / `scripts/build.mjs` / `src/lib/buildAgeCell.js` / `src/lib/bundleBuildId.js` / `scripts/run-verify-cc.mjs` / `scripts/verify-bump.mjs` / `scripts/copy-ext.mjs` / `scripts/stage-submission.py` / `scripts/check-tracked-imports.mjs` / `.github/workflows/ci.yml` / `package.json`

追加で確認した事実(設計の前提):
- git 追跡下の dist は 15 本(`extension/dist/*.js` 12本 + `app/dist/*.js` 3本)。現在の作業ツリー差分は5ファイル・7行で、**中身は `"0921-201053"`→`"0921-201251"` の buildId 文字列だけ**(ループの実体を確認)。
- `git log` 直近400件に `chore(dist): buildId 差分のみ同期` が5件。
- `npm run build` は実測 **約0.9秒**(verify-cc.log)。test は約74秒。
- `core.autocrlf=false`・`.gitattributes` 無し ⟹ git の blob sha は「ディスクの生バイト」と一致する。
- `package.json` に `dependencies` は無い(devDependencies のみ)⟹ バンドルに node_modules のコードは入らない。
- `scripts/build-watch.mjs` は `extension/dist/{page-intercept,content,popup}.js` を**同じパスに**書く(hot-reload 込みの開発ビルド)。
- `scripts/stage-submission.py` は `extension/dist/` を `copy_tree` で丸ごと提出物へコピーする ⟹ 生成メタデータを `extension/dist/` の中に置くとストア ZIP に混入する。
- `bundleBuildId.js` は `\b\d{4}-\d{6}\b` の正規表現で dist 本文から buildId を拾う(copy:ext の混在警告に使用)。
- ビルド出力に影響する環境変数は `NL_RELEASE` のみ(`NL_STORE_BUILD` は build.mjs ではもう読んでいない。AGENTS.md §2 の記述は古い)。

## A. 理想の体験フロー

開発者(=司令塔)の手順は今と同じ「bump → `npm run verify:cc` → `git add` → commit → push」。変わるのは裏側だけ。

```
npm run verify:cc          … build が走り dist と .dist-fingerprint.json が更新される(約1秒)
git add -A && git commit   … pre-commit が「ステージ内容(=これからコミットされる中身)で
                              ビルド入力と dist が対応しているか」を git の索引だけで照合(約0.5秒)
git push                   … pre-push は【build しない】。push される commit の tree から
                              指紋を再計算し、commit 内の dist と照合(約0.5秒)→ test/lint/typecheck
push 直後: git status が空 ← ★これが受け入れ基準。chore(dist) 同期 commit は二度と要らない
```

止まるのは次の3つだけで、いずれも「本当に直すべき状態」:
1. バンドルに入るソースを変えたのに `npm run build` していない(または dist を `git add` し忘れた)
2. `package-lock.json` / `scripts/build.mjs` / `tsconfig.json` / `package.json` を変えたのに build していない(ツールチェーン変更の見逃し=会議の懸念1)
3. `build:watch` の出力(hot-reload 込み)を push しようとしている

メッセージは必ず「次に打つコマンド」を含む(`npm run build && git add extension/dist app/dist .dist-fingerprint.json`)。

`NL_BUILD_ID`(JST 時刻)は一切触らない。`buildAgeCell.js` / `bundleBuildId.js` / `copy-ext.mjs` / `verify-deploy.mjs` は無傷。

## B. 統合アーキ(変更ファイルと役割)

| ファイル | 変更 | 役割 |
|---|---|---|
| `scripts/build.mjs` | 変更 | esbuild の `metafile` から**実際にバンドルされた入力ファイル一覧**を取り、各入力の git blob sha + 常時入力4件 + mode から**指紋(sha256)**を算出。出力15本の「buildId をマスクした sha256」と一緒に `.dist-fingerprint.json` へ書く(内容が変わらなければ書かない)。`NL_BUILD_ID` の生成・埋め込みはそのまま |
| `.dist-fingerprint.json`(新・**リポ直下**・git 追跡) | 新規 | 指紋の正本。`{ schema, mode, fingerprint, inputs[], outputs{} }`。buildId は**含めない**(build のたびに変わる値を入れると再びループ源になる)。`extension/dist/` の外に置くのは stage-submission の `copy_tree` に巻き込まれないため |
| `src/lib/distFingerprint.js`(新) | 新規 | 純関数(fs/child_process に触らない・`check:layer` 準拠): 指紋の正規化テキスト生成 / buildId マスク / 照合判定 `judgeDistFreshness`。vitest でテスト |
| `scripts/check-dist-fresh.mjs`(新) | 新規 | I/O 層。「どの tree を見るか」だけを切り替える: `--ref <rev>`(commit)/ `--pushed`(pre-push の refs)/ `--index`(ステージ)/ 無指定(作業ツリー)/ `--selftest`(毒→赤) |
| `.husky/pre-push` | 置換 | `npm run verify` をやめ、`check-dist-fresh --pushed` → `npm test && lint && typecheck`。**build しない** |
| `.husky/pre-commit` | 追記 | 末尾に `check-dist-fresh --index`(ブロック・`SKIP_DIST_GATE=1` で回避)。tree-map ゲートと同じ流儀 |
| `scripts/run-verify-cc.mjs` | 1行追加 | `build` の直後に `['dist-fresh', 'check:dist-fresh']`(作業ツリー照合)。selftest は既存の自動収集で拾われる |
| `package.json` | 2行追加 | `check:dist-fresh` / `check:dist-fresh:selftest`。`verify` は**そのまま**(CI 用に build 込みで残す) |
| `.github/workflows/ci.yml` | 1ステップ追加 | `npm run verify` の前に `node scripts/check-dist-fresh.mjs --ref HEAD`。`--no-verify` で押し通した push を CI が拾う(第3防衛線) |
| `scripts/repo-tree-map.mjs` の `FEATURES` | 1行追加 | 「dist 鮮度ゲート」→ 上記3ファイル(§4 のルール) |
| `~/.claude/skills/nicolive-ship/SKILL.md`・MEMORY 索引の「pre-pushでdistのbuildIdが1つずれる(追わない)」 | 文言更新 | 前提が消えるので司令塔が直す(他ツールに渡さない) |

触らないもの: `src/lib/buildAgeCell.js`、`NL_BUILD_ID` の形式、`scripts/verify-bump.mjs`(理由は E)、`scripts/build-watch.mjs`。

### 3層の防衛線(同じスクリプト・見る tree が違うだけ)
```
pre-commit --index  : コミットされる中身で照合(ここで止まれば chore commit は生まれない)
pre-push  --pushed  : push される各 ref の tip commit で照合(build は走らない=ループ消滅)
CI        --ref HEAD: フック回避・マージ commit の不整合を拾う
```

## C. 具体機構

### C-1. 必答論点 A: 何をハッシュするか

**指紋 = sha256( mode + 「実際にバンドルされた入力」の blob sha + 常時入力4件の blob sha )**

| 対象 | 含める? | 根拠 |
|---|---|---|
| esbuild `metafile.inputs` の全ファイル(15ターゲットの和集合。`src/**`・`app/*.js`・動的 import 先を含む) | **含める** | 「バンドルに実際に入ったもの」だけ。推測のグロブではなく esbuild 自身の申告なので過不足がない |
| `package.json` | 含める(常時) | `NL_BUNDLE_VERSION` の出所。bump のたびに変わるが、bump 時は必ず build するので追加コスト無し |
| `package-lock.json` | 含める(常時) | esbuild 本体のバージョン固定=ツールチェーン(懸念1)。node_modules を個別に見る代わりにこれ1つで代表 |
| `scripts/build.mjs` | 含める(常時) | define・target・minify 設定の正本 |
| `tsconfig.json` | 含める(常時) | esbuild は .js でも tsconfig を読む(`target`/`paths` 等)。変更頻度は極めて低い |
| `NL_RELEASE`(mode) | 含める | 同じ入力でも dead-code 除去で出力が変わる |
| `*.test.js` / `docs/` / `src/images` / `src/sound` / `extension/manifest.json` / `eslint.config.js` / `vitest.config.js` | 含めない | バンドルに入らない(metafile に現れない)。manifest は copy であって build 成果ではない |
| `node_modules/**` の個別ファイル | 含めない | 追跡外で blob sha が取れない。lockfile が代表する。今は `dependencies` 無しなので metafile にも現れないが、将来現れても `node_modules/` は除外して lockfile に任せる |
| Node のバージョン | 含めない | esbuild は Go バイナリで出力は Node 版に依存しない。含めると環境差で偽赤が出る |

**「新しいファイルを import した」は拾えるか**: 拾える。新規ファイルを import する側の既存ファイルの内容(import 行)が変わる → その blob sha が変わる → 指紋が変わる。次の build で新規ファイル自体が `inputs[]` に載る。

**境界線の理屈**: 含め過ぎの害は「不要な build 要求」だが、metafile 方式では要求が出るのは出力が変わりうるときだけ。空振り build を強制されるのは常時入力4件の変更時のみで、いずれも「本当に build し直すべき変更」。

### C-2. 必答論点 B: ハッシュの算出方法

- **build 時(作業ツリー)**: `git hash-object --stdin-paths` に入力パスを一括で流す(1プロセス)。git が `add` 時に付ける blob sha と厳密に同じ値(autocrlf/attributes の正規化込み)。
- **check 時(commit / index)**: `git ls-tree -r -z <rev>` または `git ls-files -s -z` で path→blob sha の表を1回で取る。ファイル内容は読まない(2.4MB の popup.js を触るのは outputs 照合のときだけ)。
- `git rev-parse <sha>:src` のような **tree-hash 方式は採らない**: `src/` にはテスト・画像・音が混ざり過包含になる上、「作業ツリー/ステージ」の tree-hash は `git write-tree` の細工が要る。blob 単位なら3つの tree 源を同じコードで扱える。
- 最終的な指紋は Node の `node:crypto` sha256(正規化テキストは純関数が作る)。

### C-3. 必答論点 C: pre-push で build するか

**build しない。** 理由は「安全か」以前に、pre-push は push 内容を変えられないから(D 参照)。pre-push で build した出力は (a) 捨てる=無意味、(b) 作業ツリーに残す=今のループ、のどちらかにしかならない。
懸念1(バンドル固有エラーの見逃し)は次で塞がる: **指紋が一致する ⟺ その commit の dist は「同じ入力+同じ lockfile+同じ build.mjs」での build が成功して生まれたもの**。build の成功はその時点で確認済みで、もう一度走らせても情報は増えない。加えて CI の `npm run verify` は build を含んだまま残す。

### C-4. 必答論点 D: 「pre-push 内で build して git add し直して push」との違い

git の push は、フックが呼ばれる時点で**送る commit(ref の sha)が確定している**。pre-push が受け取るのは `<local ref> <local sha> <remote ref> <remote sha>` で、返せるのは exit code だけ。フック内で `git add`/build をしても、送られる sha は1ビットも変わらない。
「push される内容そのものを作り直す」には新しい commit が要り、それは (i) `--amend`(案3=履歴改変・否決済み)か (ii) 追加 commit を作って `exit 1` し「もう一度 push して」と言う(=今の chore(dist) ループを自動化しただけで、消えていない)しかない。**つまり D は案3と同型で、区別できる安全な形は存在しない。**
commit の中身を確定前に整えられる唯一の場所は **pre-commit**(索引を見て止める)。そこに `--index` の門を置くのが本設計。ただし pre-commit でも**自動 build+自動 add はしない**: build は作業ツリーから作られるが、部分ステージ時は索引と作業ツリーが違い、自動生成した dist がステージ内容と対応しない。止めてコマンドを示す方が誤った commit を作らない(tree-map ゲートと同じ判断)。

### C-5. `src/lib/distFingerprint.js`(純関数)

```js
/**
 * distFingerprint.js — 「この dist はこのソースから build されたものか」を判定する純関数。
 *   ★NL_BUILD_ID(JST 時刻)は buildAgeCell の計器なので一切触らない。代わりに
 *     「ビルド入力の blob sha の集合」を指紋にし、時刻は照合から【マスクして】外す。
 *   fs / child_process に触らない(src/lib の掟)。I/O は scripts/check-dist-fresh.mjs。
 */
export const FINGERPRINT_SCHEMA = 1;
/** バンドル入力に現れなくても常に指紋へ入れる(ツールチェーン・設定の代表)。 */
export const ALWAYS_INPUTS = Object.freeze([
  'package.json', 'package-lock.json', 'scripts/build.mjs', 'tsconfig.json'
]);
/** buildIdJst() の形式(bundleBuildId.js と同じ)。g で全箇所。 */
const BUILD_ID_RE_G = /\b\d{4}-\d{6}\b/g;

/** dist 本文から buildId を消す(同じ入力の build 同士を同一視するため)。 */
export function maskBuildId(text) {
  return String(text ?? '').replace(BUILD_ID_RE_G, 'MMDD-HHmmss');
}

/** metafile の入力パスを正規化: posix・重複除去・node_modules 除外・常時入力を合流・ソート。 */
export function normalizeInputs(paths) {
  const set = new Set(ALWAYS_INPUTS);
  for (const p of paths || []) {
    const s = String(p).replace(/\\/g, '/').replace(/^\.\//, '');
    if (!s || s.startsWith('node_modules/') || s.includes('/node_modules/')) continue;
    set.add(s);
  }
  return [...set].sort();
}

/** 指紋の元テキスト。呼び出し側が sha256 する。 */
export function fingerprintText({ mode, entries }) {
  const lines = entries
    .map((e) => `${e.path} ${e.blob}`)
    .sort();
  return `schema=${FINGERPRINT_SCHEMA}\nmode=${mode}\n${lines.join('\n')}\n`;
}

/**
 * 照合。sidecar と、その tree から取り直した値を突き合わせる。
 * @param {{ sidecar: object|null, fingerprint: string|null, missingInputs: string[],
 *           outputHashes: Record<string,string|null> }} a
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function judgeDistFreshness({ sidecar, fingerprint, missingInputs, outputHashes }) {
  const problems = [];
  if (!sidecar || sidecar.schema !== FINGERPRINT_SCHEMA || typeof sidecar.fingerprint !== 'string') {
    problems.push('.dist-fingerprint.json が無い/形式が違う → npm run build(その後 git add)');
    return { ok: false, problems };
  }
  if (missingInputs.length) {
    problems.push(`build 時にあった入力がこの tree に無い(削除/改名後に build していない): ${missingInputs.join(', ')}`);
  }
  if (fingerprint !== sidecar.fingerprint) {
    problems.push(`ビルド入力が dist と一致しない(期待 ${sidecar.fingerprint.slice(0, 12)} / 実際 ${String(fingerprint).slice(0, 12)}) → npm run build`);
  }
  for (const [out, want] of Object.entries(sidecar.outputs || {})) {
    const got = outputHashes[out];
    if (got == null) problems.push(`${out} がこの tree に無い(dist の git add 忘れ)`);
    else if (got !== want) problems.push(`${out} の中身が build 時と違う(buildId 以外の差)→ 手編集 / build:watch の出力 / add 漏れ`);
  }
  return { ok: problems.length === 0, problems };
}
```

### C-6. `scripts/build.mjs` の変更(差分だけ)

★実装時注意(司令塔裏取り): 現行 `build.mjs` は冒頭に `.env` を読む処理(`process.loadEnvFile`)と
`NL_BUNDLE_VERSION`/`NL_RELEASE`等の既存 define ロジックを持つ。以下は**それらを保持したまま**
末尾の `await Promise.all(...)` の後に処理を追加する差分として適用すること(冒頭の import・.env
ロード・BUILD_ID生成・PKG_VERSION取得・targets定義・IS_RELEASE判定は一切変更しない)。

```js
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { normalizeInputs, fingerprintText, maskBuildId, FINGERPRINT_SCHEMA } from '../src/lib/distFingerprint.js';

const ROOT = resolve(__dirname, '..');
const MODE = IS_RELEASE ? 'release' : 'default';

// 既存: const results = await Promise.all(targets.map((t) => esbuild.build({ ...common, ...t })));
// ↓ metafile:true を common に足し、結果を受け取る形に変更
const results = await Promise.all(targets.map((t) => esbuild.build({ ...common, ...t, metafile: true })));

// ---- 指紋(2026-09-21: pre-push の buildId 無限差分ループ根治) ----
const rawInputs = results.flatMap((r) => Object.keys(r.metafile?.inputs || {}));
const inputs = normalizeInputs(rawInputs);
// ★git が add 時に付けるのと同じ blob sha(1プロセス・stdin にパスを流す)。
const blobs = execFileSync('git', ['hash-object', '--stdin-paths'], {
  cwd: ROOT, input: inputs.join('\n') + '\n', encoding: 'utf8'
}).trim().split('\n');
if (blobs.length !== inputs.length) throw new Error('hash-object の件数不一致');
const entries = inputs.map((path, i) => ({ path, blob: blobs[i] }));
const fingerprint = createHash('sha256').update(fingerprintText({ mode: MODE, entries })).digest('hex');

const outputs = {};
for (const t of targets) {
  const text = readFileSync(resolve(ROOT, t.outfile), 'utf8');
  outputs[t.outfile] = createHash('sha256').update(maskBuildId(text)).digest('hex');
}
const sidecarPath = resolve(ROOT, '.dist-fingerprint.json');
const next = JSON.stringify({ schema: FINGERPRINT_SCHEMA, mode: MODE, fingerprint, inputs, outputs }, null, 2) + '\n';
// ★「変わらなければ書かない」(生成物の掟)。buildId は入れていないので同じ入力なら同じ文字列になる。
if (!existsSync(sidecarPath) || readFileSync(sidecarPath, 'utf8') !== next) writeFileSync(sidecarPath, next);
console.log(`nicolivelog: build done (NL_BUILD_ID=${BUILD_ID} fingerprint=${fingerprint.slice(0, 12)} inputs=${inputs.length})`);
```

`targets` の各 `outfile` は既存のまま(15本・実在確認済み)。`BUILD_ID` の生成・define は**一切変えない**。

### C-7. `scripts/check-dist-fresh.mjs`

```js
#!/usr/bin/env node
/**
 * check-dist-fresh.mjs — 「その tree の dist は、その tree のソースから build されたものか」。
 *   --ref <rev>   : commit の tree を見る(CI・手動)
 *   --pushed      : 環境変数 PRE_PUSH_REFS(pre-push の stdin を sh で読んだもの)の各 local sha を --ref で見る
 *   --index       : ステージ(これからコミットされる中身)を見る(pre-commit)
 *   (無指定)      : 作業ツリーを見る(verify:cc・手動)
 *   --selftest    : 毒→赤 / 正常→緑 / buildId だけの差→緑
 *   ★build は走らせない。走らせると出力を捨てるか作業ツリーを汚すかしかない(pre-push は push 内容を変えられない)。
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fingerprintText, maskBuildId, judgeDistFreshness, FINGERPRINT_SCHEMA } from '../src/lib/distFingerprint.js';

const ROOT = process.cwd();
const SIDECAR = '.dist-fingerprint.json';
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const git = (args, opt = {}) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, ...opt });

/** tree 源: blobOf(path)→sha|undefined, read(path)→string|null */
function treeSource(rev) {
  const blobs = new Map();
  for (const rec of git(['ls-tree', '-r', '-z', rev], { encoding: 'utf8' }).split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    blobs.set(rec.slice(tab + 1), rec.slice(0, tab).split(' ')[2]);
  }
  return {
    label: `commit ${rev.slice(0, 10)}`,
    blobOf: (p) => blobs.get(p),
    read: (p) => (blobs.has(p) ? git(['cat-file', 'blob', `${rev}:${p}`], { encoding: 'utf8' }) : null)
  };
}
function indexSource() {
  const blobs = new Map();
  for (const rec of git(['ls-files', '-s', '-z'], { encoding: 'utf8' }).split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    blobs.set(rec.slice(tab + 1), rec.slice(0, tab).split(' ')[1]);
  }
  return {
    label: 'index(ステージ)',
    blobOf: (p) => blobs.get(p),
    read: (p) => (blobs.has(p) ? git(['cat-file', 'blob', `:${p}`], { encoding: 'utf8' }) : null)
  };
}
function worktreeSource() {
  return {
    label: '作業ツリー',
    blobOf: (p) => (existsSync(resolve(ROOT, p)) ? git(['hash-object', p], { encoding: 'utf8' }).trim() : undefined),
    read: (p) => (existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), 'utf8') : null)
  };
}

function check(src) {
  const raw = src.read(SIDECAR);
  let sidecar = null;
  try { sidecar = raw ? JSON.parse(raw) : null; } catch { sidecar = null; }
  let fingerprint = null;
  const missingInputs = [];
  const outputHashes = {};
  if (sidecar && sidecar.schema === FINGERPRINT_SCHEMA) {
    const entries = [];
    for (const p of sidecar.inputs || []) {
      const blob = src.blobOf(p);
      if (!blob) missingInputs.push(p); else entries.push({ path: p, blob });
    }
    fingerprint = sha256(fingerprintText({ mode: sidecar.mode, entries }));
    for (const out of Object.keys(sidecar.outputs || {})) {
      const text = src.read(out);
      outputHashes[out] = text == null ? null : sha256(maskBuildId(text));
    }
  }
  const v = judgeDistFreshness({ sidecar, fingerprint, missingInputs, outputHashes });
  if (v.ok) console.log(`[check-dist-fresh] OK: ${src.label} の dist はソースと一致(${sidecar.fingerprint.slice(0, 12)})`);
  else {
    console.error(`[check-dist-fresh] NG: ${src.label}`);
    for (const p of v.problems) console.error(`  ✗ ${p}`);
    console.error('  → npm run build && git add extension/dist app/dist .dist-fingerprint.json(緊急回避: SKIP_DIST_GATE=1)');
  }
  return v.ok;
}

function selftest() { /* judgeDistFreshness を直接呼ぶ5ケース:
  正常→ok / 入力blob1件差→NG / 出力hash1件差→NG / sidecar無し→NG /
  ★同じ本文で buildId だけ違う2テキストの maskBuildId→sha256 が一致すること(ループ根治の核心) */ }

const argv = process.argv.slice(2);
let ok = true;
if (argv.includes('--selftest')) ok = selftest();
else if (argv.includes('--pushed')) {
  const lines = String(process.env.PRE_PUSH_REFS || '').split(/\r?\n/).filter(Boolean);
  const shas = lines.map((l) => l.trim().split(/\s+/)[1]).filter((s) => s && !/^0+$/.test(s));
  if (shas.length === 0) ok = check(treeSource('HEAD'));       // 手動実行など refs が無いとき
  for (const s of [...new Set(shas)]) ok = check(treeSource(s)) && ok;
} else if (argv.includes('--index')) ok = check(indexSource());
else if (argv.includes('--ref')) ok = check(treeSource(argv[argv.indexOf('--ref') + 1] || 'HEAD'));
else ok = check(worktreeSource());
process.exit(ok ? 0 : 1);
```

`--pushed` は各 ref の **tip commit だけ**を見る(中間 commit は見ない)。理由: 実害が出るのは配布元になる tip(Vercel は tip を deploy・`copy:ext` は作業ツリー)であり、中間 commit まで縛ると「ソース commit → dist commit」の2段 commit が全部赤になって過去履歴の push が詰まる。

### C-8. `.husky/pre-push`(全文・LF 必須)

```sh
#!/usr/bin/env sh
# pre-push は push 内容を変えられない(送る sha は確定済み)。ここで build しても
# 出力を捨てるか作業ツリーを汚すかしかない=buildId 無限差分ループの正体(2026-09-21)。
# 代わりに「push される commit の dist がその commit のソースから build されたものか」を指紋で照合する。
# ★stdin(refs)は最初に読み切る。後続の npm 子プロセスが stdin を食うと refs が消える。
PRE_PUSH_REFS="$(cat)"
export PRE_PUSH_REFS
if [ -z "$SKIP_DIST_GATE" ]; then
  node scripts/check-dist-fresh.mjs --pushed || exit 1
fi
npm test && npm run lint && npm run typecheck
```

### C-9. `.husky/pre-commit` 末尾追記

★実装時注意(司令塔裏取り): 現行`.husky/pre-commit`は既に
`agent-git.lock`ブロック→`impact-check`(非ブロック)→`tree-map`ゲート(ブロック)の順で
構成されている。以下は**この末尾に追記**すること(既存3ブロックは変更しない)。

```sh
# ★dist 鮮度ゲート(2026-09-21): ステージ内容(=コミットされる中身)でビルド入力と dist の対応を照合。
#   ここで止まれば「ソースだけ commit → 後で chore(dist)」の2段 commit が生まれない。
#   pre-push(--pushed)は第2、CI(--ref HEAD)は第3防衛線。緊急時は SKIP_DIST_GATE=1。
if [ -z "$SKIP_DIST_GATE" ]; then
  node scripts/check-dist-fresh.mjs --index || exit 1
fi
```

### C-10. `package.json` / `run-verify-cc.mjs` / `ci.yml`

```jsonc
"check:dist-fresh": "node scripts/check-dist-fresh.mjs",
"check:dist-fresh:selftest": "node scripts/check-dist-fresh.mjs --selftest"
```
```js
  ['build', 'build'],
  // ★2026-09-21: build 直後に「.dist-fingerprint.json と dist がこの作業ツリーのソースに対応しているか」。
  //   pre-commit(--index)/pre-push(--pushed)/CI(--ref HEAD)と同じ判定を、司令塔の手元でも先に見る。
  ['dist-fresh', 'check:dist-fresh'],
```
```yaml
      - name: dist freshness (build 忘れ / --no-verify の押し通し / マージ commit の不整合)
        run: node scripts/check-dist-fresh.mjs --ref HEAD
      - name: Verify (tests, lint, typecheck, build)
        run: npm run verify
```

### C-11. 必答論点 E: 影響範囲

| 箇所 | 影響 | 対処 |
|---|---|---|
| `scripts/build.mjs` | `metafile:true` + 指紋算出 + sidecar 書き出し。出力バンドルの中身は**不変**(define を足さない) | 上記 C-6 |
| `.husky/pre-push` | build が消える。test/lint/typecheck は残る(所要時間はほぼ不変・build 分の1秒が減るだけ) | C-8 |
| `scripts/run-verify-cc.mjs` | `build` ステップは**残す**(司令塔が commit 前に dist を作る唯一の経路)。直後に `dist-fresh` を1行追加。selftest は自動収集 | C-10 |
| `scripts/verify-bump.mjs` [3](dist mtime > manifest mtime) | **変更不要・影響なし**。ship 順は bump→build なので成立し続ける。pre-push が dist を触らなくなるので mtime も動かない。[3] は mtime ヒューリスティック(checkout 直後に偽赤が出うる)で、新ゲートは内容照合の強い形。将来 [3] を退役させる判断は別 PR(外科的に触らない) | なし |
| `verify-bump` [5](flamboyant の dist バイト一致) | 無関係(worktree 間比較) | なし |
| `scripts/copy-ext.mjs` / `verify-deploy.mjs` / `bundleBuildId.js` / `buildAgeCell.js` | `NL_BUILD_ID` の形式・位置とも不変なので無影響 | なし |
| `scripts/stage-submission.py` | sidecar はリポ直下なので `copy_tree(EXT_DIR/'dist')` に入らない | なし |
| `scripts/build-watch.mjs` | 出力に hot-reload コードが入るため outputs hash が sidecar と一致しない → push 前に `npm run build` を要求する(**望ましい副作用**: watch 出力の誤 push 防止) | なし |
| `scripts/feature-map.mjs`(esbuild を `NL_BUILD_ID:'""'` で別途実行) | dist に書かないので無影響 | なし |
| `check:tracked-imports` / `check:layer` | 新 lib は純関数、scripts が lib を import するのは verify-bump と同じ既存パターン | なし |
| `tree-map:check` | 新規ファイル3件で再生成が要る(ship 手順の既存ステップ) | `npm run tree-map` |
| CI `ci.yml` | `verify` は build 込みのまま(CI は commit しないので buildId が変わっても無害) | 1ステップ追加 |
| マージ commit(PR) | 両側が整合していても src が衝突解決されると tip の dist が古い → CI 赤。従来は黙って古い dist が master に入っていたので**改善** | 赤なら checkout→build→commit |
| ドキュメント | nicolive-ship SKILL.md「dist の buildId が必ず1つずれる。これは正常」/ MEMORY「pre-pushでdistのbuildIdが1つずれる(追わない)」が**偽**になる。AGENTS.md §2 の `NL_STORE_BUILD=1` も build.mjs ではもう読んでいない(今回の範囲外だが1行注記推奨) | 司令塔が更新 |

## D. 捨てた案と理由

| 案 | 捨てた理由 |
|---|---|
| `NL_BUILD_SRC_HASH` を define でバンドルへ埋め込む(会議の収束案そのまま) | 埋め込みは「バンドル↔指紋の紐付け」にしか使えず、**dist 15本のうち1本だけ add し忘れ**や手編集を検出できない。sidecar の「buildId マスク済み出力 hash」の方が強く、しかも実行時バンドルを1バイトも変えない。指紋の思想(時刻ではなく入力の同一性)は会議案を採用 |
| `NL_BUILD_ID` を固定/ハッシュ化 | `buildAgeCell.js` の計器が死ぬ(不可侵条件) |
| pre-push で一時ディレクトリに影ビルドして「buildId マスク済み」で比較 | 毎 push に esbuild を走らせる上、作業ツリーからしか build できず「push される commit ≠ HEAD」「入力が dirty」の場合に破綻 |
| `git diff HEAD~1` でソース変更検知(懸念2) | 複数 commit の push・別ブランチ push・ステージ済み未 commit を扱えない |
| `git rev-parse HEAD:src` の tree-hash | テスト・画像・音の変更でも build 要求が出る(過包含)。作業ツリー/索引では write-tree の細工が要る |
| 自動 `--amend` / squash(案3) | 全員否決。履歴改変 |
| pre-push 内で build → `git add` → push 内容を作り直す(論点D) | pre-push は ref の sha を変えられない |
| pre-commit で自動 build + 自動 `git add` | 部分ステージ時に索引と作業ツリーがずれる |
| `--pushed` で中間 commit も全件検査 | 過去の2段 commit 履歴の push が全部赤 |
| Node バージョンを指紋に含める | esbuild 出力は Node 版に依存せず、環境差の偽赤だけが増える |
| `verify-bump` [3] の mtime 検査を同時に撤去 | 別関心(外科的変更)。新ゲートが数版動いてから退役を判断 |

## E. 地雷と回避策(Windows / Git Bash 固有を含む)

1. **husky フックの CRLF**: `.husky/pre-push` が CRLF になると `sh` が死ぬ。`.gitattributes` に `.husky/* text eol=lf` を1行足して固定する。
2. **pre-push の stdin**: refs は stdin で来る。`npm test`(vitest)より**先に** `PRE_PUSH_REFS="$(cat)"` で読み切る。**stdin は sh の `cat` で読み、Node は環境変数から受ける**。
3. **`$(cat)` が空のとき**(手動実行等)は HEAD にフォールバックする(C-7)。空で緑にしない。
4. **shell を経由しない**: `execFileSync('git', [...])` で呼ぶ。`shell:true` だと日本語パスと引用符の罠。
5. **esbuild `metafile.inputs` のキー形式**: 実物を必ず印字して確認する(擬似入力混入時は除外条件を足す)。
6. **`hash-object --stdin-paths` の件数ずれ**: 例外にして黙って進めない。
7. **blob sha の一致条件**: 将来 `.js` に eol 正規化を足しても `hash-object`(filters 適用)と `ls-tree` は同じ値。**`--no-filters` を付けてはいけない**。
8. **sidecar の置き場**: リポ直下 `.dist-fingerprint.json`(`extension/dist/`内だとstage-submissionのcopy_treeに混入)。
9. **sidecar に buildId を書かない**: 書くと「build のたびに変わる追跡ファイル」が増えてループ復活。
10. **`NL_RELEASE=1` の dist を commit した場合**: mode=releaseで指紋整合、ゲートは緑。今回のゲートの関心外。
11. **部分ステージ**: 入力A'・B'でbuildしたのにA'だけステージすると`--index`が赤になる。これは正しい赤。
12. **`build:watch` 中に commit**: outputs hash不一致で赤。`npm run build`で緑。
13. **`SKIP_DIST_GATE=1`は両フック共通の1つの名前**(`SKIP_TREE_MAP_GATE`と同じ流儀)。
14. **verify:ccの`dist-fresh`はbuild直後**なので原理的に緑。本命はpre-commit/pre-push/CI。
15. **`check:layer`**: `src/lib/distFingerprint.js`は`node:*`を一切importしない。
16. **maskBuildIdの正規表現**は`bundleBuildId.js`と同じ形。両方変えるときは同時に。

## F. 検証手順

1. **metafileの形を実物で確認**: 一時的にconsole.logで`inputs.slice(0,5), inputs.length`を出し、`src/…`/`app/…`形式・node_modules無し・擬似入力無しを確認してから消す。
2. **ループ根治の核心(同一入力で2回build)**:
   ```
   npm run build && cp .dist-fingerprint.json /tmp/fp1.json
   npm run build && diff /tmp/fp1.json .dist-fingerprint.json && echo SAME
   git diff --stat -- extension/dist app/dist     # buildId 行だけの差
   node scripts/check-dist-fresh.mjs              # OK
   ```
3. **commit → push → 作業ツリーが空(受け入れ基準)**:
   `git add -A && npm run tree-map && git add -A && npm run verify:cc && git commit -m "..."` → `git push` → **`git status --porcelain`が空**であること。
4. **毒1: ソース変更・build忘れ**: ソースを1文字変えて`SKIP_DIST_GATE=1 git commit -am poison`→`node scripts/check-dist-fresh.mjs --ref HEAD`が赤→`git push`がpre-pushで止まる→`git reset --hard HEAD~1`。
5. **毒2: ツールチェーン変更(懸念1)**: `package-lock.json`の末尾に空行を足して同様に→赤。
6. **毒3: distのadd漏れ**: ソースを変えてbuild、`git add src .dist-fingerprint.json`だけで commit→`--ref HEAD`が赤。
7. **毒4: pre-commitの索引照合**: 毒1と同じ編集をSKIP無しで`git commit -a`→pre-commitで止まり指示コマンドが出る。
8. **毒5: build:watch出力**: `npm run build:watch`を数秒走らせて止め、`check-dist-fresh`が赤→`npm run build`で緑。
9. **selftest**: `npm run check:dist-fresh:selftest`単体で緑、`verify:cc`ログに自動収集で載ること。
10. **pre-pushのstdin経路(Windows実機)**: `printf 'refs/heads/x %s refs/heads/x 0000...\n' "$(git rev-parse HEAD)" | sh .husky/pre-push`で対象照合ログが出ること。空入力でHEADフォールバックが出ること。
11. **CI**: 毒1のcommitを`--no-verify`でpushした場合にCIだけが赤になること(第3防衛線の実証)。
12. **無傷の確認**: `copy:ext`のBUILD_ID表示、`verify:deploy`、status画面の「このビルドの新しさ」セルが従来通り。
13. **`verify-bump` [3]**: bump→build→`verify:bump`で[3]が緑のまま。
14. **ロールバック**: `.husky/pre-push`を`npm run verify`の1行に戻し、pre-commitの追記とci.ymlの1ステップを外せば旧挙動。`.dist-fingerprint.json`と2スクリプトは残しても無害。
