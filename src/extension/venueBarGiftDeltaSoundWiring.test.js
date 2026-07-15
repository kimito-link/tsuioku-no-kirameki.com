import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// v0.1.1095: デルタ補完ギフト(handleGiftPointsAggregate・v0.1.1090)の効果音配線漏れ修正の
//   回帰テスト。venueBar.js は DOM(document/window/chrome.storage)に強く依存し jsdom 環境も
//   使っていない(vitest.config環境=node)ため、mountVenueBarButton をインポートして実行する
//   ユニットテストは組めない。その代わり、ソースコードをテキストとして解析し、
//   「本物経路(handleNewGiftEvents)とデルタ経路(handleGiftPointsAggregate)が同型の
//   launchGiftThrow→scheduleGiftSound 配線になっているか」を構造的に固定する。
//   実配信2回で「検知1→演出1✅→音0(off/guarded/noPath/error/coalescedいずれも0)」が観測され、
//   デルタ経路だけ launchGiftThrow の戻り値を見ずに giftThrown を無条件加算し scheduleGiftSound を
//   無条件で呼ぶ非対称な配線になっていた(本物経路は launchGiftThrow===true の時だけ)。

const venueBarPath = join(dirname(fileURLToPath(import.meta.url)), 'venueBar.js');
const src = readFileSync(venueBarPath, 'utf8');

