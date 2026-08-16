import { userLaneCandidatesFromStorage } from '../../../src/lib/userLaneCandidatesFromStorage.js';

const liveId = 'lv350805294';
function makeRows(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      liveId,
      userId: String(1000 + (i % 800)),
      commentNo: String(i + 1),
      text: 'コメント' + i,
      capturedAt: 1700000000000 + i * 100,
      avatarUrl: '',
      avatarObserved: false
    });
  }
  return rows;
}

console.log('userLaneCandidatesFromStorage: 1回の所要(=即時プッシュ1バッチごとに走る)');
for (const n of [1000, 5000, 20000, 50000, 100000]) {
  const rows = makeRows(n);
  userLaneCandidatesFromStorage(rows, liveId, {
    broadcasterUid: '999',
    broadcasterIconUrl: 'x',
    requireText: true
  }); // warm
  const t0 = performance.now();
  const runs = 3;
  for (let i = 0; i < runs; i++) {
    userLaneCandidatesFromStorage(rows, liveId, {
      broadcasterUid: '999',
      broadcasterIconUrl: 'x',
      requireText: true
    });
  }
  const one = (performance.now() - t0) / runs;
  console.log(
    `  rows=${String(n).padStart(6)}  1回=${one.toFixed(1)}ms` +
      `  → 1秒に2バッチ来るなら ${((one * 2) / 1000).toFixed(2)}秒/秒 (1.0超=詰む)`
  );
}
