// @ts-nocheck
/**
 * スマホの WEB版から生放送にコメントを届ける(v0.1.1734)。
 *
 *   スマホ → サーバー(api/post.js)に預ける → PC の拡張が受け取り、PC の放送タブのコメント欄から投稿する。
 *   入力欄・送信ボタン・応援プリセット・やさしさの一言は【PC と同じ本物】(popup-entry の入力欄)を使う。
 *   ここで足すのは、スマホにしか無いものだけ:
 *     1) 接続の帯(打ち始める前に「PC とつながっているか」が分かる)
 *     2) 自分のコメントの印 ⏱送信中 → ✓PCが投稿した → ✓✓届いた(放送に流れたのを確認) / ⚠届かなかった
 *     3) 入力欄へ飛ぶボタン(長い画面の下の方にあるため)
 *   popup-entry へは globalThis.__nlsWebCommentRelay で口を渡す(拡張の中では存在しない=PC の送信は不変)。
 *
 *   ★投稿用の鍵は URL の #pk= で受け取り、この端末に保存してから URL から消す
 *     (画面を見せたりスクショを共有しても鍵が漏れない・#以降はサーバーに送られない)。
 *   判定・文言は src/lib/phonePost.js(純関数)。
 */

import {
  PHONE_POST_MIN_GAP_MS,
  findSeenPhonePosts,
  isValidPostKey,
  normalizePostText,
  parsePhonePostState,
  phonePostConnectionBand,
  phonePostFailureText,
  phonePostMark,
  readPostKeyFromHash
} from '../src/lib/phonePost.js';

/** 状態の照会の間隔(ms): 入力中・届くのを待っている間 / それ以外(画面が表のとき)。 */
const STATUS_POLL_FAST_MS = 2_000;
const STATUS_POLL_IDLE_MS = 15_000;
/** 画面に出す自分のコメントの件数。 */
const MY_POSTS_SHOWN = 3;

const storageKeyFor = (token) => `nls_post_key:${token}`;

/**
 * URL の #pk= を読み、この端末に保存して URL から消す。保存済みの鍵を返す。
 * @param {string} token 閲覧トークン(鍵はトークンごとに持つ)
 */
export function takePostKey(token) {
  let pk = readPostKeyFromHash(location.hash);
  try {
    if (pk) localStorage.setItem(storageKeyFor(token), pk);
    else pk = localStorage.getItem(storageKeyFor(token)) || '';
  } catch {
    /* 保存できない(プライベートモード等)=この表示の間だけ使う */
  }
  if (location.hash) {
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch {
      /* no-op */
    }
  }
  return isValidPostKey(pk) ? pk : '';
}

function newPostId() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {{ token: string, postKey: string }} opts
 */
