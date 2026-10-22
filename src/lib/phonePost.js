/**
 * 【層】L0 判定層(純粋関数)
 * 【この箱に入るもの】スマホからのコメント(PC 中継)の形の検査・Redis のキー名・回数制限の判定・
 *   状態(⏱/✓/✓✓/⚠)と接続の帯の決定・失敗理由の文言・放送に流れたかの照合
 * 【この箱に入らないもの】乱数・ハッシュ・通信(api/post.js / src/server/phonePostStore.js)・
 *   chrome.*(src/extension/phonePostRelay.js)・DOM(app/live-view.js)
 *
 * ★なぜ(v0.1.1734・スマホからコメントを届ける):
 *   スマホの WEB版はニコ生に直接書けない(ログインはPCのブラウザにある・ログイン情報は預からない)。
 *   スマホ → サーバーの待ち行列 → PC の送信担当(status.html?publisher=1)が受け取り →
 *   PC で開いている放送タブのコメント欄から投稿する(PC の「コメント送信」と同じ経路 NLS_POST_COMMENT)。
 *   設計: Doc「スマホから生放送にコメントを届ける」(2026-10-22 りんく「UIUXの最大化をかんがえてやって」)。
 *
 * ★「届いた」と言ってよいのは、放送のコメントに実際に流れたのを確認したとき(✓✓)だけ。
 *   PC が投稿した(✓)だけでは「届いた」と書かない(嘘の表示をしない・§12.7)。
 * @module phonePost
 */

/** 投稿用の鍵(スマホのURLの #pk=)。32バイト=43文字で発行する。閲覧トークンとは別物。 */
const POST_KEY_RE = /^[A-Za-z0-9_-]{32,128}$/;
/** スマホが付ける1件ごとの番号(重複送信の見分け・状態の照会)。 */
const POST_ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const VIEW_TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;
const LV_RE = /^lv\d{1,15}$/;

/** 1件の上限文字数(PC の入力欄 textarea の maxlength と同じ)。超えた分は送らない(切り詰めない)。 */
export const PHONE_POST_MAX_CHARS = 250;
/** 回数制限: この秒数の中で。 */
export const PHONE_POST_WINDOW_SEC = 20;
/** 回数制限: 上の秒数の中でこの件数まで(連投・誤爆の連打で放送を荒らさない)。 */
export const PHONE_POST_MAX_PER_WINDOW = 8;
/** 1日の上限(利用者ごと)。 */
export const PHONE_POST_DAILY_LIMIT = 1_000;
/** スマホ側: 前の送信からこの時間(ms)は次を送れない(ダブルタップの二重送信を防ぐ)。 */
export const PHONE_POST_MIN_GAP_MS = 3_000;
/** 待ち行列に置けるのはこの時間(ms)まで。過ぎたものは投稿しない(何分も遅れて流れると場違いになる)。 */
export const PHONE_POST_STALE_MS = 60_000;
/** 「✓ PCが投稿した」のあと、放送に流れたか(✓✓)を確かめに行く時間(ms)。 */
export const PHONE_POST_SEEN_WAIT_MS = 90_000;
/** PC がこの時間(ms)以内に取りに来ていれば「つながっている」。 */
export const PHONE_POST_PC_ALIVE_MS = 30_000;
/** スマホが入力中・送信待ちのときに立てる印の寿命(秒)。PC はこれを見て取りに行く間隔を縮める。 */
export const PHONE_POST_ACTIVE_TTL_SEC = 45;
/** 投稿用の鍵の保存期間(秒)。使っている間は延ばす。 */
export const PHONE_POST_KEY_TTL_SEC = 30 * 24 * 60 * 60;
/** 状態(⏱/✓/⚠)の保存期間(秒)。 */
export const PHONE_POST_STATE_TTL_SEC = 10 * 60;
/** PC の取りに行く間隔(ms): ふだん / スマホが入力中のとき。 */
export const PHONE_POST_PULL_IDLE_MS = 10_000;
export const PHONE_POST_PULL_ACTIVE_MS = 2_000;
/** 1回に取り出す件数の上限。 */
export const PHONE_POST_PULL_BATCH = 5;

