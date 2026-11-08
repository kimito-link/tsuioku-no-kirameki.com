// twIrcParse.js — Twitch のチャット(IRC over WebSocket)1行を、YouTube 版と同じ「チャット1件」の形に直す(純関数)
// @layer L0 — 純粋計算(副作用・ブラウザ API なし)
//
// ★なぜ IRC か(2026-11-07 調査・council/twitch-support-PLAN.md)
//   Twitch は「ログイン無しの読み取り専用接続」(NICK justinfanNNNN)を公式に残している
//   (https://discuss.dev.twitch.com/t/.../54596 「IRC を外す予定は無い」)。画面の DOM を読むより壊れにくい。
//   tags(twitch.tv/tags)を要求すると、表示名・数字の user-id・Bits・サブスク・ギフトサブ・レイドが1行に乗ってくる。
//
// 出力は YouTube 版のチャット1件(ytChatParse.parseYtChatElement)と同じ形にそろえる。
//   そうすると記録(IndexedDB)・応援の集計(ytSupportRanking)・ニコ生版の画面への写し(ytNicoShim)をそのまま使える。
//   - 人のキー: channelId = 'tw:<数字の user-id>'(YouTube の UC… と衝突しない)
//   - Bits(cheer)        → kind 'superchat'・currency 'BITS'・amount = Bits 数(通貨ごとに集計されるので円と混ざらない)
//   - サブスク/再サブスク → kind 'membership'(何か月目か = subMonths)
//   - ギフトサブ          → kind 'membership_gift'(まとめ贈りの件数 = giftCount)
//   - レイド              → kind 'tw_raid'(人数を amount)
//   - チャンネルポイントの交換(本文つき・custom-reward-id / メッセージを目立たせる highlighted-message)→ kind 'tw_reward'
//   - 連続視聴の記念(viewermilestone)→ kind 'tw_milestone'(何回連続か = amount)
//   - 通常のコメント      → kind 'text'

/** IRC tags の値のエスケープを戻す(https://ircv3.net/specs/extensions/message-tags#escaping-values) */
/** @param {unknown} v */
export function unescapeTwTagValue(v) {
  const s = String(v ?? '');
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const nx = s[i + 1];
    i += 1;
    if (nx === undefined) break;
    if (nx === 's') out += ' ';
    else if (nx === ':') out += ';';
    else if (nx === '\\') out += '\\';
    else if (nx === 'r') out += '\r';
    else if (nx === 'n') out += '\n';
    else out += nx;
  }
  return out;
}

/**
 * IRC の1行を部品に分ける。壊れた行は null。
 * @param {string} line
 * @returns {{ tags: Record<string, string>, prefix: string, command: string, params: string[], trailing: string } | null}
 */
export function parseTwIrcLine(line) {
  let s = String(line ?? '').replace(/[\r\n]+$/, '');
  if (!s) return null;
  /** @type {Record<string, string>} */
  const tags = {};
  if (s.startsWith('@')) {
    const sp = s.indexOf(' ');
    if (sp < 0) return null;
    const raw = s.slice(1, sp);
    for (const part of raw.split(';')) {
      if (!part) continue;
      const eq = part.indexOf('=');
      if (eq < 0) tags[part] = '';
      else tags[part.slice(0, eq)] = unescapeTwTagValue(part.slice(eq + 1));
    }
    s = s.slice(sp + 1).trimStart();
  }
  let prefix = '';
  if (s.startsWith(':')) {
    const sp = s.indexOf(' ');
    if (sp < 0) return null;
    prefix = s.slice(1, sp);
    s = s.slice(sp + 1).trimStart();
  }
  let trailing = '';
  const ti = s.indexOf(' :');
  let head = s;
  let hasTrailing = false;
  if (ti >= 0) {
    trailing = s.slice(ti + 2);
    head = s.slice(0, ti);
    hasTrailing = true;
  }
  const parts = head.split(' ').filter(Boolean);
  const command = String(parts.shift() || '').toUpperCase();
  if (!command) return null;
  const params = parts;
  if (hasTrailing) params.push(trailing);
  return { tags, prefix, command, params, trailing };
}

/** バッジ文字列 "broadcaster/1,subscriber/12" → ['broadcaster', 'subscriber'] */
/** @param {unknown} v */
export function parseTwBadges(v) {
  return String(v || '')
    .split(',')
    .map((b) => b.split('/')[0].trim())
    .filter(Boolean);
}

/** prefix "foo!foo@foo.tmi.twitch.tv" → "foo" */
/** @param {string} prefix */
function loginFromPrefix(prefix) {
  const p = String(prefix || '');
  const bang = p.indexOf('!');
  return (bang >= 0 ? p.slice(0, bang) : p).toLowerCase();
}

/** "#channel" → "channel" */
/** @param {string[]} params */
function channelOf(params) {
  const c = String(params?.[0] || '');
  return c.startsWith('#') ? c.slice(1).toLowerCase() : c.toLowerCase();
}

