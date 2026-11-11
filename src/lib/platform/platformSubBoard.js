/**
 * platformSubBoard.js — 各サービスの「2つめの公式ランキング」(Twitch・Kick のギフトサブの順位など)を、
 *   ニコ生版の画面の「広告ランキング」欄(北極星レーン adRanking)にそのまま出すための共通部品。
 *
 * 背景(りんく 2026-11-11「それぞれのプラットフォーム特有のランキングをちゃんと合わせて実装してほしい」):
 *   どのサービスも公式ランキングを1つだけ「ギフト貢献度」の欄に入れていて、ページにある2つめの順位
 *   (Twitch のギフトサブ順位は同じ応答で受け取っているのに捨てていた)を出していなかった。
 *   ニコ生版にはもともと「ギフト貢献度」と「広告ランキング」の2つの欄がある。2つめの欄を共通部品として使い、
 *   サービス専用の見た目は作らない(数字・名前・期間はそのサービスの公式の値そのまま。数を作らない)。
 *
 * 流れ:
 *   入口(tw/kick-content-entry)→ YT_LEADERBOARD { slot: 'sub', title, unit, period, rows }
 *   → background が yt_board_sub_<配信キー> に置く
 *   → ytNicoShim が popup の nls_nicoad_api_ranking_<疑似lv> の読みに、この形(subBoardToNicoadApiValue)で答える
 *   → 欄の決まった文言は subBoardWording でそのサービスの言葉にする。
 */

export const SUB_BOARD_KEY_PREFIX = 'yt_board_sub_';
const PERIODS = new Set(['ALLTIME', 'MONTH', 'WEEK', 'DAY', 'STREAM']);

/** 期間の言葉 [文の中・見出し] */
const PERIOD_WORDS = /** @type {Record<string, [string, string]>} */ ({
  ALLTIME: ['これまでの累計', '累計'],
  MONTH: ['今月', '今月'],
  WEEK: ['今週', '今週'],
  DAY: ['今日', '今日'],
  STREAM: ['この配信', 'この配信'],
});

/** @param {unknown} s @param {number} max */
function cleanText(s, max) {
  return String(s ?? '')
    .replace(/[<>]/g, '')
    .split('').filter((c) => c.charCodeAt(0) >= 0x20).join('')
    .trim()
    .slice(0, max);
}

/**
 * 入口から届いた2つめの順位表を、置く形にそろえる。形が違えば null(置かない)。壊れた1行だけ捨てる。
 * @param {any} payload
 * @returns {null | { title: string, unit: string, period: string, rows: Array<{ rank: number, name: string, xp: number, iconUrl: string }> }}
 */