export function createPhonePostClient(opts) {
  const { token, postKey } = opts;
  const state = {
    checked: false,
    pcSeenAt: 0,
    networkError: false,
    composing: false,
    lastPostAt: 0,
    /** @type {{ id: string, text: string, at: number, state: string, reason: string, seen: boolean }[]} */
    posts: []
  };
  /** @type {(() => void)[]} */
  const listeners = [];
  const emit = () => {
    for (const fn of listeners.slice()) {
      try { fn(); } catch { /* no-op */ }
    }
  };
  let timer = null;

  const band = () =>
    phonePostConnectionBand({
      hasKey: Boolean(postKey),
      checked: state.checked,
      pcSeenAt: state.pcSeenAt,
      networkError: state.networkError,
      nowMs: Date.now()
    });

  const waiting = () => state.posts.some((p) => !phonePostMark(p, Date.now()).done);

  const pollStatus = async () => {
    if (!postKey) return;
    const ids = state.posts.filter((p) => p.state !== 'failed' && !p.seen).map((p) => p.id).slice(0, 10);
    const q = new URLSearchParams();
    if (ids.length) q.set('ids', ids.join(','));
    if (state.composing || waiting()) q.set('active', '1');
    try {
      const res = await fetch(`/api/post?${q}`, { cache: 'no-store', headers: { 'x-post-key': postKey } });
      if (res.status === 401) {
        // 鍵が無効(PC で OFF・作り直し)。この端末の鍵を捨てる。
        try { localStorage.removeItem(storageKeyFor(token)); } catch { /* no-op */ }
        state.checked = true;
        state.pcSeenAt = 0;
        state.networkError = false;
        api.revoked = true;
        emit();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      // PC とスマホの時計のずれを消す(サーバーの now を基準に「何秒前に来たか」を出す)。
      const skew = Date.now() - (Number(body.now) || Date.now());
      state.pcSeenAt = body.pcSeenAt ? Number(body.pcSeenAt) + skew : 0;
      for (const p of state.posts) {
        const st = parsePhonePostState(body.states?.[p.id]);
        if (st) {
          p.state = st.state;
          p.reason = st.reason;
        }
      }
      state.checked = true;
      state.networkError = false;
    } catch {
      state.networkError = true;
    }
    emit();
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    const ms = state.composing || waiting() ? STATUS_POLL_FAST_MS : STATUS_POLL_IDLE_MS;
    timer = setTimeout(async () => {
      if (!document.hidden) await pollStatus();
      schedule();
    }, ms);
  };

  const api = {
    revoked: false,
    onChange(fn) {
      if (typeof fn === 'function') listeners.push(fn);
    },
    band,
    /** 送信ボタンを押せるか(PC とつながっていて、鍵が生きている)。 */
    canSend() {
      return !api.revoked && band().canSend;
    },
    /** 印がまだ行き着いていない(⏱ か ✓)ものがあるか。 */
    hasPending() {
      return state.posts.some((p) => !phonePostMark(p, Date.now()).done);
    },
    posts() {
      return state.posts.slice(-MY_POSTS_SHOWN).reverse();
    },
    /** 入力欄に触れている/文字があるか。PC に「今から送る」合図を出し、照会を速くする。 */
    setComposing(on) {
      const next = Boolean(on);
      if (next === state.composing) return;
      state.composing = next;
      if (next) void pollStatus();
      schedule();
    },
    /**
     * 1件預ける。結果は「預けられたか」だけ(届いたかは印で後から出す)。
     * @param {string} rawText
     * @param {string} lv
     * @returns {Promise<{ ok: boolean, error?: string, queued?: boolean }>}
     */
    async post(rawText, lv) {
      const text = normalizePostText(rawText);
      if (!text) return { ok: false, error: 'コメントが空か、長すぎます(250文字まで)。' };
      if (api.revoked || !postKey) return { ok: false, error: phonePostFailureText('no_key') };
      if (!band().canSend) return { ok: false, error: band().text };
      if (Date.now() - state.lastPostAt < PHONE_POST_MIN_GAP_MS) {
        return { ok: false, error: '続けて送るときは、3秒ほどあけてね。' };
      }
      const id = newPostId();
      state.lastPostAt = Date.now();
      try {
        const res = await fetch('/api/post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-post-key': postKey },
          body: JSON.stringify({ id, text, lv })
        });
        if (!res.ok) {
          const err = String((await res.json().catch(() => ({})))?.error || '');
          return { ok: false, error: phonePostFailureText(res.status === 401 ? 'no_key' : err) };
        }
        state.posts.push({ id, text, at: Date.now(), state: 'queued', reason: '', seen: false });
        if (state.posts.length > 20) state.posts.splice(0, state.posts.length - 20);
        emit();
        schedule();
        return { ok: true, queued: true };
      } catch {
        state.networkError = true;
        emit();
        return { ok: false, error: phonePostFailureText('network') };
      }
    },
    /** 放送のコメント(タイムラインの鏡)に流れたものに ✓✓ を付ける。 */
    updateSeen(rows) {
      const seen = findSeenPhonePosts(state.posts.filter((p) => !p.seen), rows);
      if (!seen.size) return;
      for (const p of state.posts) if (seen.has(p.id)) p.seen = true;
      emit();
    },
    start() {
      void pollStatus();
      schedule();
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void pollStatus();
      });
      // 帯の「何秒前」・時間切れの ⚠ を、通信が無くても進める。
      setInterval(() => { if (!document.hidden) emit(); }, 5_000);
    }
  };
  return api;
}

/* ───────────────────────── 画面(スマホにしか無い部品だけ) ───────────────────────── */

const BAND_COLORS = {
  ok: ['#e9f8ee', '#1f6b3a', '#b9e5c7', '🟢'],
  checking: ['#f3f4f8', '#4a4a5a', '#dcdde6', '⏳'],
  down: ['#fff3f3', '#9a2c2c', '#f0c0c0', '🔴'],
  network: ['#fff8e8', '#7a5a18', '#f0dca0', '📶'],
  off: ['#f3f4f8', '#4a4a5a', '#dcdde6', '✍️']
};

