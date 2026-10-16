/**
 * 会場のセリフ診断の配線の固定(2026-10-12・ユーザー要望)。
 * 判定は venueSpeechCensus.test.js。ここは venueBar → 保存(venueSeatsDiag) → 状態速報(aiShareFullText) が
 * 端から端まで繋がっていることを固定する(判定はあるが配線されていない、が最大の病)。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildVenueSeatsDiagSnapshot } from './venueSeatsDiag.js';
import { buildAiShareFullText } from './aiShareFullText.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), 'utf8').split('\r\n').join('\n');
const venue = read('../extension/venueBar.js');

describe('会場のセリフ診断: 配線', () => {
  it('venueBar が import して状態を持つ', () => {
    expect(venue).toContain("} from '../lib/venueSpeechCensus.js';");
    expect(venue).toContain('const _speechCensus = createVenueSpeechCensusState();');
  });

  it('★カードを開いたとき(model 作成直後・描画前)に数える。段(広告/ギフト)で除外しない・発言の形跡は【発言の証拠】(count の下駄ではない)', () => {
    expect(venue).toMatch(/const model = buildVenueHoverCardModel\([^\n]*\);(\n\s+\/\/[^\n]*)+\n\s+try \{\n\s+observeVenueSpeechHover\(_speechCensus, \{/);
    expect(venue).not.toContain("const isThrow = data.tier === 'gift' || data.tier === 'ad';");
    expect(venue).toContain('spoke: hasSpeech(data.speech),');
    expect(venue).toContain("saidSpeech: /発言/.test(String(model.statLine || '')),");
  });

  it('★タイルの数え直しは3秒期日(diagDue)の中だけ(毎paintで走らない)', () => {
    const at = venue.indexOf('observeVenueSpeechTiles(_speechCensus, speechTiles);');
    const dueAt = venue.lastIndexOf('if (diagDue) {', at);
    expect(at).toBeGreaterThan(0);
    expect(dueAt).toBeGreaterThan(0);
    expect(at - dueAt).toBeLessThan(2400);
  });

  it('★名簿の発言回数は commentCount を読む(count と書くと常に0=「欠け」を取りこぼす)', () => {
    expect(venue).toContain('rosterCount: rosterEntry ? Number(rosterEntry.commentCount) || 0 : 0');
    expect(venue).not.toContain('Number(rosterEntry.count)');
  });

  it('★診断の snapshot に載せている(載せないと状態速報に永久に出ない)', () => {
    expect(venue).toContain('speechCensus: toVenueSpeechCensusDiag(_speechCensus),');
  });

  it('★保存用の正規化を通る(ホワイトリストに載っていないと捨てられる)', () => {
    const out = buildVenueSeatsDiagSnapshot({ enabled: true, speechCensus: { line: '会場セリフ ✅ x', verdict: 'ok', checked: 3, shown: 3, missing: 0 } });
    expect(out.speechCensus).toMatchObject({ line: '会場セリフ ✅ x', verdict: 'ok', checked: 3, shown: 3, missing: 0 });
    expect(buildVenueSeatsDiagSnapshot({ enabled: true }).speechCensus).toBeNull();
  });
});

describe('会場のセリフ診断: 状態速報に出る(本物の buildAiShareFullText を通す)', () => {
  const build = (speechCensus) => buildAiShareFullText({
    overviewText: 'x',
    livesData: [],
    fastDiag: null,
    popupDiag: null,
    voiceDiag: null,
    venueSeatsDiag: buildVenueSeatsDiagSnapshot({ enabled: true, liveId: 'lv1', speechCensus }, Date.now()),
    currentLiveId: 'lv1'
  });

  it('★セリフ診断の1行が状態速報の本文に出る', () => {
    const text = build({ line: '会場セリフ ✅ タイル9枚: 出る9(うち鏡頼み2) / 欠け0 / 無言0', verdict: 'ok', checked: 9, shown: 9 });
    expect(text).toContain('会場セリフ ✅ タイル9枚: 出る9(うち鏡頼み2) / 欠け0 / 無言0');
  });

  it('★🔴(欠けあり)もそのまま本文に出る', () => {
    const text = build({ line: '会場セリフ 🔴 タイル5枚: 出る3 / 欠け2 / 欠け例{レトルト}', verdict: 'warn', checked: 5, missing: 2 });
    expect(text).toContain('会場セリフ 🔴');
    expect(text).toContain('欠け例{レトルト}');
  });

  it('診断が無いとき(古い版が書いた)は行ごと出さない=普段の速報を汚さない', () => {
    expect(build(undefined)).not.toContain('会場セリフ');
  });
});

describe('空だったカードの手がかり(detail)の配線', () => {
  // ★ふだんは何も作らない=軽さを守る: detail は【関数】で渡し、空のときだけ評価される。
  it('★venueBar.js が detail を関数で渡している(文字列を毎回作らない)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve('src/extension/venueBar.js'), 'utf8');
    const i = src.indexOf('observeVenueSpeechHover(_speechCensus');
    expect(i).toBeGreaterThan(0);
    const body = src.slice(i, i + 1400);
    expect(body).toMatch(/detail: \(\) => `発言\$\{Number\(data\.count\) \|\| 0\}/);
    expect(body).toMatch(/出所\$\{String\(data\.factsSource/);
  });
});
