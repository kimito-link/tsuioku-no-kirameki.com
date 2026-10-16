/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】会場のホバーカードの「セリフ(発言の行)」がちゃんと出ているかを数える計器
 * 【この箱に入らないもの】DOM・storage・chrome.*(観測のみ。何も書き換えない)
 * 【書けるstorageキー】なし
 * 【正本宣言】「セリフが出ているか」の判定と1行の文面はこのファイルのみ
 *
 * venueSpeechCensus.js — 会場モードのホバーカードに「セリフ」が出ているかの診断(2026-10-12・ユーザー要望)。
 *
 * ■ 背景
 *   ユーザー実機: 会場のホバーカードに「発言1(12分前)・いまは聞いている」とは出るが、その人の発言の中身(セリフ)が出ない。
 *   原因は、鏡のセルには発言(recentTexts)が載っているのに、会場の段のタイルまで引き継がれず、カードが会場自前の
 *   在席名簿しか見ていなかったこと(会場を開く前に発言した人は名簿に発言が無い)。
 *   → 直したあとも「ちゃんと出続けているか」を状態速報で見えるようにする。
 *
 * ■ 2つの観点(どちらも観測のみ)
 *   (1) データ: 会場の各タイルについて、カードに出せる発言が【在席名簿 / 鏡のセル】のどちらにあるか。
 *       - 出る     = どちらかに発言がある
 *       - 鏡頼み   = 名簿には無く、鏡のセルだけにある(修正前なら出なかった人)
 *       - 欠け     = どちらにも無いのに、その人は発言している(stats.c>0 または名簿の count>0) ★🔴の条件
 *       - 無言     = 発言した形跡が無い(出なくて正常)
 *   (2) 実際: カードが開かれたときに発言の行が出たか(累計)。「発言の形跡があるのに空だった回数」を数える。
 *
 * ■ 判定
 *   欠け>0 または 実際の空振り>0 → 🔴(セリフが出ていない人がいる)
 *   タイル0枚かつカード0回 → ⚪(まだ観測していない)
 *   それ以外 → ✅
 *
 * @module venueSpeechCensus
 */

/** 直近の標本(最大)。 */
const SAMPLE_MAX = 3;

/**
 * @returns {{
 *   tiles: { checked: number, shown: number, mirrorOnly: number, missing: number, silent: number },
 *   missingSamples: string[],
 *   hover: { opened: number, withLines: number, emptyButSpoke: number, lied: number },
 *   hoverEmptySamples: string[],
 *   hoverLiedSamples: string[]
 * }}
 */
export function createVenueSpeechCensusState() {
  return {
    tiles: { checked: 0, shown: 0, mirrorOnly: 0, missing: 0, silent: 0 },
    missingSamples: [],
    hover: { opened: 0, withLines: 0, emptyButSpoke: 0, lied: 0 },
    hoverEmptySamples: [],
    hoverLiedSamples: []
  };
}

