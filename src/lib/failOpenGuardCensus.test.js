import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1370: 「守るものが無いから通す」(fail-open)の【横断台帳】。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * なぜこの検査が要るか — 同じ型を4回踏んだから
 * ─────────────────────────────────────────────────────────────────────────
 *
 * タイル消失は「1つのバグ」ではなく【1つの型】が別の名前で再発し続けたもの:
 *
 *   | 版      | 素通りした枝                          | 名前            |
 *   |---------|---------------------------------------|-----------------|
 *   | v1251前 | DOM が 0枚 → 冪等ガードを通過         | (無名)          |
 *   | v1251前 | prev <= 0 → 縮小ガードを通過          | 前回タイル無し  |
 *   | v1251   | roster <= 0 → 名簿ガードを通過        | roster-empty    |
 *   | v1370   | !rosterLid → 名簿ガードを通過         | live-switch     |
 *
 * どれも判断としては正しい(「守る対象が無いなら止める理由が無い」)。
 * ★問題は【守る対象が"無い"のか"まだ分からない"のか】を区別しなかったこと。
 *   - 無い   (別配信・初回描画)     → 通してよい
 *   - 未確定 (起動直後・ID未設定)   → 通してはいけない(まだ何も分かっていないだけ)
 * [[decisions-accumulate-into-regressions-2026-08-11]]
 *
 * ■ この検査の役目(30年後に楽をするための本体)
 *   fail-open 分岐を【数で固定】する。新しく足したら必ずここが赤くなり、
 *   足した人は「これは"無い"か"未確定"か」を宣言させられる。
 *   ★数を増やすこと自体は禁止しない。無自覚に増えることだけを禁止する。
 *
 * ■ なぜ文字列一致でなく件数か
 *   実装の言い回しは変わる(!last / prev<=0 / roster<=0)。変わらないのは
 *   「早期 return で防御を降りる箇所がいくつあるか」。
 *   ★[[mutation-test-needs-anchored-regex-2026-08-05]]: 緩い regex は
 *     `if(false)` 前置を素通りするので、行の形ではなく【出現数】を断言する。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

/**
 * 「守りを降りる」早期 return を数える。
 * 対象: guard 関数内で防御を無効化して先へ通す分岐。
 */