/** @param {unknown} v */
export function isValidPostKey(v) {
  return typeof v === 'string' && POST_KEY_RE.test(v);
}

/** @param {unknown} v */
export function isValidPostId(v) {
  return typeof v === 'string' && POST_ID_RE.test(v);
}

/** @param {unknown} v */
export function isValidViewToken(v) {
  return typeof v === 'string' && VIEW_TOKEN_RE.test(v);
}

/** @param {unknown} v @returns {string} 正しい lv なら小文字の lv・違えば '' */
export function normalizePostLv(v) {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return LV_RE.test(s) ? s : '';
}

/**
 * 本文を検査する。前後の空白を落とし、空・長すぎ・制御文字入りは '' (=送らない)。
 * @param {unknown} v
 * @returns {string}
 */
export function normalizePostText(v) {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  if (!t) return '';
  if ([...t].length > PHONE_POST_MAX_CHARS) return '';
  // 改行・タブ以外の制御文字は受け付けない(コメント欄に変な文字を流し込まない)。
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(t)) return '';
  return t;
}

/** UTC の日付(YYYYMMDD)。 @param {number} nowMs */
function utcDay(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10).replace(/-/g, '');
}

/** Redis のキー名(ここだけで決める)。token = 閲覧トークン(その利用者の送り先)。 */
export const phonePostKeys = {
  /** @param {string} keyHash 投稿用の鍵の sha256 */
  key: (keyHash) => `post:key:${keyHash}`,
  /** @param {string} token いま有効な投稿用の鍵のハッシュ(作り直し・OFF で古い鍵を消すため) */
  owner: (token) => `post:owner:${token}`,
  /** @param {string} token */
  queue: (token) => `post:q:${token}`,
  /** @param {string} token */
  states: (token) => `post:st:${token}`,
  /** @param {string} token */
  active: (token) => `post:active:${token}`,
  /** @param {string} token */
  pcSeen: (token) => `post:seen:${token}`,
  /** @param {string} token @param {number} nowMs */
  rate: (token, nowMs) => `post:rl:${token}:${Math.floor(nowMs / (PHONE_POST_WINDOW_SEC * 1000))}`,
  /** @param {string} token @param {number} nowMs */
  daily: (token, nowMs) => `post:day:${token}:${utcDay(nowMs)}`
};

/**
 * 回数制限の判定。INCR した【後】の値で判定する。
 * @param {{ windowCount: number, dailyCount: number }} a
 * @returns {{ allow: boolean, reason: 'ok' | 'too_fast' | 'daily_limit' }}
 */
export function phonePostRateVerdict(a) {
  const w = Number(a?.windowCount) || 0;
  const d = Number(a?.dailyCount) || 0;
  if (d > PHONE_POST_DAILY_LIMIT) return { allow: false, reason: 'daily_limit' };
  if (w > PHONE_POST_MAX_PER_WINDOW) return { allow: false, reason: 'too_fast' };
  return { allow: true, reason: 'ok' };
}

/**
 * @typedef {{ id: string, text: string, lv: string, at: number }} PhonePostItem
 */

/**
 * 待ち行列から取り出した1件を読む。形が違えば null(捨てる)。
 * @param {unknown} raw JSON 文字列
 * @returns {PhonePostItem | null}
 */
export function parsePhonePostItem(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let o;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  if (!isValidPostId(o.id)) return null;
  const text = normalizePostText(o.text);
  const lv = normalizePostLv(o.lv);
  const at = Number(o.at) || 0;
  if (!text || !lv || at <= 0) return null;
  return { id: o.id, text, lv, at };
}

/** @param {PhonePostItem} item @param {number} nowMs */
export function isPhonePostStale(item, nowMs) {
  return (Number(nowMs) || 0) - (Number(item?.at) || 0) > PHONE_POST_STALE_MS;
}

/** 失敗の理由コード(PC が返す)。文言は phonePostFailureText。 */
export const PHONE_POST_FAIL_REASONS = Object.freeze(['stale', 'no_tab', 'post_failed', 'unknown']);

