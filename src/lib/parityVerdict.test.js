import { describe, it, expect } from 'vitest';
import { buildParityVerdict, formatParityVerdictLine, buildParityBadge, judgeVenuePopulationParity, judgePreviewGenerationParity } from './parityVerdict.js';

// 決定木を固定。誤検知根絶(取得不能は必ず pending・×にしない)を最重視で検証。

const okInput = () => ({
  currentLiveId: 'lv1',
  nowMs: 1000,
  trust: { hasWatchTab: true, popup: { present: true, lidMatch: true, fresh: true } },
  laneRenderDiag: { started: 8, verdict: 'ok' },
  northStarProbe: { refreshAllStarted: 4 },
  publishSelfDiag: {
    consistency: [{ lane: '北極星 貢献度', match: true, extRows: 10, mirrorRows: 10 }],
    publish: { ready: true },
    lastPost: { everSent: true, ok: true, ageSec: 5 }
  },
  previewAck: { ready: true, ts: 1000, liveId: 'lv1' }
});

describe('buildParityVerdict — 保留(誤検知根絶)', () => {
  it('watch 無し → pending(×にしない)', () => {
    const v = buildParityVerdict({ trust: { hasWatchTab: false } });
    expect(v.verdict).toBe('pending');
    expect(v.code).toBe('no_watch');
  });
  it('popup 未取得 → pending', () => {
    const v = buildParityVerdict({ trust: { hasWatchTab: true, popup: { present: false } } });
    expect(v.verdict).toBe('pending');
    expect(v.code).toBe('popup_absent');
  });
  it('popup 別配信 → pending', () => {
    const v = buildParityVerdict({ trust: { hasWatchTab: true, popup: { present: true, lidMatch: false } } });
    expect(v.verdict).toBe('pending');
    expect(v.code).toBe('popup_other_live');
  });
  it('popup 古い → pending', () => {
    const v = buildParityVerdict({ trust: { hasWatchTab: true, popup: { present: true, lidMatch: true, fresh: false } } });
    expect(v.verdict).toBe('pending');
    expect(v.code).toBe('popup_stale');
  });
  it('未publish → pending(eを×にしない)', () => {
    const i = okInput();
    i.publishSelfDiag.lastPost = { everSent: false };
    expect(buildParityVerdict(i).code).toBe('web_not_published');
    expect(buildParityVerdict(i).verdict).toBe('pending');
  });
  it('②応援プレビュー ack 無し → pending', () => {
    const i = okInput();
    i.previewAck = null;
    expect(buildParityVerdict(i).code).toBe('preview_no_ack');
    expect(buildParityVerdict(i).verdict).toBe('pending');
  });
});

describe('buildParityVerdict — 不一致(本物の×だけ)', () => {
  it('①応援レーン描画 started=0 → mismatch(a)', () => {
    const i = okInput();
    i.laneRenderDiag = { started: 0, verdict: 'not_started' };
    const v = buildParityVerdict(i);
    expect(v.verdict).toBe('mismatch');
    expect(v.code).toBe('pop_lane_not_started');
  });
  it('①北極星 refreshAllStarted=0 → mismatch(a)', () => {
    const i = okInput();
    i.northStarProbe = { refreshAllStarted: 0 };
    const v = buildParityVerdict(i);
    expect(v.verdict).toBe('mismatch');
    expect(v.code).toBe('pop_northstar_not_started');
  });
  it('データ整合 mismatch(拡張10≠鏡0) → mismatch(b)', () => {
    const i = okInput();
    i.publishSelfDiag.consistency = [{ lane: '北極星 貢献度', match: false, extRows: 10, mirrorRows: 0 }];
    const v = buildParityVerdict(i);
    expect(v.verdict).toBe('mismatch');
    expect(v.code).toBe('data_mismatch');
    expect(v.reason).toContain('拡張10≠鏡0');
  });
  it('鮮度差で skipped な consistency は ×にしない(normal は保留扱い=先へ進む)', () => {
    const i = okInput();
    i.publishSelfDiag.consistency = [{ lane: '北極星 貢献度', match: null, skipped: true, normal: true }];
    expect(buildParityVerdict(i).verdict).toBe('ok'); // 他が全部OKなら ok
  });
  it('③送信失敗 → mismatch', () => {
    const i = okInput();
    i.publishSelfDiag.lastPost = { everSent: true, ok: false };
    expect(buildParityVerdict(i).code).toBe('web_publish_failed');
    expect(buildParityVerdict(i).verdict).toBe('mismatch');
  });
});