function injectStyleOnce() {
  if (document.getElementById('lvWebPostStyle')) return;
  const st = document.createElement('style');
  st.id = 'lvWebPostStyle';
  // iPhone は 16px 未満の入力欄に触れると画面が拡大される=スマホだけ 16px にする。
  st.textContent =
    '@media (pointer:coarse){#commentInput{font-size:16px !important;}}' +
    '#lvWebPostBand{margin:0 0 6px;padding:7px 10px;border-radius:8px;border:1px solid;font:12.5px/1.5 system-ui,sans-serif;}' +
    '#lvWebMyPosts{margin:6px 0 0;padding:0;list-style:none;font:12.5px/1.5 system-ui,sans-serif;}' +
    '#lvWebMyPosts li{display:flex;gap:8px;align-items:baseline;padding:4px 2px;border-top:1px dashed #e3e3ec;}' +
    '#lvWebMyPosts .m{flex:0 0 auto;min-width:2.6em;font-weight:700;}' +
    '#lvWebMyPosts .t{flex:1 1 auto;word-break:break-word;}' +
    '#lvWebMyPosts .s{flex:0 0 auto;color:#77778a;font-size:11.5px;}' +
    '#lvWebMyPosts .r{display:block;color:#9a2c2c;font-size:11.5px;}' +
    '#lvWebPostFab{position:fixed;right:14px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:99996;' +
    'padding:12px 16px;border-radius:999px;border:0;background:#3a7bd5;color:#fff;font:600 15px/1 system-ui,sans-serif;' +
    'box-shadow:0 6px 18px rgba(0,0,0,.18);}';
  document.head.appendChild(st);
}

/**
 * 本物の入力欄(popup-entry が描いた #commentInput)の周りに、帯・自分のコメント・飛ぶボタンを付ける。
 * @param {ReturnType<typeof createPhonePostClient> | null} client 鍵が無ければ null(帯で「ONにすると使えます」と案内)
 */
export function mountPhonePostUi(client) {
  const input = document.getElementById('commentInput');
  const section = input ? input.closest('section') : null;
  if (!input || !section) return;
  injectStyleOnce();

  const bandEl = document.createElement('div');
  bandEl.id = 'lvWebPostBand';
  bandEl.setAttribute('role', 'status');
  section.insertBefore(bandEl, section.firstChild);

  const list = document.createElement('ul');
  list.id = 'lvWebMyPosts';
  list.setAttribute('aria-label', '自分のコメント');
  section.appendChild(list);

  const paint = () => {
    const b = client
      ? client.band()
      : phonePostConnectionBand({ hasKey: false, nowMs: Date.now() });
    const revoked = client && client.revoked;
    const level = revoked ? 'off' : b.level;
    const [bg, fg, bd, icon] = BAND_COLORS[level] || BAND_COLORS.off;
    bandEl.style.background = bg;
    bandEl.style.color = fg;
    bandEl.style.borderColor = bd;
    bandEl.textContent = `${icon} ${revoked ? phonePostFailureText('no_key') : b.text}`;

    list.replaceChildren();
    const now = Date.now();
    for (const p of client ? client.posts() : []) {
      const m = phonePostMark(p, now);
      const li = document.createElement('li');
      const mk = document.createElement('span');
      mk.className = 'm';
      mk.textContent = m.mark;
      mk.style.color = m.mark === '⚠' ? '#9a2c2c' : m.mark === '✓✓' ? '#1f6b3a' : '#4a4a5a';
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = p.text;
      if (m.mark === '⚠') {
        const r = document.createElement('span');
        r.className = 'r';
        r.textContent = phonePostFailureText(p.state === 'failed' ? p.reason : 'stale');
        t.appendChild(r);
      }
      const s = document.createElement('span');
      s.className = 's';
      s.textContent = m.label;
      li.append(mk, t, s);
      list.appendChild(li);
    }
  };

  if (client) {
    client.onChange(paint);
    const sync = () => client.setComposing(document.activeElement === input || Boolean(input.value.trim()));
    input.addEventListener('focus', sync);
    input.addEventListener('blur', sync);
    input.addEventListener('input', sync);
  }
  paint();

  // 入力欄が画面の外にあるときだけ「✍️ コメント」を出す(押すと入力欄へ飛んでキーボードを出す)。
  //   鍵が無い(見るだけのURL)ときは出さない=見せてもらった人に押せないボタンを勧めない。
  if (!client) return;
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.id = 'lvWebPostFab';
  fab.textContent = '✍️ コメント';
  fab.hidden = true;
  fab.addEventListener('click', () => {
    section.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try { input.focus({ preventScroll: true }); } catch { input.focus(); }
  });
  document.body.appendChild(fab);
  try {
    // 入力欄そのものが半分以上見えていれば出さない(画面は .nl-main の中で縦に流れる)。
    new IntersectionObserver(
      (entries) => {
        for (const e of entries) fab.hidden = e.intersectionRatio >= 0.5;
      },
      { threshold: [0, 0.5, 1] }
    ).observe(input);
  } catch {
    /* 古いブラウザ: 出さない */
  }
}
