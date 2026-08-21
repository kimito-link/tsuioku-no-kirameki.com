import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

/**
 * ★DOM属性の「書き手↔読み手」を機械的に突き合わせる(理解の土台)。
 *
 * ■ ★ユーザー方針(2026-08-21)
 *   「まずは根本解決の土台として**ソースコード丸ごと理解**がいる」「**改善はそのあと**」
 *
 * ■ ★なぜ「ファイル単位の地図」では足りなかったか(実測)
 *   このリポは `docs/code-tree.md` で **役割コメント 816/822 = 99.3%** を達成している。
 *   それでも 2026-08-21 に見つかった不具合5件は **1件も検出できなかった**。
 *   ★共通点: どれも「値の書き手と読み手の対」の破れ＝**1ファイルを読んでも見えない**。
 *
 * ■ ★新規発明ではない(既存の実績をDOM属性へ広げただけ)
 *   storage キーには既に同じ検出器(`writeStorageBusMap`)があり実際に効いていた。
 *   `storage-bus.md` 自身が「将来は verify:map で機械判定する」と次の一手を書いていた。
 *
 * ■ ★静的解析だけで足りる根拠(実測・推測ではない)
 *   `setAttribute('data-nls-…')` のリテラル 31種 / 動的生成(テンプレート・連結) **0件**。
 *   → ランタイム計測は不要。会議の批判役は「動的があるから必須」と主張したが、
 *     ★このリポには当てはまらないことを実測で確認して**採らなかった**。
 */
describe('★DOM属性の書き手↔読み手(理解の土台)', () => {
  const busMd = () => read('docs/feature-map/dom-attr-bus.md');

  it('★生成物が存在する(feature-map に相乗り・新規スクリプトを作らない)', () => {
    expect(busMd()).toContain('DOM属性 データバス図');
    // ★正本を散らさない: 既存 feature-map.mjs が生成する
    const src = read('scripts/feature-map.mjs');
    expect(src).toContain('writeDomAttrBusMap');
    expect(src).toContain('extractDomAttrAccess');
  });

  it('★★自分の属性だけを対象にする(他人のDOMを読むだけは断線ではない)', () => {
    /*
     * ★絞らないと ニコ生本体の属性(data-props / data-testid / data-user-id 等)が
     *   「読む人だけ」として大量に並ぶ。実測: 63件中38件が外部＝ノイズ。
     *   ★ノイズの多い検出器は読まれなくなって死ぬ。
     */
    const src = read('scripts/feature-map.mjs');
    expect(src).toContain('isOwnDomAttr');
    const disconnects = busMd().split('## 全属性')[0];
    for (const foreign of ['data-props', 'data-testid', 'data-user-id', 'data-server-rendered']) {
      expect(disconnects, `外部の属性 ${foreign} が断線に出ている(ノイズ)`)
        .not.toContain(`**${foreign}**`);
    }
  });

  it('★★定数経由の書き手を見落とさない(生grepだと誤検出する)', () => {
    /*
     * ★`INLINE_HOST_HIDDEN_ATTR = 'data-nls-hidden'` は
     *   inlineHostVisibilityIntent.js:103 で定義し content-entry.js が setAttribute する。
     *   ★ファイル内だけ見ると「書き手なし」と誤判定した(実際に一度出した)。
     *   ★2026-08-21 に同型で iframe.nl-ifr-loading を「死んだCSS」と誤判定している。
     */
    const src = read('scripts/feature-map.mjs');
    expect(src, '全ファイル横断の定数辞書が無い').toContain('globalConstAttr');
    const disconnects = busMd().split('## 全属性')[0];
    expect(disconnects, 'data-nls-hidden は定数経由で書かれている(断線ではない)')
      .not.toContain('**data-nls-hidden**');
  });

  it('★dataset 表記の書き手も拾う(el.dataset.nlRecording = v)', () => {
    const src = read('scripts/feature-map.mjs');
    expect(src).toContain('camelToKebab');
    const disconnects = busMd().split('## 全属性')[0];
    expect(disconnects, 'data-nl-recording は dataset で書かれている')
      .not.toContain('**data-nl-recording**');
  });

  it('★★「読むが誰も書かない」＝バグ候補を名指しできる', () => {
    /*
     * ★これが検出器の存在意義。書きっぱなし(🟠)より、
     *   ★**読んでいるのに書き手が居ない(🔵)方が実害**(常に空を読み続ける)。
     */
    expect(busMd()).toContain('🔵');
    expect(busMd()).toContain('読む人だけ');
  });

  it('★★見つけたバグを実際に消した(検出して終わりにしない)', () => {
    /*
     * ★過去最大の失敗は「計器を足して満足し、直さない」
     *   ([[counting-is-not-fixing-2026-08-13]] ユーザー「一体なんのため」)。
     *   ★なので検出器を入れた同じ版で、見つけた1件を消す。
     *
     * `data-nls-fiber-diag` は content-entry.js:9334 が読んでいたが、
     * ★書き手が repo 全体に存在せず **常に空文字** を診断へ入れていた。
     */
    const src = read('src/extension/content-entry.js');
    expect(src, '書き手の無い属性をまだ読んでいる').not.toContain("'data-nls-fiber-diag'");
  });

  it('★★サボると赤くなる(ベースラインに無い新規の断線で exit 1)', () => {
    /*
     * ★このリポで生き残った仕掛けは**全てこの形**
     *   (未記入数を固定するテスト / バンドル予算)。
     *   死んだのは「オプトインの台帳」＝デフォルト値を用意した瞬間に死ぬ。
     */
    const src = read('scripts/feature-map.mjs');
    expect(src).toContain('DOM_ATTR_DISCONNECT_BASELINE');
    expect(src, '新規の断線を checkProblems に積んでいない')
      .toContain('新規の DOM属性 断線');
  });
});