describe('buildParityVerdict — passive 由来は heavy probe=0 を誤診しない(v0.1.988)', () => {
  it('passive 診断で started=0/refreshAllStarted=0 でも ①POP未描画にしない', () => {
    const i = okInput();
    i.trust.popup.viewKind = 'passive';
    i.laneRenderDiag = { started: 0, verdict: 'not_started' }; // passive では正常
    i.northStarProbe = { refreshAllStarted: 0 };               // passive では正常
    const v = buildParityVerdict(i);
    // ①の heavy 判定をスキップ→他(整合/publish/ack)が全部OKなら ok
    expect(v.verdict).toBe('ok');
  });
  it('embed_watch 診断なら started=0 は ①POP未描画(従来どおり)', () => {
    const i = okInput();
    i.trust.popup.viewKind = 'embed_watch';
    i.laneRenderDiag = { started: 0, verdict: 'not_started' };
    expect(buildParityVerdict(i).code).toBe('pop_lane_not_started');
  });
});

describe('buildParityVerdict — 合格', () => {
  it('全部そろって ok', () => {
    const v = buildParityVerdict(okInput());
    expect(v.verdict).toBe('ok');
    expect(v.code).toBe('ok');
  });
  it('応援レーンが空ソース(供給0=正常)でも他OKなら ok', () => {
    const i = okInput();
    i.laneRenderDiag = { started: 0, verdict: 'empty_source' };
    expect(buildParityVerdict(i).verdict).toBe('ok');
  });
});

describe('formatParityVerdictLine', () => {
  it('ok 行', () => {
    expect(formatParityVerdictLine({ verdict: 'ok' })).toContain('✅ 同一で完全');
  });
  it('mismatch 行は理由と次の一手', () => {
    const line = formatParityVerdictLine({ verdict: 'mismatch', reason: 'X', nextAction: 'Y' });
    expect(line).toContain('🔴 不一致');
    expect(line).toContain('X');
    expect(line).toContain('→ Y');
  });
  it('pending 行', () => {
    expect(formatParityVerdictLine({ verdict: 'pending', reason: 'Z', nextAction: '' })).toContain('🟡 保留');
  });
});

describe('buildParityBadge — ②応援プレビューの色付きバッジ材料(v0.1.1015)', () => {
  it('ok は緑トーン+✅+理由は固定文(nextAction 無し)', () => {
    const b = buildParityBadge({ verdict: 'ok', reason: '', nextAction: '', code: 'ok' });
    expect(b.tone).toBe('ok');
    expect(b.icon).toBe('✅');
    expect(b.title).toContain('同一');
    expect(b.nextAction).toBe('');
  });
  it('mismatch は赤トーン+🔴+理由と次の一手をそのまま通す', () => {
    const b = buildParityBadge({ verdict: 'mismatch', reason: '食い違い X', nextAction: '開発者に共有', code: 'data_mismatch' });
    expect(b.tone).toBe('mismatch');
    expect(b.icon).toBe('🔴');
    expect(b.reason).toBe('食い違い X');
    expect(b.nextAction).toBe('開発者に共有');
  });
  it('③WEB が古い(web_stale)は pending 黄トーン+🟡+再公開を促す', () => {
    const b = buildParityBadge({ verdict: 'pending', reason: '③WEBの送信が古い(再公開で新鮮化)', nextAction: '「🌐このURLをWEBでも公開する」を再度押す', code: 'web_stale' });
    expect(b.tone).toBe('pending');
    expect(b.icon).toBe('🟡');
    expect(b.reason).toContain('③WEB');
    expect(b.nextAction).toContain('公開');
  });
  it('不正入力(null/未知 verdict)は pending にフォールバック(死なない)', () => {
    expect(buildParityBadge(null).tone).toBe('pending');
    expect(buildParityBadge({ verdict: 'weird' }).tone).toBe('pending');
  });
});

