#!/usr/bin/env node
/* eslint-disable no-control-regex -- \x01 は文字列リテラル/コメントを退避する目印(入力に現れない制御文字)として意図して使っている */
/**
 * static-dead-selectors.mjs — 「CSSはあるのに対応するクラス/ID/属性を作るコードが無い(デッドな規則)」と
 * 「クラスを作るのにCSS規則が無い」と「面(会場/popup/別窓/…)どうしのクラス集合のずれ」を静的に洗い出す監査。
 *
 * 読み取り専用。ソース(src/ extension/ app/ tsuioku-no-kirameki/)は一切変更しない。
 * 出力: scripts/audit/reports/static-dead-selectors-<DATE>.md と .json
 *
 * 使い方:  node scripts/audit/static-dead-selectors.mjs [--date YYYY-MM-DD] [--no-write] [--debug]
 *
 * 設計メモ(誤検知を減らす工夫):
 *  - JS は自前の走査器で「文字列/テンプレ/コメント/正規表現」を分け、コメント内の言及を証拠に数えない。
 *  - 生成の証拠は3段階: strong(class= / classList.add / className= 等の文脈) / weak(ハイフン付きトークンが
 *    セレクタ以外の文字列に出る) / ref(querySelector('.x') や getElementById('x') などの【参照だけ】)。
 *    ref だけのトークンは「作る側が無い」とみなす(=確証デッドの一種)。
 *  - `nl-x--${name}` / 'nl-x--' + name の形は prefix(suffix) として登録し、一致するCSSトークンは
 *    「誤検知の疑い(動的生成)」に落とす。
 *  - 依存は import の閉包で面ごとに切り、さらにバンドル済み dist(ツリーシェイク後)でも照合して
 *    「srcの閉包には文字列があるが、出荷物には無い」を拾う。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const argVal = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const DATE = argVal('--date', '2026-10-17');
const NO_WRITE = argv.includes('--no-write');
const DEBUG = argv.includes('--debug');

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const abs = (p) => path.join(ROOT, p);
const readText = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

// ───────────────────────── 行番号ヘルパ ─────────────────────────
function makeLineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (idx) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= idx) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

// ───────────────────────── JS 走査器 ─────────────────────────
const REGEX_PREV_WORDS = new Set([
  'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'instanceof', 'void', 'delete', 'throw', 'new', 'yield', 'await'
]);

/**
 * JS ソースを走査して「文字列リテラル(テンプレは全体で1単位)」を取り出す。
 * @returns {{units: Array<{text:string,line:number,pre:string,post:string,isTpl:boolean,start:number}>, code:string}}
 *   text 内のテンプレ補間 `${…}` は \u0001 に置換。code は文字列/コメントを空白化したコード本体。
 */
export function scanJs(src) {
  const n = src.length;
  const lineAt = makeLineIndex(src);
  const out = src.split('');
  const blank = (a, b) => {
    for (let k = a; k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  const units = [];
  let i = 0;
  let prevSig = '';
  let prevWord = '';

  function readString(q) {
    const start = i;
    i++;
    let text = '';
    while (i < n) {
      const c = src[i];
      if (c === '\\') {
        text += src[i] + (src[i + 1] ?? '');
        i += 2;
        continue;
      }
      if (c === q) break;
      if (c === '\n') break; // 未終端: 打ち切り
      text += c;
      i++;
    }
    const end = i;
    i++;
    blank(start, Math.min(i, n));
    units.push({ text, line: lineAt(start), start, end, isTpl: false });
    prevSig = q;
    prevWord = '';
  }

  function readTemplate() {
    const start = i;
    i++;
    let text = '';
    while (i < n) {
      const c = src[i];
      if (c === '\\') {
        text += c + (src[i + 1] ?? '');
        blank(i, i + 2);
        i += 2;
        continue;
      }
      if (c === '`') break;
      if (c === '$' && src[i + 1] === '{') {
        text += '\u0001';
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 2;
        scanCode(true);
        continue;
      }
      text += c;
      if (c !== '\n') out[i] = ' ';
      i++;
    }
    const end = i;
    out[start] = ' ';
    if (i < n) out[i] = ' ';
    i++;
    units.push({ text, line: lineAt(start), start, end, isTpl: true });
    prevSig = '`';
    prevWord = '';
  }

  function scanCode(untilBrace) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      const d = src[i + 1];
      if (c === '/' && d === '/') {
        const s = i;
        while (i < n && src[i] !== '\n') i++;
        blank(s, i);
        continue;
      }
      if (c === '/' && d === '*') {
        const s = i;
        const e = src.indexOf('*/', i + 2);
        i = e < 0 ? n : e + 2;
        blank(s, i);
        continue;
      }
      if (c === "'" || c === '"') {
        readString(c);
        continue;
      }
      if (c === '`') {
        readTemplate();
        continue;
      }
      if (c === '/') {
        const isRegex = prevSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prevSig) || REGEX_PREV_WORDS.has(prevWord);
        if (isRegex) {
          const s = i;
          i++;
          let inClass = false;
          while (i < n) {
            const ch = src[i];
            if (ch === '\\') {
              i += 2;
              continue;
            }
            if (ch === '\n') break;
            if (ch === '[') inClass = true;
            else if (ch === ']') inClass = false;
            else if (ch === '/' && !inClass) break;
            i++;
          }
          i++;
          while (i < n && /[a-z]/.test(src[i])) i++;
          blank(s, i);
          prevSig = ')';
          prevWord = '';
          continue;
        }
        prevSig = '/';
        prevWord = '';
        i++;
        continue;
      }
      if (c === '{') {
        depth++;
        prevSig = '{';
        prevWord = '';
        i++;
        continue;
      }
      if (c === '}') {
        if (untilBrace && depth === 0) {
          out[i] = ' ';
          i++;
          prevSig = '}';
          return;
        }
        depth--;
        prevSig = '}';
        prevWord = '';
        i++;
        continue;
      }
      if (/[A-Za-z0-9_$]/.test(c)) {
        let j = i;
        while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
        prevWord = src.slice(i, j);
        prevSig = 'a';
        i = j;
        continue;
      }
      if (!/\s/.test(c)) {
        prevSig = c;
        prevWord = '';
      }
      i++;
    }
  }

  scanCode(false);
  for (const u of units) {
    u.pre = out.slice(Math.max(0, u.start - 120), u.start).join('');
    let k = u.end + 1;
    while (k < n && /[ \t\r\n]/.test(src[k])) k++;
    u.post = src[k] || '';
  }
  return { units, code: out.join('') };
}

// ───────────────────────── HTML 分解 ─────────────────────────
/**
 * @returns {{styles:Array<{text:string,line:number}>, scripts:Array<{text:string,line:number,src:string}>, markup:string, links:string[]}}
 */
export function splitHtml(htmlRaw) {
  // ★コメントを先に空白化する(popup.html のコメント内の「<style>」という文字列を style ブロックと誤認しないため)
  const html = htmlRaw.replace(/<!--[\s\S]*?-->/g, (mm) => mm.replace(/[^\n]/g, ' '));
  const lineAt = makeLineIndex(html);
  const styles = [];
  const scripts = [];
  let markup = html;
  const blankRange = (a, b) => {
    markup = markup.slice(0, a) + markup.slice(a, b).replace(/[^\n]/g, ' ') + markup.slice(b);
  };
  let m;
  const reStyle = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = reStyle.exec(html))) {
    const bodyStart = m.index + m[0].indexOf('>') + 1;
    styles.push({ text: m[1], line: lineAt(bodyStart) });
    blankRange(m.index, m.index + m[0].length);
  }
  const reScript = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  while ((m = reScript.exec(html))) {
    const bodyStart = m.index + m[0].indexOf('>') + 1;
    const srcM = /\bsrc\s*=\s*"([^"]*)"/.exec(m[1]);
    scripts.push({ text: m[2], line: lineAt(bodyStart), src: srcM ? srcM[1] : '' });
    blankRange(m.index, m.index + m[0].length);
  }
  const links = [];
  const reLink = /<link\b[^>]*\brel\s*=\s*"stylesheet"[^>]*>/gi;
  while ((m = reLink.exec(markup))) {
    const h = /\bhref\s*=\s*"([^"]*)"/.exec(m[0]);
    if (h) links.push(h[1]);
  }
  return { styles, scripts, markup, links };
}

// ───────────────────────── CSS パーサ ─────────────────────────
function blankCssComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, (mm) => mm.replace(/[^\n]/g, ' '));
}