/** "/me" の CTCP ACTION 包み(\u0001ACTION ...\u0001)を外す */
/** @param {string} text */
function stripAction(text) {
  const t = String(text || '');
  const SOH = String.fromCharCode(1); // CTCP の区切り
  return t.startsWith(`${SOH}ACTION `) && t.endsWith(SOH) && t.length > 9 ? t.slice(8, -1) : t;
}

/** Bits のチア絵文字("Cheer100" 等)を本文から外す。読み上げで「チア100」と読まない */
/** @param {string} text */
export function stripCheermotes(text) {
  return String(text || '')
    .replace(/(^|\s)[A-Za-z]+\d+(?=\s|$)/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** サブスクの説明(本人の一言が無いとき) */
/** @param {string} tier @param {number} months */
function twSubText(tier, months) {
  return months > 1 ? `サブスク ${tier}(${months}か月目)` : `サブスク ${tier}`;
}

/** サブスクの段("1000"/"2000"/"3000"/"Prime")→ 表示の札 */
/** @param {unknown} plan */
export function twSubTierLabel(plan) {
  const p = String(plan || '');
  if (/^prime$/i.test(p)) return 'Prime';
  if (p === '2000') return 'Tier 2';
  if (p === '3000') return 'Tier 3';
  return 'Tier 1';
}

/**
 * IRC の1行 → YouTube 版と同じ形のチャット1件。コメントでない行(PING・JOIN 等)は null。
 * @param {string} line
 * @returns {null | {
 *   id: string, channelId: string, name: string, login: string, iconUrl: string, text: string,
 *   kind: 'text' | 'superchat' | 'membership' | 'membership_gift' | 'tw_raid' | 'tw_reward' | 'tw_milestone',
 *   amount: number, currency: string, badges: string[], ts: string, postedAtMs: number,
 *   channel: string, roomId: string, color: string, subTier?: string, subMonths?: number, giftCount?: number, giftPartOf?: string, rewardId?: string
 * }}
 */
export function parseTwChatLine(line) {
  const m = parseTwIrcLine(line);
  if (!m) return null;
  const { tags, command } = m;
  if (command !== 'PRIVMSG' && command !== 'USERNOTICE') return null;
  const channel = channelOf(m.params);
  const login = String(tags.login || loginFromPrefix(m.prefix) || '').toLowerCase();
  const userId = String(tags['user-id'] || '').trim();
  const name = String(tags['display-name'] || login || '').trim();
  const postedAtMs = Number(tags['tmi-sent-ts'] || 0) || 0;
  const id = String(tags.id || '').trim() || `${command}:${userId || login}:${postedAtMs}`;
  const base = {
    id,
    channelId: userId ? `tw:${userId}` : login ? `tw:@${login}` : '',
    name,
    login,
    iconUrl: '',
    badges: parseTwBadges(tags.badges),
    ts: '',
    postedAtMs,
    channel,
    roomId: String(tags['room-id'] || ''),
    color: String(tags.color || ''),
  };
  if (!base.channelId && !name) return null;

  if (command === 'PRIVMSG') {
    const text = stripAction(m.params.length >= 2 ? m.params[m.params.length - 1] : '');
    const bits = Number.parseInt(String(tags.bits || ''), 10);
    if (Number.isFinite(bits) && bits > 0) {
      return { ...base, text: stripCheermotes(text), kind: 'superchat', amount: bits, currency: 'BITS' };
    }
    if (!text.trim()) return null;
    // チャンネルポイントで本文つきの交換をした行(交換の名前は IRC に乗らない=本文だけ残す)
    if (tags['custom-reward-id'] || tags['msg-id'] === 'highlighted-message') {
      const what = tags['msg-id'] === 'highlighted-message' ? 'メッセージを目立たせる' : 'ポイント交換';
      // rewardId: 同じ交換は Hermes(リワードの名前つき)でも届く。Hermes が読めている間は入口でこちらを捨てる
      return { ...base, text: `${what}: ${text}`, kind: 'tw_reward', amount: 0, currency: '', rewardId: String(tags['custom-reward-id'] || '') };
    }
    return { ...base, text, kind: 'text', amount: 0, currency: '' };
  }

  // USERNOTICE
  const msgId = String(tags['msg-id'] || '');
  const userText = m.params.length >= 2 ? m.params[m.params.length - 1] : '';
  const plan = tags['msg-param-sub-plan'];
  if (msgId === 'sub' || msgId === 'resub') {
    return {
      ...base,
      // 読み上げ・吹き出しに英語の system-msg を出さない。本人の一言があればそれ、無ければ日本語の説明
      text: String(userText || '').trim() || twSubText(twSubTierLabel(plan), Number(tags['msg-param-cumulative-months'] || 0) || 0),
      kind: 'membership',
      // YouTube のメンバー加入と同じく金額は持たない(pt にしない)。何か月目かは別に持つ
      amount: 0,
      currency: '',
      subMonths: Number(tags['msg-param-cumulative-months'] || 0) || 0,
      subTier: twSubTierLabel(plan),
    };
  }
  if (msgId === 'subgift' || msgId === 'submysterygift' || msgId === 'anonsubgift' || msgId === 'anonsubmysterygift') {
    const count = msgId.includes('mystery') ? Number(tags['msg-param-mass-gift-count'] || 0) || 1 : 1;
    // まとめ贈り(submysterygift)の後に、受け取った人ごとの subgift が count 行続く。二重に数えないよう、
    //   まとめの方は件数だけ持ち、個別の subgift には origin-id 付きで「まとめの内訳」と印を付ける。
    const partOfMystery = msgId === 'subgift' && Boolean(tags['msg-param-community-gift-id']);
    return {
      ...base,
      text: msgId.includes('mystery') ? `ギフトサブを${count}件贈りました` : `${String(tags['msg-param-recipient-display-name'] || '').trim() || 'だれか'}さんにギフトサブを贈りました`,
      kind: 'membership_gift',
      // 金額は持たない(YouTube のメンバーシップギフトと同じ)。贈った件数は giftCount
      amount: 0,
      currency: '',
      giftCount: partOfMystery ? 0 : count,
      subTier: twSubTierLabel(plan),
      ...(partOfMystery ? { giftPartOf: String(tags['msg-param-community-gift-id']) } : {}),
    };
  }
  if (msgId === 'raid') {
    return {
      ...base,
      text: `${Number(tags['msg-param-viewerCount'] || 0) || 0}人でレイドしてきました`,
      kind: 'tw_raid',
      amount: Number(tags['msg-param-viewerCount'] || 0) || 0,
      currency: '',
    };
  }
  if (msgId === 'viewermilestone') {
    const n = Number(tags['msg-param-value'] || 0) || 0;
    const note = String(userText || '').trim();
    return {
      ...base,
      text: `${n > 0 ? `${n}回連続で` : '続けて'}見に来ました${note ? `「${note}」` : ''}`,
      kind: 'tw_milestone',
      amount: n,
      currency: '',
    };
  }
  // announcement など、人の書いた本文があるものは普通のコメントとして残す
  if (String(userText || '').trim()) {
    return { ...base, text: String(userText).trim(), kind: 'text', amount: 0, currency: '' };
  }
  return null;
}

/**
 * 消されたコメント(CLEARMSG)・時間切れ/BAN(CLEARCHAT)を読む。記録から外すときに使う。
 * @param {string} line
 * @returns {null | { type: 'msg', id: string } | { type: 'user', userId: string } | { type: 'all' }}
 */
export function parseTwClearLine(line) {
  const m = parseTwIrcLine(line);
  if (!m) return null;
  if (m.command === 'CLEARMSG') {
    const id = String(m.tags['target-msg-id'] || '');
    return id ? { type: 'msg', id } : null;
  }
  if (m.command === 'CLEARCHAT') {
    const uid = String(m.tags['target-user-id'] || '');
    return uid ? { type: 'user', userId: uid } : { type: 'all' };
  }
  return null;
}

/** チャンネル名として使える文字か(Twitch のログイン名は英数字と _ で 4〜25 文字) */
/** @param {unknown} s */
export function isTwLogin(s) {
  return /^[a-z0-9_]{3,25}$/.test(String(s || '').toLowerCase());
}

/**
 * twitch.tv の URL から配信チャンネル名を読む。視聴ページでなければ ''。
 *   https://www.twitch.tv/foo            → 'foo'
 *   https://www.twitch.tv/popout/foo/chat → 'foo'
 *   https://www.twitch.tv/directory/...   → ''
 * @param {string} url
 */
export function parseTwChannelFromUrl(url) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch {
    return '';
  }
  if (!/(^|\.)twitch\.tv$/i.test(u.hostname)) return '';
  const seg = u.pathname.split('/').filter(Boolean).map((x) => x.toLowerCase());
  if (!seg.length) return '';
  if (seg[0] === 'popout' || seg[0] === 'embed') return isTwLogin(seg[1]) ? seg[1] : '';
  if (seg[0] === 'moderator') return isTwLogin(seg[1]) ? seg[1] : '';
  const RESERVED = new Set([
    'directory', 'videos', 'settings', 'subscriptions', 'inventory', 'wallet', 'drops', 'friends',
    'search', 'downloads', 'jobs', 'p', 'turbo', 'prime', 'messages', 'payments', 'login', 'signup',
  ]);
  if (RESERVED.has(seg[0])) return '';
  if (seg.length > 1 && seg[1] !== 'chat') return ''; // /foo/videos 等はチャンネルの別ページ
  return isTwLogin(seg[0]) ? seg[0] : '';
}