describe('buildParityVerdict — ②の実描画突合(嘘の✅根治・v0.1.1025)', () => {
  const withSupporters = (supMirrorCount, ackSupporterRows) => {
    const i = okInput();
    i.publishSelfDiag.mirrors = { supporters: { present: true, count: supMirrorCount } };
    i.previewAck = { ready: true, ts: 1000, liveId: 'lv1', supporterRows: ackSupporterRows };
    return i;
  };
  it('①鏡に応援者ランキングがあるのに②が0件=pending(v0.1.1027: 誤検知回避で🔴でなく保留・嘘の✅も嘘の🔴も出さない)', () => {
    const v = buildParityVerdict(withSupporters(10, 0));
    expect(v.verdict).toBe('pending');
    expect(v.code).toBe('preview_supporters_pending');
    expect(v.reason).toContain('①鏡10件');
    expect(v.reason).toContain('未確認');
  });
  it('①鏡=10・②も10件描けている=ok', () => {
    expect(buildParityVerdict(withSupporters(10, 10)).verdict).toBe('ok');
  });
  it('①鏡に応援者ランキングが無い(count0)なら②0でも ok(突合しない)', () => {
    expect(buildParityVerdict(withSupporters(0, 0)).verdict).toBe('ok');
  });
  it('ack に supporterRows が無い旧形式でも①鏡0なら ok(後方互換)', () => {
    const i = okInput(); // mirrors 無し=supMirrorCount0
    expect(buildParityVerdict(i).verdict).toBe('ok');
  });
});

describe('judgeVenuePopulationParity — ④会場と①応援レーンの人数突合(v0.1.1050)', () => {
  it('会場未起動は pending(mismatch にしない=オプション面)', () => {
    const r = judgeVenuePopulationParity({ enabled: false, liveId: 'lv1', participantCount: 187 }, { identified: 56 }, 'lv1');
    expect(r.state).toBe('pending');
    expect(r.code).toBe('venue_off');
  });
  it('会場の liveId が空(旧スナップショット)は pending(嘘の🔴を出さない)', () => {
    const r = judgeVenuePopulationParity({ enabled: true, liveId: '', participantCount: 187 }, { identified: 56 }, 'lv1');
    expect(r.state).toBe('pending');
    expect(r.code).toBe('venue_other_live');
  });
  it('会場の liveId が別配信は pending', () => {
    const r = judgeVenuePopulationParity({ enabled: true, liveId: 'lvOLD', participantCount: 187 }, { identified: 56 }, 'lv1');
    expect(r.state).toBe('pending');
    expect(r.code).toBe('venue_other_live');
  });
  it('人数一致は match', () => {
    const r = judgeVenuePopulationParity({ enabled: true, liveId: 'lv1', participantCount: 100 }, { identified: 100 }, 'lv1');
    expect(r.state).toBe('match');
  });
  it('差が許容幅(5人)以内は explained(母集合差)', () => {
    const r = judgeVenuePopulationParity({ enabled: true, liveId: 'lv1', participantCount: 103 }, { identified: 100 }, 'lv1');
    expect(r.state).toBe('explained');
    expect(r.reason).toContain('母集合差');
  });
  it('差が許容超は mismatch(本物のズレ・POP56 vs 会場187 型)', () => {
    const r = judgeVenuePopulationParity({ enabled: true, liveId: 'lv1', participantCount: 187 }, { identified: 56 }, 'lv1');
    expect(r.state).toBe('mismatch');
    expect(r.reason).toContain('56');
    expect(r.reason).toContain('187');
  });
});

describe('buildParityVerdict — ④会場突合の統合(v0.1.1050)', () => {
  const withVenue = (venueParticipant, identified) => ({
    ...okInput(),
    venueSeatsDiag: { enabled: true, liveId: 'lv1', participantCount: venueParticipant, seatsShown: Math.min(venueParticipant, 48) },
    laneDiagCounts: { identified, laneShown: Math.min(identified, 48), limit: 48 }
  });
  it('①56 vs ④187 の大きなズレ=mismatch(今回の実機ケース)', () => {
    const v = buildParityVerdict(withVenue(187, 56));
    expect(v.verdict).toBe('mismatch');
    expect(v.code).toBe('venue_population_mismatch');
  });
  it('①100=④103(母集合差)=ok だが reason に意図差と件数を明記(嘘の緑を出さない)', () => {
    const v = buildParityVerdict(withVenue(103, 100));
    expect(v.verdict).toBe('ok');
    expect(v.code).toBe('ok_venue_explained');
    expect(v.reason).toContain('意図差');
  });
  it('会場未観測(venueSeatsDiag 無し)でも①②③が揃えば ok(会場は overall を劣化させない)', () => {
    const v = buildParityVerdict(okInput());
    expect(v.verdict).toBe('ok');
    expect(v.code).toBe('ok');
  });
});