/**
 * PC が返す失敗の文言を理由コードに丸める(本文や画面の文言をサーバーへ送らない)。
 * @param {unknown} error PC の送信結果の error 文字列
 * @returns {'no_tab' | 'post_failed'}
 */
export function classifyRelayError(error) {
  const e = String(error || '');
  if (/watchタブが見つかりません|放送タブ/.test(e)) return 'no_tab';
  return 'post_failed';
}

/**
 * 保存された状態を読む。
 * @param {unknown} raw 'queued' | 'taken' | 'sent' | 'failed:<reason>'
 * @returns {{ state: 'queued' | 'taken' | 'sent' | 'failed', reason: string } | null}
 */
export function parsePhonePostState(raw) {
  const s = typeof raw === 'string' ? raw : '';
  if (s === 'queued' || s === 'taken' || s === 'sent') return { state: s, reason: '' };
  if (s.startsWith('failed')) {
    const reason = s.slice('failed:'.length);
    return { state: 'failed', reason: PHONE_POST_FAIL_REASONS.includes(reason) ? reason : 'unknown' };
  }
  return null;
}

/** @param {'failed'} _state @param {string} reason */
export function encodeFailedState(_state, reason) {
  return `failed:${PHONE_POST_FAIL_REASONS.includes(reason) ? reason : 'unknown'}`;
}

/**
 * 失敗の文言(次にどうすればいいかまで書く・星野メソッド「行動誘発」)。
 * @param {string} reason
 */
export function phonePostFailureText(reason) {
  switch (reason) {
    case 'stale':
      return 'PCが1分以内に受け取れず、送りませんでした。PCで拡張が動いているか確かめてね。';
    case 'no_tab':
      return 'PCでこの放送のタブが開いていません。PCで放送を開いてからもう一度送ってね。';
    case 'post_failed':
      return 'PCからコメント欄に書き込めませんでした。PCの放送タブを再読み込みしてからもう一度送ってね。';
    case 'too_fast':
      return '続けて送りすぎです。少し待ってから送ってね。';
    case 'daily_limit':
      return '今日はこれ以上送れません(1日の上限)。';
    case 'no_key':
      return 'このURLではコメントできません。PCの「スマホからコメントする」で出たURLを開き直してね。';
    case 'network':
      return '通信できませんでした。電波のよいところでもう一度送ってね。';
    default:
      return '送れませんでした。もう一度送ってね。';
  }
}

/**
 * スマホの「自分のコメント」1件の表示上の状態。
 *   ⏱ 送信中(サーバーに預けた・PCがまだ受け取っていない)
 *   ✓  PCが投稿した(放送に流れたかはまだ分からない)
 *   ✓✓ 放送に流れたのを確認した(=届いた)
 *   ⚠  届かなかった
 * @param {{ state?: string, seen?: boolean, at?: number }} post
 * @param {number} nowMs
 * @returns {{ mark: '⏱' | '✓' | '✓✓' | '⚠', label: string, done: boolean }}
 */
export function phonePostMark(post, nowMs) {
  const p = post || {};
  if (p.seen === true) return { mark: '✓✓', label: '届いた', done: true };
  if (p.state === 'failed') return { mark: '⚠', label: '届かなかった', done: true };
  if (p.state === 'sent') {
    // 放送の記録を切っている等で ✓✓ を確かめられないこともある=待つのは90秒まで(✓ のまま行き着いた扱い)。
    const waited = (Number(nowMs) || 0) - (Number(p.at) || 0) > PHONE_POST_SEEN_WAIT_MS;
    return { mark: '✓', label: 'PCが投稿した', done: waited };
  }
  // 預けたまま時間切れ(PC が取りに来ない)=サーバー側でも投稿しない。
  if ((Number(nowMs) || 0) - (Number(p.at) || 0) > PHONE_POST_STALE_MS + 5_000) {
    return { mark: '⚠', label: '届かなかった', done: true };
  }
  return { mark: '⏱', label: '送信中', done: false };
}