/**
 * @returns {{rules:Array<{selector:string,line:number,atCtx:string}>}}
 */
export function parseCss(textIn, baseLine) {
  const text = blankCssComments(textIn.replace(/\u0001/g, '0'));
  const lineAt = makeLineIndex(text);
  const rules = [];
  function parseBlock(start, end, atCtx) {
    let i = start;
    while (i < end) {
      let j = i;
      let paren = 0;
      let q = null;
      for (; j < end; j++) {
        const c = text[j];
        if (q) {
          if (c === '\\') {
            j++;
            continue;
          }
          if (c === q) q = null;
          continue;
        }
        if (c === '"' || c === "'") {
          q = c;
          continue;
        }
        if (c === '(') paren++;
        else if (c === ')') paren--;
        else if (paren <= 0 && (c === '{' || c === ';' || c === '}')) break;
      }
      if (j >= end) break;
      if (text[j] === ';' || text[j] === '}') {
        i = j + 1;
        continue;
      }
      let depth = 1;
      let k = j + 1;
      let q2 = null;
      for (; k < end && depth > 0; k++) {
        const c = text[k];
        if (q2) {
          if (c === '\\') {
            k++;
            continue;
          }
          if (c === q2) q2 = null;
          continue;
        }
        if (c === '"' || c === "'") {
          q2 = c;
          continue;
        }
        if (c === '{') depth++;
        else if (c === '}') depth--;
      }
      const prelude = text.slice(i, j);
      const pre = prelude.trim();
      const lead = prelude.length - prelude.trimStart().length;
      if (pre.startsWith('@')) {
        const name = (pre.match(/^@([\w-]+)/) || [])[1] || '';
        if (['media', 'supports', 'container', 'layer', 'scope', 'document'].includes(name)) {
          parseBlock(j + 1, k - 1, `${atCtx} ${pre.slice(0, 50).replace(/\s+/g, ' ')}`.trim());
        }
      } else if (pre) {
        rules.push({ selector: pre, line: baseLine + lineAt(i + lead) - 1, atCtx });
      }
      i = k;
    }
  }
  parseBlock(0, text.length, '');
  return { rules };
}

