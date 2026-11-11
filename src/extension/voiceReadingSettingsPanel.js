// voiceReadingSettingsPanel.js — 会場とコメビュの「読み方」。
// 辞書の追加・編集・削除、読み方の型、読まない人、書き出しと読み込み。
// 声の割り当ては触らない。保存は KEY_VOICE_READING_SCRIPT(schemaVersion つき)だけ。

import { KEY_VOICE_READING_SCRIPT } from '../lib/voiceKeys.js';
import {
  compileVoiceReadingScript,
  composeVoiceReading,
  DEFAULT_COMMENT_TEMPLATE,
  DEFAULT_GIFT_TEMPLATE,
  excludeEntryFromInput,
  mergeVoiceReadingImport,
  parseVoiceReadingImport,
  serializeVoiceReadingScript,
  VOICE_READING_DICT_MAX,
  voiceReadingScriptToStorage
} from '../lib/voiceReadingScript.js';

const HOST_ID = 'nl-voice-reading-host';

/**
 * @param {{ local?: { get?: Function, set?: Function }, get?: Function, set?: Function } | null | undefined} storage
 */
function storageLocal(storage) {
  if (storage && storage.local && typeof storage.local.get === 'function') return storage.local;
  return storage || null;
}

/**
 * @param {ReturnType<typeof storageLocal>} local
 */
async function readRaw(local) {
  if (!local || typeof local.get !== 'function') return null;
  try {
    const bag = await local.get([KEY_VOICE_READING_SCRIPT]);
    return bag ? bag[KEY_VOICE_READING_SCRIPT] : null;
  } catch {
    return null;
  }
}

/**
 * @param {ReturnType<typeof storageLocal>} local
 * @param {unknown} plain
 */
function persistVoiceReadingScript(payload) {
  return chrome.storage.local.set({ [KEY_VOICE_READING_SCRIPT]: payload });
}

async function writeRaw(local, plain) {
  const payload = voiceReadingScriptToStorage(plain);
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && local === chrome.storage.local) {
    await persistVoiceReadingScript(payload);
    return;
  }
  if (local && typeof local.set === 'function') await local.set({ [KEY_VOICE_READING_SCRIPT]: payload });
}

/**
 * @param {ParentNode} root
 * @param {string} tag
 * @param {string} text
 * @param {string} [className]
 */