/** 関数本体をブレース対応で抜き出す簡易パーサ(テスト専用・厳密なJSパースはしない)。 */
function extractFunctionBody(source, startMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`marker not found: ${startMarker}`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces for: ${startMarker}`);
}

describe('v0.1.1095: デルタ補完ギフトの scheduleGiftSound 配線(handleGiftPointsAggregate)', () => {
  const deltaFn = extractFunctionBody(src, 'const handleGiftPointsAggregate = (aggregatePoints)');
  // maybeThrowGiftFromSpeech(コメント本文パース経路)が「launchGiftThrow の戻り値(実際に
  //   投げたか)を見てからカウントする」模範実装(v0.1.1057)。handleNewGiftEvents(NDGR構造化
  //   event経路)はv0.1.1095時点ではこのゲートを欠いたまま残っていたが、v0.1.1156で
  //   実際に「検知1→演出1✅→音0」の実害が確認され模範側へ揃えた(下のdescribeブロック参照)。
  const referenceFn = extractFunctionBody(src, 'const maybeThrowGiftFromSpeech = (speech)');

  it('handleGiftPointsAggregate は launchGiftThrow を呼ぶ', () => {
    expect(deltaFn).toContain("launchGiftThrow('', proj, _detectAt)");
  });

  it('handleGiftPointsAggregate は launchGiftThrow の戻り値をゲートにしてから scheduleGiftSound を呼ぶ(v0.1.1057の模範実装と同型)', () => {
    // 模範実装(maybeThrowGiftFromSpeech)の型: if (launchGiftThrow(...)) { giftThrown+=1; scheduleGiftSound(...) }
    expect(referenceFn).toMatch(/if \(launchGiftThrow\([^)]*\)\) \{[\s\S]*?giftThrown \+= 1;[\s\S]*?scheduleGiftSound\(/);
    // デルタ経路も同じ型でなければならない(v0.1.1095で無条件呼びから修正)。
    expect(deltaFn).toMatch(/if \(launchGiftThrow\([^)]*\)\) \{[\s\S]*?giftThrown \+= 1;[\s\S]*?scheduleGiftSound\(/);
  });

  it('handleGiftPointsAggregate は scheduleGiftSound の呼び出しを try/catch で保護し、例外時も giftSoundError を計上する', () => {
    expect(deltaFn).toMatch(/try \{[\s\S]*scheduleGiftSound\([\s\S]*\} catch \{[\s\S]*giftSoundError \+= 1;[\s\S]*\}/);
  });

  it('handleGiftPointsAggregate は例外を飲み込んでも publishGiftEffectDiag を呼び続ける(1件ごとの異常でループを壊さない)', () => {
    const publishCount = (deltaFn.match(/publishGiftEffectDiag\(\)/g) || []).length;
    expect(publishCount).toBeGreaterThanOrEqual(1);
    // catch ブロックの後にも publishGiftEffectDiag() が到達すること(tryの外側=必ず実行される)。
    expect(deltaFn).toMatch(/\} catch \{[\s\S]*?\}\s*publishGiftEffectDiag\(\);/);
  });

  it('scheduleGiftSound(venueBar.js)は off/guarded/no-path/error/coalesced の全戻り値をカウンタへ計上する(v0.1.1091の不変条件が壊れていない)', () => {
    const scheduleFn = extractFunctionBody(src, 'const scheduleGiftSound = (tier, _flightMs, detectAt)');
    expect(scheduleFn).toContain('giftSoundOff += 1');
    expect(scheduleFn).toContain("_giftEffectDiagCounters[field] += 1"); // guarded/no-path/error
    expect(scheduleFn).toContain('giftSoundError += 1');
    expect(scheduleFn).toContain("return 'coalesced'");
  });
});

describe('v0.1.1156: NDGR構造化event経路(handleNewGiftEvents)の非対称是正+pagehideタイマー回収', () => {
  // 実配信2回で「検知1→演出1✅→音0(内訳全部ゼロ)」が観測された。真因は2つ:
  //   (1) handleNewGiftEvents が launchGiftThrow の戻り値を見ずに giftThrown を無条件加算していた
  //       (maybeThrowGiftFromSpeech/handleGiftPointsAggregateは既にゲート済みだった非対称)。
  //   (2) scheduleGiftSound が予約する setTimeout(0) は、コールバック発火前にタブ/ウィンドウが
  //       閉じられるとタイマーごと消え、giftSoundPlayed/Coalesced/Guarded/NoPath/Error/Off の
  //       どれにも計上されないまま音だけ失われる(pagehideで保留タイマーを回収する経路が無かった)。
  const eventsFn = extractFunctionBody(src, 'const handleNewGiftEvents = (events)');
  const referenceFn = extractFunctionBody(src, 'const maybeThrowGiftFromSpeech = (speech)');

  it('handleNewGiftEvents は launchGiftThrow の戻り値をゲートにしてから giftThrown を加算し scheduleGiftSound を呼ぶ(模範実装と同型)', () => {
    expect(referenceFn).toMatch(/if \(launchGiftThrow\([^)]*\)\) \{[\s\S]*?giftThrown \+= 1;[\s\S]*?scheduleGiftSound\(/);
    expect(eventsFn).toMatch(/if \(launchGiftThrow\([^)]*\)\) \{[\s\S]*?giftThrown \+= 1;[\s\S]*?scheduleGiftSound\(/);
  });

  it('scheduleGiftSound は保留中の1本を再実行できる関数(run)を _pendingGiftSound に保持する', () => {
    const scheduleFn = extractFunctionBody(src, 'const scheduleGiftSound = (tier, _flightMs, detectAt)');
    expect(scheduleFn).toMatch(/const runPendingGiftSound = \(\) => \{/);
    expect(scheduleFn).toContain('pending.run = runPendingGiftSound');
  });

  it('mountVenueBarButton は pagehide 時に保留中のギフト音を強制フラッシュし、内訳ゼロで音が消えることを防ぐ', () => {
    expect(src).toMatch(
      /window\.addEventListener\(\s*'pagehide',\s*\(\) => \{\s*if \(_pendingGiftSound && _pendingGiftSound\.run\) \{\s*window\.clearTimeout\(_pendingGiftSound\.timer\);\s*_pendingGiftSound\.run\(\);\s*\}\s*\},\s*\{ once: true \}\s*\);/
    );
  });
});

describe('v0.1.1156追補: publishGiftEffectDiagの3秒min-gapが音カウンタ反映を握りつぶす競合の是正', () => {
  // v0.1.1156の2点(上のdescribe参照)を適用したのに実配信で「検知1→演出1✅→音0(内訳全ゼロ)」が
  //   624秒経っても解消せず再発した。真因は別にあった: 1件のギフト処理でpublishGiftEffectDiagは
  //   最低2回呼ばれる(演出直後=giftThrown加算済み・音カウンタはまだ0/setTimeoutコールバック内=
  //   音カウンタ加算後)。この2回は数msしか離れておらず、2回目は必ず3秒min-gapに弾かれてstorageへ
  //   届かない。その後は同じ配信で他のギフト系イベントが来るまでpublishの機会が無く、「演出✅・
  //   音0」の中間状態が半永久的に残る=音は実際には鳴っているのに診断表示だけが嘘をつき続ける。
  const publishFn = extractFunctionBody(src, 'const publishGiftEffectDiag = ()');

  it('publishGiftEffectDiag はmin-gapで弾いた書き込みを "dirty" として記録する(取りこぼしを覚えておく)', () => {
    expect(publishFn).toMatch(/_giftEffectDiagDirty = true/);
  });

  it('publishGiftEffectDiag はmin-gap明け直後に1回だけ追いpublishするタイマーを予約する(多重予約しない)', () => {
    expect(publishFn).toMatch(/if \(!_giftEffectDiagFlushTimer\) \{/);
    expect(publishFn).toContain('_giftEffectDiagFlushTimer = window.setTimeout(');
    expect(publishFn).toMatch(/3000 - elapsed/);
  });

  it('追いpublishタイマーは dirty がまだ立っている場合だけ実際に書き込む(不要な二重書き込みを避ける)', () => {
    expect(publishFn).toMatch(/if \(_giftEffectDiagDirty\) writeGiftEffectDiagSnapshot\(Date\.now\(\)\);/);
  });

  it('実際のstorage書き込みはwriteGiftEffectDiagSnapshotの1箇所に集約されている(min-gap通過時・追いpublish時とも同じ経路)', () => {
    const writeFn = extractFunctionBody(src, 'const writeGiftEffectDiagSnapshot = (now)');
    expect(writeFn).toContain('_giftEffectDiagDirty = false');
    expect(writeFn).toContain('chrome.storage.local.set({ [KEY_GIFT_EFFECT_DIAG]: snap })');
    expect(publishFn).toContain('writeGiftEffectDiagSnapshot(now);');
  });
});