/** @param {unknown} v @returns {number} 非負整数(不正なら0) */
function n0(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** @param {unknown} v @returns {number} 発言の行の数(空文字は数えない) */
function lineCount(v) {
  return Array.isArray(v) ? v.filter((t) => typeof t === 'string' && t.trim() !== '').length : 0;
}

/**
 * 会場のタイル群を1回数える(置き換え=累積ではなく【いまの状態】)。
 *
 * @param {ReturnType<typeof createVenueSpeechCensusState>} state
 * @param {ReadonlyArray<{ uid?: unknown, name?: unknown, rosterTexts?: unknown, mirrorTexts?: unknown,
 *   commentCount?: unknown, rosterCount?: unknown }>} tiles
 *   rosterTexts: 在席名簿の発言 / mirrorTexts: 鏡のセルの発言 /
 *   commentCount: 鏡の stats.c(その人のコメント数) / rosterCount: 名簿の発言回数
 */
export function observeVenueSpeechTiles(state, tiles) {
  const t = { checked: 0, shown: 0, mirrorOnly: 0, missing: 0, silent: 0 };
  /** @type {string[]} */
  const samples = [];
  for (const it of Array.isArray(tiles) ? tiles : []) {
    if (!it || typeof it !== 'object') continue;
    t.checked += 1;
    const roster = lineCount(it.rosterTexts);
    const mirror = lineCount(it.mirrorTexts);
    if (roster > 0) {
      t.shown += 1;
    } else if (mirror > 0) {
      t.shown += 1;
      t.mirrorOnly += 1;
    } else if (n0(it.commentCount) > 0 || n0(it.rosterCount) > 0) {
      t.missing += 1;
      if (samples.length < SAMPLE_MAX) samples.push(String(it.name || it.uid || '?').slice(0, 20));
    } else {
      t.silent += 1;
    }
  }
  state.tiles = t;
  state.missingSamples = samples;
}

/**
 * カードが開かれたときに1回呼ぶ(累計)。
 * @param {ReturnType<typeof createVenueSpeechCensusState>} state
 * @param {{ name?: unknown, lines?: unknown, spoke?: unknown, saidSpeech?: unknown, detail?: unknown }} card
 *   saidSpeech: カードが「発言」と言ったか(statLine に「発言」を含む)。★言ったのに spoke(発言の【証拠】)が偽=嘘(lied・2026-10-16)
 *   detail: 空だったときの手がかり(関数でも文字列でも可。空のときだけ評価する=ふだんは何も作らない)。標本の名前の後ろに付く(原因の切り分け用・2026-10-13)
 *   lines: カードに出した発言の行数 / spoke: その人が発言している形跡(カードの発言回数>0 など)
 */
export function observeVenueSpeechHover(state, card) {
  state.hover.opened += 1;
  // ★発言の嘘(2026-10-16): 「発言」と言ったのに発言の証拠が無い。構造上 0 になるはずだが、意図でなく【出力】を測る。
  if (card?.saidSpeech === true && card?.spoke !== true) {
    state.hover.lied += 1;
    if (state.hoverLiedSamples.length < SAMPLE_MAX) {
      let raw = card?.detail;
      try { if (typeof raw === 'function') raw = raw(); } catch { raw = ''; }
      const detail = String(raw || '').slice(0, 80);
      state.hoverLiedSamples.push(String(card?.name || '?').slice(0, 20) + (detail ? `(${detail})` : ''));
    }
  }
  if (lineCount(card?.lines) > 0 || n0(card?.lines) > 0) {
    state.hover.withLines += 1;
    return;
  }
  if (card?.spoke === true) {
    state.hover.emptyButSpoke += 1;
    if (state.hoverEmptySamples.length < SAMPLE_MAX) {
      let raw = card?.detail;
      try { if (typeof raw === 'function') raw = raw(); } catch { raw = ''; }
      const detail = String(raw || '').slice(0, 60);
      state.hoverEmptySamples.push(String(card?.name || '?').slice(0, 20) + (detail ? `(${detail})` : ''));
    }
  }
}

/**
 * 状態速報に出す1行と、構造化した値。
 * @param {ReturnType<typeof createVenueSpeechCensusState>} state
 * @returns {{ line: string, verdict: 'ok'|'warn'|'idle', checked: number, shown: number, mirrorOnly: number, missing: number,
 *   silent: number, hoverOpened: number, hoverWithLines: number, hoverEmptyButSpoke: number, hoverLied: number }}
 */
export function toVenueSpeechCensusDiag(state) {
  const t = state.tiles;
  const h = state.hover;
  const idle = t.checked === 0 && h.opened === 0;
  const bad = t.missing > 0 || h.emptyButSpoke > 0 || h.lied > 0;
  const verdict = idle ? 'idle' : bad ? 'warn' : 'ok';
  const mark = idle ? '⚪' : bad ? '🔴' : '✅';
  const parts = [`会場セリフ ${mark}`];
  if (idle) {
    parts.push('未観測(会場を開いて数秒後に出ます)');
  } else {
    parts.push(`タイル${t.checked}枚: 出る${t.shown}(うち鏡頼み${t.mirrorOnly}) / 欠け${t.missing} / 無言${t.silent}`);
    parts.push(`カード${h.opened}回: セリフあり${h.withLines} / 発言ありなのに空${h.emptyButSpoke} / 発言の嘘${h.lied}`);
    if (state.missingSamples.length) parts.push(`欠け例{${state.missingSamples.join('・')}}`);
    if (state.hoverEmptySamples.length) parts.push(`空だったカード{${state.hoverEmptySamples.join('・')}}`);
    if (state.hoverLiedSamples.length) parts.push(`嘘だったカード{${state.hoverLiedSamples.join('・')}}`);
  }
  return {
    line: parts.join(' / '),
    verdict,
    checked: t.checked,
    shown: t.shown,
    mirrorOnly: t.mirrorOnly,
    missing: t.missing,
    silent: t.silent,
    hoverOpened: h.opened,
    hoverWithLines: h.withLines,
    hoverEmptyButSpoke: h.emptyButSpoke,
    hoverLied: h.lied
  };
}