describe('judgePreviewGenerationParity — ①②の世代同期(パリティ根本修正 v0.1.1056)', () => {
  it('鏡が旧形式(bundleGen未スタンプ)は pending(gen_unstamped)', () => {
    const r = judgePreviewGenerationParity({ ready: true, gen: 5 }, { liveId: 'lv1' }, 'lv1', 1000);
    expect(r.state).toBe('pending');
    expect(r.code).toBe('gen_unstamped');
  });
  it('ack が無い/gen を持たない旧形式は pending(gen_no_ack)', () => {
    const r = judgePreviewGenerationParity(null, { liveId: 'lv1', bundleGen: 5 }, 'lv1', 1000);
    expect(r.state).toBe('pending');
    expect(r.code).toBe('gen_no_ack');
  });
  it('ack が別配信は pending(gen_other_live)', () => {
    const r = judgePreviewGenerationParity(
      { ready: true, liveId: 'lv2', gen: 5, ts: 1000 },
      { liveId: 'lv1', bundleGen: 5 }, 'lv1', 1000
    );
    expect(r.state).toBe('pending');
    expect(r.code).toBe('gen_other_live');
  });
  it('ack が鮮度切れ(180秒超)は pending(gen_ack_stale)', () => {
    const r = judgePreviewGenerationParity(
      { ready: true, liveId: 'lv1', gen: 5, ts: 1000 },
      { liveId: 'lv1', bundleGen: 5 }, 'lv1', 1000 + 200_000
    );
    expect(r.state).toBe('pending');
    expect(r.code).toBe('gen_ack_stale');
  });
  it('世代が一致(差0-1)は match', () => {
    const r = judgePreviewGenerationParity(
      { ready: true, liveId: 'lv1', gen: 5, ts: 1000 },
      { liveId: 'lv1', bundleGen: 5 }, 'lv1', 1000
    );
    expect(r.state).toBe('match');
    expect(r.code).toBe('gen_match');
  });
  it('世代差がflight中の許容内(ack取得から時間経過)は lag(正常な追従中)', () => {
    // ackAgeMs=6000(6秒経過)→ toleratedDelta=1+ceil(6000/3000)=3。差2はmatch圏(<=1)を超えつつ
    //   許容内=①がack後さらに2回flush(3秒間隔)している間に②がまだ追いついていない正常な遅れ。
    const r = judgePreviewGenerationParity(
      { ready: true, liveId: 'lv1', gen: 5, ts: 1000 },
      { liveId: 'lv1', bundleGen: 7 }, 'lv1', 7000
    );
    expect(r.state).toBe('lag');
    expect(r.code).toBe('gen_lag');
  });
  it('世代差が許容を大きく超える(②が更新に追従できていない)は mismatch', () => {
    const r = judgePreviewGenerationParity(
      { ready: true, liveId: 'lv1', gen: 1, ts: 1000 },
      { liveId: 'lv1', bundleGen: 20 }, 'lv1', 1000
    );
    expect(r.state).toBe('mismatch');
    expect(r.code).toBe('gen_mismatch');
    expect(r.delta).toBe(19);
  });
});

describe('buildParityVerdict — 世代パリティの統合(パリティ根本修正 v0.1.1056)', () => {
  it('laneMirror 未指定(旧形式)は既存のok判定を劣化させない(後方互換)', () => {
    const v = buildParityVerdict(okInput());
    expect(v.verdict).toBe('ok');
  });
  it('世代mismatchは fail(preview_gen_mismatch)', () => {
    const i = { ...okInput(), laneMirror: { liveId: 'lv1', bundleGen: 20 } };
    i.previewAck = { ready: true, ts: 1000, liveId: 'lv1', gen: 1 };
    const v = buildParityVerdict(i);
    expect(v.verdict).toBe('mismatch');
    expect(v.code).toBe('preview_gen_mismatch');
  });
  it('世代が一致していれば ok のまま(既存判定と両立)', () => {
    const i = { ...okInput(), laneMirror: { liveId: 'lv1', bundleGen: 5 } };
    i.previewAck = { ready: true, ts: 1000, liveId: 'lv1', gen: 5 };
    const v = buildParityVerdict(i);
    expect(v.verdict).toBe('ok');
  });
});

