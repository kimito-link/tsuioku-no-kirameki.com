#!/usr/bin/env node
// check-root-cause-claim.mjs — コミットメッセージの「根治」語を検査する。
//
// なぜ要るか(2026-08-04・docs/handoff/ROOT-CAUSE-CLAIM-RULE.md):
//   90日で164回「根治」を宣言しながら、同じ症状が41回再発している。
//   規則を文書に書くだけでは注意力頼みになり、必ず破られる(実際、
//   「推測で直す前に測る」という規律は既にあったのに守れていなかった)。
//   なので機械に見張らせる。
//
// 何をするか:
//   コミットメッセージに「根治」等が含まれ、かつ実機確認の根拠が
//   書かれていなければ、エラーにして書き直させる。
//
// 根拠として認めるもの(いずれか1つ):
//   ・「実機確認済み」の明記
//   ・実測値の引用(数字+単位、または before→after の記載)
//   ・「未確認」と自ら明記している(=根治を名乗っていない扱い)
//
// 使い方:
//   node scripts/check-root-cause-claim.mjs <commit-msg-file>
//   node scripts/check-root-cause-claim.mjs --last   (直近コミットを検査)

import fs from 'node:fs';
import { execSync } from 'node:child_process';

/** 「根治した」と主張する語。これがあると検査対象になる。 */
const CLAIM_WORDS = ['根治', '真因を特定', '完全に直', '解決しました', '直りました'];

/**
 * 実機確認の根拠として認める語。
 *
 * ★重要(2026-08-04 に自分で踏んだ): 「実測値を引用している」だけでは足りない。
 *   今日の私のコミット2つは修正【前】の実測を引用していたので、素朴な検査では
 *   両方とも通ってしまった。しかし修正【後】に症状が消えたことは未確認だった。
 *   よって認めるのは「修正後に症状が消えたことを示す語」だけに絞る。
 */
const EVIDENCE_WORDS = [
  '症状消失', '症状が消え', '再発しない', '修正後の実測', '適用後の実測',
  '反映後に確認', '実機で確認済み', '実機確認済み'
];

/** 未確認を自ら明示していれば、根治の主張とみなさない。 */
const HEDGE_WORDS = ['未確認', '効くはず', '仮説', '見込み', '検証待ち', '要確認'];

function readMessage() {
  const arg = process.argv[2];
  if (!arg || arg === '--last') {
    return execSync('git log -1 --pretty=%B', { encoding: 'utf8' });
  }
  return fs.readFileSync(arg, 'utf8');
}

function main() {
  let msg = '';
  try {
    msg = readMessage();
  } catch (e) {
    console.error('[root-cause-claim] メッセージを読めませんでした:', e.message);
    process.exit(0); // 読めないだけで出荷を止めない
    return;
  }

  // コメント行(#)を除く
  const body = msg
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n');

  const claimed = CLAIM_WORDS.filter((w) => body.includes(w));
  if (claimed.length === 0) {
    console.log('[root-cause-claim] OK(「根治」を名乗っていません)');
    return;
  }

  const hedged = HEDGE_WORDS.filter((w) => body.includes(w));
  if (hedged.length > 0) {
    console.log(
      `[root-cause-claim] OK(「${claimed[0]}」を含みますが「${hedged[0]}」と併記=未確認と明示)`
    );
    return;
  }

  const evidence = EVIDENCE_WORDS.filter((w) => body.includes(w));

  // ★数字の引用【だけ】では通さない。修正前の実測でも数字は書けるので、
  //   「原因を数字で説明した」と「直ったことを数字で確かめた」は別物である。
  //   2026-08-04 の私のコミット2つは前者だけで「根治」を名乗っていた。
  if (evidence.length > 0) {
    console.log(`[root-cause-claim] OK(「${claimed[0]}」+ 根拠あり: ${evidence[0]})`);
    return;
  }

  console.error('');
  console.error('='.repeat(64));
  console.error('[root-cause-claim] ✗ 「' + claimed[0] + '」と書いていますが、根拠がありません。');
  console.error('='.repeat(64));
  console.error('');
  console.error('  正本: docs/handoff/ROOT-CAUSE-CLAIM-RULE.md');
  console.error('');
  console.error('  「根治」を名乗ってよいのは次の3つが揃ったときだけです:');
  console.error('    1. 実機で動いている版数が期待版と一致している');
  console.error('    2. 修正前に異常だった計器値が正常域に入った');
  console.error('    3. その値が「今の値」である(化石値でない)');
  console.error('');
  console.error('  まだ確認していないなら、次のどれかに書き換えてください:');
  console.error('    「効くはず(未確認)」 / 「仮説」 / 「計測できるようにした」');
  console.error('');
  console.error('  確認済みなら、実測値を本文に書いてください。例:');
  console.error('    実機実測: 描画 77回/件 → 1.2回/件・症状消失を確認');
  console.error('');
  process.exit(1);
}

main();