function el(root, tag, text, className) {
  const node = root.ownerDocument.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function field(doc, labelText, control) {
  const wrap = doc.createElement('label');
  wrap.className = 'nl-vrs__field';
  const span = doc.createElement('span');
  span.textContent = labelText;
  wrap.append(span, control);
  return wrap;
}

const CSS = `
:host { all: initial; }
.backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;
  background: rgba(15, 23, 42, 0.48);
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Yu Gothic', sans-serif;
  color: #1f2937;
  font-size: 15px;
  line-height: 1.5;
}
.panel {
  width: min(560px, 100%);
  max-height: min(92vh, 780px);
  overflow: auto;
  background: #ffffff;
  color: #1f2937;
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.28);
  padding: 16px 16px 20px;
  box-sizing: border-box;
}
h2 { margin: 0; font-size: 18px; line-height: 1.4; }
.lead { margin: 6px 0 12px; color: #374151; font-size: 13px; }
.section { margin-top: 14px; padding-top: 12px; border-top: 1px solid #e5e7eb; }
.section h3 { margin: 0 0 6px; font-size: 15px; }
.hint { margin: 0 0 8px; color: #374151; font-size: 12.5px; }
.row, .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.row input, textarea, .grow { flex: 1 1 140px; min-width: 0; }
.nl-vrs__field { display: block; margin: 0 0 8px; }
.nl-vrs__field span { display: block; margin: 0 0 4px; font-size: 13px; font-weight: 600; }
.row input { width: auto; }
input, textarea {
  box-sizing: border-box;
  width: 100%;
  background: #ffffff;
  color: #1f2937;
  border: 1px solid #9ca3af;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  font-size: 15px;
}
textarea { min-height: 64px; resize: vertical; }
input:focus, textarea:focus, button:focus-visible {
  outline: 2px solid #0f6f9e;
  outline-offset: 2px;
}
button {
  background: #ffffff;
  color: #1f2937;
  border: 1px solid #9ca3af;
  border-radius: 8px;
  padding: 8px 12px;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
button.primary { background: #0f6f9e; color: #ffffff; border-color: #0f6f9e; }
button.quiet { color: #1f2937; }
.dict { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.preview {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f3f4f6;
  color: #1f2937;
  font-size: 13.5px;
}
.status { min-height: 1.4em; margin: 8px 0 0; color: #1f2937; font-size: 13px; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
@media (max-width: 640px) {
  .backdrop { padding: 0; align-items: stretch; }
  .panel { width: 100%; max-height: 100%; border-radius: 0; }
  .row, .actions { align-items: stretch; }
  button { width: 100%; }
  .head button { width: auto; }
  .row input { width: 100%; flex-basis: 100%; }
}
@media (prefers-color-scheme: dark) {
  .panel { background: #111827; color: #f9fafb; }
  h2, .section h3, .lead, .hint, .status, .preview { color: #f9fafb; }
  .section { border-top-color: #374151; }
  input, textarea { background: #1f2937; color: #f9fafb; border-color: #9ca3af; }
  button { background: #1f2937; color: #f9fafb; border-color: #9ca3af; }
  button.primary { background: #38bdf8; color: #0f172a; border-color: #38bdf8; }
  .preview { background: #1f2937; }
}
`;

const IMPORT_NOTE = {
  empty: '中身がありません',
  'too-big': 'ファイルが大きすぎます',
  'bad-json': 'ファイルを読み取れませんでした',
  'no-rows': '単語と読みの組がありません'
};

/**
 * @param {Document} doc
 * @param {{ get?: Function, set?: Function } | null} local
 * @param {HTMLElement} anchor
 */
function openPanel(doc, local, anchor) {
  let host = doc.getElementById(HOST_ID);
  if (host && host.isConnected) {
    const closeBtn = host.shadowRoot && host.shadowRoot.querySelector('[data-close]');
    if (closeBtn instanceof HTMLElement) closeBtn.focus();
    return;
  }
  host = doc.createElement('div');
  host.id = HOST_ID;
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '2147483000';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = CSS;
  shadow.append(style);
  doc.body.append(host);

  /** @type {ReturnType<typeof compileVoiceReadingScript>} */
  let current = compileVoiceReadingScript(null);
  /** @type {number} */
  let timer = 0;

  const backdrop = doc.createElement('div');
  backdrop.className = 'backdrop';
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  const panel = doc.createElement('div');
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'nl-vrs-title');
  backdrop.append(panel);
  shadow.append(backdrop);

  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };
  doc.addEventListener('keydown', onKey);

  function close() {
    window.clearTimeout(timer);
    doc.removeEventListener('keydown', onKey);
    host.remove();
    if (anchor instanceof HTMLElement) anchor.focus();
  }

  async function persist(next, quiet) {
    current = compileVoiceReadingScript(next || collect());
    try {
      await writeRaw(local, current);
      if (!quiet) setStatus('保存しました');
      return true;
    } catch {
      setStatus('保存できませんでした。もう一度試してください');
      return false;
    } finally {
      paintPreview();
    }
  }

  function schedule() {
    paintPreview();
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { void persist(undefined, true); }, 280);
  }

  function collect() {
    const dictionary = [...panel.querySelectorAll('[data-dict-row]')].map((row) => ({
      word: row.querySelector('[data-word]') instanceof HTMLInputElement ? /** @type {HTMLInputElement} */ (row.querySelector('[data-word]')).value : '',
      reading: row.querySelector('[data-reading]') instanceof HTMLInputElement ? /** @type {HTMLInputElement} */ (row.querySelector('[data-reading]')).value : ''
    }));
    const comment = panel.querySelector('[data-comment-template]');
    const gift = panel.querySelector('[data-gift-template]');
    return {
      dictionary,
      commentTemplate: comment instanceof HTMLTextAreaElement ? comment.value : current.commentTemplate,
      giftTemplate: gift instanceof HTMLTextAreaElement ? gift.value : current.giftTemplate,
      exclude: current.exclude
    };
  }

  function setStatus(text) {
    const node = panel.querySelector('[data-status]');
    if (node) node.textContent = text;
  }

  function paintPreview() {
    const node = panel.querySelector('[data-preview]');
    if (!node) return;
    const script = compileVoiceReadingScript(collect());
    const comment = composeVoiceReading(
      { kind: 'comment', name: 'リスナー', text: '草888' },
      { script }
    );
    const gift = composeVoiceReading(
      { kind: 'gift', name: 'リスナー', gift: '花火', count: 1, message: '' },
      { script }
    );
    node.textContent = '';
    node.append(el(node, 'div', `コメント: ${comment || '（読まない）'}`));
    node.append(el(node, 'div', `ギフト: ${gift || '（読まない）'}`));
    node.append(el(node, 'div', '見本の名前を入れています。名前が空のときは、先頭の「さん」や読点は読みません。'));
  }

  function render(script) {
    current = script;
    panel.textContent = '';
    const head = doc.createElement('div');
    head.className = 'head';
    const title = el(head, 'h2', '読み方');
    title.id = 'nl-vrs-title';
    const closeBtn = el(head, 'button', '閉じる');
    closeBtn.type = 'button';
    closeBtn.dataset.close = '1';
    closeBtn.addEventListener('click', close);
    head.append(title, closeBtn);
    panel.append(head, el(panel, 'p', '言葉の読みと、コメント・ギフトの読み方を決めます。人ごとの声はそのままです。この端末の中だけに保存します。', 'lead'));

    const dictSec = doc.createElement('section');
    dictSec.className = 'section';
    dictSec.append(el(dictSec, 'h3', '読み上げ辞書'));
    dictSec.append(el(dictSec, 'p', '声を作る直前に置き換えます。長い語を優先します。例: 草 → くさ、888 → ぱちぱち', 'hint'));
    const addRow = doc.createElement('div');
    addRow.className = 'row';
    const wordInput = doc.createElement('input');
    wordInput.type = 'text';
    wordInput.maxLength = 40;
    wordInput.placeholder = '単語';
    wordInput.setAttribute('aria-label', '追加する単語');
    const readingInput = doc.createElement('input');
    readingInput.type = 'text';
    readingInput.maxLength = 40;
    readingInput.placeholder = '読み';
    readingInput.setAttribute('aria-label', '追加する読み');
    const addBtn = el(addRow, 'button', '追加');
    addBtn.type = 'button';
    addBtn.className = 'primary';
    addRow.append(wordInput, readingInput, addBtn);
    dictSec.append(addRow);

    const list = doc.createElement('div');
    list.className = 'dict';
    for (const row of current.dictionary) {
      const line = doc.createElement('div');
      line.className = 'row';
      line.dataset.dictRow = '1';
      const w = doc.createElement('input');
      w.type = 'text';
      w.maxLength = 40;
      w.value = row.word;
      w.dataset.word = '1';
      w.setAttribute('aria-label', `単語 ${row.word}`);
      const r = doc.createElement('input');
      r.type = 'text';
      r.maxLength = 40;
      r.value = row.reading;
      r.dataset.reading = '1';
      r.setAttribute('aria-label', `読み ${row.word}`);
      const del = el(line, 'button', '削除');
      del.type = 'button';
      del.className = 'quiet';
      w.addEventListener('input', schedule);
      r.addEventListener('input', schedule);
      del.addEventListener('click', () => {
        line.remove();
        void persist();
      });
      line.append(w, r, del);
      list.append(line);
    }
    dictSec.append(list);
    addBtn.addEventListener('click', () => {
      const word = wordInput.value.trim();
      const reading = readingInput.value.trim();
      if (!word) {
        setStatus('単語を入れてください');
        wordInput.focus();
        return;
      }
      if (current.dictionary.length >= VOICE_READING_DICT_MAX) {
        setStatus(`辞書は${VOICE_READING_DICT_MAX}件までです`);
        return;
      }
      const next = collect();
      const without = next.dictionary.filter((e) => e.word !== word);
      without.push({ word, reading });
      next.dictionary = without;
      wordInput.value = '';
      readingInput.value = '';
      render(compileVoiceReadingScript(next));
      void persist(next);
    });

    const actions = doc.createElement('div');
    actions.className = 'actions';
    const exportBtn = el(actions, 'button', '書き出す');
    exportBtn.type = 'button';
    const importBtn = el(actions, 'button', '読み込む');
    importBtn.type = 'button';
    const file = doc.createElement('input');
    file.type = 'file';
    file.accept = '.json,.txt,application/json,text/plain';
    file.hidden = true;
    file.setAttribute('aria-label', '読み方のファイル');
    exportBtn.addEventListener('click', () => {
      const blob = new Blob([serializeVoiceReadingScript(collect())], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = doc.createElement('a');
      a.href = url;
      a.download = 'voice-reading.json';
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setStatus('書き出しました');
    });
    importBtn.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const picked = file.files && file.files[0];
      file.value = '';
      if (!picked) return;
      const reader = new FileReader();
      reader.onload = () => {
        const parsed = parseVoiceReadingImport(String(reader.result || ''));
        if (!parsed.ok) {
          setStatus(IMPORT_NOTE[parsed.reason] || '読み取れませんでした');
          return;
        }
        const merged = mergeVoiceReadingImport(collect(), parsed);
        render(compileVoiceReadingScript(merged));
        void persist(merged, true).then((ok) => {
          if (ok) setStatus(`${merged.dictionary.length}件の辞書を読み込みました`);
        });
      };
      reader.onerror = () => setStatus('ファイルを読み取れませんでした');
      reader.readAsText(picked);
    });
    actions.append(exportBtn, importBtn, file);
    dictSec.append(actions, el(dictSec, 'div', '', 'preview'));
    const preview = dictSec.querySelector('.preview');
    if (preview) preview.dataset.preview = '1';

    const typeSec = doc.createElement('section');
    typeSec.className = 'section';
    typeSec.append(el(typeSec, 'h3', '読み方の型'));
    typeSec.append(el(typeSec, 'p', '使える印: {name} {comment} {gift} {count} {message}。{count} は2個以上のときだけ入ります。空のままにすると、今までと同じ文を読みます。', 'hint'));
    const commentBox = doc.createElement('textarea');
    commentBox.dataset.commentTemplate = '1';
    commentBox.value = current.commentTemplate;
    commentBox.maxLength = 180;
    commentBox.setAttribute('aria-label', 'コメントの読み方');
    const giftBox = doc.createElement('textarea');
    giftBox.dataset.giftTemplate = '1';
    giftBox.value = current.giftTemplate;
    giftBox.maxLength = 180;
    giftBox.setAttribute('aria-label', 'ギフトの読み方');
    commentBox.addEventListener('input', schedule);
    giftBox.addEventListener('input', schedule);
    const reset = el(typeSec, 'button', '今までの読み方に戻す');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      commentBox.value = DEFAULT_COMMENT_TEMPLATE;
      giftBox.value = DEFAULT_GIFT_TEMPLATE;
      void persist();
    });
    typeSec.append(
      field(doc, 'コメント', commentBox),
      field(doc, 'ギフト', giftBox),
      reset
    );

    const exSec = doc.createElement('section');
    exSec.className = 'section';
    exSec.append(el(exSec, 'h3', '読まない人'));
    exSec.append(el(exSec, 'p', 'ここに入れた人のコメントは画面に残し、声だけ出しません。ユーザーIDか、一人に絞れる表示名を入れます。', 'hint'));
    const exRow = doc.createElement('div');
    exRow.className = 'row';
    const exInput = doc.createElement('input');
    exInput.type = 'text';
    exInput.maxLength = 80;
    exInput.placeholder = 'ユーザーID または表示名';
    exInput.setAttribute('aria-label', '読まない人');
    const exAdd = el(exRow, 'button', '追加');
    exAdd.type = 'button';
    exAdd.className = 'primary';
    exRow.append(exInput, exAdd);
    const exList = doc.createElement('div');
    exList.className = 'dict';
    for (const entry of current.exclude) {
      const line = doc.createElement('div');
      line.className = 'row';
      line.append(el(line, 'span', entry.name || entry.key, 'grow'));
      const del = el(line, 'button', '削除');
      del.type = 'button';
      del.addEventListener('click', () => {
        current = compileVoiceReadingScript({
          ...collect(),
          exclude: current.exclude.filter((e) => e.key !== entry.key)
        });
        render(current);
        void persist(current);
      });
      line.append(del);
      exList.append(line);
    }
    exAdd.addEventListener('click', () => {
      const entry = excludeEntryFromInput(exInput.value, Date.now());
      if (!entry) {
        setStatus('一人に絞れるユーザーIDか表示名を入れてください');
        exInput.focus();
        return;
      }
      const exclude = current.exclude.filter((e) => e.key !== entry.key);
      exclude.push(entry);
      const next = { ...collect(), exclude };
      render(compileVoiceReadingScript(next));
      void persist(next);
    });
    exSec.append(exRow, exList);

    panel.append(dictSec, typeSec, exSec, el(panel, 'p', '', 'status'));
    const status = panel.querySelector('.status');
    if (status) status.dataset.status = '1';
    paintPreview();
    if (!host.dataset.ready) {
      host.dataset.ready = '1';
      closeBtn.focus();
    }
  }

  void readRaw(local).then((raw) => {
    render(compileVoiceReadingScript(raw));
  });
}

/**
 * 読み上げボタンのとなりに「読み方」を置く。
 * @param {{ anchor: Element | null, storage?: any, buttonClass?: string }} opts
 */
export function mountVoiceReadingSettingsButton(opts) {
  const anchor = opts && opts.anchor;
  const doc = (anchor && anchor.ownerDocument) || document;
  if (!anchor || !anchor.parentNode) return null;
  if (anchor.parentNode.querySelector('[data-nl-voice-reading-open]')) return anchor.parentNode.querySelector('[data-nl-voice-reading-open]');
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.dataset.nlVoiceReadingOpen = '1';
  btn.textContent = '読み方';
  btn.title = '読み上げの辞書・読み方の型・読まない人';
  btn.setAttribute('aria-haspopup', 'dialog');
  if (opts.buttonClass) {
    btn.className = opts.buttonClass;
    btn.style.marginLeft = '8px';
  }
  anchor.insertAdjacentElement('afterend', btn);
  const local = storageLocal(opts.storage);
  btn.addEventListener('click', () => openPanel(doc, local, btn));
  return btn;
}