/**
 * ★起動直後(数百ms)の値で「起動していない」と断定しない。
 *
 * ■ ★実機の速報(2026-08-21)がこれを示した
 *   popup 起動から **0.3秒後**のスナップショットに対して:
 *     🔴 不一致 — ①POPの応援レーン描画が起動していない(a)
 *   ところが**同じ速報**にこう出ていた:
 *     shadeAgeMs: 288 / shadeDone: false     ← ★まだ幕が出ている最中
 *     laneTickProbe.lastReason: 'doc-hidden' ← ★隠れているので走らせなかった(正しい動作)
 *     応援レーン(全段): ①POP 27 / ③WEB鏡 27 ✅一致 ← ★実際は27件出ている
 *   ＝ **レーンは動いている。0.3秒の瞬間を切り取っていただけ**。
 *
 * ■ ★同じ型は既に2回踏んでいる(これで3回目)
 *   - v0.1.1211: 362ms のスナップショットを「22秒経っても鏡が空」と読み違えた
 *   - v0.1.1303: 鏡がまだ読めていない時点の突合を🔴にしていた → pending へ
 *   ★どちらも「その場の1件」を直しただけで、**判定の入口に齢の門番を置かなかった**。
 *   → 50年後も同じ誤診が生えないよう、**起動直後は構造的に断定しない**ようにする。
 *
 * ■ ★なぜ pending(保留)なのか
 *   「異常なし(緑)」でもない。★**まだ測れていない**だけ。
 *   45リポから収穫した3値の規約(0=合格/1=赤/★2=測れなかった)と同じ考え。
 */
describe('★起動直後は「起動していない」と断定しない(誤診の根絶)', () => {
  /** 起動 N ミリ秒後のスナップショットを作る。 */
  const atBootAge = (ageMs) => ({
    ...okInput(),
    trust: {
      hasWatchTab: true,
      popup: {
        present: true, lidMatch: true, fresh: true,
        viewKind: 'popup',
        // ★起動からの経過。幕の齢がそのまま「起動して何ms経ったか」
        bootAgeMs: ageMs
      }
    },
    // ★レーンは「まだ一度も走っていない」状態(実機と同じ)
    laneRenderDiag: { started: 0, verdict: 'not_started' }
  });

  it('★★起動0.3秒では 🔴 にしない(保留にする)', () => {
    const v = buildParityVerdict(atBootAge(288));
    expect(v.verdict, '起動直後を不一致と断定している').not.toBe('mismatch');
    expect(v.verdict).toBe('pending');
  });

  it('★保留の理由が「起動直後」だと分かる(読んだ人が誤解しない)', () => {
    const v = buildParityVerdict(atBootAge(288));
    expect(v.reason).toMatch(/起動直後|起動して/);
    expect(v.code).toBe('popup_just_booted');
  });

  it('★★十分に時間が経っていれば従来どおり 🔴 を出す(見逃さない)', () => {
    /*
     * ★これが要。「起動直後だから」で全部保留にすると、
     *   本物の「起動していない」を見逃す装置になる。
     */
    const v = buildParityVerdict(atBootAge(30_000));
    expect(v.verdict, '本物の異常まで保留にしている').toBe('mismatch');
    expect(v.code).toBe('pop_lane_not_started');
  });

  it('★齢が分からないときは従来どおり(挙動を勝手に変えない)', () => {
    const v = buildParityVerdict(atBootAge(null));
    expect(v.verdict).toBe('mismatch');
  });
});

/**
 * ★判定を作っただけで配線しない「片肺」を作らない
 *   ([[unwired-judgement-is-systemic-2026-08-12]])。
 *
 * ★2026-08-21 の実機では、齢を出す仕組み(v0.1.1391)が**既にあったのに**
 *   パリティ判定はそれを見ていなかった(grep 0件)。
 *   ＝「注記は出るが、判定は変わらない」片肺だった。
 */
describe('★起動直後の門番が【配線されている】', () => {
  it('★trust が bootAgeMs を渡している(渡さないと門番が永久に効かない)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..');
    const src = fs.readFileSync(path.join(root, 'src/lib/diagnosticsTrust.js'), 'utf8');
    expect(src, 'trust.popup に bootAgeMs が無い').toContain('bootAgeMs:');
    expect(src, '起動時刻(popupBootAtIso)を見ていない').toContain('popupBootAtIso');
  });

  it('★しきい値が正本に1つだけある(散らさない)', async () => {
    const mod = await import('./parityVerdict.js');
    expect(typeof mod.PARITY_BOOT_SETTLE_MS).toBe('number');
    // ★幕の最低表示(800ms)より長く、見逃しを生むほど長くない
    expect(mod.PARITY_BOOT_SETTLE_MS).toBeGreaterThan(800);
    expect(mod.PARITY_BOOT_SETTLE_MS).toBeLessThanOrEqual(10_000);
  });
});