export function normalizeSubBoardPayload(payload) {
  const title = cleanText(payload?.title, 40);
  if (!title) return null;
  const unit = cleanText(payload?.unit, 12);
  const p = String(payload?.period || '').toUpperCase();
  const period = PERIODS.has(p) ? p : '';
  const src = Array.isArray(payload?.rows) ? payload.rows.slice(0, 100) : [];
  /** @type {Array<{ rank: number, name: string, xp: number, iconUrl: string }>} */
  const rows = [];
  for (const r of src) {
    const name = cleanText(r?.name, 60);
    const xp = Math.floor(Number(r?.xp));
    if (!name || !Number.isFinite(xp) || xp <= 0) continue;
    const icon = String(r?.iconUrl || '');
    rows.push({ rank: rows.length + 1, name, xp, iconUrl: /^https:\/\//.test(icon) ? icon.slice(0, 500) : '' });
  }
  if (!rows.length) return null;
  return { title, unit, period, rows };
}

/**
 * 置いた2つめの順位表 → popup が nls_nicoad_api_ranking_<lv> から読む形(北極星 adRanking 欄)。
 *   人の数字IDは付けない(付けるとギフト列・りんく段に数が結びつく。ytLeaderboardToKoken と同じ理由)。
 * @param {any} board yt_board_sub_<配信キー>
 * @param {string} lv 疑似 lv
 * @param {(name: string) => string} [iconOfName] 記録の中の同じ名前の人の顔
 */
export function subBoardToNicoadApiValue(board, lv, iconOfName) {
  const rows = Array.isArray(board?.rows) ? board.rows : [];
  if (!rows.length || !lv) return null;
  return {
    liveId: String(lv).toLowerCase(),
    capturedAt: Number(board.capturedAt) || Date.now(),
    lastOk: true,
    lastStatus: 200,
    source: 'platform-sub-board',
    rows: rows.map((/** @type {any} */ r, /** @type {number} */ i) => {
      const name = String(r?.name || '');
      return {
        rank: Number(r?.rank) || i + 1,
        name,
        contribution: Math.max(0, Math.floor(Number(r?.xp) || 0)),
        isAnonymous: false,
        thumbnailUrl: String(r?.iconUrl || '') || (iconOfName ? iconOfName(name) : '') || '',
      };
    }),
  };
}

/**
 * 2つめの順位表の言葉。
 * @param {{ name: string }} p サービス
 * @param {{ title: string, unit?: string, period?: string }} board
 */
export function subBoardWords(p, board) {
  const [inSentence, inHeading] = PERIOD_WORDS[String(board.period || '')] || ['', ''];
  const unit = String(board.unit || 'pt');
  return {
    label: `${board.title}`,
    sublabel: `${p.name} 公式の${board.title}です（${inSentence ? `${inSentence}・` : ''}${p.name} のページと同じ値）。`,
    // 欄の部品が後ろに「。」を付ける
    note: `${p.name} 公式の${board.title}${inHeading ? `（${inHeading}）` : ''}。数は ${p.name} が出している値そのままです`,
    unit,
  };
}

/**
 * 「広告ランキング」欄の決まった文言を、2つめの順位表の言葉にする(欄の中の文字にだけ使う)。
 * @param {string} text
 * @param {{ name: string }} p
 * @param {{ title: string, unit?: string, period?: string }} board
 */
export function subBoardLaneWording(text, p, board) {
  const s = String(text ?? '');
  if (!s) return s;
  const w = subBoardWords(p, board);
  let out = s
    // 「ギフト貢献度」は先にサービスの言葉(Bits ランキング等)へ直っていることがある
    .replace(/ニコニ広告の貢献度ランキングです（[^（）]{1,40}とは別系統）。/, w.sublabel)
    .replace(/ニコニ広告の貢献度ランキング（公式ページ相当）。画面上部の累計ptなどと、各行の「貢」は指標や期間が異なり一致しないことがあります/, w.note)
    .replace('一覧の「貢」合計', '一覧の合計');
  if (out.trim() === '広告ランキング') out = out.replace('広告ランキング', w.label);
  if (out.includes('広告ランキング')) out = out.split('広告ランキング').join(w.label);
  // 各行の数「410貢」→「410 サブ」(3桁ごとに区切る)
  out = out.replace(/(\d[\d,]*)\s*貢(?![献])/g, (_m, n) => `${Number(String(n).replace(/,/g, '')).toLocaleString('ja-JP')} ${w.unit}`);
  return out;
}

/**
 * 欄の外に出る「広告主」のお祝いの言葉(2つめの順位表に人が増えたとき)をその順位表の言葉にする。
 * @param {string} text
 * @param {{ title: string }} board
 */
export function subBoardCelebrationWording(text, board) {
  const s = String(text ?? '');
  if (!s.includes('広告主')) return s;
  return s
    .replace('最初の広告主さんがランキングに登場！', `${board.title}に最初の人が登場！`)
    .replace(/広告主 ([\d,]+) 人目がランキングに！/, (_m, n) => `${board.title}に ${n} 人目が登場！`);
}

/**
 * 中身の同じ順位表を何度も置かないための印。
 * @param {{ title: string, unit: string, period: string, rows: Array<{ name: string, xp: number }> }} b
 */
export function subBoardSig(b) {
  return `${b.title}|${b.unit}|${b.period}|${b.rows.map((r) => `${r.name}:${r.xp}`).join(',')}`;
}
