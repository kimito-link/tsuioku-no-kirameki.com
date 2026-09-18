// @ts-nocheck — popup-entry.js から切り出し。DOM/Chrome API が広く any 相当(移設元と同方針)。
/**
 * frameTheme — popup の「配色プリセット/枠テーマ」一式。
 *
 * ★refactor Phase 4 Track B の 4-1。挙動は一切変えていない。
 *   popup-entry.js の initPopup がファイル上限と initPopup 上限の両方に張り付いていたため、
 *   結合が比較的弱い枠テーマのクラスタを 1 つ外へ出す。
 *
 * ★選定と境界(2026-09-18 に司令塔が実コードで再測定):
 *   - frame 専用の module-level 状態 `popupFrameState` は【この箱に同伴】させた
 *     (popup-entry 側の利用は無く、frame コードだけが読む)。
 *   - `readCustomFrameInputs` は元は initPopup 内クロージャだったが frame 専用なのでここへ。
 *   - generic utility(`copyTextToClipboard` / `openManualCopyOverlay` は使わない・
 *     `triggerOpSound`)と DOM 取得(`getEl` / `doc`)は popup-entry から【注入】する
 *     (それらは全体で使われる共有物なので、この箱に取り込まない)。
 *   - frame の純粋ロジック(プリセット表・コーデック)は既に src/lib にあるので直接 import。
 *
 * ★DOM を触るので純関数ではない。src/extension/popup 配下(src/lib は window/document 禁止)。
 *
 * @module popup/init/frameTheme
 */

import {
  DEFAULT_CUSTOM_FRAME,
  DEFAULT_FRAME_ID,
  frameLabel,
  hasFramePreset,
  KNOWN_FRAME_VARS,
  normalizeFrameId,
  resolveFrameVars,
  sanitizeCustomFrame
} from '../../../lib/popupFramePresets.js';
import { createFrameShareCode, parseFrameShareCode } from '../../../lib/popupFrameCodec.js';

/** storage キー(popup-entry と同一の文字列。値は変えない) */
const KEY_POPUP_FRAME = 'popupFrame';
const KEY_POPUP_FRAME_CUSTOM = 'popupFrameCustom';

/**
 * frame 専用の module-level 状態。popup-entry 側の利用は無いので同伴させた。
 * @type {{ id: string, custom: { headerStart: string, headerEnd: string, accent: string } }}
 */
export const popupFrameState = {
  id: DEFAULT_FRAME_ID,
  custom: { ...DEFAULT_CUSTOM_FRAME }
};

/** @param {(id: string) => any} getEl @param {Document} doc @param {string} frameId */
function renderFrameSelection(getEl, doc, frameId) {
  const labelEl = getEl('frameCurrentLabel');
  if (labelEl) labelEl.textContent = frameLabel(frameId);
  const chips = Array.from(doc.querySelectorAll('.nl-frame-chip'));
  for (const chip of chips) {
    const id = String(chip.getAttribute('data-frame-id') || '');
    const active = id === frameId;
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-selected', active ? 'true' : 'false');
  }
}

/** @param {(id: string) => any} getEl @param {{ headerStart: string, headerEnd: string, accent: string }} custom */
function renderCustomFrameEditor(getEl, custom) {
  const safe = sanitizeCustomFrame(custom);
  const start = /** @type {HTMLInputElement|null} */ (getEl('frameHeaderStart'));
  const end = /** @type {HTMLInputElement|null} */ (getEl('frameHeaderEnd'));
  const accent = /** @type {HTMLInputElement|null} */ (getEl('frameAccent'));
  if (start) start.value = safe.headerStart;
  if (end) end.value = safe.headerEnd;
  if (accent) accent.value = safe.accent;
}

