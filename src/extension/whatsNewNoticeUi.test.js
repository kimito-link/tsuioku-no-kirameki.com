/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { wireWhatsNewNotice, applyLpChangelogLink } from './whatsNewNoticeUi.js';
import { getLatestChangelogEntry } from '../lib/changelog.js';
import { lpChangelogUrl } from '../lib/lpChangelogLink.js';
import { WHATS_NEW_SEEN_STORAGE_KEY } from '../lib/whatsNewNotice.js';

const POPUP_HTML = readFileSync(resolve(__dirname, '../../extension/popup.html'), 'utf8');
const SIDEPANEL_HTML = readFileSync(resolve(__dirname, '../../extension/yt-sidepanel.html'), 'utf8');

/** popup.html の本物の「この版で変わったこと」の枠だけを取り出す。 */
function noticeMarkup(html) {
  const m = html.match(/<aside\s+id="whatsNewNotice"[\s\S]*?<\/aside>/);
  if (!m) throw new Error('whatsNewNotice が popup.html に無い');
  return m[0];
}

function fakeStorage(initial = {}) {
  const bag = { ...initial };
  return {
    bag,
    get: async (k) => ({ [k]: bag[k] }),
    set: async (o) => Object.assign(bag, o)
  };
}

const latest = getLatestChangelogEntry();

describe('この版で変わったこと（版番号＋一言・詳しくは紹介ページ）', () => {
  beforeEach(() => {
    document.body.innerHTML = noticeMarkup(POPUP_HTML);
  });

  it('更新後は、版番号と一言だけを出し、項目の全文は並べない', async () => {
    await wireWhatsNewNotice({ document, storage: fakeStorage({ [WHATS_NEW_SEEN_STORAGE_KEY]: '0.1.1' }) });
    const notice = document.getElementById('whatsNewNotice');
    expect(notice.hidden).toBe(false);
    expect(document.getElementById('whatsNewNoticeVersion').textContent).toBe(`v${latest.version}`);
    expect(document.getElementById('whatsNewNoticeSummary').textContent).toBe(latest.summary);
    expect(notice.querySelectorAll('li').length).toBe(0);
    for (const item of latest.items) {
      expect(notice.textContent.includes(item)).toBe(false);
    }
  });

  it('版番号と「詳しく」は紹介ページのその版を新しいタブで開く', async () => {
    await wireWhatsNewNotice({ document, storage: fakeStorage({ [WHATS_NEW_SEEN_STORAGE_KEY]: '0.1.1' }) });
    for (const id of ['whatsNewNoticeVersion', 'whatsNewNoticeMore']) {
      const a = document.getElementById(id);
      expect(a.tagName).toBe('A');
      expect(a.getAttribute('href')).toBe(lpChangelogUrl(latest.version));
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }
    expect(document.getElementById('whatsNewNoticeMore').textContent.trim()).toBe('詳しく');
  });

  it('リンクを押したら「見た」にして閉じる（次からは出ない）', async () => {
    const storage = fakeStorage({ [WHATS_NEW_SEEN_STORAGE_KEY]: '0.1.1' });
    await wireWhatsNewNotice({ document, storage });
    const a = document.getElementById('whatsNewNoticeMore');
    a.addEventListener('click', (ev) => ev.preventDefault()); // テストではページを移らない
    a.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(storage.bag[WHATS_NEW_SEEN_STORAGE_KEY]).toBe(latest.version);
    expect(document.getElementById('whatsNewNotice').hidden).toBe(true);
  });

  it('横の欄（yt-sidepanel.html）も同じ短い形', () => {
    const aside = noticeMarkup(SIDEPANEL_HTML);
    expect(aside).toContain('id="whatsNewNoticeMore"');
    expect(aside).not.toContain('whatsNewNoticeItems');
  });
});

describe('拡張の中の版番号は紹介ページへのリンク', () => {
  it('applyLpChangelogLink は href・target・rel をそろえる', () => {
    const a = document.createElement('a');
    applyLpChangelogLink(a, '0.1.2229');
    expect(a.getAttribute('href')).toBe('https://tsuioku-no-kirameki.com/changelog.html#v0.1.2229');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('「詳しい状況」の版番号バッジは押せるリンク', () => {
    const m = POPUP_HTML.match(/<(\w+)\s+id="nlVersionBadge"[^>]*>/);
    expect(m && m[1]).toBe('a');
    expect(m[0]).toContain('target="_blank"');
  });

  it('更新履歴の一覧は版番号をリンクにし、項目の全文は並べない', () => {
    const src = readFileSync(resolve(__dirname, './popup-entry.js'), 'utf8');
    const block = src.slice(src.indexOf("$('changelogList')"), src.indexOf('void wireWhatsNewNotice('));
    expect(block).toContain("document.createElement('a')");
    expect(block).toContain('applyLpChangelogLink(ver, entry.version)');
    expect(block).not.toContain('entry.items');
  });
});
