import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1373: 「中身が見えない時間」を判定に配線する。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 実機がこう出した(2026-08-12・ユーザーの黒いパネル)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   サイドパネル自己診断: ✅正常 / ...
 *     ★中身が見えなかった合計=12773ms(幕660ms / シェード12773ms) 主因=初回シェード
 *
 * ★12.7秒も中身が出ていないのに【✅正常】。ユーザーには黒く見えているのに、
 *   計器は「正常」と言い張っていた。
 *
 * ■ なぜ漏れたか
 *   judgeSidepanelBlack は【その瞬間のサンプル】(塗り主・層の色)だけを見る。
 *   合算値(summarizeContentBlindTime)は v0.1.1370 で作ったのに、
 *   ★【判定には配線していなかった】=作っただけで使っていない
 *   ([[unwired-judgement-is-systemic-2026-08-12]] を私がまた踏んだ)。
 *
 * ■ 同じ速報が真因も示していた
 *     更新所要 48820ms / 記録中 2 配信 / 窓0x0の継続=t=1858〜10688ms
 *   ＝2配信同時記録で storage が飽和し、シェードが待つ「データ」が来ない。
 *   シェードの上限(旧10秒・CSS保険15秒)が、そのまま体感の黒時間になっていた。
 *   ★別のスクショでは同じパネルが正常に描けている=「描けない」のではなく
 *     【描けるまで待たされている】。だから上限を短くするのが正しい直し方。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

const panelSrc = read('src/extension/sidepanel-entry.js');
const popupSrc = read('src/extension/popup-entry.js');
const popupHtml = read('extension/popup.html');

describe('★「中身が見えない時間」を異常として判定する', () => {
  it('合算値(blindMs)が閾値を超えたら異常にする', () => {
    expect(panelSrc).toContain('CONTENT_BLIND_ALERT_MS');
    expect(panelSrc).toMatch(/const blindTooLong = blind\.blindMs >= CONTENT_BLIND_ALERT_MS;/);
  });

  it('★ok の判定に含まれている(作っただけで使わない、をしない)', () => {
    expect(panelSrc).toMatch(/const overallOk =[^;]*!blindTooLong/);
  });

  it('★記録(保存)は overallOk=この起動で一度でも異常があったか', () => {
    expect(panelSrc).toMatch(/ok: overallOk,/);
  });

  /*
   * ★v0.1.1374: 記録と通知は目的が違う。
   *   実機で v1373 を入れた直後、「合計909ms」(正常な起動時の読み込み)なのに
   *   ⚠オーバーレイが【出っぱなし】になった。blindMs は累積値なので、
   *   一度超えたら永久に超えたまま=「いま異常か」を表せない。
   *   ★正常なのに警告が居座るのはノイズ＝価値が負
   *     ([[instrument-value-is-measured-by-fixes-2026-08-12]])。
   */
  it('★画面に出すのは「いま現に中身が無い」ときだけ(累積値で居座らせない)', () => {
    expect(panelSrc).toContain('function isBlackRightNow(');
    expect(panelSrc).toContain('renderSelfDiagOverlay({ ok: !isBlackRightNow(verdict, sample)');
    // overallOk(累積)を表示条件に使っていないこと=居座りの再発防止。
    expect(panelSrc).not.toContain('renderSelfDiagOverlay({ ok: overallOk');
  });

  it('★未レイアウト(窓0x0)は異常と呼ばない(拡張からは塗れない時間帯)', () => {
    const start = panelSrc.indexOf('function isBlackRightNow(');
    const body = panelSrc.slice(start, panelSrc.indexOf('\n}\n', start));
    expect(body).toMatch(/startsWith\('未レイアウト'\)/);
  });

  /*
   * ★v0.1.1374 の実測で棄却した案: 「bodyKids>0 なら正常とみなす」。
   *   about:blank(中身が読めていない最悪の状態)でも body の子要素は存在しうるため、
   *   これを正常判定に使うと【本物の異常で警告が出なくなる】。実ブラウザで実際にそうなった。
   *   ★独自の閾値を作らず、判定済みの verdict.cause に委ねるのが正しい
   *     ([[measure-the-region-you-claim-2026-08-10]]: 決め打ちの計器は別物を測る)。
   */
  it('★独自の閾値を作らず verdict に委ねる(bodyKidsで正常判定しない)', () => {
    const start = panelSrc.indexOf('function isBlackRightNow(');
    const body = panelSrc.slice(start, panelSrc.indexOf('\n}\n', start));
    // 「子要素があるから正常」という判定を持たないこと(本物の異常を隠すため)。
    expect(body).not.toMatch(/kids > 0\) return false/);
    // 判定の根拠は verdict.ok / verdict.cause であること。
    expect(body).toMatch(/verdict\.ok === true/);
  });

  it('cause が「何秒出ていないか」と主因を名指しする', () => {
    expect(panelSrc).toMatch(/中身が\$\{[^}]+\}秒出ていない/);
  });

  it('★閾値はシェード上限(2.5秒)より後(正常な起動を異常と呼ばない)', () => {
    /*
     * ★v0.1.1374: 実機の改善後は 909ms(正常な起動時の読み込み)。
     *   1秒だと正常な起動が毎回「異常」になる=オオカミ少年。
     *   シェード上限(INLINE_SHADE_DATA_FALLBACK_MS=2.5s)を越えて中身が無いなら本物。
     */
    const m = panelSrc.match(/const CONTENT_BLIND_ALERT_MS = ([\d_]+);/);
    expect(m).toBeTruthy();
    const ms = Number(String(m[1]).replace(/_/g, ''));
    const shade = Number(
      String(popupSrc.match(/const INLINE_SHADE_DATA_FALLBACK_MS = ([\d_]+);/)[1]).replace(/_/g, '')
    );
    expect(ms).toBeGreaterThan(shade);
    expect(ms).toBeLessThanOrEqual(8000);
  });
});