function countFailOpenReturns(src, fnName) {
  const start = src.indexOf(`export function ${fnName}`);
  if (start < 0) throw new Error(`関数が見つからない: ${fnName}(改名したらこの検査も直すこと)`);
  // 関数本体を波括弧の対応で切り出す(素朴だが対象は小さな純関数のみ)。
  const open = src.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = src.slice(open, end);
  // skip:false を返す = 見送らない = 通す / return false = 守らない = 通す
  const passes = body.match(/return\s*\{\s*skip:\s*false/g) || [];
  const falses = body.match(/return\s+false\s*;/g) || [];
  return passes.length + falses.length;
}

describe('fail-open 台帳 — 「守るものが無いから通す」を無自覚に増やさない', () => {
  it('名簿ガード(lightSupplyOverwriteGuard)の fail-open は 5 箇所', () => {
    /*
     * 内訳(2026-08-12 v0.1.1370 時点・return 文の数で数える):
     *   1. settled              確定供給は常に通す(永久stale防止)
     *   2. live-unknown         現配信が不明=何を守るか決まらない
     *   3. live-switch          別IDへの切替=守る対象が別物
     *   4. roster-empty / roster-unestablished  名簿人数0(★1つの return が2つの理由を出し分ける)
     *   5. supply-complete      供給が名簿に追いついた=正常な更新
     * ★増やすときは、それが「無い」か「未確定」かを必ずコメントで宣言すること。
     *   未確定を通す枝を足すなら、それは v1370 と同じ穴を開けている。
     */
    const src = read('src/lib/lightSupplyOverwriteGuard.js');
    expect(countFailOpenReturns(src, 'shouldSkipLightSupplyOverwrite')).toBe(5);
  });

  it('縮小ガード(shouldKeepStoryUserLaneTilesOnShrink)の fail-open は 4 箇所', () => {
    /*
     * 内訳:
     *   1. entriesProvisional !== true  確定な正当減少は描く
     *   2. !last                        一度も描いていない=守るものが無い
     *   3. cur !== last                 本物の配信切替
     *   4. prev <= 0                    前回タイル無し
     * ★2 と 4 は「未確定」に化けうる枝(DOM が一瞬空になる窓が実在する)。
     *   ここを増やす/緩めるときは lightSupplyOverwriteGuard の名簿基準で
     *   代替できないかを先に検討すること(DOM は消える側の値=判断材料にしない)。
     */
    const src = read('src/extension/story/renderStoryUserLaneDom.js');
    expect(countFailOpenReturns(src, 'shouldKeepStoryUserLaneTilesOnShrink')).toBe(4);
  });

  it('★名簿ガードは「IDが空」を単独で通さない(v1370 の穴の再発防止)', () => {
    /*
     * 行の形で縛る唯一の検査。理由: この1行が穴そのものだったから。
     * 旧: if (!cur || !rosterLid || cur !== rosterLid) → 空を切替と同一視(穴)
     * 新: if (rosterLid && cur !== rosterLid)          → 空は下の名簿基準へ落とす
     */
    const src = read('src/lib/lightSupplyOverwriteGuard.js');
    expect(src).not.toMatch(/if\s*\(\s*!rosterLid\s*\|\|/);
    expect(src).toMatch(/if\s*\(\s*rosterLid\s*&&\s*cur\s*!==\s*rosterLid\s*\)/);
  });

  it('★判定と記録は同じ入口を通る(通した理由の記録漏れを構造で防ぐ)', () => {
    /*
     * popup-entry.js が生の shouldSkipLightSupplyOverwrite を直接呼ぶと
     * passReasons を記録し損ねる=「なぜ素通りしたか」が永久に分からない状態に戻る。
     * [[unwired-judgement-is-systemic-2026-08-12]]
     */
    const popup = read('src/extension/popup-entry.js');
    expect(popup).toContain('judgeAndRecordLightSupply');
    expect(popup).not.toContain('shouldSkipLightSupplyOverwrite(');
  });
});

/**
 * ★v0.1.1472: 台帳の【守備範囲】を広げる。
 *
 * ■ なぜ広げたか(2026-08-21)
 *   同じ型がさらに4件見つかった。★どれもこの台帳の範囲外(レーン描画の2関数しか見ていなかった)。
 *   ＝ ★仕掛けは正しいが、守備範囲が狭すぎて再発を止められなかった。
 *
 *   | # | 場所                        | 「無い」と混ぜた「まだ分からない」            |
 *   |---|-----------------------------|-----------------------------------------------|
 *   | ① | numberConsistency.js        | 別配信の値かもしれないのに比べた               |
 *   | ② | autoSectionCensus.js        | 0.7ms 測れているのに「まだ0」判定をすり抜けた |
 *   | B1| popup-entry.js:8776         | IDBが0件＝まだ移行途中かもしれないのに確定した |
 *   | B2| background.js:379-397       | read 失敗(分からない)を [] (無い)に握り潰した |
 *
 * ★①②は v0.1.1472 で修復済み。★B1/B2 は【記録経路】なので別リリース。
 *   忘れて放置されないよう、下の KNOWN_UNKNOWN_DEBT に【実名で】固定する。
 */
describe('★「無い」と「まだ分からない」— 台帳(v0.1.1472 で範囲拡大)', () => {
  it('★比較の前に liveId 一致を確かめている(numberConsistency)', () => {
    const src = read('src/lib/numberConsistency.js');
    // ★判定より前に比較可能性を問う、という構造そのものを固定する
    expect(src).toContain('classifyComparability');
    /*
     * ★falsified な名指しを【出力に】復活させない。
     *   ★コメント内の言及は許す(なぜ否定されたかの記録は残すべき)。
     *   ＝ 名前ではなく【形】を見る: message に入る文字列だけを対象にする
     *     ([[detect-the-shape-not-one-function-name]])。
     */
    const emitted = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(emitted).not.toContain('表示用の一部');
  });

  it('★起動直後の門番は「表示と同じ値」で判定する(autoSectionCensus)', () => {
    const src = read('src/lib/autoSectionCensus.js');
    // ★totalMs === 0 に戻すと、小数を積んだときに門番をすり抜ける
    expect(src).toContain('coveragePct === 0');
    expect(src).not.toMatch(/BOOT_SETTLE_MS\s*&&\s*totalMs === 0/);
  });

  it('★仕分けの正本が存在し、迷ったら unknown に倒す(fail-closed)', () => {
    const src = read('src/lib/unknownVsAbsent.js');
    expect(src).toContain('export const UNKNOWN');
    expect(src).toContain('export const ABSENT');
    // ★measured を書かない限り「無い」と名乗れない、という強制
    expect(src).toContain('input?.measured === true');
  });

  /*
   * ★未修復の借金を【実名で】固定する。
   *   ★オプトインの台帳は死ぬ([[opt-in-registry-always-ossifies]])ので、
   *     「書かないと赤」ではなく「★数が変わると赤」にする。
   *   ★直したらこの配列から消す＝そのとき件数が変わって赤くなり、直したことが記録に残る。
   */
  const KNOWN_UNKNOWN_DEBT = [
    {
      where: 'src/extension/popup-entry.js',
      what: 'readAllCommentsFromCommentDb の `cnt <= 0`',
      why: '★IDBに1行でもあれば chrome.storage の chunk を一切読まない。'
        + '0件を「無い」と決めているが、実際は「まだ移行途中」かもしれない',
      needle: 'if (cnt <= 0) return null;'
    },
    {
      where: 'extension/background.js',
      what: 'ensureLiveMigratedToDb の移行済みフラグ',
      why: '★read が失敗しても catch で [] にして、移行済みフラグを無条件に立てる。'
        + '「失敗した(分からない)」を「無い」として確定させている',
      needle: 'await chrome.storage.local.set({ [mkey]: true });'
    }
  ];

  it('★未修復の借金は2件(直したら数が変わって赤くなる)', () => {
    expect(KNOWN_UNKNOWN_DEBT).toHaveLength(2);
  });

  it('★借金は実在する(直ったのに台帳に残り続けるのを防ぐ)', () => {
    for (const debt of KNOWN_UNKNOWN_DEBT) {
      const src = read(debt.where);
      expect(
        src.includes(debt.needle),
        `${debt.where} の「${debt.what}」が見つからない。`
        + '直したなら KNOWN_UNKNOWN_DEBT から消すこと(消し忘れ防止)'
      ).toBe(true);
    }
  });
});

/**
 * ★v0.1.1473: 同じ型の【3件目】。
 *   配信が切り替わったのに「累計の床」を持ち越し、
 *   別配信の分子(1,910)を今の配信の分母(381)で割って ★取得率501% を出した。
 *   ★「一瞬の揺れで減った(まだ分からない)」と「配信が変わって減った(無い)」を混ぜた形。
 */
describe('★累計の床は配信の顔ぶれが変わったら捨てる(2026-08-21 実損: 501%)', () => {
  it('★床のリセットが status-entry に配線されている', () => {
    const src = read('src/extension/status-entry.js');
    // ★床は「どの配信に対する床か」を覚えていなければ、別配信へ持ち越してしまう
    expect(src).toContain('_recordedSumFloorKey');
    expect(src).toMatch(/_recordedSumFloorKey\s*\)?\s*\{[\s\S]{0,120}_recordedSumFloor\s*=\s*0/);
  });

  it('★表示側にも二重の守り(100%超は比を出さない)', () => {
    const src = read('src/lib/statusFormat.js');
    // ★比は床を掛ける前の実合算で出す
    expect(src).toContain('sumRecordedFromLives(livesData) / officialSum');
    expect(src).toContain('比較不能');
  });
});

/**
 * ★v0.1.1474: 同じ型の【4件目】。
 *   追いつき中(30%)なのに「取得率が下がり続けています(100%→0%)」の偽陽性。
 *   ★記録0件の一瞬を【追いつき中ではない】と記録していた
 *     ＝「まだ始まっていない」を「無い」として確定させた形。
 */
describe('★追いつき中の判定は1箇所で決める(2026-08-22 実損: 100%→0%)', () => {
  it('★判定が純関数に切り出され、status-entry が呼んでいる', () => {
    const src = read('src/extension/status-entry.js');
    expect(src).toContain('catchingUpVerdict.js');
    // ★2箇所とも同じ正本を通す(片方だけ条件が違うと片方だけ偽陽性になる)
    expect(src).toContain('isCatchingUp(');
    expect(src).toContain('anyCatchingUp(');
  });

  it('★記録0件を「追いつき中ではない」に倒さない', () => {
    const src = read('src/lib/catchingUpVerdict.js');
    // ★rec > 0 を条件に戻すと、開いた直後の一瞬が false になって偽陽性が復活する
    expect(src).not.toMatch(/return\s+rec\s*>\s*0\s*&&/);
  });
});

/**
 * ★v0.1.1475: 「窓」を、また誰かが消さないように固定する。
 *
 * ■ ★前提が消えたのに対策が戻らなかった型(今回の真因)
 *   v0.1.1051 上限48→200 ＋【40vh の縦スクロール枠】を追加
 *   v0.1.1139 上限200→48 ＋ ★枠を撤去(「48なら要らない」・二重スクロール解消)
 *   v0.1.1232 ★①の上限を撤廃
 *   v0.1.1234 ★③鏡の cap も撤廃(238人事件)
 *   ⟹ ★上限は消えたのに、枠は戻らなかった。実機857人で画面を突き抜けた。
 *
 * ■ 実測(chrome-devtools・857枚)
 *   窓なし 2,010px / 窓あり ★380px(81%減) / scrollHeight 2,010px
 *   ★タイルは857枚のまま＝1枚も消えていない。
 */
describe('★レーンの窓(v0.1.1475)— 消さない・capにしない', () => {
  it('★窓のCSSは popup.html と status.html の【両方】にある(2026-08-22 実損)', () => {
    /*
     * ★v0.1.1475 で popup.html にだけ入れ、status.html を忘れた。
     *   status は別文書なので CSS が共有されない。
     *   実機で status の DOM が 3,984個(推奨1,500の2.7倍)まで膨れ、
     *   ★read を1本も発行していない coreBatch×0 が 3,164ms かかった。
     */
    for (const f of ['extension/popup.html', 'extension/status.html']) {
      const html = read(f);
      expect(html, f + ' に窓のCSSが無い').toContain('nl-story-userlane--windowed');
    }
  });

  it('★窓のCSSが popup.html に存在する', () => {
    const html = read('extension/popup.html');
    expect(html).toContain('nl-story-userlane--windowed');
    // ★素直な max-height + overflow-y だけを使う(実測否定済みの手口を使わない)
    expect(html).toMatch(/nl-story-userlane--windowed[\s\S]{0,200}overflow-y:\s*auto/);
  });

  it('★実測否定済みの手口をレーンに使わない', () => {
    const html = read('extension/popup.html');
    // ★content-visibility は v0.1.648 で撤去(18,300件配信で白化)。2回撤去している
    // ★contain: size は 2026-08-19 実測で高さ0・クリック判定が壊れた
    const windowBlock = html.slice(
      html.indexOf('nl-story-userlane--windowed'),
      html.indexOf('nl-story-userlane--windowed') + 300
    );
    expect(windowBlock).not.toContain('content-visibility');
    expect(windowBlock).not.toMatch(/contain\s*:[^;]*size/);
  });

  it('★判定は純関数が正本で、renderStoryUserLaneDom が呼んでいる', () => {
    const src = read('src/extension/story/renderStoryUserLaneDom.js');
    expect(src).toContain('laneWindowVerdict.js');
    expect(src).toContain('judgeLaneWindow(');
  });

  it('★窓は「枚数を減らす」判断をしない(capにならないことの構造固定)', () => {
    const src = read('src/lib/laneWindowVerdict.js');
    // ★slice / limit / cap が入ったら、それはもう窓ではなく cap
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/\.slice\(/);
    expect(code).not.toMatch(/\blimit\b/);
    expect(code).not.toMatch(/\bcap\b/);
  });
});