/**
 * 入力欄の上に出す接続の帯。打ち始める前に「送れるか」が分かるようにする。
 * @param {{ hasKey: boolean, pcSeenAt?: number, nowMs: number, checked?: boolean, networkError?: boolean }} a
 * @returns {{ level: 'off' | 'checking' | 'ok' | 'down' | 'network', text: string, canSend: boolean }}
 */
export function phonePostConnectionBand(a) {
  if (!a || a.hasKey !== true) {
    return {
      level: 'off',
      text: 'PCの状態画面で「✍️ スマホからコメントする」をONにして、出てきたURLで開くとコメントできます。',
      canSend: false
    };
  }
  if (a.networkError === true) {
    return { level: 'network', text: '通信できていません。電波を確かめてね。', canSend: false };
  }
  if (a.checked !== true) {
    return { level: 'checking', text: 'PCとつながっているか確かめています…', canSend: false };
  }
  const seen = Number(a.pcSeenAt) || 0;
  if (seen > 0 && (Number(a.nowMs) || 0) - seen <= PHONE_POST_PC_ALIVE_MS) {
    return { level: 'ok', text: 'PCとつながっています。ここからコメントできます。', canSend: true };
  }
  return {
    level: 'down',
    text: 'PCが応答していません。PCで放送のタブと拡張のパネルを開いてね(開けば自動でつながります)。',
    canSend: false
  };
}

/**
 * 本文の照合用の形(前後の空白・連続空白・全角半角の空白の違いを無視)。
 * @param {unknown} v
 */
function matchForm(v) {
  return String(v ?? '').replace(/[\s\u3000]+/g, ' ').trim();
}

/**
 * 自分が送ったコメントが、放送のコメント(タイムラインの鏡)に流れたかを照合する。
 *   送った時刻の少し前以降に、同じ本文のコメントがあれば「流れた」。
 * @param {{ id: string, text: string, at: number }[]} posts
 * @param {{ at?: number, text?: string, kind?: string }[]} rows タイムラインの鏡の行
 * @returns {Set<string>} 流れたのを確認できた id
 */
export function findSeenPhonePosts(posts, rows) {
  const out = new Set();
  if (!Array.isArray(posts) || !Array.isArray(rows) || !posts.length || !rows.length) return out;
  /** @type {Map<string, number[]>} */
  const byText = new Map();
  for (const r of rows) {
    if (!r || (r.kind && r.kind !== 'comment')) continue;
    const t = matchForm(r.text);
    if (!t) continue;
    const list = byText.get(t) || [];
    list.push(Number(r.at) || 0);
    byText.set(t, list);
  }
  for (const p of posts) {
    const ats = byText.get(matchForm(p?.text));
    if (!ats) continue;
    // PC と放送の時計の差・鏡の時刻の粗さを見込んで、送った10秒前以降なら同じものとみなす。
    if (ats.some((at) => at >= (Number(p.at) || 0) - 10_000)) out.add(p.id);
  }
  return out;
}

/**
 * PC が次に取りに行くまでの間隔。
 * @param {{ active?: boolean, hadItems?: boolean }} a
 */
export function phonePostPullDelayMs(a) {
  return a?.active === true || a?.hadItems === true ? PHONE_POST_PULL_ACTIVE_MS : PHONE_POST_PULL_IDLE_MS;
}

/**
 * スマホのURLに付ける投稿用の鍵の断片。#(フラグメント)はサーバーへ送られない=アクセス記録にも残らない。
 * @param {string} liveViewUrl
 * @param {string} postKey
 */
export function buildPhonePostUrl(liveViewUrl, postKey) {
  const base = String(liveViewUrl || '').split('#')[0];
  if (!base || !isValidPostKey(postKey)) return '';
  return `${base}#pk=${postKey}`;
}

/**
 * URL のフラグメントから投稿用の鍵を読む。
 * @param {unknown} hash location.hash
 * @returns {string} 鍵・無ければ ''
 */
export function readPostKeyFromHash(hash) {
  const h = String(hash || '').replace(/^#/, '');
  try {
    const pk = new URLSearchParams(h).get('pk') || '';
    return isValidPostKey(pk) ? pk : '';
  } catch {
    return '';
  }
}
