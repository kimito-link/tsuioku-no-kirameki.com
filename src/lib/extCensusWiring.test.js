import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTRAS_BATCH_KEYS, pickExtrasBatchValues } from './statusExtrasBatch.js';
import { KEY_EXT_PROCESS_CENSUS } from './extProcessCensusKey.js';
import { buildAiShareFullText } from './aiShareFullText.js';

/**
 * 拡張プロセスの忙しさ台帳(v0.1.1580)の「配線忘れ=CI赤」ガード。
 *   手で書く登録表は必ず穴が開く(MEMORY)。全エントリが起動処理を import していることを機械で固定する。
 *   ★記録(コメント保存)の経路に触れないことも import/参照で固定する。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');
/** コメントを除いた【コード】だけ(説明文が「触らない」と書いたキー名や chrome.* に当たらないように)。 */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** 拡張プロセスで動く文書のエントリ(extension/*.html に対応する)。 */
const DOC_ENTRIES = ['popup', 'sidepanel', 'status', 'comeview', 'live-view', 'venue', 'offscreen', 'marketing-export'];

describe('全拡張文書が忙しさ台帳の起動処理を import している', () => {
  for (const name of DOC_ENTRIES) {
    it(`${name}-entry.js が extDocBusyCensusBoot.js を import する`, () => {
      expect(read(`src/extension/${name}-entry.js`)).toMatch(/^import '\.\.\/lib\/extDocBusyCensusBoot\.js';$/m);
    });
  }

  it('★extension/ の html が増えたら、このテストの一覧(DOC_ENTRIES)も増やす(手で書く表の穴を機械で塞ぐ)', () => {
    const htmls = ['popup', 'sidepanel', 'status', 'comeview', 'live-view', 'venue', 'offscreen', 'marketing-export'];
    for (const h of htmls) {
      const html = read(`extension/${h}.html`);
      expect(html, `${h}.html が dist/${h}.js を読んでいる`).toMatch(/dist\/[a-z-]+\.js/);
    }
    // extension/ 直下の html 一覧と一致(新しい文書を足したのに台帳に載せ忘れていたら赤)
    const files = readdirHtml();
    expect(files.sort()).toEqual(htmls.slice().sort());
  });

  it('SW のバンドル(backfill-sw-entry.js)が受け口 ext-census-sw.js を import する', () => {
    expect(read('src/extension/backfill-sw-entry.js')).toMatch(/^import '\.\/ext-census-sw\.js';$/m);
  });
});

function readdirHtml() {
  return readdirSync(path.join(repoRoot, 'extension'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => f.replace(/\.html$/, ''));
}

describe('記録(コメント保存)の経路に触れない', () => {
  const recordKeyRe = /nls_ctail_|nls_comments_|nls_cchunk_|nls_csummary_|nls_cdb_summary_/;
  for (const rel of [
    'src/lib/extDocBusyCensus.js',
    'src/lib/extDocBusyCensusBoot.js',
    'src/lib/extProcessCensusKey.js',
    'src/extension/ext-census-sw.js'
  ]) {
    it(`${rel} は記録系の storage キーを参照しない`, () => {
      expect(code(rel)).not.toMatch(recordKeyRe);
    });
  }

  it('文書側(boot)は storage に書かない(書き手は SW の1か所)', () => {
    const src = code('src/lib/extDocBusyCensusBoot.js');
    expect(src).not.toMatch(/storage\.local\.set|storage\.session\.set|\.set\(\{/);
  });

  it('純関数(extDocBusyCensus.js)は chrome.* に触れない', () => {
    expect(code('src/lib/extDocBusyCensus.js')).not.toMatch(/\bchrome\./);
  });
});

describe('状態速報への配線', () => {
  it('台帳キーは status の統合 get(EXTRAS_BATCH_KEYS)に同梱される=読み取り回数は増えない', () => {
    expect(EXTRAS_BATCH_KEYS).toContain(KEY_EXT_PROCESS_CENSUS);
    expect(new Set(EXTRAS_BATCH_KEYS).size).toBe(EXTRAS_BATCH_KEYS.length); // 重複キーで read が増えない
  });

  it('pickExtrasBatchValues が processCensus を取り出す(無ければ null)', () => {
    const rec = { at: 1, docs: [], bl: {} };
    expect(pickExtrasBatchValues({ [KEY_EXT_PROCESS_CENSUS]: rec }, 1).processCensus).toBe(rec);
    expect(pickExtrasBatchValues({}, 1).processCensus).toBeNull();
  });

  it('速報本文に「拡張プロセスの忙しさ」が出る。台帳が空/無しなら「未受信」(0件の緑にしない)', () => {
    const base = { overviewText: 'x', livesData: [], fastDiag: {} };
    expect(buildAiShareFullText({ ...base, processCensus: null })).toContain('拡張プロセスの忙しさ: ⏳未受信');
    const now = Date.now();
    const rec = {
      at: now,
      bl: {},
      docs: [{ i: 'aaaa1111', s: 'popup-watch', a: 100, lt: [3, 20000, 9000], lg: [100, 50, 2], oc: [], hp: null, seenAt: now, firstSeenAt: now }]
    };
    const text = buildAiShareFullText({ ...base, processCensus: rec });
    expect(text).toContain('popup-watch#1111');
    expect(text).toContain('犯人候補');
  });

  it('台帳キーの書き手は SW(ext-census-sw.js)だけ。他の src は KEY_EXT_PROCESS_CENSUS を set しない', () => {
    const sw = read('src/extension/ext-census-sw.js');
    expect(sw).toMatch(/storage\.set\(\{ \[KEY_EXT_PROCESS_CENSUS\]/);
  });
});
