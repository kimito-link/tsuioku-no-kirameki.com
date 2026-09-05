import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTRAS_BATCH_KEYS, pickExtrasBatchValues } from './statusExtrasBatch.js';
import { KEY_SIDEPANEL_SELF_DIAG } from './sidepanelSelfDiagKey.js';
import { buildAiShareFullText } from './aiShareFullText.js';

/**
 * ★サイドパネル自己診断が【storage から状態速報の1行まで実際に届くか】の通し検査。
 *
 * ■ なぜこれが要るか(2026-08-08 の失敗)
 *   v0.1.1295 で自己診断を入れ「これで原因が分かります」と出荷したが、
 *   実機の状態速報に【その行が1つも出なかった】。
 *   真因: status-entry.js の renderAll が引数リストに sidepanelSelfDiag を
 *   持っておらず、呼び出し側が渡しても受け取り側で undefined に落ちていた。
 *   個々の部品(判定関数・整形関数)は緑だったのに、繋がっていなかった。
 *
 *   = [[wiring-test-must-assert-counts]] / v1286-1287 と同型の穴。
 *   「部品が動く」ことと「端から端まで届く」ことは別。だから通しで検査する。
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const statusSrc = fs.readFileSync(
  path.resolve(__dirname, '../extension/status-entry.js'),
  'utf8'
);

const LINE = 'サイドパネル自己診断: 🔴黒くなりうる / v0.1.1295 / 680x1100 / 外✅ iframe🔴 中✅ / 原因=iframeが潰れている(0x0)';

describe('サイドパネル自己診断: storage → 状態速報 の通し', () => {
  it('① extras の読み込みキーに含まれている', () => {
    expect(EXTRAS_BATCH_KEYS).toContain(KEY_SIDEPANEL_SELF_DIAG);
  });

  it('② storage の値が pick で取り出せる', () => {
    const picked = pickExtrasBatchValues({ [KEY_SIDEPANEL_SELF_DIAG]: { line: LINE } }, Date.now());
    expect(picked.sidepanelSelfDiag).toEqual({ line: LINE });
  });

  it('★③ renderAll が引数として受け取っている(ここが抜けて実機で出なかった)', () => {
    // 呼び出し側が渡しても、受け取り側の分割代入に無ければ undefined に落ちる。
    // ★シグネチャの `{ ... }` だけを厳密に切り出して見る。
    //   `+1400文字` のような緩い切り出しだと、後続の【呼び出し側】の同名文字列を
    //   拾ってしまい、受け取りを削る変異を素通しする(実際に素通しさせた)。
    const head = 'function renderAll({';
    const start = statusSrc.indexOf(head);
    expect(start).toBeGreaterThan(0);
    const close = statusSrc.indexOf('})', start);
    expect(close).toBeGreaterThan(start);
    const params = statusSrc.slice(start + head.length, close);
    expect(params).toContain('sidepanelSelfDiag');
  });

  it('★④ renderAll から buildAiShareFullText へ渡している', () => {
    const callIdx = statusSrc.indexOf('buildAiShareFullText({');
    expect(callIdx).toBeGreaterThan(0);
    const call = statusSrc.slice(callIdx, callIdx + 1400);
    expect(call).toContain('sidepanelSelfDiag');
  });

  it('★⑤ 整形結果に実際に1行として現れる(端から端まで)', () => {
    const out = buildAiShareFullText({
      overviewText: 'x',
      livesData: [],
      fastDiag: {},
      popupDiag: {},
      sidepanelSelfDiag: { line: LINE }
    });
    const text = typeof out === 'string' ? out : String(out?.text || '');
    expect(text).toContain('サイドパネル自己診断');
    expect(text).toContain('iframeが潰れている');
  });

  /*
   * ★v0.1.1351: 「起動から30秒より後に黒くなる」経路の配線検査。
   *
   * ■ 2026-08-12 のユーザー実機
   *   ニコ生でない普通のページ(chikuwachan.com)を開いた状態でパネルが真っ黒だった。
   *   ところが従来の観測点は SAMPLE_AT_MS の最後=30秒で打ち切りで、それ以降を
   *   一度も測らない。つまりこの経路は【構造的に観測できず】、速報は永久に
   *   「✅正常」と言い続ける([[zero-count-may-mean-unmeasured]] と同型)。
   *
   *   ★v0.1.1307 で 3500ms→30000ms に伸ばしたのと同じ型の穴である。
   *     端を伸ばすだけでは窓の外の症状は消えない=【測り直す契機】が要る。
   */
  describe('★あとから黒くなる経路(30秒より後)', () => {
    const panelSrc = fs.readFileSync(
      path.resolve(__dirname, '../extension/sidepanel-entry.js'),
      'utf8'
    );

    it('遅い定期観測がある(居座る黒を必ず1回は捕まえる)', () => {
      expect(panelSrc).toContain('LATE_PROBE_INTERVAL_MS');
      expect(panelSrc).toMatch(/setInterval\(/);
      expect(panelSrc).toContain("collectAndPublish('late')");
    });

    it('可視化された瞬間に測り直す(ユーザーが「見て黒い」と気づく瞬間と一致)', () => {
      expect(panelSrc).toContain('visibilitychange');
      expect(panelSrc).toContain("collectAndPublish('visible')");
    });

    it('★iframe の再 load でも測り直す(once を付けない=今回のスクショの経路)', () => {
      expect(panelSrc).toContain("collectAndPublish('reload')");
      // 初回 load 用の once:true とは別に、once の付かない load 監視があること。
      const loadHandlers = panelSrc.match(/addEventListener\('load'/g) || [];
      expect(loadHandlers.length).toBeGreaterThanOrEqual(2);
    });

    it('★rAF で経過を測らない(タブ非表示で止まる=G5)', () => {
      expect(panelSrc).not.toContain('requestAnimationFrame');
    });

    it('late の黒は _worst と別の箱に持つ(「出た直後だけ黒い」と誤表示しない)', () => {
      expect(panelSrc).toContain('_lateBlack');
      expect(panelSrc).toContain('あとから黒くなった');
    });

    it('★late を観測したら ok=false になる(行と判定が食い違わない)', () => {
      // ★v0.1.1373: 判定式は overallOk に切り出した(表示と保存で同じ値を使うため)。
      //   !_lateBlack が条件から落ちたら赤になるよう、式そのものを固定する。
      expect(panelSrc).toContain('!_lateBlack && !blindTooLong');
      expect(panelSrc).toMatch(/ok:\s*overallOk,/);
    });

    it('lateBlack が storage の payload に載る(画面止まりにしない)', () => {
      expect(panelSrc).toContain('lateBlack: _lateBlack');
    });

    it('★整形結果に「あとから黒くなった」が1行として現れる(端から端まで)', () => {
      const lateLine =
        'サイドパネル自己診断: 🔴黒くなりうる / v0.1.1351 / 400x1100 / 外✅ iframe✅ 中🔴 ' +
        '/ ★あとから黒くなった(起動312秒後のreloadで検知・2回・原因=中身が塗っていない)';
      const out = buildAiShareFullText({
        overviewText: 'x',
        livesData: [],
        fastDiag: {},
        popupDiag: {},
        sidepanelSelfDiag: { line: lateLine }
      });
      const text = typeof out === 'string' ? out : String(out?.text || '');
      expect(text).toContain('あとから黒くなった');
      expect(text).toContain('起動312秒後');
    });
  });

  /*
   * ★v0.1.1364(ユーザー実機 2026-08-12・パネルが全面暗いまま中身が出ない)
   *   自己診断は【幕(cloak)】だけを見ており、初回ロードシェード
   *   (nlInitialLoadShade)を1度も観測していなかった。
   *   ところが画面を覆う時間はシェードの方が長い:
   *     JS=実データが乗るまで最大10秒 / CSSの保険=15秒
   *   ＝「開いているのに中身が出ない」の主因になりうるのに速報に1文字も出ていなかった。
   *   ★計器の無い欠落は永久に出ない。
   */
  describe('★初回シェードの観測(幕より長く中身を覆う)', () => {
    const panelSrc = fs.readFileSync(
      path.resolve(__dirname, '../extension/sidepanel-entry.js'),
      'utf8'
    );

    it('シェード要素を観測している', () => {
      expect(panelSrc).toContain('nlInitialLoadShade');
    });

    it('★覆っている/フェード中/完了 を区別する(見えていない状態を覆っていると誤報しない)', () => {
      expect(panelSrc).toContain("'covering'");
      expect(panelSrc).toContain("'fading'");
      expect(panelSrc).toContain("'done'");
      // opacity がほぼ0なら覆っていない扱いにしていること。
      expect(panelSrc).toMatch(/opacity\)\s*<\s*0\.05/);
    });

    it('覆っていた最後の時刻を残す(継続時間が読める)', () => {
      expect(panelSrc).toContain('_shadeCoveringLastT');
      expect(panelSrc).toContain('shadeCoveringLastT:');
    });

    it('★行に出す(画面止まりにしない)', () => {
      expect(panelSrc).toContain('初回シェード');
      expect(panelSrc).toContain('${shadeNote}');
    });

    it('一度も覆っていなければ注記を出さない(正常時のノイズにしない)', () => {
      expect(panelSrc).toMatch(/_shadeCoveringLastT >= 0[\s\S]{0,200}?:\s*''/);
    });
  });

  it('自己診断が無い(サイドパネル未使用)なら行を出さない=通常時のノイズにしない', () => {
    const out = buildAiShareFullText({
      overviewText: 'x',
      livesData: [],
      fastDiag: {},
      popupDiag: {},
      sidepanelSelfDiag: null
    });
    const text = typeof out === 'string' ? out : String(out?.text || '');
    expect(text).not.toContain('サイドパネル自己診断');
  });
});
