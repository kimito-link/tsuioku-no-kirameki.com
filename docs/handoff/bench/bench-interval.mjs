import { computeLivePersistIntervalMs } from '../../../src/lib/livePersistInterval.js';

console.log('保存コアレッサの最小間隔 = 即時プッシュが送られる間隔の下限');
console.log('(pushInstantCommentRowsToInlineIframe は persistCommentRows の中で呼ばれる)\n');
for (const count of [1000, 5000, 10000, 20000, 50000]) {
  for (const hidden of [false, true]) {
    const ms = computeLivePersistIntervalMs({ storedCount: count, hidden });
    console.log(
      `  件数=${String(count).padStart(6)} ${hidden ? '裏タブ' : '前面  '} → ${String(ms).padStart(7)}ms` +
        (ms >= 40000 ? '   ★47秒級の遅延が説明できる' : '')
    );
  }
}
