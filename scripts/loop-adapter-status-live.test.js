// loop-adapter-status-live.mjs の回帰テスト。
// 守ること: 速報の個人情報（名前・コメント本文・ID・アイコンURL）がカードに一切出ない／症状IDの許可リストが
// src/lib/symptomVerdicts.js の実コードとずれない／検査器が拒否したら何も書かない／速報本文が無ければ「測れていない」。
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { KNOWN_SYMPTOM_IDS, STALE_SEC, buildCardsFromBlob, extractJson } from './loop-adapter-status-live.mjs';
import { SYMPTOM_SIGNATURE_LABEL } from '../src/lib/symptomVerdicts.js';

const NOW = new Date('2026-10-18T06:00:10Z');
const blob = () => ({
  generatedAt: '2026-10-18T06:00:00Z',
  lives: [{ liveId: 'lv1', title: '山田太郎の配信' }, { liveId: 'lv2', title: '別の配信' }],
  commentTimelineMirror: { rows: [{ at: 1, name: '佐藤花子', text: 'こんにちは、住所は東京都…', avatarUrl: 'https://example.com/a.png', userId: '123456789', kind: 'c' }] },
  statusReport: ['### 症状別の判定', '🔴 サムネが白い: 名前が出ている3人の実サムネが0件', `${SYMPTOM_SIGNATURE_LABEL} thumb-white status-slow weird-new-id`].join('\n'),
});
const ctx = { version: '0.1.1656', now: NOW };

describe('buildCardsFromBlob', () => {
  it('既知の症状IDだけをカードにし、未知のトークンは数だけ残す', () => {
    const cards = buildCardsFromBlob(blob(), ctx);
    expect(cards.map((c) => c.id)).toEqual(['thumb-white', 'status-slow', 'status-snapshot']);
    const snap = cards.find((c) => c.id === 'status-snapshot');
    expect(snap.metrics).toMatchObject({ reportPresent: true, symptomCount: 2, unknownSymptomCount: 1, snapshotAgeSec: 10, livesCount: 2 });
    expect(snap.verdict).toBe('ok');
    expect(cards.find((c) => c.id === 'thumb-white').verdict).toBe('fail');
  });

  it('個人情報（名前・コメント本文・ID・URL・配信タイトル）も未知トークンも、カードのどこにも出ない', () => {
    const out = JSON.stringify(buildCardsFromBlob(blob(), ctx));
    for (const leak of ['山田', '佐藤', 'こんにちは', '住所', '123456789', 'example.com', 'avatar', 'weird-new-id', 'lv1', 'サムネが白い']) {
      expect(out).not.toContain(leak);
    }
  });

  it('カードの最上位キーは許可リストの範囲だけ・metrics は数値と真偽値だけ', () => {
    const allowed = ['schema', 'id', 'project', 'source', 'verdict', 'version', 'buildId', 'at', 'metrics'];
    for (const c of buildCardsFromBlob(blob(), ctx)) {
      expect(Object.keys(c).every((k) => allowed.includes(k))).toBe(true);
      expect(Object.values(c.metrics).every((v) => typeof v === 'number' || typeof v === 'boolean')).toBe(true);
    }
  });

  it('速報が古ければ（STALE_SEC超）「測れていない」。ちょうど STALE_SEC は ok（実データで1時間前の速報が ok になっていた不具合の再発防止）', () => {
    const at = (secAgo) => new Date(NOW.getTime() - secAgo * 1000).toISOString();
    const snap = (secAgo) => buildCardsFromBlob({ ...blob(), statusReport: 'x', generatedAt: at(secAgo) }, ctx).at(-1);
    expect(snap(STALE_SEC).verdict).toBe('ok');
    expect(snap(STALE_SEC + 1).verdict).toBe('unmeasured');
    expect(snap(3591).verdict).toBe('unmeasured');
  });
  it('生成時刻が無い・壊れている速報も「測れていない」（古さが分からないものを ok にしない）', () => {
    expect(buildCardsFromBlob({ ...blob(), generatedAt: undefined }, ctx).at(-1).verdict).toBe('unmeasured');
    expect(buildCardsFromBlob({ ...blob(), generatedAt: 'x' }, ctx).at(-1).verdict).toBe('unmeasured');
  });
  it('速報本文が無ければ「測れていない」（緑にしない）・症状カードは作らない', () => {
    const cards = buildCardsFromBlob({ generatedAt: '2026-10-18T06:00:00Z', lives: [] }, ctx);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: 'status-snapshot', verdict: 'unmeasured' });
    expect(cards[0].metrics.reportPresent).toBe(false);
  });

  it('生成時刻が壊れていても落ちない（その指標だけ出さない）', () => {
    const cards = buildCardsFromBlob({ ...blob(), generatedAt: 'x' }, ctx);
    expect(cards.at(-1).metrics.snapshotAgeSec).toBeUndefined();
  });
});