/** @param {(id: string) => any} getEl @param {Document} doc @param {string} frameId @param {{ headerStart: string, headerEnd: string, accent: string }} custom */
function applyPopupFrame(getEl, doc, frameId, custom) {
  const root = doc.documentElement;
  const normalized = normalizeFrameId(frameId);
  const selectedFrame =
    normalized === 'custom' || hasFramePreset(normalized) ? normalized : DEFAULT_FRAME_ID;
  const vars = resolveFrameVars(selectedFrame, custom);
  // 0.1.11 (A1 親バグ根治): プリセット切替で前プリセットの inline 値が残留すると、
  // 例えば dark→light 切替時に `--nl-text-sub: #cbd5e1` が残って light 背景上で
  // 読めなくなる。新プリセットを書く前に既知キーを一括 removeProperty して、
  // CSS rule の値（`html.nl-skin-panel-dark` の dark 値 など）に一旦戻してから
  // 新プリセットの inline で上書きする。これで切替の度に綺麗にリセットされる。
  for (const key of KNOWN_FRAME_VARS) {
    root.style.removeProperty(key);
  }
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  renderFrameSelection(getEl, doc, selectedFrame);
  renderCustomFrameEditor(getEl, custom);
  syncFrameShareInput(getEl);
}

/** 配色プリセットが外側の details 内にあるため、カスタム編集時は開いておく @param {(id: string) => any} getEl */
function openFrameThemeSectionIfPresent(getEl) {
  const theme = /** @type {HTMLDetailsElement|null} */ (getEl('frameThemeDetails'));
  if (theme) theme.open = true;
}

/** @param {(id: string) => any} getEl @param {Document} doc */
export async function loadPopupFrameSettings(getEl, doc) {
  const bag = await chrome.storage.local.get([KEY_POPUP_FRAME, KEY_POPUP_FRAME_CUSTOM]);
  const rawFrameId = normalizeFrameId(bag[KEY_POPUP_FRAME]);
  const frameId =
    rawFrameId === 'custom' || hasFramePreset(rawFrameId) ? rawFrameId : DEFAULT_FRAME_ID;
  const custom = sanitizeCustomFrame(bag[KEY_POPUP_FRAME_CUSTOM]);
  popupFrameState.id = frameId;
  popupFrameState.custom = custom;
  applyPopupFrame(getEl, doc, frameId, custom);
  if (frameId === 'custom') openFrameThemeSectionIfPresent(getEl);
}

async function savePopupFrameSettings() {
  await chrome.storage.local.set({
    [KEY_POPUP_FRAME]: popupFrameState.id,
    [KEY_POPUP_FRAME_CUSTOM]: popupFrameState.custom
  });
}