function splitTopLevel(s, sepChar) {
  const parts = [];
  let depth = 0;
  let cur = '';
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      cur += c;
      if (c === '\\') {
        cur += s[++i] ?? '';
        continue;
      }
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") {
      q = c;
      cur += c;
      continue;
    }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    if (c === sepChar && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

const FUNCTIONAL_PSEUDO_RE = /:(?:not|is|where|has|matches|-webkit-any|-moz-any|host|host-context|nth-child|nth-last-child|nth-of-type|nth-last-of-type|lang|dir|slotted|part)\(/g;

/** 1ブランチ(カンマ区切りの1つ)から必須トークンを抽出 */
export function analyzeBranch(branch) {
  let s = branch;
  const optional = [];
  // 機能擬似クラス内は「必須ではない」ので外して optional に記録
  for (let guard = 0; guard < 50; guard++) {
    FUNCTIONAL_PSEUDO_RE.lastIndex = 0;
    const m = FUNCTIONAL_PSEUDO_RE.exec(s);
    if (!m) break;
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let end = open;
    for (; end < s.length; end++) {
      if (s[end] === '(') depth++;
      else if (s[end] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    optional.push(s.slice(open + 1, end));
    s = `${s.slice(0, m.index)} ${s.slice(end + 1)}`;
  }
  const attrs = [];
  s = s.replace(
    /\[\s*([^\]=~|^$*\s]+)\s*(?:([~|^$*]?=)\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\]\s]+)\s*(?:[is])?)?\s*\]/g,
    (_m, name, op, val) => {
      attrs.push({ name, op: op || '', val: val ? val.replace(/^["']|["']$/g, '') : '' });
      return ' ';
    }
  );
  s = s.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  const classes = [...s.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((x) => x[1]);
  const ids = [...s.matchAll(/#([_a-zA-Z][\w-]*)/g)].map((x) => x[1]);
  const dataAttrs = attrs.filter((a) => /^(data-|aria-)/.test(a.name)).map((a) => a.name);
  const classSubstr = attrs.filter((a) => a.name === 'class' && a.op && a.val).map((a) => ({ op: a.op, val: a.val }));
  const idAttr = attrs.filter((a) => a.name === 'id' && a.op === '=' && a.val).map((a) => a.val);
  return { classes, ids: ids.concat(idAttr), dataAttrs, classSubstr, optional, attrs };
}

// ───────────────────────── 証拠(生成側)コーパス ─────────────────────────
const LOOKUP_PRE_RE =
  /(?:getElementById|querySelector(?:All)?|closest|matches|getElementsByClassName|classList\s*\.\s*(?:contains|remove)|\.contains|\.remove)\s*\(\s*(?:[^()]|\([^()]*\))*$/;
const CLASSLIST_PRE_RE = /classList\s*\.\s*(?:add|toggle|replace)\s*\((?:[^()]|\([^()]*\))*$/;
const CLASSNAME_PRE_RE = /(?:className|\bclass)\s*(?:\+?=|:)\s*[^;{}]*$/;
const SETATTR_CLASS_PRE_RE = /setAttribute\s*\(\s*['"]class['"]\s*,\s*[^;{}]*$/;
const SETATTR_ID_PRE_RE = /(?:setAttribute\s*\(\s*['"]id['"]\s*,|\.id\s*=)\s*[^;{}]*$/;
const DATASET_BRACKET_PRE_RE = /dataset\s*\[\s*$/;

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function newEvidence() {
  return {
    class: new Map(),
    id: new Map(),
    attr: new Map(),
    prefixes: [],
    numPrefixes: [],
    suffixes: [],
    classSubstr: [],
    fileStrongClasses: new Map()
  };
}

function addEv(map, token, level, loc) {
  let e = map.get(token);
  if (!e) {
    e = { strong: [], weak: [], ref: [] };
    map.set(token, e);
  }
  if (e[level].length < 4) e[level].push(loc);
  else e[level].count = (e[level].count || 4) + 1;
}


/** 文字列1単位から証拠を抽出して ev に積む */
function ingestUnit(ev, unit, file, lineBase = 0) {
  const text = unit.text;
  const lineOf = (offset) => unit.line + lineBase + (text.slice(0, offset).match(/\n/g) || []).length;
  const loc = (offset) => `${file}:${lineOf(offset)}`;
  const isLookup = LOOKUP_PRE_RE.test(unit.pre);

  // dyn prefix / suffix
  const reDyn = /([A-Za-z0-9_-]{2,}[-_])\u0001|\u0001([-_][A-Za-z0-9_-]{3,})/g;
  let dm;
  while ((dm = reDyn.exec(text))) {
    if (dm[1]) ev.prefixes.push({ p: dm[1], loc: loc(dm.index) });
    if (dm[2]) ev.suffixes.push({ p: dm[2], loc: loc(dm.index) });
  }
  for (const nm of text.matchAll(/(?<![A-Za-z0-9_-])([A-Za-z]{1,12})\u0001/g)) ev.numPrefixes.push({ p: nm[1], loc: loc(nm.index) });
  if (!unit.isTpl && unit.post === '+') {
    const m = text.match(/([A-Za-z0-9_-]{4,}[-_])$/);
    if (m) ev.prefixes.push({ p: m[1], loc: loc(text.length) });
  }
  if (!unit.isTpl && /\+\s*$/.test(unit.pre)) {
    const m = text.match(/^([-_][A-Za-z0-9_-]{3,})/);
    if (m) ev.suffixes.push({ p: m[1], loc: loc(0) });
  }

  if (isLookup) {
    for (const m of text.matchAll(/([.#]?)([A-Za-z_][\w-]*)/g)) {
      addEv(m[1] === '#' ? ev.id : ev.class, m[2], 'ref', loc(m.index));
      if (/^(data|aria)-/.test(m[2])) addEv(ev.attr, m[2], 'ref', loc(m.index));
    }
    return;
  }

  // HTML 属性形
  for (const m of text.matchAll(/\bclass(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const val = m[1] ?? m[2] ?? '';
    for (const t of val.split(/\s+/)) {
      if (/^[A-Za-z_][\w-]*$/.test(t)) addEv(ev.class, t, 'strong', loc(m.index));
      else if (t.includes('\u0001')) {
        // `rankno${cls}` のような静的部分は強い証拠として数える(動的部分は prefix/suffix 側)
        for (const piece of t.split('\u0001')) if (/^[A-Za-z_][\w-]*$/.test(piece)) addEv(ev.class, piece, 'strong', loc(m.index));
      }
    }
  }
  for (const m of text.matchAll(/\bid\s*=\s*(?:"([^"\u0001]*)"|'([^'\u0001]*)')/g)) {
    const val = m[1] ?? m[2] ?? '';
    if (/^[A-Za-z_][\w-]*$/.test(val)) addEv(ev.id, val, 'strong', loc(m.index));
  }
  for (const m of text.matchAll(/(?<![\w-])((?:data|aria)-[a-z0-9-]+)/g)) addEv(ev.attr, m[1], 'strong', loc(m.index));

  // 文脈からクラス/ID
  let ctx = '';
  if (CLASSLIST_PRE_RE.test(unit.pre) || CLASSNAME_PRE_RE.test(unit.pre) || SETATTR_CLASS_PRE_RE.test(unit.pre)) ctx = 'class';
  else if (SETATTR_ID_PRE_RE.test(unit.pre)) ctx = 'id';
  else if (DATASET_BRACKET_PRE_RE.test(unit.pre)) ctx = 'dataset';
  if (ctx === 'dataset') {
    const t = text.trim();
    if (/^[A-Za-z_]\w*$/.test(t)) addEv(ev.attr, `data-${kebab(t)}`, 'strong', loc(0));
    return;
  }
  if (ctx === 'class') {
    for (const m of text.matchAll(/[A-Za-z_][\w-]*/g)) addEv(ev.class, m[0], 'strong', loc(m.index));
    return;
  }
  if (ctx === 'id') {
    const t = text.trim();
    if (/^[A-Za-z_][\w-]*$/.test(t)) addEv(ev.id, t, 'strong', loc(0));
    return;
  }

  // 「トークンだけで出来た短い文字列」('active' / 'a b')は、単語1個でも weak 証拠にする
  //   (★既知の偽陰性: 状態値の文字列 'active' が同名のデッドCSSを隠す。単語1個のCSSトークンだけに効く)
  if (text.length <= 80 && /^\s*[A-Za-z_][\w-]*(?:\s+[A-Za-z_][\w-]*)*\s*$/.test(text)) {
    for (const m of text.matchAll(/[A-Za-z_][\w-]*/g)) addEv(ev.class, m[0], 'weak', loc(m.index));
  }
  // 一般の文字列: セレクタ形は ref、ハイフン/アンダースコア付きトークンは weak
  for (const m of text.matchAll(/(?<![\w-])([.#]?)([A-Za-z_][\w-]*)/g)) {
    const pfx = m[1];
    const tok = m[2];
    const before = text[m.index - 1] || '';
    if (pfx === '.' || pfx === '#') {
      // 「0.5em」「file.png」のようなものを避ける: 直前が英数字なら拡張子とみなす
      if (/[A-Za-z0-9_)\]]/.test(before)) continue;
      addEv(pfx === '#' ? ev.id : ev.class, tok, 'ref', loc(m.index));
      continue;
    }
    if (before === '/' || before === '.') continue;
    if (/[-_]/.test(tok)) {
      addEv(ev.class, tok, 'weak', loc(m.index));
      addEv(ev.id, tok, 'weak', loc(m.index));
    }
  }
}

function ingestJsCode(ev, code, file) {
  const lineAt = makeLineIndex(code);
  for (const m of code.matchAll(/\.dataset\s*\.\s*([A-Za-z_]\w*)/g)) {
    addEv(ev.attr, `data-${kebab(m[1])}`, 'strong', `${file}:${lineAt(m.index)}`);
  }
  for (const m of code.matchAll(/\bdataset\s*:\s*\{([^}]*)\}/g)) {
    for (const k of m[1].matchAll(/([A-Za-z_]\w*)\s*:/g)) addEv(ev.attr, `data-${kebab(k[1])}`, 'strong', `${file}:${lineAt(m.index)}`);
  }
}

function ingestHtmlMarkup(ev, markup, file) {
  const lineAt = makeLineIndex(markup);
  const reTag = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let m;
  while ((m = reTag.exec(markup))) {
    const attrText = m[2];
    const line = lineAt(m.index);
    const cm = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(attrText);
    if (cm) for (const t of (cm[1] ?? cm[2] ?? '').split(/\s+/)) if (/^[A-Za-z_][\w-]*$/.test(t)) addEv(ev.class, t, 'strong', `${file}:${line}`);
    const im = /\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(attrText);
    if (im) addEv(ev.id, im[1] ?? im[2], 'strong', `${file}:${line}`);
    for (const a of attrText.matchAll(/(?<![\w-])((?:data|aria)-[a-z0-9-]+)/g)) addEv(ev.attr, a[1], 'strong', `${file}:${line}`);
  }
}

// ───────────────────────── import 閉包 ─────────────────────────
const scanCache = new Map();
function scanFile(file) {
  let s = scanCache.get(file);
  if (!s) {
    const src = readText(file);
    s = { src, ...scanJs(src) };
    scanCache.set(file, s);
  }
  return s;
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const cand of [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')]) if (exists(cand)) return cand;
  return null;
}

function closureOf(entries) {
  const seen = new Set();
  const stack = entries.map((e) => path.resolve(e));
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !exists(f)) continue;
    seen.add(f);
    const { units } = scanFile(f);
    for (const u of units) {
      if (u.isTpl && u.text.includes('\u0001')) continue;
      if (!/(?:\bfrom\s*|\bimport\s*\(?\s*|\bimport\s*|\bexport\s*\*\s*from\s*)$/.test(u.pre)) continue;
      const r = resolveImport(f, u.text);
      if (r && !seen.has(r)) stack.push(r);
    }
  }
  return [...seen].filter((f) => !/\.test\.js$/.test(f)).sort();
}

// ───────────────────────── CSS 単位の判定 ─────────────────────────
function looksLikeCss(text) {
  if (text.length < 80) return false;
  const rules = text.match(/[.#a-zA-Z:*[][^{}]{0,200}\{[^{}]*:[^{}]*\}/g);
  return !!rules && rules.length >= 3;
}

// ───────────────────────── 面の定義 ─────────────────────────
/**
 * jsCssFiles: その面の document に実際に注入される CSS を持つ JS ファイル(相対パス)。
 *   これ以外の「CSSっぽい文字列」(レポートHTML生成用など)は別 document 向けなので CSS として扱わない。
 */
const SURFACES = [
  {
    id: 'venue',
    label: '会場 (venueBar / venue.html)',
    entries: ['src/extension/venue-entry.js'],
    extraProducerFiles: ['src/extension/content-entry.js'],
    htmls: [],
    cssFiles: [],
    jsCssFiles: ['src/extension/venueBar.js', 'src/lib/charaLiveController.js'],
    dist: ['extension/dist/venue.js', 'extension/dist/content.js']
  },
  {
    id: 'popup',
    label: 'popup (extension/popup.html)',
    entries: ['src/extension/popup-entry.js'],
    extraProducerFiles: [],
    htmls: ['extension/popup.html'],
    cssFiles: [],
    jsCssFiles: [],
    dist: 'extension/dist/popup.js'
  },
  {
    id: 'liveview-web',
    label: '別窓WEB (app/live-view.html = popup手動コピー)',
    entries: ['app/live-view.js'],
    extraProducerFiles: ['src/extension/popup-entry.js'],
    htmls: ['app/live-view.html'],
    cssFiles: [],
    jsCssFiles: [],
    dist: 'app/dist/live-view.js'
  },
  {
    id: 'live',
    label: '/live/ (tsuioku-no-kirameki/live/index.html)',
    entries: ['src/extension/live-ranking-entry.js'],
    extraProducerFiles: ['tsuioku-no-kirameki/assets/js/site-chrome-lp.js'],
    htmls: ['tsuioku-no-kirameki/live/index.html', 'app/live.html'],
    cssFiles: ['tsuioku-no-kirameki/assets/css/yukkuri-thread.css', 'tsuioku-no-kirameki/assets/css/site-chrome-lp.css', 'tsuioku-no-kirameki/assets/css/live-ranking.css'],
    sharedCss: new Set(['tsuioku-no-kirameki/assets/css/yukkuri-thread.css', 'tsuioku-no-kirameki/assets/css/site-chrome-lp.css']),
    jsCssFiles: [],
    dist: 'app/dist/live-ranking.js'
  },
  {
    id: 'comeview',
    label: 'comeview (extension/comeview.html)',
    entries: ['src/extension/comeview-entry.js'],
    extraProducerFiles: [],
    htmls: ['extension/comeview.html'],
    cssFiles: [],
    jsCssFiles: [],
    dist: 'extension/dist/comeview.js'
  },
  {
    id: 'status',
    label: 'status (extension/status.html)',
    entries: ['src/extension/status-entry.js'],
    extraProducerFiles: ['extension/status-guard.js'],
    htmls: ['extension/status.html'],
    cssFiles: [],
    jsCssFiles: [],
    dist: 'extension/dist/status.js'
  }
];

/**
 * 外部ページ(ニコ生)由来・ブラウザ由来など「こちらで生成しない」クラスの許可リスト。理由必須。
 * key = 正規表現(トークン全体に一致)。 surfaces 省略=全面。
 */
const EXTERNAL_ALLOW = [
  { re: /^(?:html|body)$/, reason: '要素名の誤抽出ガード(通常は発生しない)' }
];

/**
 * 手動で実コードを読んで「動的に作られている/意図的に残している」と確認したもの(面+トークン)。理由必須。
 * 0件の緑を作らないため、ここへ足すのは【読んで確かめた物だけ】。
 */
const MANUAL_ALLOW = [
  {
    surface: 'popup',
    token: 'nlsb-venue-lane-stack',
    reason: 'popup.html が会場用CSS(.nlsb-venue-lane-stack 子孫形)を意図して写している。src/lib/laneCssSync.parity.test.js の EXPECTED_SELECTOR_DIFFS(P/L/V の集合差照合)が要求。popup では常にデッドだが 3 画面の見た目をそろえるための写し'
  },
  {
    surface: 'liveview-web',
    token: 'nlsb-venue-lane-stack',
    reason: '同上(app/live-view.html は popup.html の手動コピー)'
  }
];

// ───────────────────────── 面ごとの収集 ─────────────────────────
function collectSurface(def) {
  const entryAbs = def.entries.map(abs);
  const files = closureOf(entryAbs);
  const extraFiles = (def.extraProducerFiles || []).map(abs).filter(exists);
  const jsFiles = [...new Set([...files, ...extraFiles])].sort();

  const ev = newEvidence();
  const cssSources = []; // {file, text, baseLine, region}
  const foreignCss = []; // この面の document には注入されない CSS 文字列(レポートHTML等)。逆向き判定の除外にだけ使う
  let styleCount = 0;

  for (const html of def.htmls) {
    const p = abs(html);
    const parts = splitHtml(readText(p));
    parts.styles.forEach((st) => {
      cssSources.push({ file: html, text: st.text, baseLine: st.line, region: '<style>' });
      styleCount++;
    });
    ingestHtmlMarkup(ev, parts.markup, html);
    for (const sc of parts.scripts) {
      if (sc.src || !sc.text.trim()) continue;
      const scanned = scanJs(sc.text);
      for (const u of scanned.units) ingestUnit(ev, u, html, sc.line - 1);
      ingestJsCode(ev, scanned.code, html);
    }
  }
  for (const cssRel of def.cssFiles) {
    const p = abs(cssRel);
    if (!exists(p)) continue;
    cssSources.push({ file: cssRel, text: readText(p), baseLine: 1, region: 'linked-css' });
  }

  const jsCssSet = new Set((def.jsCssFiles || []).map((f) => abs(f)));
  for (const f of jsFiles) {
    const s = scanFile(f);
    const fileRel = rel(f);
    for (const u of s.units) {
      const css = looksLikeCss(u.text);
      if (css) {
        if (jsCssSet.has(f)) cssSources.push({ file: fileRel, text: u.text, baseLine: u.line, region: 'js-css' });
        else foreignCss.push({ file: fileRel, text: u.text, baseLine: u.line });
        continue; // CSS文字列は生成の証拠に数えない
      }
      ingestUnit(ev, u, fileRel);
    }
    ingestJsCode(ev, s.code, fileRel);
  }
  const foreignTokens = new Map();
  for (const fc of foreignCss) {
    for (const r of parseCss(fc.text, fc.baseLine).rules) {
      for (const b of splitTopLevel(r.selector, ',').map(analyzeBranch)) {
        for (const c of b.classes) if (!foreignTokens.has(c)) foreignTokens.set(c, `${fc.file}:${r.line}`);
        for (const o of b.optional) for (const m of o.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) if (!foreignTokens.has(m[1])) foreignTokens.set(m[1], `${fc.file}:${r.line}`);
      }
    }
  }
  return { def, jsFiles, ev, cssSources, styleCount, foreignTokens };
}

function collectDist(distRels) {
  const list = Array.isArray(distRels) ? distRels : [distRels];
  const ev = newEvidence();
  let any = false;
  for (const distRel of list) {
    const p = abs(distRel);
    if (!exists(p)) continue;
    any = true;
    const s = scanJs(readText(p));
    for (const u of s.units) {
      if (looksLikeCss(u.text)) continue;
      ingestUnit(ev, u, distRel);
    }
    ingestJsCode(ev, s.code, distRel);
  }
  return any ? ev : null;
}

// ───────────────────────── 判定 ─────────────────────────
function levelOf(ev, kind, token) {
  const e = ev[kind].get(token);
  if (e && e.strong.length) return 'strong';
  if (e && e.weak.length) return 'weak';
  // 動的 prefix/suffix
  for (const { p } of ev.prefixes) if (token.startsWith(p) && token.length > p.length) return 'dyn';
  for (const { p } of ev.suffixes) if (token.endsWith(p) && token.length > p.length) return 'dyn';
  for (const { p } of ev.numPrefixes) if (token.startsWith(p) && /^\d+$/.test(token.slice(p.length))) return 'dyn';
  if (e && e.ref.length) return 'ref';
  return 'none';
}
const isGen = (lv) => lv === 'strong' || lv === 'weak';
const isDeadLv = (lv) => lv === 'none' || lv === 'ref';

function firstLoc(ev, kind, token) {
  const e = ev[kind].get(token);
  if (!e) return '';
  return (e.strong[0] || e.weak[0] || e.ref[0] || '').toString();
}

function analyzeCss(surf) {
  const tokens = new Map(); // key `${kind}:${token}` -> {kind, token, rules:[{file,line,selector,region,atCtx}]}
  const cssTokenSet = { class: new Set(), id: new Set(), attr: new Set() };
  const classSubstr = [];
  const rules = [];
  for (const src of surf.cssSources) {
    const { rules: rs } = parseCss(src.text, src.baseLine);
    for (const r of rs) {
      const branches = splitTopLevel(r.selector, ',').map(analyzeBranch);
      const rule = { file: src.file, line: r.line, selector: r.selector.replace(/\s+/g, ' ').slice(0, 160), region: src.region, atCtx: r.atCtx, branches: [] };
      for (const b of branches) {
        const req = [];
        for (const c of b.classes) req.push(['class', c]);
        for (const c of b.ids) req.push(['id', c]);
        for (const c of b.dataAttrs) req.push(['attr', c]);
        rule.branches.push(req);
        for (const cs of b.classSubstr) classSubstr.push(cs);
        for (const [k, t] of req) {
          cssTokenSet[k].add(t);
          const key = `${k}:${t}`;
          let e = tokens.get(key);
          if (!e) {
            e = { kind: k, token: t, rules: [] };
            tokens.set(key, e);
          }
          e.rules.push(rule);
        }
        // optional 内のトークンも「CSSが存在する」側には数える(逆向き照合用)
        for (const o of b.optional) {
          for (const m of o.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) cssTokenSet.class.add(m[1]);
          for (const m of o.matchAll(/#([_a-zA-Z][\w-]*)/g)) cssTokenSet.id.add(m[1]);
          for (const m of o.matchAll(/\[\s*((?:data|aria)-[\w-]+)/g)) cssTokenSet.attr.add(m[1]);
        }
      }
      rules.push(rule);
    }
  }
  return { tokens, cssTokenSet, classSubstr, rules };
}

// ───────────────────────── メイン ─────────────────────────
export function runAudit() {
  const surfaces = SURFACES.map((d) => {
    const s = collectSurface(d);
    s.css = analyzeCss(s);
    s.dist = d.dist ? collectDist(d.dist) : null;
    return s;
  });
  const byId = Object.fromEntries(surfaces.map((s) => [s.def.id, s]));

  const result = { date: DATE, surfaces: [] };

  for (const surf of surfaces) {
    const { css } = surf;
    const tokenRows = [];
    for (const t of css.tokens.values()) {
      const lvSrc = levelOf(surf.ev, t.kind, t.token);
      const lvDist = surf.dist ? levelOf(surf.dist, t.kind, t.token) : null;
      const ext = EXTERNAL_ALLOW.find((a) => a.re.test(t.token));
      const elsewhere = surfaces
        .filter((o) => o !== surf && isGen(levelOf(o.ev, t.kind, t.token)))
        .map((o) => o.def.id);
      let verdict;
      const man = MANUAL_ALLOW.find((a) => a.surface === surf.def.id && a.token === t.token);
      const evTok = surf.ev[t.kind].get(t.token);
      const evLocs = evTok ? evTok.strong.concat(evTok.weak) : [];
      const jsEvidence = evLocs.some((l) => !/\.html:/.test(l)); // HTML だけが根拠なら dist(JSのみ)照合は意味が無い
      if (ext) verdict = '意図的(外部)';
      else if (man) verdict = '意図的(手動確認済み)';
      else if (isGen(lvSrc)) verdict = lvDist && isDeadLv(lvDist) && jsEvidence ? '要確認(srcにあるがdistに無い)' : 'ok';
      else if (lvSrc === 'dyn') verdict = '誤検知の疑い(動的生成)';
      else verdict = lvSrc === 'ref' ? '確証デッド(参照のみ)' : '確証デッド';
      const dead = verdict.startsWith('確証デッド');
      tokenRows.push({
        kind: t.kind,
        token: t.token,
        lvSrc,
        lvDist,
        verdict,
        dead,
        elsewhere,
        refLoc: lvSrc === 'ref' ? firstLoc(surf.ev, t.kind, t.token) : '',
        distGenLoc: '',
        rules: t.rules,
        reason: ext ? ext.reason : man ? man.reason : ''
      });
    }
    // 規則レベル: 全ブランチに「デッドなトークン」を含む規則
    const deadMap = new Map(tokenRows.filter((r) => r.dead).map((r) => [`${r.kind}:${r.token}`, r]));
    const deadRules = [];
    for (const rule of css.rules) {
      if (!rule.branches.length) continue;
      const branchDeadTokens = rule.branches.map((req) => req.filter(([k, t]) => deadMap.has(`${k}:${t}`)));
      if (branchDeadTokens.every((x) => x.length > 0)) {
        deadRules.push({ rule, tokens: [...new Set(branchDeadTokens.flat().map(([k, t]) => `${k}:${t}`))] });
      }
    }
    // 逆向き: 生成されるがCSSに規則が無いクラス
    const reverse = [];
    let foreignSkipped = 0;
    for (const [token, e] of surf.ev.class) {
      if (!e.strong.length) continue;
      if (/[-_]$/.test(token)) continue; // 動的 prefix の取り込み残り
      if (surf.foreignTokens.has(token)) {
        foreignSkipped++;
        continue; // 別 document 向けの JS 内 CSS に規則がある(レポートHTML等)
      }
      if (css.cssTokenSet.class.has(token)) continue;
      if (css.classSubstr.some((cs) => (cs.op === '*=' && token.includes(cs.val)) || (cs.op === '^=' && token.startsWith(cs.val)) || (cs.op === '$=' && token.endsWith(cs.val)) || (cs.op === '=' && token === cs.val))) continue;
      const refd = e.ref.length > 0;
      const otherCss = surfaces.filter((o) => o !== surf && o.css.cssTokenSet.class.has(token)).map((o) => o.def.id);
      let verdict;
      if (refd) verdict = '意図的(JSフック: セレクタ参照あり)';
      else if (/(?:report|marketing|Overlay|Report)[^/]*\.js:/.test(e.strong[0]) && !/popup-entry|popup\.html/.test(e.strong[0])) verdict = '別documentの疑い(生成元がレポート/演出系)';
      else if (otherCss.length) verdict = '要確認(他面のCSSにだけ規則あり)';
      else if (/^(?:is|has|js)-/.test(token)) verdict = '要確認(状態フラグ風・参照もCSSも無い)';
      else verdict = '確証(スタイルもフックも無い)';
      reverse.push({ token, verdict, loc: e.strong[0], otherCss, refLoc: e.ref[0] || '' });
    }
    reverse.sort((a, b) => a.verdict.localeCompare(b.verdict) || a.token.localeCompare(b.token));
    result.surfaces.push({ id: surf.def.id, label: surf.def.label, jsFileCount: surf.jsFiles.length, cssRuleCount: css.rules.length, cssSources: surf.cssSources.map((c) => `${c.file}:${c.baseLine}(${c.region})`), tokenRows, deadRules, reverse, distScanned: !!surf.dist, foreignSkipped, shared: surf.def.sharedCss ? [...surf.def.sharedCss] : [] });
  }

  result.families = compareFamilies(byId);
  result.attrFamilies = compareAttrFamilies(byId);
  result.surfaceObjs = byId;
  return result;
}

// ───────────────────────── 面どうしの比較(item 4) ─────────────────────────
const FAMILIES = [
  { role: '応援レーン .nl-story-userlane', test: (t) => /^nl-story-userlane(?:--[\w-]+)?$/.test(t) },
  { role: '段ラッパ .nl-story-userlane-tier-wrap', test: (t) => /^nl-story-userlane-tier-wrap/.test(t) },
  { role: 'タイル .nl-story-userlane-cell', test: (t) => /^nl-story-userlane-cell/.test(t) },
  {
    role: 'その他レーン部品 .nl-story-userlane-*',
    test: (t) => /^nl-story-userlane/.test(t) && !/^nl-story-userlane(?:--[\w-]+)?$/.test(t) && !/^nl-story-userlane-(?:tier-wrap|cell)/.test(t)
  },
  { role: '席 .nlsb-seat (会場専用)', test: (t) => /^nlsb-seat/.test(t), venueOnly: true }
];

/** レーン/席まわりの CSS 規則が要求する data-* / aria-* 属性を、popup と会場でどちらが作っているか比較 */
function compareAttrFamilies(byId) {
  const popup = byId.popup;
  const venue = byId.venue;
  const famRe = /^(?:nl-story-userlane|nlsb-seat|nlsb-venue-lane)/;
  const attrs = new Map();
  for (const [label, s] of [['popup', popup], ['venue', venue]]) {
    for (const rule of s.css.rules) {
      for (const req of rule.branches) {
        if (!req.some(([k, t]) => k === 'class' && famRe.test(t))) continue;
        for (const [k, t] of req) {
          if (k !== 'attr') continue;
          let e = attrs.get(t);
          if (!e) {
            e = { popupRules: 0, venueRules: 0, sample: '' };
            attrs.set(t, e);
          }
          e[label === 'popup' ? 'popupRules' : 'venueRules']++;
          if (!e.sample) e.sample = `${rule.file}:${rule.line}`;
        }
      }
    }
  }
  return [...attrs.entries()].sort().map(([attr, e]) => ({
    attr,
    ...e,
    popupGen: levelOf(popup.ev, 'attr', attr),
    popupLoc: firstLoc(popup.ev, 'attr', attr),
    venueGen: levelOf(venue.ev, 'attr', attr),
    venueLoc: firstLoc(venue.ev, 'attr', attr)
  }));
}

function compareFamilies(byId) {
  const popup = byId.popup;
  const venue = byId.venue;
  const rows = [];
  for (const fam of FAMILIES) {
    const toks = new Set();
    for (const s of [popup, venue]) {
      for (const k of s.ev.class.keys()) if (fam.test(k)) toks.add(k);
      for (const k of s.css.cssTokenSet.class) if (fam.test(k)) toks.add(k);
    }
    for (const token of [...toks].sort()) {
      const pl = levelOf(popup.ev, 'class', token);
      const vl = levelOf(venue.ev, 'class', token);
      rows.push({
        role: fam.role,
        venueOnly: !!fam.venueOnly,
        token,
        popupGen: pl,
        popupLoc: firstLoc(popup.ev, 'class', token),
        venueGen: vl,
        venueLoc: firstLoc(venue.ev, 'class', token),
        popupCss: popup.css.cssTokenSet.class.has(token),
        venueCss: venue.css.cssTokenSet.class.has(token)
      });
    }
  }
  return rows;
}

// ───────────────────────── レポート出力 ─────────────────────────
const mdEsc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderMarkdown(res) {
  const L = [];
  const surf = Object.fromEntries(res.surfaces.map((s) => [s.id, s]));
  L.push(`# 静的デッドセレクタ監査 (${res.date})`);
  L.push('');
  L.push('生成: `node scripts/audit/static-dead-selectors.mjs`(読み取り専用・ソース無変更。同スクリプトが .json も出す)。');
  L.push('');
  if (res.selfTest) L.push(`> 自己検査(合成入力でスキャナ自体を確認): ${res.selfTest.total - res.selfTest.failed}/${res.selfTest.total} 合格。`), L.push('');
  L.push('## 判定の意味');
  L.push('');
  L.push('- **確証デッド**: CSS にある class / id / data-・aria- 属性トークンを、その面の import 閉包+HTML のどこにも【作る文字列】として持たない(コメントは数えない)。');
  L.push('- **確証デッド(参照のみ)**: `querySelector(\'.x\')` / `classList.remove(\'x\')` 等の参照はあるが、作る側(add/class=/className=)が無い。');
  L.push('- **誤検知の疑い(動的生成)**: `nl-x--${name}` / `\'nl-x--\' + name` / `r${n}` の形の prefix/suffix に一致。');
  L.push('- **要確認(srcにあるがdistに無い)**: src の閉包には JS 文字列があるが、出荷物(dist,ツリーシェイク後)に無い。dist が古い/ビルド中の可能性も。');
  L.push('- **意図的(手動確認済み)**: スクリプト内 `MANUAL_ALLOW` に【理由つき】で登録した物。');
  L.push('- 「他面で生成」=同じトークンを別の面が作っている(=その面にだけ作る側が抜けている疑いが濃い。`--tanu` 型)。');
  L.push('');
  L.push('> **限界(推測を断定にしないための注記)**: 静的解析なので (1) ヘルパ関数へ渡す class 名・単語1個の状態名は weak 証拠=「デッドと判定しない側」に倒している(偽陰性) (2) import 閉包は【そのファイルの文字列】を数えるので、「同じ共有モジュール内の別関数(popup専用経路)にだけ文字列がある」は検出できない(例: `nl-story-userlane--windowed` は会場でも "生成あり" と出るが、実際は `judgeLaneWindow` が isVenue で窓にしない) (3) 実行時に分岐へ到達するかは見ていない。');
  L.push('');

  // ── 優先度つき上位 ──
  const merged = new Map();
  for (const s of res.surfaces) {
    const deadRuleSet = new Set(s.deadRules.map((d) => d.rule));
    for (const r of s.tokenRows.filter((x) => x.dead)) {
      const key = `${r.kind}:${r.token}`;
      let m = merged.get(key);
      if (!m) {
        m = { kind: r.kind, token: r.token, surfaces: [], fullyDead: 0, rules: 0, elsewhere: new Set(), at: '', verdicts: new Set(), score: 0 };
        merged.set(key, m);
      }
      m.surfaces.push(s.id);
      m.rules = Math.max(m.rules, r.rules.length);
      m.fullyDead = Math.max(m.fullyDead, r.rules.filter((x) => deadRuleSet.has(x)).length);
      r.elsewhere.forEach((e) => m.elsewhere.add(e));
      m.verdicts.add(r.verdict);
      if (!m.at) m.at = `${r.rules[0].file}:${r.rules[0].line}`;
    }
  }
  const ranked = [...merged.values()]
    .map((m) => {
      const live = m.surfaces.some((x) => x === 'venue' || x === 'popup' || x === 'live');
      m.score = (m.elsewhere.size ? 100 : 0) + Math.min(m.fullyDead, 60) + (m.surfaces.includes('venue') ? 80 : 0) + (live ? 10 : 0);
      return m;
    })
    .sort((a, b) => b.score - a.score || a.token.localeCompare(b.token));
  L.push('## 0. 優先度つき候補(全面まとめ・上位25)');
  L.push('');
  L.push('スコア = 他面で生成あり(+100) / 会場でデッド(+80) / 全分岐が死んだ規則の数(最大+60) / 実面(venue,popup,live)(+10)。**スコアは目安であり実害の保証ではない**(実害の評価は最終報告側の人手判断)。');
  L.push('');
  L.push('| # | 種別 | トークン | デッドな面 | 規則数(全分岐死) | 代表 file:line | 他面で生成 | 判定 |');
  L.push('|--:|---|---|---|---:|---|---|---|');
  ranked.slice(0, 25).forEach((m, i) => {
    L.push(`| ${i + 1} | ${m.kind} | \`${mdEsc(m.token)}\` | ${m.surfaces.join(',')} | ${m.rules}(${m.fullyDead}) | ${m.at} | ${[...m.elsewhere].join(',') || '-'} | ${[...m.verdicts].join(' / ')} |`);
  });
  L.push('');

  L.push('## 1. 面ごとの要約');
  L.push('');
  L.push('| 面 | JSファイル数(閉包) | CSS規則数 | CSS出所 | 確証デッドtoken | うち他面で生成 | デッド規則(全分岐が死) | 動的疑い | 要確認(dist) | 逆向き(確証/別doc疑い/フック) |');
  L.push('|---|---:|---:|---|---:|---:|---:|---:|---:|---|');
  for (const s of res.surfaces) {
    const dead = s.tokenRows.filter((r) => r.dead);
    const rv = (k) => s.reverse.filter((r) => r.verdict.startsWith(k)).length;
    L.push(
      `| ${s.id} | ${s.jsFileCount} | ${s.cssRuleCount} | ${mdEsc(s.cssSources.map((c) => c.replace(/:\d+\(.*\)/, '')).filter((v, i, a) => a.indexOf(v) === i).join(', ').slice(0, 90))} | ${dead.length} | ${dead.filter((r) => r.elsewhere.length).length} | ${s.deadRules.length} | ${s.tokenRows.filter((r) => r.verdict.startsWith('誤検知')).length} | ${s.tokenRows.filter((r) => r.verdict.startsWith('要確認')).length} | ${rv('確証')}/${rv('別document')}/${rv('意図的')} |`
    );
  }
  L.push('');
  L.push('> 緑(0件)は安全ではない: 面の定義漏れ・抽出失敗でも 0 になる。上の「CSS規則数」が 0 でないことを毎回確認する(ラチェット設計案を末尾に記載)。');
  L.push('');

  for (const s of res.surfaces) {
    L.push(`## 面: ${s.label}`);
    L.push('');
    const dead = s.tokenRows.filter((r) => r.dead).sort((a, b) => b.elsewhere.length - a.elsewhere.length || b.rules.length - a.rules.length || a.token.localeCompare(b.token));
    const shared = new Set(s.shared);
    const deadRuleSet = new Set(s.deadRules.map((d) => d.rule));
    L.push(`### ${s.id}-A. CSSにあるが作る側が無いトークン (確証デッド ${dead.length} 件)`);
    L.push('');
    if (!dead.length) {
      L.push('(0件)');
    } else {
      L.push('| 種別 | トークン | 判定 | 規則数(全分岐死) | 代表 file:line | 他面で生成 | distにも無い |');
      L.push('|---|---|---|---:|---|---|---|');
      for (const r of dead) {
        const fullyDead = r.rules.filter((x) => deadRuleSet.has(x)).length;
        const sharedNote = r.rules.every((x) => shared.has(x.file)) ? '(共有CSS:参考)' : '';
        const rep = r.rules[0];
        L.push(`| ${r.kind} | \`${mdEsc(r.token)}\` | ${r.verdict}${sharedNote} | ${r.rules.length}(${fullyDead}) | ${rep.file}:${rep.line} | ${r.elsewhere.join(',') || '-'} | ${r.lvDist === null ? 'n/a' : isDeadLv(r.lvDist) ? 'はい' : '**いいえ(distには文字列あり)**'} |`);
      }
    }
    L.push('');
    const manual = s.tokenRows.filter((r) => r.verdict.startsWith('意図的'));
    if (manual.length) {
      L.push(`#### ${s.id}-A'. 意図的として除外した物 (${manual.length} 件)`);
      L.push('');
      L.push('| トークン | 理由 |');
      L.push('|---|---|');
      for (const r of manual) L.push(`| \`${mdEsc(r.token)}\` | ${mdEsc(r.reason)} |`);
      L.push('');
    }
    const dyn = s.tokenRows.filter((r) => r.verdict.startsWith('誤検知') || r.verdict.startsWith('要確認'));
    L.push(`### ${s.id}-B. 誤検知の疑い / 要確認 (${dyn.length} 件)`);
    L.push('');
    if (dyn.length) {
      L.push('| 種別 | トークン | 判定 | 規則数 | 代表 file:line |');
      L.push('|---|---|---|---:|---|');
      for (const r of dyn.slice(0, 120)) {
        const rep = r.rules[0];
        L.push(`| ${r.kind} | \`${mdEsc(r.token)}\` | ${r.verdict} | ${r.rules.length} | ${rep.file}:${rep.line} |`);
      }
      if (dyn.length > 120) L.push(`| …他 ${dyn.length - 120} 件は JSON 参照 | | | | |`);
    } else L.push('(なし)');
    L.push('');
    L.push(`### ${s.id}-C. 逆向き: 作られるがCSS規則の無いクラス (${s.reverse.length} 件${s.foreignSkipped ? `。別document向けJS内CSSに規則があるため除外済み ${s.foreignSkipped} 件` : ''})`);
    L.push('');
    if (s.reverse.length) {
      L.push('| クラス | 判定 | 生成 file:line | 参照(JS) | 他面にCSS |');
      L.push('|---|---|---|---|---|');
      const order = (v) => (v.startsWith('確証') ? 0 : v.startsWith('要確認') ? 1 : v.startsWith('別') ? 2 : 3);
      const rv = [...s.reverse].sort((a, b) => order(a.verdict) - order(b.verdict) || a.token.localeCompare(b.token));
      for (const r of rv.slice(0, 150)) L.push(`| \`${mdEsc(r.token)}\` | ${r.verdict} | ${r.loc} | ${r.refLoc || '-'} | ${r.otherCss.join(',') || '-'} |`);
      if (rv.length > 150) L.push(`| …他 ${rv.length - 150} 件は JSON 参照 | | | | |`);
    } else L.push('(なし)');
    L.push('');
  }

  L.push('## 面どうしの比較: popup(静的HTML+JS) vs 会場(JS)');
  L.push('');
  L.push('`生成` = そのクラスを作る側の証拠(strong/weak/dyn/ref/none)。CSS = その面のCSSに規則があるか。会場側 "strong" でも共有モジュール内の別経路由来の可能性がある(上の限界(2))。');
  L.push('');
  L.push('| 役割 | クラス | popup生成 | 会場生成 | popup CSS | 会場 CSS | ずれ |');
  L.push('|---|---|---|---|---|---|---|');
  for (const r of res.families) {
    const pg = isGen(r.popupGen) || r.popupGen === 'dyn';
    const vg = isGen(r.venueGen) || r.venueGen === 'dyn';
    let gap = '';
    if (r.venueOnly) gap = '会場専用(比較対象外)';
    else if (pg && !vg) gap = r.venueCss ? '**会場に作る側なし(CSSだけある)**' : '会場に作る側もCSSも無い(popupのみ)';
    else if (!pg && vg) gap = r.popupCss ? 'popupに作る側なし(CSSだけある)' : 'popupに作る側もCSSも無い';
    else if (!pg && !vg) gap = '**両面で作る側なし(CSSだけある)**';
    L.push(`| ${r.role} | \`${r.token}\` | ${r.popupGen}${r.popupLoc ? ` (${r.popupLoc})` : ''} | ${r.venueGen}${r.venueLoc ? ` (${r.venueLoc})` : ''} | ${r.popupCss ? 'あり' : '-'} | ${r.venueCss ? 'あり' : '-'} | ${gap} |`);
  }
  L.push('');
  L.push('### レーン/席まわりの CSS が要求する data-*/aria-* 属性');
  L.push('');
  L.push('| 属性 | popup規則数 | 会場規則数 | popup生成 | 会場生成 | 代表CSS |');
  L.push('|---|---:|---:|---|---|---|');
  for (const a of res.attrFamilies) {
    L.push(`| \`${a.attr}\` | ${a.popupRules} | ${a.venueRules} | ${a.popupGen}${a.popupLoc ? ` (${a.popupLoc})` : ''} | ${a.venueGen}${a.venueLoc ? ` (${a.venueLoc})` : ''} | ${a.sample} |`);
  }
  L.push('');

  // popup と liveview-web の差
  const pu = surf.popup;
  const lw = surf['liveview-web'];
  if (pu && lw) {
    const pm = new Map(pu.tokenRows.map((r) => [`${r.kind}:${r.token}`, r]));
    const lm = new Map(lw.tokenRows.map((r) => [`${r.kind}:${r.token}`, r]));
    const diffs = [];
    for (const [k, r] of pm) {
      const o = lm.get(k);
      if (!o) diffs.push([k, 'popup.htmlにだけCSSあり', r.verdict]);
      else if (r.dead !== o.dead) diffs.push([k, '判定が違う', `popup=${r.verdict} / live-view=${o.verdict}`]);
    }
    for (const [k, r] of lm) if (!pm.has(k)) diffs.push([k, 'app/live-view.htmlにだけCSSあり', r.verdict]);
    L.push('## popup と別窓WEB(app/live-view.html = popup の手動コピー)のずれ');
    L.push('');
    L.push(`トークン集合の差 ${diffs.length} 件(CSS が片方にしかない / デッド判定が違う)。**手動コピーのドリフトの目安**。`);
    L.push('');
    if (diffs.length) {
      L.push('| トークン | 差 | 判定 |');
      L.push('|---|---|---|');
      for (const d of diffs.slice(0, 80)) L.push(`| \`${mdEsc(d[0])}\` | ${d[1]} | ${mdEsc(d[2])} |`);
      if (diffs.length > 80) L.push(`| …他 ${diffs.length - 80} 件 | | |`);
      L.push('');
    }
  }
  // ── 再発防止(CI/ラチェット)設計案 ──
  const base = {};
  for (const s of res.surfaces) {
    base[s.id] = {
      minCssRules: Math.floor(s.cssRuleCount * 0.8),
      minJsFiles: Math.floor(s.jsFileCount * 0.8),
      maxConfirmedDead: s.tokenRows.filter((r) => r.dead).length,
      maxReverseConfirmed: s.reverse.filter((r) => r.verdict.startsWith('確証')).length
    };
  }
  L.push('## 再発防止案: vitest ラチェット(提案のみ・未実装)');
  L.push('');
  L.push('**置き場**: `src/lib/staticDeadSelectors.audit.test.js`(vitest, 所要は実測約2秒)が `scripts/audit/static-dead-selectors.mjs` の `runAudit()` / `selfTest()` を import。基準値は `scripts/audit/dead-selectors.baseline.json`。');
  L.push('');
  L.push('現状値から作る基準(今日の実測。allow は未登録=現状の確証デッドが全部「上限」に入る形):');
  L.push('');
  L.push('```json');
  L.push(JSON.stringify({ version: 1, surfaces: base, allow: [{ surface: 'popup', kind: 'class', token: 'nlsb-venue-lane-stack', reason: '(例) 会場CSSの意図した写し。laneCssSync.parity.test.js が要求', expires: '2027-04-01' }] }, null, 2));
  L.push('```');
  L.push('');
  L.push('| # | 検査 | 失敗の条件 | 狙い |');
  L.push('|--:|---|---|---|');
  L.push('| 1 | **空振りの緑を禁止** | `selfTest()` に1件でも不合格 / 各面の `cssRuleCount < minCssRules` または `jsFileCount < minJsFiles` / 全面の token 総数が 0 | 抽出が壊れて 0 件=緑になる事故([[gate-watches-only-what-it-measures]])。0 件は「CSS を読めた」証拠(規則数・token数)が揃ったときだけ合格 |');
  L.push('| 2 | **新規デッド禁止(ラチェット)** | 面ごとの確証デッド token(allow 除く)が baseline に無い物を含む / 件数が `maxConfirmedDead` を超える | 新しく足した CSS に作る側が無い、を PR で名指し(トークンと file:line を出力) |');
  L.push('| 3 | **allow は理由必須・期限つき** | `reason` が15字未満 / `expires` 超過 / **allow したのにもうデッドでない(古い宣言)** | `laneCssSync.parity.test.js` の EXPECTED_SELECTOR_DIFFS と同じ流儀。握りつぶしを許さない |');
  L.push('| 4 | **会場だけに作る側が無い型(`--tanu` 型)は即赤** | 「popup 側が作る(strong) ∧ 会場 CSS に規則あり ∧ 会場に作る側なし」のクラスが1件でもあり allow に無い | 現状値の上限方式だと「既にある1件」を許してしまう。この型だけは上限0で固定し、残す物は理由つき allow に出す |');
  L.push('| 5 | **下げるだけ** | `--update-baseline` は数値を下げる方向のみ書換え。上げるには `--allow-increase "理由"` が必要で、その理由が差分に残る | 緑にするために基準を緩める逃げ道を塞ぐ |');
  L.push('| 6 | 逆向き(CSSの無いクラス) | `maxReverseConfirmed` 超過 | 報(止めない)でよい。件数だけ記録 |');
  L.push('| 7 | dist 照合(任意) | `extension/dist/*.js` があるときだけ「srcにあるがdistに無い」を数える。無いときは **skip と明示**(合格扱いにしない) | ツリーシェイクで消えた経路を拾う。dist が古い環境で赤くならないよう報扱い |');
  L.push('');
  L.push('**門と報の分け方**: 1・3・4 は門(verify:cc で止める)、2 は門にするが「全面一括」ではなく面ごとに独立して判定、6・7 は報(`REPORT` 行に件数だけ出す)。');
  L.push('');
  L.push('**この静的検査が原理的に見えない物**(別手段で補う): 「文字列は閉包内にあるが、その面の実行経路では通らない」型(例: 共有関数 `applyStoryUserLaneWindow` は会場では `isVenue` で窓化しない)。→ 補完として jsdom/Playwright で会場にフィクスチャ行を流し込み、`.nl-story-userlane--tanu` など【CSS が前提にする要素・属性が実DOMに存在する】ことを数える配線テストを会場の主要クラス(上の面比較表の「CSSだけある」行)に限って足す。');
  L.push('');
  return L.join('\n');
}


// ───────────────────────── 自己検査(--selftest / レポートにも結果を載せる) ─────────────────────────
/**
 * 合成入力で「デッドを見つける・見つけてはいけない物を見つけない」を確かめる。
 * 検査が壊れて常に緑(0件)になる事故([[gate-watches-only-what-it-measures]])を防ぐための足場。
 */
export function selfTest() {
  const results = [];
  const mk = (jsSrc) => {
    const ev = newEvidence();
    const sc = scanJs(jsSrc);
    for (const u of sc.units) ingestUnit(ev, u, 'fixture.js');
    ingestJsCode(ev, sc.code, 'fixture.js');
    return ev;
  };
  const lv = (ev, kind, tok) => levelOf(ev, kind, tok);
  const t = (name, ok) => results.push({ name, ok: !!ok });

  const js = [
    "const a = document.createElement('div');",
    "a.className = 'alive-one';",
    "a.classList.add('alive-two', cond ? 'alive-three' : 'alive-four');",
    "// commented-only-class is only in a comment",
    "/* block-comment-class */",
    "a.classList.remove('ref-only-class');",
    "document.querySelector('.query-only-class');",
    "a.className = `dyn-pref-${kind}`;",
    "const h = `<span class=\"rankno${rc}\">x</span>`;",
    "a.dataset.fooBar = '1';",
    "const re = /'/g; const after = 'after-regex-class'; a.className = after;",
    "const nested = `x ${ `inner-tpl-class` } y`; a.className = nested;"
  ].join('\n');
  const ev = mk(js);
  t('className= は生成', lv(ev, 'class', 'alive-one') === 'strong');
  t('classList.add 複数引数・三項は生成', ['alive-two', 'alive-three', 'alive-four'].every((c) => lv(ev, 'class', c) === 'strong'));
  t('コメントだけの言及は証拠にならない', lv(ev, 'class', 'commented-only-class') === 'none' && lv(ev, 'class', 'block-comment-class') === 'none');
  t('classList.remove だけは参照扱い(=デッド側)', lv(ev, 'class', 'ref-only-class') === 'ref');
  t('querySelector だけは参照扱い', lv(ev, 'class', 'query-only-class') === 'ref');
  t('テンプレ prefix は dyn', lv(ev, 'class', 'dyn-pref-big') === 'dyn');
  t('class="rankno${x}" の静的部分は生成', lv(ev, 'class', 'rankno') === 'strong');
  t('dataset.fooBar は data-foo-bar', lv(ev, 'attr', 'data-foo-bar') === 'strong');
  t('正規表現リテラルの引用符で走査が壊れない', lv(ev, 'class', 'after-regex-class') !== 'none');
  t('入れ子テンプレの文字列も拾う', lv(ev, 'class', 'inner-tpl-class') !== 'none');
  t('何も無いトークンは none', lv(ev, 'class', 'never-mentioned') === 'none');

  const css = parseCss(
    [
      '.alive-one { color: red; }',
      '/* .commented-rule { } */',
      '@media (max-width: 600px) { .in-media .alive-two { color: blue; } }',
      '.x:not(.not-required) .alive-one, .dead-one .alive-one { color: green; }',
      '[data-foo-bar="1"] { color: red; }',
      '@keyframes spin { from { opacity: 0; } to { opacity: 1; } }'
    ].join('\n'),
    1
  ).rules;
  t('CSS: コメント内の規則は拾わない', !css.some((r) => /commented-rule/.test(r.selector)));
  t('CSS: @media 内の規則を拾う', css.some((r) => /in-media/.test(r.selector)));
  t('CSS: @keyframes の中身は規則にしない', !css.some((r) => /from|to/.test(r.selector.trim()) && r.selector.trim().length < 6));
  const b = splitTopLevel('.x:not(.not-required) .alive-one, .dead-one .alive-one', ',').map(analyzeBranch);
  t('CSS: :not() の中は必須トークンにしない', !b[0].classes.includes('not-required') && b[0].classes.includes('alive-one'));
  t('CSS: カンマ分岐を分ける(分岐2は dead-one 必須)', b[1].classes.includes('dead-one'));
  const bAttr = analyzeBranch('[data-foo-bar="1"]');
  t('CSS: 属性セレクタの data-* を拾う', bAttr.dataAttrs.includes('data-foo-bar'));

  const html = splitHtml('<!-- <style> .c-in-comment{} </style> -->\n<style>.real-one{color:red}</style>\n<div class="real-one zzz"></div>');
  t('HTML: コメント内の <style> を style とみなさない', html.styles.length === 1 && /real-one/.test(html.styles[0].text));
  return results;
}

// ───────────────────────── 実行 ─────────────────────────
function main() {
  const st = selfTest();
  const failed = st.filter((x) => !x.ok);
  if (failed.length) {
    console.error('SELFTEST FAILED:', failed.map((x) => x.name).join(' / '));
    process.exitCode = 2;
  }
  if (argv.includes('--selftest')) {
    for (const x of st) console.log(`${x.ok ? 'ok  ' : 'FAIL'} ${x.name}`);
    return;
  }
  const res = runAudit();
  res.selfTest = { total: st.length, failed: failed.length };
  const md = renderMarkdown(res);
  if (DEBUG) {
    for (const s of res.surfaces) {
      console.log(`[${s.id}] js=${s.jsFileCount} cssRules=${s.cssRuleCount} tokens=${s.tokenRows.length} dead=${s.tokenRows.filter((r) => r.dead).length} deadRules=${s.deadRules.length} reverse=${s.reverse.length}`);
    }
  }
  const json = {
    date: res.date,
    surfaces: res.surfaces.map((s) => ({
      id: s.id,
      cssRuleCount: s.cssRuleCount,
      dead: s.tokenRows.filter((r) => r.dead).map((r) => ({ kind: r.kind, token: r.token, verdict: r.verdict, elsewhere: r.elsewhere, rules: r.rules.length, at: `${r.rules[0].file}:${r.rules[0].line}` })),
      deadRules: s.deadRules.map((d) => ({ at: `${d.rule.file}:${d.rule.line}`, selector: d.rule.selector, tokens: d.tokens })),
      dyn: s.tokenRows.filter((r) => r.verdict.startsWith('誤検知') || r.verdict.startsWith('要確認')).map((r) => ({ token: r.token, verdict: r.verdict })),
      reverse: s.reverse
    })),
    families: res.families,
    attrFamilies: res.attrFamilies
  };
  if (!NO_WRITE) {
    const dir = path.join(ROOT, 'scripts', 'audit', 'reports');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `static-dead-selectors-${DATE}.md`), md);
    fs.writeFileSync(path.join(dir, `static-dead-selectors-${DATE}.json`), JSON.stringify(json, null, 2));
    console.log(`wrote scripts/audit/reports/static-dead-selectors-${DATE}.md (${md.split('\n').length} lines)`);
  } else console.log(md);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
