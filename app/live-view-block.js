/**
 * iPhone アプリの「🚩 見たくない人を隠す・報告する」(App Store の審査 1.2: ほかの人の書き込みを見せるアプリの決まり)。
 *   隠すのはこの端末の画面だけ(src/lib/phoneBlocklist.js)。報告はニコニコの窓口と、このアプリの連絡先へ。
 *
 * @module live-view-block
 */
import { PHONE_BLOCKLIST_KEY, PHONE_BLOCKLIST_MAX, parseBlocklist, recentPeopleForBlock } from '../src/lib/phoneBlocklist.js';

const NICONICO_REPORT_URL = 'https://qa.nicovideo.jp/';
const CONTACT_MAIL = 'mailto:info@best-trust.biz?subject=%E8%BF%BD%E6%86%B6%E3%81%AE%E3%81%8D%E3%82%89%E3%82%81%E3%81%8D%20%E5%A0%B1%E5%91%8A';

export function readBlocklist() {
  try { return parseBlocklist(localStorage.getItem(PHONE_BLOCKLIST_KEY)); } catch { return []; }
}
/** @param {string[]} list */
function writeBlocklist(list) {
  try { localStorage.setItem(PHONE_BLOCKLIST_KEY, JSON.stringify(list.slice(-PHONE_BLOCKLIST_MAX))); } catch { /* 覚えられなくても今回は隠す */ }
}

const STYLE = `
#lvWebBlockBtn{position:fixed;right:12px;bottom:calc(332px + env(safe-area-inset-bottom,0px));z-index:99995;
  min-width:44px;height:44px;padding:0 12px;border-radius:22px;border:1px solid rgba(0,0,0,.15);
  background:#fff;color:#333;font:600 15px/1 system-ui,-apple-system,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.18)}
#lvWebBlockSheet{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;justify-content:center}
#lvWebBlockSheet .p{background:#fffdf9;color:#4a3b34;width:100%;max-width:520px;max-height:80vh;overflow:auto;border-radius:16px 16px 0 0;
  padding:14px 14px calc(14px + env(safe-area-inset-bottom,0px));font:14px/1.6 -apple-system,system-ui,sans-serif}
#lvWebBlockSheet h2{font-size:16px;margin:0 0 6px}
#lvWebBlockSheet p{margin:0 0 10px;font-size:13px;color:#8a7568}
#lvWebBlockSheet li{display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid #f0e2d6;list-style:none}
#lvWebBlockSheet ul{margin:0 0 12px;padding:0}
#lvWebBlockSheet .n{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#lvWebBlockSheet button,#lvWebBlockSheet a{flex:0 0 auto;min-height:36px;padding:0 12px;border-radius:10px;border:1px solid #e3c9b5;background:#fff;color:#4a3b34;font:600 13px/36px inherit;text-decoration:none;display:inline-block}
#lvWebBlockSheet .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
`;

/**
 * @param {{ getRows: () => any[], onChange: () => void }} a
 */
export function mountPhoneBlockUi(a) {
  if (document.getElementById('lvWebBlockBtn')) return;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  const btn = document.createElement('button');
  btn.id = 'lvWebBlockBtn';
  btn.type = 'button';
  btn.textContent = '🚩';
  btn.setAttribute('aria-label', '見たくない人を隠す・報告する');
  btn.addEventListener('click', (ev) => { ev.stopPropagation(); open(); });
  document.body.appendChild(btn);

  function open() {
    close();
    const blocked = readBlocklist();
    const sheet = document.createElement('div');
    sheet.id = 'lvWebBlockSheet';
    const p = document.createElement('div');
    p.className = 'p';
    const h = document.createElement('h2');
    h.textContent = '見たくない人を隠す・報告する';
    const note = document.createElement('p');
    note.textContent = '隠した人のコメントと顔は、この端末の画面に出なくなります(PC の記録は変わりません)。';
    const ul = document.createElement('ul');
    const set = new Set(blocked);
    const people = recentPeopleForBlock(a.getRows()).filter((x) => !set.has(x.userId));
    const item = (/** @type {string} */ label, /** @type {string} */ btnText, /** @type {() => void} */ act) => {
      const li = document.createElement('li');
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = label;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = btnText;
      b.addEventListener('click', act);
      li.append(n, b);
      ul.appendChild(li);
    };
    for (const x of people) {
      item(`${x.name}「${x.text}」`, '隠す', () => { writeBlocklist([...readBlocklist(), x.userId]); a.onChange(); open(); });
    }
    for (const id of blocked) {
      item(`隠している人(${id.slice(0, 12)})`, '戻す', () => { writeBlocklist(readBlocklist().filter((y) => y !== id)); a.onChange(); open(); });
    }
    if (!people.length && !blocked.length) item('最近コメントした人はまだいません', '閉じる', close);
    const row = document.createElement('div');
    row.className = 'row';
    const rep = document.createElement('a');
    rep.href = NICONICO_REPORT_URL;
    rep.target = '_blank';
    rep.rel = 'noopener';
    rep.textContent = 'ニコニコに報告する';
    const mail = document.createElement('a');
    mail.href = CONTACT_MAIL;
    mail.textContent = 'このアプリに連絡する';
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '閉じる';
    x.addEventListener('click', close);
    row.append(rep, mail, x);
    p.append(h, note, ul, row);
    sheet.appendChild(p);
    sheet.addEventListener('click', (ev) => { if (ev.target === sheet) close(); });
    document.body.appendChild(sheet);
  }
  function close() {
    const s = document.getElementById('lvWebBlockSheet');
    if (s) s.remove();
  }
}