/** @param {(id: string) => any} getEl @param {string} message @param {'idle'|'error'|'success'} kind */
function setFrameShareStatus(getEl, message, kind = 'idle') {
  const status = getEl('frameShareStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.remove('error', 'success');
  if (kind === 'error') status.classList.add('error');
  if (kind === 'success') status.classList.add('success');
}

/** @param {(id: string) => any} getEl */
function syncFrameShareInput(getEl) {
  const input = /** @type {HTMLTextAreaElement|null} */ (getEl('frameShareCode'));
  if (!input) return;
  input.value = createFrameShareCode(popupFrameState.id, popupFrameState.custom);
}

/** @param {(id: string) => any} getEl */
function readCustomFrameInputs(getEl) {
  return sanitizeCustomFrame({
    headerStart: /** @type {HTMLInputElement|null} */ (getEl('frameHeaderStart'))?.value,
    headerEnd: /** @type {HTMLInputElement|null} */ (getEl('frameHeaderEnd'))?.value,
    accent: /** @type {HTMLInputElement|null} */ (getEl('frameAccent'))?.value
  });
}

/**
 * 初期ロード失敗時のフォールバック(現状値でとにかく塗る)。
 * @param {(id: string) => any} getEl @param {Document} doc
 */
export function applyPopupFrameFallback(getEl, doc) {
  applyPopupFrame(getEl, doc, popupFrameState.id, popupFrameState.custom);
}

/**
 * 枠テーマの listener をすべて張る。popup-entry の initPopup から 1 回呼ぶ。
 *
 * @param {{
 *   getEl: (id: string) => any,
 *   doc: Document,
 *   copyTextToClipboard: (text: string) => Promise<boolean>,
 *   triggerOpSound: (name: string) => void,
 * }} deps
 */
export function wireFrameTheme(deps) {
  const { getEl, doc, copyTextToClipboard, triggerOpSound } = deps;

  const frameChips = Array.from(doc.querySelectorAll('.nl-frame-chip'));
  const frameEditor = /** @type {HTMLDetailsElement|null} */ (getEl('frameCustomEditor'));
  const saveCustomFrameBtn = getEl('saveCustomFrame');
  const resetCustomFrameBtn = getEl('resetCustomFrame');
  const copyFrameCodeBtn = getEl('copyFrameCode');
  const toggleFrameCodeInputBtn = getEl('toggleFrameCodeInput');
  const frameShareBox = getEl('frameShareBox');
  const frameShareCode = /** @type {HTMLTextAreaElement|null} */ (getEl('frameShareCode'));
  const applyFrameCodeBtn = getEl('applyFrameCode');

  const applyAndSaveFrame = async (frameId) => {
    const normalized =
      frameId === 'custom' || hasFramePreset(frameId) ? frameId : DEFAULT_FRAME_ID;
    popupFrameState.id = normalized;
    if (normalized === 'custom') {
      popupFrameState.custom = readCustomFrameInputs(getEl);
      openFrameThemeSectionIfPresent(getEl);
      if (frameEditor) frameEditor.open = true;
    }
    applyPopupFrame(getEl, doc, popupFrameState.id, popupFrameState.custom);
    setFrameShareStatus(getEl, '', 'idle');
    await savePopupFrameSettings();
  };

  for (const chip of frameChips) {
    chip.addEventListener('click', () => {
      const frameId = String(chip.getAttribute('data-frame-id') || '');
      applyAndSaveFrame(frameId).catch(() => {});
    });
  }

  saveCustomFrameBtn?.addEventListener('click', () => {
    popupFrameState.custom = readCustomFrameInputs(getEl);
    popupFrameState.id = 'custom';
    applyPopupFrame(getEl, doc, popupFrameState.id, popupFrameState.custom);
    setFrameShareStatus(getEl, 'カスタム色を更新しました。', 'success');
    savePopupFrameSettings().catch(() => {});
  });

  resetCustomFrameBtn?.addEventListener('click', () => {
    popupFrameState.custom = { ...DEFAULT_CUSTOM_FRAME };
    renderCustomFrameEditor(getEl, popupFrameState.custom);
    if (popupFrameState.id === 'custom') {
      applyPopupFrame(getEl, doc, popupFrameState.id, popupFrameState.custom);
    }
    setFrameShareStatus(getEl, 'カスタム色を初期化しました。', 'success');
    savePopupFrameSettings().catch(() => {});
  });

  toggleFrameCodeInputBtn?.addEventListener('click', () => {
    if (!frameShareBox) return;
    const nextHidden = !frameShareBox.hidden;
    frameShareBox.hidden = nextHidden;
    setFrameShareStatus(getEl, '', 'idle');
    if (!nextHidden) {
      syncFrameShareInput(getEl);
      frameShareCode?.focus();
      frameShareCode?.select();
    }
  });

  copyFrameCodeBtn?.addEventListener('click', () => {
    const code = createFrameShareCode(popupFrameState.id, popupFrameState.custom);
    copyTextToClipboard(code)
      .then((ok) => {
        if (ok) {
          setFrameShareStatus(getEl, '共有コードをコピーしました。', 'success');
          // Phase D1(操作音・§1.2): コピー成功=コイン1枚獲得の比喩。失敗時は無音(嘘をつかない)。
          triggerOpSound('op_copy');
          return;
        }
        setFrameShareStatus(getEl, 'コピーに失敗しました。', 'error');
      })
      .catch(() => {
        setFrameShareStatus(getEl, 'コピーに失敗しました。', 'error');
      });
  });

  applyFrameCodeBtn?.addEventListener('click', () => {
    const raw = String(frameShareCode?.value || '');
    try {
      const parsed = parseFrameShareCode(raw);
      popupFrameState.id = parsed.frameId;
      popupFrameState.custom = parsed.custom;
      applyPopupFrame(getEl, doc, popupFrameState.id, popupFrameState.custom);
      if (popupFrameState.id === 'custom') {
        openFrameThemeSectionIfPresent(getEl);
        if (frameEditor) frameEditor.open = true;
      }
      savePopupFrameSettings().catch(() => {});
      setFrameShareStatus(getEl, '共有コードを適用しました。', 'success');
    } catch {
      setFrameShareStatus(getEl, '共有コードの形式が正しくありません。', 'error');
    }
  });

  frameShareCode?.addEventListener('input', () => {
    setFrameShareStatus(getEl, '', 'idle');
  });
}
