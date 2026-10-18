// loop-glossary-status-live.mjs の回帰テスト。
// 守ること: 実コード(symptomVerdicts.js)の症状7個が全部、症状名と次の一手つきで読み取れる／
// アダプタが出す id・指標が全部、用語集に載る（足し忘れは赤）／読み取りがずれたら書かない／検査器が拒否したら書かない。
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARD_GLOSSARY, KNOWN_SYMPTOM_IDS, buildCardsFromBlob } from './loop-adapter-status-live.mjs';
import { formatGlossary, parseSymptomDefinitions } from './loop-glossary-status-live.mjs';
import { SYMPTOM_SIGNATURE_LABEL } from '../src/lib/symptomVerdicts.js';

const REPO = resolve(fileURLToPath(import.meta.url), '..', '..');
const SRC = readFileSync(join(REPO, 'src', 'lib', 'symptomVerdicts.js'), 'utf8');

describe('parseSymptomDefinitions（実コードから読む）', () => {
  const defs = parseSymptomDefinitions(SRC);
  it('許可リストの7個すべてが、症状名と次の一手つきで読み取れる', () => {
    expect(defs.map((d) => d.id).sort()).toEqual([...KNOWN_SYMPTOM_IDS].sort());
    for (const d of defs) {
      expect(d.symptom.length).toBeGreaterThan(0);
      expect(d.hint.length).toBeGreaterThan(5);
    }
  });
  it('次の一手に、補間の残骸（${…}）や引用符が混ざらない', () => {
    for (const d of defs) {
      expect(d.hint).not.toMatch(/\$\{|`|'/);
    }
  });
  it('定義の形が変わったら（push が無い）空になる＝呼び出し側が止まれる', () => {
    expect(parseSymptomDefinitions('const x = 1;')).toEqual([]);
  });
});

describe('用語集の網羅（アダプタが出すものは全部載る）', () => {
  const blob = {
    generatedAt: '2026-10-18T06:00:00Z',
    lives: [{}],
    statusReport: `${SYMPTOM_SIGNATURE_LABEL} ${KNOWN_SYMPTOM_IDS.join(' ')} unknown-x`,
  };
  const cards = buildCardsFromBlob(blob, { version: '0.1.1656', now: new Date('2026-10-18T06:00:10Z') });
  it('カードの指標キーが全部 CARD_GLOSSARY にある', () => {
    const keys = new Set(cards.flatMap((c) => Object.keys(c.metrics)));
    for (const k of keys) expect(Object.keys(CARD_GLOSSARY)).toContain(k);
  });
  it('土台カードの id（status-snapshot）も CARD_GLOSSARY にある', () => {
    for (const c of cards.filter((x) => !KNOWN_SYMPTOM_IDS.includes(x.id))) expect(Object.keys(CARD_GLOSSARY)).toContain(c.id);
  });
  it('整形した用語集に、全症状ID・全指標が載り、個人情報や秘密らしき形が無い', () => {
    const text = formatGlossary(parseSymptomDefinitions(SRC));
    for (const id of KNOWN_SYMPTOM_IDS) expect(text).toContain(id);
    for (const k of Object.keys(CARD_GLOSSARY)) expect(text).toContain(k);
    expect(text).not.toMatch(/[^\s@]+@[^\s@]+\.[^\s@]+/);
    expect(Buffer.byteLength(text)).toBeLessThan(4096);
  });
});

const KIT = process.env.LOOP_KIT_DIR || resolve(REPO, '..', 'web-ios-android', 'templates', 'scripts');
const kitPresent = existsSync(join(KIT, 'lib', 'loop-propose-core.mjs'));

describe('CLI', () => {
  const cli = join(REPO, 'scripts', 'loop-glossary-status-live.mjs');
  const run = (env) => spawnSync(process.execPath, [cli], { encoding: 'utf8', env: { ...process.env, ...env } });

  it('検査器が見つからなければ exit 2・何も書かない', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gloss-'));
    try {
      const out = join(dir, 'out');
      const r = run({ LOOP_KIT_DIR: join(dir, 'no-kit'), LOOP_OUT_DIR: out });
      expect(r.status).toBe(2);
      expect(existsSync(out)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('検査器が拒否したら exit 1・何も書かない（fail-closed）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gloss-'));
    try {
      const fakeKit = join(dir, 'kit');
      mkdirSync(join(fakeKit, 'lib'), { recursive: true });
      writeFileSync(join(fakeKit, 'lib', 'loop-propose-core.mjs'), "export const assertGlossary = () => { throw new Error('x'); };\n");
      const out = join(dir, 'out');
      const r = run({ LOOP_KIT_DIR: fakeKit, LOOP_OUT_DIR: out });
      expect(r.status).toBe(1);
      expect(existsSync(out)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('定義の読み取りが許可リストとずれたら exit 1・何も書かない（症状が増減した/書き方が変わった合図）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gloss-'));
    try {
      const fakeSrc = join(dir, 'symptomVerdicts.js');
      writeFileSync(fakeSrc, "out.push({ id: 'thumb-white', symptom: 'サムネが白い', level: 'bad', line: 'x ★次の一手: 確認する' });\n");
      const out = join(dir, 'out');
      const r = run({ LOOP_SYMPTOM_SRC: fakeSrc, LOOP_KIT_DIR: KIT, LOOP_OUT_DIR: out });
      expect(r.status).toBe(1);
      expect(existsSync(out)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!kitPresent)('正常: 正本の検査を通って glossary.txt を書く', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gloss-'));
    try {
      const out = join(dir, 'out');
      const r = run({ LOOP_KIT_DIR: KIT, LOOP_OUT_DIR: out });
      expect(r.status).toBe(0);
      const text = readFileSync(join(out, 'glossary.txt'), 'utf8');
      for (const id of KNOWN_SYMPTOM_IDS) expect(text).toContain(id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