describe('★シェードの上限 — 待たせるほど黒く見える', () => {
  it('JS 側の上限が実機の症状(12.7秒)より十分短い', () => {
    const m = popupSrc.match(/const INLINE_SHADE_DATA_FALLBACK_MS = ([\d_]+);/);
    expect(m).toBeTruthy();
    const ms = Number(String(m[1]).replace(/_/g, ''));
    expect(ms).toBeLessThanOrEqual(3000);
  });

  it('★CSS の最後の保険も短い(ここが長いと体感時間を決めてしまう)', () => {
    /*
     * JS が止まった場合に効く保険。旧 15s は「中身が見えない 12.7秒」を
     * 許す長さだった。JS側(2.5s)より後・ただし体感を壊さない範囲に収める。
     */
    const m = popupHtml.match(/animation: nl-init-shade-css-failsafe (\d+)s/);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBeLessThanOrEqual(6);
  });

  it('CSS 保険は JS 側の上限より後(先に消えて幕が復活する、を作らない)', () => {
    const js = Number(
      String(popupSrc.match(/const INLINE_SHADE_DATA_FALLBACK_MS = ([\d_]+);/)[1]).replace(/_/g, '')
    );
    const css = Number(popupHtml.match(/animation: nl-init-shade-css-failsafe (\d+)s/)[1]) * 1000;
    expect(css).toBeGreaterThan(js);
  });

  it('★CSS保険は「不透明のまま待ち続けない」(v0.1.1414・実機で黒かった真因)', () => {
    /*
     * ■ 何が起きていたか
     *   旧 keyframes は `0%, 93% { opacity: 1 }` = 5秒のうち **4.65秒は完全不透明**。
     *   JS 上限は 2.5秒に短縮済みだったが、JS の解除が遅れると
     *   **この CSS が体感の黒時間を決めていた**。
     *   実機速報: shadeAgeMs 427 / shadeDone false / dismissCalls 0
     *   ＝JS がまだ解除を呼べていない区間で全面が覆われていた。
     *
     * ★総時間(5s)だけを見る上の検査では**この穴を検出できなかった**。
     *   「いつ薄れ始めるか」を別に固定する。
     */
    /*
     * ★ブロック全体を取る。`[\s\S]*?\}` だと **最初の } で止まり**、
     *   1行目しか読めずに検査が素通りする(実際にこれで変異が緑になった)。
     *   ネストの無い keyframes なので「最後の }」まで貪欲に取り、
     *   宣言行(`N% { ... }`)だけを対象にする。
     */
    const start = popupHtml.indexOf('@keyframes nl-init-shade-css-failsafe');
    expect(start, 'keyframes が見つからない').toBeGreaterThan(-1);
    const open = popupHtml.indexOf('{', start);
    // 閉じ括弧を数えてブロック末尾を求める
    let depth = 0;
    let end = -1;
    for (let i = open; i < popupHtml.length; i += 1) {
      const ch = popupHtml[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    expect(end, 'keyframes の終端が読めない').toBeGreaterThan(open);
    const body = popupHtml.slice(open + 1, end);

    /*
     * opacity:1 を保つ最後の停止点(%)を取る。
     * ★`0%, 93% { opacity: 1 }` のように**セレクタに複数の%が並ぶ**ので、
     *   1個目だけ拾うと 0 になり検査が恒真化する(実際にこれで変異が緑になった)。
     *   宣言ごとに「セレクタ部分の全ての%」を見る。
     */
    const holdStops = [];
    for (const decl of body.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const selector = decl[1];
      const props = decl[2];
      if (!/opacity:\s*1\b/.test(props)) continue;
      for (const pct of selector.matchAll(/([\d.]+)%/g)) {
        const n = Number(pct[1]);
        if (Number.isFinite(n)) holdStops.push(n);
      }
    }
    const lastHold = Math.max(...holdStops, 0);

    const totalMs = Number(popupHtml.match(/animation: nl-init-shade-css-failsafe (\d+)s/)[1]) * 1000;
    const jsMs = Number(
      String(popupSrc.match(/const INLINE_SHADE_DATA_FALLBACK_MS = ([\d_]+);/)[1]).replace(/_/g, '')
    );

    // ★JS の上限を過ぎたら薄れ始めていること
    const holdMs = (lastHold / 100) * totalMs;
    expect(
      holdMs,
      `幕が不透明のまま ${holdMs}ms 待っている(JS上限 ${jsMs}ms を過ぎたら薄れ始めるべき)`
    ).toBeLessThanOrEqual(jsMs);
  });
});