describe('許可リストは実コードとずれない', () => {
  it('KNOWN_SYMPTOM_IDS == src/lib/symptomVerdicts.js が push する症状ID', () => {
    const src = readFileSync(resolve(fileURLToPath(import.meta.url), '..', '..', 'src', 'lib', 'symptomVerdicts.js'), 'utf8');
    const ids = [...src.matchAll(/out\.push\(\{\s*id:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
    expect(new Set(ids)).toEqual(new Set(KNOWN_SYMPTOM_IDS));
  });
});

const KIT = process.env.LOOP_KIT_DIR || resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'web-ios-android', 'templates', 'scripts');
const kitPresent = existsSync(join(KIT, 'lib', 'symptom-card-core.mjs'));

describe.skipIf(!kitPresent)('キット正本の症状カード検査との結合（キットが隣に無い環境では飛ばす）', () => {
  it('作ったカードが全部、正本の検査に通る', async () => {
    const { validateSymptomCard } = await import(pathToFileURL(join(KIT, 'lib', 'symptom-card-core.mjs')).href);
    for (const c of buildCardsFromBlob(blob(), ctx)) {
      const r = validateSymptomCard(c, { byteLength: Buffer.byteLength(JSON.stringify(c)) });
      expect(r.violations).toEqual([]);
    }
  });
});

describe('CLI', () => {
  const cli = resolve(fileURLToPath(import.meta.url), '..', 'loop-adapter-status-live.mjs');
  const run = (input, env) => spawnSync(process.execPath, [cli], { input, encoding: 'utf8', env: { ...process.env, ...env } });

  it('検査器が拒否したら何も書かない（fail-closed）・exit 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loop-'));
    try {
      const fakeKit = join(dir, 'kit');
      mkdirSync(join(fakeKit, 'lib'), { recursive: true });
      writeFileSync(join(fakeKit, 'lib', 'symptom-card-core.mjs'), "export const validateSymptomCard = () => ({ ok: false, violations: [{ path: '$', rule: 'x' }] });\n");
      const out = join(dir, 'out');
      const r = run(JSON.stringify(blob()), { LOOP_KIT_DIR: fakeKit, LOOP_OUT_DIR: out });
      expect(r.status).toBe(1);
      expect(existsSync(out)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('検査器が見つからなければ exit 2（測れていない）・何も書かない', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loop-'));
    try {
      const out = join(dir, 'out');
      const r = run(JSON.stringify(blob()), { LOOP_KIT_DIR: join(dir, 'no-kit'), LOOP_OUT_DIR: out });
      expect(r.status).toBe(2);
      expect(existsSync(out)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!kitPresent)('正常: カードを書き、出力にも書いたファイルにも個人情報が無い', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loop-'));
    try {
      const out = join(dir, 'out');
      const r = run(JSON.stringify(blob()), { LOOP_KIT_DIR: KIT, LOOP_OUT_DIR: out });
      expect(r.status).toBe(0);
      const files = readdirSync(out);
      expect(files).toHaveLength(3);
      const all = files.map((f) => readFileSync(join(out, f), 'utf8')).join('\n') + r.stdout + r.stderr;
      for (const leak of ['山田', '佐藤', 'こんにちは', '123456789', 'example.com']) expect(all).not.toContain(leak);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('壊れた入力は exit 2', () => {
    expect(run('not json', { LOOP_KIT_DIR: KIT }).status).toBe(2);
  });
});

describe('extractJson（status-live --json は JSON の前に人向けの見出しを付ける）', () => {
  const obj = { generatedAt: '2026-10-18T06:00:00Z', lives: [], statusReport: 'x' };
  it('全体が JSON ならそのまま読む', () => {
    expect(extractJson(JSON.stringify(obj))).toEqual(obj);
    expect(extractJson(JSON.stringify(obj, null, 2))).toEqual(obj);
  });
  it('見出し（日本語・記号・警告）の後ろの JSON を読む。見出しの中身は使わない', () => {
    const text = '── 状態速報(生成: 59分前) ──────\n⚠️ このスナップショットは5分以上古いです\n\n' + JSON.stringify(obj, null, 2) + '\n';
    expect(extractJson(text)).toEqual(obj);
  });
  it('見出しの途中に { を含む行があっても、行頭が { の行から読む', () => {
    const text = '見出し {途中の波括弧}\n' + JSON.stringify(obj);
    expect(extractJson(text)).toEqual(obj);
  });
  it('JSON が無い・壊れている・空なら null（呼び出し側が測れていないと扱う）', () => {
    expect(extractJson('エラー: トークンがありません')).toBeNull();
    expect(extractJson('見出し\n{ 壊れた')).toBeNull();
    expect(extractJson('')).toBeNull();
    expect(extractJson(undefined)).toBeNull();
  });
});
