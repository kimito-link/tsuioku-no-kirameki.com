// sidepanel.js — YouTube Live 3レーン・通貨別応援者ランキング・読み上げ設定の表示バンドル
/* eslint-disable */
(() => {
  // src/lib/htmlText.js
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function safeHttpUrl(v) {
    const s = String(v == null ? "" : v).trim();
    return /^https?:\/\//i.test(s) ? s : "";
  }
  function formatNumberJa(n) {
    const v = Number(n);
    return (Number.isFinite(v) ? v : 0).toLocaleString("ja-JP");
  }

  // src/lib/anonymousIdenticon.js
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  var LINE = "#332a26";
  var SKIN_TONES = ["#ffeede", "#ffe6cf", "#fdf0e4", "#f8dfc8"];
  var HAIR_COLORS = [
    ["#f29b38", "#ffc97e"],
    ["#3a3534", "#6b6360"],
    ["#8a5a2b", "#c08c50"],
    ["#e88bb1", "#ffc3da"],
    ["#5b87c5", "#9cc0ea"],
    ["#7aa45a", "#b4d59a"],
    ["#e9c25a", "#ffe6a0"],
    ["#d4543a", "#f59679"],
    ["#8d6bb0", "#c4a8e0"],
    ["#8f8f8f", "#c9c9c9"],
    ["#4ba596", "#92d5c9"],
    ["#a4683f", "#d49a6e"]
  ];
  var EYES = [
    // ぱっちり（白目+2色虹彩+ハイライト2つ）
    (iris, irisDark) => `<ellipse cx="23.5" cy="37" rx="5" ry="6.6" fill="#fff" stroke="${LINE}" stroke-width="2.2"/><ellipse cx="40.5" cy="37" rx="5" ry="6.6" fill="#fff" stroke="${LINE}" stroke-width="2.2"/><ellipse cx="23.5" cy="38" rx="3.2" ry="4.4" fill="${irisDark}"/><ellipse cx="40.5" cy="38" rx="3.2" ry="4.4" fill="${irisDark}"/><ellipse cx="23.5" cy="39.2" rx="2" ry="2.6" fill="${iris}"/><ellipse cx="40.5" cy="39.2" rx="2" ry="2.6" fill="${iris}"/><circle cx="22" cy="35.4" r="1.6" fill="#fff"/><circle cx="39" cy="35.4" r="1.6" fill="#fff"/><circle cx="25.2" cy="40.2" r="0.8" fill="#fff" opacity="0.9"/><circle cx="42.2" cy="40.2" r="0.8" fill="#fff" opacity="0.9"/>`,
    // にこにこ閉じ目（∩・太線）
    () => `<path d="M18.5 38 q5 -6.5 10 0" stroke="${LINE}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M35.5 38 q5 -6.5 10 0" stroke="${LINE}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    // ジト目（まぶた直線+下半分の虹彩）
    (iris, irisDark) => `<path d="M18.5 35 l10 0" stroke="${LINE}" stroke-width="2.8" stroke-linecap="round"/><path d="M35.5 35 l10 0" stroke="${LINE}" stroke-width="2.8" stroke-linecap="round"/><path d="M20.5 35.8 a3.6 4 0 0 0 7.2 0 z" fill="${irisDark}"/><path d="M37.5 35.8 a3.6 4 0 0 0 7.2 0 z" fill="${irisDark}"/><path d="M22 35.8 a2 2.2 0 0 0 4 0 z" fill="${iris}"/><path d="M39 35.8 a2 2.2 0 0 0 4 0 z" fill="${iris}"/>`
  ];
  var MOUTHS = [
    () => `<path d="M27.5 46.5 q2.3 2.6 4.5 0 q2.2 2.6 4.5 0" stroke="${LINE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    () => `<path d="M27 46 a5 4.6 0 0 0 10 0 z" fill="#9e3a30" stroke="${LINE}" stroke-width="1.8"/><path d="M29.5 49.2 a2.6 1.8 0 0 1 5 0 z" fill="#e9756a"/>`,
    () => `<path d="M27 46 q5 4.4 10 0" stroke="${LINE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
  ];
  var HAIRS = [
    // ボブ+ぱっつんギザ（りんく系）
    (c, hi) => `<path d="M8 44 q-2 -26 24 -28 q26 2 24 28 l-5 3 q3 -8 1 -14 l-3 6 -3 -8 -4 6 -4 -8 -3 7 -4 -7 -4 8 -4 -6 -3 8 -3 -6 q-2 6 1 14 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 24 q8 -7 18 -7 q10 0 18 7 q-8 -3 -18 -3 q-10 0 -18 3 z" fill="${hi}" opacity="0.85"/>`,
    // 外はねショート（こんた系）
    (c, hi) => `<path d="M9 42 q-7 -4 -3 -10 q-6 -2 0 -8 q2 -12 26 -12 q24 0 26 12 q6 6 0 8 q4 6 -3 10 l-4 1 q2 -6 0 -10 l-4 5 -3 -9 -5 6 -5 -9 -4 8 -5 -7 -4 9 -4 -5 q-2 4 0 10 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M15 22 q8 -6 17 -6 q9 0 17 6 q-8 -2.5 -17 -2.5 q-9 0 -17 2.5 z" fill="${hi}" opacity="0.85"/>`,
    // ロング風（たぬ姉系・髪が顔の横を流れ落ちる）
    (c, hi) => `<path d="M10 58 q-4 -18 -2 -30 q4 -14 24 -14 q20 0 24 14 q2 12 -2 30 l-6 -2 q3 -12 2 -22 l-4 6 -3 -9 -5 6 -4 -9 -4 8 -5 -7 -4 8 -4 -5 q-1 10 2 22 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M15 23 q8 -6 17 -6 q9 0 17 6 q-8 -2.5 -17 -2.5 q-9 0 -17 2.5 z" fill="${hi}" opacity="0.85"/>`,
    // ふんわりマッシュ
    (c, hi) => `<path d="M8 40 q-2 -25 24 -25 q26 0 24 25 q-1 5 -5 6 q2 -5 1 -9 l-4 5 -3 -7 -5 5 -4 -7 -4 6 -4 -6 -4 7 -5 -5 -3 7 -4 -5 q-1 4 1 9 q-4 -1 -5 -6 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 24 q9 -6.5 18 -6.5 q9 0 18 6.5 q-9 -3 -18 -3 q-9 0 -18 3 z" fill="${hi}" opacity="0.85"/>`
  ];
  var ACCENTS = [
    (c) => `<path d="M32 16 q-2 -8 4 -11 q-1 5 1 7 q3 -3 7 -2 q-5 2 -6 7 z" fill="${c}" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>`,
    (c) => `<path d="M13 26 q-3 -12 3 -16 q6 3 7 13 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M51 26 q3 -12 -3 -16 q-6 3 -7 13 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M15.5 24 q-1.5 -7 1.5 -10 q3 2 4 8 z" fill="#fff" opacity="0.75"/><path d="M48.5 24 q1.5 -7 -1.5 -10 q-3 2 -4 8 z" fill="#fff" opacity="0.75"/>`,
    () => ""
  ];
  function shade(hex, f) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return "#5a4636";
    const c = (x) => Math.max(0, Math.min(255, Math.floor(parseInt(x, 16) * f)));
    return `rgb(${c(m[1])},${c(m[2])},${c(m[3])})`;
  }
  var IDENTICON_CACHE_MAX = 2e3;
  var identiconCache = /* @__PURE__ */ new Map();
  function anonymousIdenticonDataUrl(userId, sizePx = 64) {
    const s = String(userId || "").trim();
    if (!s) return "";
    const n = Math.max(16, Math.min(128, Number(sizePx) || 64));
    const cacheKey = `${n}|${s}`;
    const hit = identiconCache.get(cacheKey);
    if (hit !== void 0) {
      identiconCache.delete(cacheKey);
      identiconCache.set(cacheKey, hit);
      return hit;
    }
    const h = hashString(s);
    const hue = (h >>> 15) % 360;
    const bg = `hsl(${hue},55%,90%)`;
    const skin = SKIN_TONES[h % SKIN_TONES.length];
    const [hairC, hairHi] = HAIR_COLORS[(h >>> 3) % HAIR_COLORS.length];
    const iris = shade(hairC, 0.9);
    const irisDark = shade(hairC, 0.45);
    const eyes = EYES[(h >>> 7) % EYES.length];
    const mouth = MOUTHS[(h >>> 10) % MOUTHS.length];
    const hairShape = HAIRS[(h >>> 12) % HAIRS.length];
    const accent = ACCENTS[(h >>> 21) % ACCENTS.length];
    const blushStrong = (h >>> 20 & 1) === 1;
    const blush = `<ellipse cx="17" cy="44" rx="4.4" ry="2.6" fill="#ff9d9d" opacity="${blushStrong ? 0.8 : 0.45}"/><ellipse cx="47" cy="44" rx="4.4" ry="2.6" fill="#ff9d9d" opacity="${blushStrong ? 0.8 : 0.45}"/>`;
    const k = n / 64;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"><rect width="100%" height="100%" fill="${bg}"/><g transform="scale(${k})">` + accent(hairC) + `<path d="M13 38 a19 19 0 1 0 38 0 a19 21 0 0 0 -38 0 z" fill="${skin}" stroke="${LINE}" stroke-width="2.2"/>` + hairShape(hairC, hairHi) + blush + eyes(iris, irisDark) + mouth() + `</g></svg>`;
    const out = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    identiconCache.set(cacheKey, out);
    while (identiconCache.size > IDENTICON_CACHE_MAX) {
      const oldest = identiconCache.keys().next().value;
      if (oldest === void 0) break;
      identiconCache.delete(oldest);
    }
    return out;
  }

  // src/lib/voiceStyleLevelTable.js
  var VOICE_STYLE_LEVEL_TABLE = Object.freeze({
    "0": [0.084, 0.456],
    "1": [0.064, 0.432],
    "2": [0.075, 0.447],
    "3": [0.063, 0.53],
    "4": [0.086, 0.558],
    "5": [0.066, 0.469],
    "6": [0.066, 0.411],
    "7": [0.067, 0.466],
    "8": [0.08, 0.419],
    "9": [0.085, 0.375],
    "10": [0.071, 0.405],
    "11": [0.07, 0.584],
    "12": [0.074, 0.469],
    "13": [0.078, 0.456],
    "14": [0.078, 0.258],
    "15": [0.069, 0.458],
    "16": [0.082, 0.364],
    "17": [0.073, 0.437],
    "18": [0.073, 0.46],
    "19": [0.039, 0.546],
    "20": [0.08, 0.514],
    "21": [0.075, 0.677],
    "22": [0.053, 0.457],
    "23": [0.086, 0.417],
    "24": [0.074, 0.408],
    "25": [0.097, 0.363],
    "26": [0.067, 0.465],
    "27": [0.085, 0.327],
    "28": [0.065, 0.367],
    "29": [0.098, 0.645],
    "30": [0.1, 0.598],
    "31": [0.101, 0.409],
    "32": [0.074, 0.437],
    "33": [0.076, 0.422],
    "34": [0.072, 0.472],
    "35": [0.056, 0.252],
    "36": [0.06, 0.551],
    "37": [0.087, 0.37],
    "38": [0.1, 0.364],
    "39": [0.08, 0.542],
    "40": [0.073, 0.641],
    "41": [0.09, 0.578],
    "42": [0.081, 0.783],
    "43": [0.091, 0.41],
    "44": [0.088, 0.441],
    "45": [0.081, 0.294],
    "46": [0.084, 0.393],
    "47": [0.073, 0.387],
    "48": [0.089, 0.374],
    "49": [0.089, 0.361],
    "50": [0.07, 0.641],
    "51": [0.082, 0.489],
    "52": [0.089, 0.538],
    "53": [0.091, 0.497],
    "54": [0.067, 0.438],
    "55": [0.098, 0.508],
    "56": [0.098, 0.443],
    "57": [0.099, 0.472],
    "58": [0.084, 0.531],
    "59": [0.101, 0.46],
    "60": [0.114, 0.423],
    "61": [0.072, 0.354],
    "62": [0.092, 0.377],
    "63": [0.096, 0.375],
    "64": [0.094, 0.323],
    "65": [0.084, 0.381],
    "66": [0.085, 0.56],
    "67": [0.097, 0.396],
    "68": [0.077, 0.446],
    "69": [0.081, 0.592],
    "70": [0.072, 0.429],
    "71": [0.055, 0.569],
    "72": [0.073, 0.388],
    "73": [0.091, 0.488],
    "74": [0.086, 0.521],
    "75": [0.059, 0.321],
    "76": [0.055, 0.358],
    "77": [0.083, 0.465],
    "78": [0.075, 0.406],
    "79": [0.08, 0.341],
    "80": [0.093, 0.4],
    "81": [0.082, 0.338],
    "82": [0.084, 0.353],
    "83": [0.082, 0.372],
    "84": [0.095, 0.353],
    "85": [0.083, 0.442],
    "86": [0.058, 0.489],
    "87": [0.074, 0.416],
    "88": [0.09, 0.381],
    "89": [0.101, 0.46],
    "90": [0.074, 0.492],
    "91": [0.08, 0.391],
    "92": [0.071, 0.505],
    "93": [0.074, 0.546],
    "94": [0.084, 0.408],
    "95": [0.072, 0.472],
    "96": [0.091, 0.345],
    "97": [0.062, 0.42],
    "98": [0.052, 0.391],
    "99": [0.1, 0.538],
    "100": [0.077, 0.5],
    "101": [0.093, 0.594],
    "102": [0.09, 0.323],
    "103": [0.076, 0.316],
    "104": [0.095, 0.369],
    "105": [0.106, 0.46],
    "106": [0.088, 0.355],
    "107": [0.081, 0.395],
    "108": [0.081, 0.383],
    "109": [0.075, 0.394],
    "110": [0.078, 0.52],
    "111": [0.079, 0.457],
    "112": [0.059, 0.41],
    "113": [0.079, 0.419],
    "114": [0.071, 0.443],
    "115": [0.081, 0.413],
    "116": [0.073, 0.357],
    "117": [0.054, 0.509],
    "118": [0.102, 0.337],
    "119": [0.098, 0.453],
    "120": [0.101, 0.372],
    "121": [0.106, 0.402],
    "122": [0.088, 0.327],
    "123": [0.082, 0.404],
    "124": [0.089, 0.377],
    "125": [0.077, 0.424],
    "126": [0.061, 0.314]
  });
  var VOICE_PITCH_OFFSET_GRID = Object.freeze([-0.06, -0.03, 0, 0.03, 0.06]);
  var VOICE_STYLE_PITCH_RMS_FACTOR = Object.freeze({
    "0": [0.95, 1, 1.13, 1.16],
    "1": [0.63, 0.82, 1.08, 1.03],
    "2": [0.82, 0.93, 1.09, 1.18],
    "3": [0.63, 0.83, 1.28, 1.32],
    "4": [0.98, 1.01, 0.97, 0.95],
    "5": [0.63, 0.83, 0.99, 0.97],
    "6": [0.74, 0.85, 1.01, 1.15],
    "7": [0.67, 0.87, 1.1, 0.93],
    "8": [0.74, 0.87, 0.95, 0.91],
    "9": [0.69, 0.82, 1.18, 1.27],
    "10": [0.71, 0.88, 1.01, 1.04],
    "11": [0.81, 0.93, 1.14, 1.33],
    "12": [0.81, 0.91, 1.09, 1.26],
    "13": [0.8, 0.89, 1.05, 1.09],
    "14": [0.83, 0.94, 0.97, 1.06],
    "15": [0.98, 1.08, 1, 1.08],
    "16": [0.75, 0.88, 1.12, 1.19],
    "17": [0.81, 0.9, 0.99, 0.93],
    "18": [0.77, 0.87, 1.03, 1],
    "19": [1, 1, 1, 1],
    "20": [0.84, 0.91, 1.01, 1.01],
    "21": [0.83, 0.86, 1.18, 1.32],
    "22": [1, 1, 1, 1],
    "23": [1.01, 1.01, 1.02, 1.12],
    "24": [0.72, 0.88, 1.03, 1.06],
    "25": [0.52, 0.77, 1.17, 1.4],
    "26": [0.82, 0.88, 1.1, 1.12],
    "27": [0.75, 0.85, 1.21, 1.33],
    "28": [0.85, 0.94, 1.03, 1.09],
    "29": [0.78, 0.92, 1.05, 1.12],
    "30": [0.72, 0.87, 1.04, 1.07],
    "31": [0.8, 0.92, 1.01, 0.99],
    "32": [0.85, 0.92, 1.19, 1.19],
    "33": [0.84, 0.84, 1.07, 1.16],
    "34": [0.74, 0.88, 1.1, 1.15],
    "35": [0.85, 0.97, 1.1, 0.74],
    "36": [1, 1, 1, 1],
    "37": [0.69, 0.88, 1.19, 1.23],
    "38": [0.72, 0.79, 0.97, 0.7],
    "39": [0.88, 0.93, 1.09, 1.26],
    "40": [0.8, 0.91, 1.09, 1.19],
    "41": [0.89, 0.92, 1.05, 1.05],
    "42": [1.01, 0.99, 1.15, 1.3],
    "43": [0.69, 0.82, 1, 0.98],
    "44": [0.59, 0.74, 1.28, 1.64],
    "45": [0.59, 0.77, 1.19, 1.19],
    "46": [0.86, 0.92, 0.99, 0.87],
    "47": [0.76, 0.91, 1.24, 1.38],
    "48": [0.95, 0.98, 1, 0.99],
    "49": [1.14, 0.98, 1.01, 0.9],
    "50": [1, 1, 1, 1],
    "51": [0.95, 1.01, 1.06, 1.07],
    "52": [0.72, 0.87, 1.09, 1.13],
    "53": [0.94, 0.98, 1.05, 1.08],
    "54": [0.69, 0.88, 1.08, 1.02],
    "55": [0.96, 1.02, 1.01, 1.04],
    "56": [0.78, 0.93, 1.07, 1.2],
    "57": [0.91, 0.98, 1.04, 0.94],
    "58": [0.79, 0.88, 1, 0.95],
    "59": [0.74, 0.85, 1.16, 0.92],
    "60": [0.69, 0.89, 0.94, 0.91],
    "61": [0.55, 0.7, 1.4, 1.6],
    "62": [0.58, 0.78, 1.02, 0.87],
    "63": [0.75, 1.03, 0.73, 0.84],
    "64": [0.57, 0.8, 0.88, 0.62],
    "65": [0.74, 0.9, 1.07, 1.07],
    "66": [0.74, 0.91, 1, 1.02],
    "67": [0.91, 0.96, 1.02, 1.02],
    "68": [0.77, 0.89, 1.05, 1.18],
    "69": [0.9, 0.95, 1.05, 1.13],
    "70": [0.73, 0.87, 1.04, 0.87],
    "71": [1.02, 1.02, 1, 0.98],
    "72": [0.73, 0.83, 1.14, 1.27],
    "73": [0.69, 0.88, 1.11, 1.25],
    "74": [0.8, 0.9, 0.98, 0.87],
    "75": [0.7, 0.85, 1.15, 1.27],
    "76": [1.02, 0.96, 0.88, 0.79],
    "77": [0.88, 0.93, 1.04, 1],
    "78": [0.88, 0.95, 1, 1],
    "79": [0.99, 0.96, 1.09, 1.1],
    "80": [0.78, 0.9, 1.01, 0.92],
    "81": [0.96, 1, 1.02, 1.04],
    "82": [0.85, 0.92, 1.04, 1.06],
    "83": [0.94, 0.96, 1.01, 1.01],
    "84": [0.93, 0.98, 1.01, 1.01],
    "85": [0.86, 0.93, 1.07, 1.12],
    "86": [1, 1, 1, 1],
    "87": [0.99, 1.03, 1.01, 1.07],
    "88": [0.86, 0.99, 0.8, 0.92],
    "89": [1.17, 1.2, 0.92, 0.88],
    "90": [0.72, 0.82, 1.15, 1.16],
    "91": [0.68, 0.85, 1.14, 1.17],
    "92": [0.69, 0.79, 1.1, 1.21],
    "93": [0.84, 0.9, 1.11, 1.19],
    "94": [0.63, 0.87, 1.11, 1.12],
    "95": [0.56, 0.8, 1.08, 1.01],
    "96": [0.54, 0.76, 1.16, 1.32],
    "97": [0.84, 0.93, 1.07, 1.2],
    "98": [0.8, 0.86, 1.22, 1.36],
    "99": [0.79, 0.89, 1.04, 1.09],
    "100": [0.97, 1, 1.05, 1.12],
    "101": [0.72, 0.85, 1.18, 1.31],
    "102": [0.98, 0.99, 0.99, 1.06],
    "103": [0.88, 1.01, 1, 1.08],
    "104": [0.88, 0.89, 0.96, 1.09],
    "105": [0.93, 0.94, 0.93, 0.79],
    "106": [0.74, 0.88, 1.06, 1.17],
    "107": [1.27, 1.09, 0.84, 0.78],
    "108": [0.82, 0.97, 1.07, 0.99],
    "109": [0.77, 0.91, 1.05, 0.99],
    "110": [0.88, 0.97, 0.92, 1.01],
    "111": [0.74, 0.93, 0.98, 0.87],
    "112": [0.77, 0.87, 1.05, 1.13],
    "113": [0.67, 0.85, 1.05, 1.04],
    "114": [0.8, 0.91, 1.04, 1.25],
    "115": [0.94, 0.96, 1.05, 1.08],
    "116": [0.59, 0.8, 1.16, 1.37],
    "117": [1, 1, 1, 1],
    "118": [0.69, 0.83, 1.05, 1.04],
    "119": [0.87, 0.97, 1.01, 0.94],
    "120": [0.77, 0.93, 1.01, 0.93],
    "121": [0.77, 0.88, 1.03, 0.97],
    "122": [0.55, 0.73, 1.22, 1.31],
    "123": [0.57, 0.77, 1.19, 1.36],
    "124": [0.63, 0.8, 1.18, 1.2],
    "125": [0.67, 0.81, 1.24, 1.38],
    "126": [0.5, 0.68, 1.08, 0.94]
  });

  // src/lib/voicevoxClient.js
  var VOICEVOX_BASE_URL = "http://127.0.0.1:50021";

  // src/lib/youtube/ytSupportRanking.js
  var ZERO_DECIMAL_CURRENCIES = /* @__PURE__ */ new Set(["JPY", "KRW", "TWD", "VND"]);
  function buildYtChannelUrl(channelId) {
    const id = String(channelId || "").trim();
    if (/^UC[A-Za-z0-9_-]{16,32}$/.test(id)) {
      return `https://www.youtube.com/channel/${id}`;
    }
    if (id.startsWith("handle:@")) {
      const handle = id.slice("handle:".length);
      if (/^@[A-Za-z0-9_.-]+$/.test(handle)) {
        return `https://www.youtube.com/${handle}`;
      }
    }
    if (/^@[A-Za-z0-9_.-]+$/.test(id)) {
      return `https://www.youtube.com/${id}`;
    }
    return "";
  }
  function formatYtCurrencyAmount(amount, currency) {
    const code = String(currency || "").trim().toUpperCase();
    const n = Number(amount);
    if (!Number.isFinite(n)) return "—";
    if (code === "JPY") {
      return `¥${formatNumberJa(Math.round(n))}`;
    }
    if (code === "KRW") {
      return `₩${formatNumberJa(Math.round(n))}`;
    }
    if (ZERO_DECIMAL_CURRENCIES.has(code)) {
      return `${code} ${formatNumberJa(Math.round(n))}`;
    }
    const fixed = (Math.round(n * 100) / 100).toFixed(2);
    return code ? `${code} ${fixed}` : fixed;
  }
  function createYtSupportRankingAccumulator() {
    const totalsByCurrency = {};
    const currencyItemCounts = {};
    const currencyUserMap = {};
    const supporterMap = /* @__PURE__ */ new Map();
    const commenterMap = /* @__PURE__ */ new Map();
    const supporterChannelIds = /* @__PURE__ */ new Set();
    const counts = {
      superchat: 0,
      sticker: 0,
      membership: 0,
      membershipGift: 0
    };
    const byCurrency = {};
    const supporters = [];
    let cachedCommenters = [];
    const snapshot = {
      totalsByCurrency,
      currencyItemCounts,
      byCurrency,
      counts,
      supporters,
      supporterChannelIds,
      get uniqueCommenterCount() {
        return commenterMap.size;
      },
      get primaryCurrencySummary() {
        const codes = Object.keys(totalsByCurrency);
        if (codes.length === 0) {
          return { currency: "", amount: 0, itemCount: 0, formatted: "—" };
        }
        codes.sort((a, b) => {
          const countDiff = (currencyItemCounts[b] || 0) - (currencyItemCounts[a] || 0);
          if (countDiff !== 0) return countDiff;
          const amountDiff = (totalsByCurrency[b] || 0) - (totalsByCurrency[a] || 0);
          if (amountDiff !== 0) return amountDiff;
          return a.localeCompare(b);
        });
        const best = codes[0];
        const amount = totalsByCurrency[best] || 0;
        return {
          currency: best,
          amount,
          itemCount: currencyItemCounts[best] || 0,
          formatted: formatYtCurrencyAmount(amount, best)
        };
      },
      get commenters() {
        if (cachedCommenters !== null) return cachedCommenters;
        const sorted = Array.from(commenterMap.values()).sort((a, b) => {
          if (b.commentCount !== a.commentCount) return b.commentCount - a.commentCount;
          if (b.superchatTotalAmount !== a.superchatTotalAmount) {
            return b.superchatTotalAmount - a.superchatTotalAmount;
          }
          const aMemGift = a.giftCount + a.membershipCount;
          const bMemGift = b.giftCount + b.membershipCount;
          if (bMemGift !== aMemGift) return bMemGift - aMemGift;
          if (b.lastTs !== a.lastTs) return b.lastTs - a.lastTs;
          return a.firstOrder - b.firstOrder;
        });
        cachedCommenters = sorted.map((entry, idx) => ({
          rank: idx + 1,
          ...entry
        }));
        return cachedCommenters;
      }
    };
    return {
      totalsByCurrency,
      currencyItemCounts,
      currencyUserMap,
      supporterMap,
      commenterMap,
      supporterChannelIds,
      counts,
      commenterSeq: 0,
      invalidateCommentersCache() {
        cachedCommenters = null;
      },
      snapshot
    };
  }
  function applyYtSupportRankingDelta(accumulator, newItems) {
    const acc = accumulator || createYtSupportRankingAccumulator();
    let rankingChanged = false;
    let supporterSetChanged = false;
    const touchedCurrencies = /* @__PURE__ */ new Set();
    if (!Array.isArray(newItems) || newItems.length === 0) {
      return {
        accumulator: acc,
        snapshot: acc.snapshot,
        rankingChanged: false,
        supporterSetChanged: false
      };
    }
    for (const item of newItems) {
      if (!item || typeof item !== "object") continue;
      const kind = String(item.kind || "");
      const isSupportKind = kind === "superchat" || kind === "sticker" || kind === "membership" || kind === "membership_gift";
      const badges = Array.isArray(item.badges) ? item.badges : [];
      const isMemberBadge = badges.includes("member");
      const channelId = String(item.channelId || item.name || "").trim();
      if (!channelId) continue;
      const name = String(item.name || channelId).trim();
      const iconUrl = safeHttpUrl(item.iconUrl || "");
      const channelUrl = buildYtChannelUrl(channelId);
      const ts = Number.isFinite(Number(item.ts)) ? Number(item.ts) : Number.isFinite(Number(item.recordedAt)) ? Number(item.recordedAt) : 0;
      const amount = Number(item.amount || 0);
      const currency = String(item.currency || "").trim().toUpperCase();
      const isPaid = (kind === "superchat" || kind === "sticker") && Number.isFinite(amount) && amount > 0 && Boolean(currency);
      let commenter = acc.commenterMap.get(channelId);
      if (!commenter) {
        acc.commenterSeq += 1;
        commenter = {
          channelId,
          name,
          iconUrl,
          channelUrl,
          commentCount: 0,
          superchatCount: 0,
          stickerCount: 0,
          superchatTotalAmount: 0,
          amountsByCurrency: {},
          primaryFormattedAmount: "",
          membershipCount: 0,
          giftCount: 0,
          isMember: false,
          lastTs: ts,
          firstOrder: acc.commenterSeq
        };
        acc.commenterMap.set(channelId, commenter);
      } else {
        if (name && (!commenter.name || commenter.name === commenter.channelId)) {
          commenter.name = name;
        }
        if (iconUrl && !commenter.iconUrl) {
          commenter.iconUrl = iconUrl;
        }
        if (ts > commenter.lastTs) {
          commenter.lastTs = ts;
        }
      }
      commenter.commentCount += 1;
      if (isMemberBadge || kind === "membership" || kind === "membership_gift") {
        commenter.isMember = true;
      }
      if (kind === "superchat") commenter.superchatCount += 1;
      else if (kind === "sticker") commenter.stickerCount += 1;
      else if (kind === "membership") commenter.membershipCount += 1;
      else if (kind === "membership_gift") commenter.giftCount += 1;
      if (isPaid) {
        commenter.superchatTotalAmount = Math.round((commenter.superchatTotalAmount + amount) * 100) / 100;
        commenter.amountsByCurrency[currency] = Math.round(((commenter.amountsByCurrency[currency] || 0) + amount) * 100) / 100;
        commenter.primaryFormattedAmount = formatYtCurrencyAmount(
          commenter.amountsByCurrency[currency],
          currency
        );
      }
      acc.invalidateCommentersCache();
      if (iconUrl) {
        const existingSup = acc.supporterMap.get(channelId);
        if (existingSup && !existingSup.iconUrl) {
          existingSup.iconUrl = iconUrl;
          rankingChanged = true;
        }
        for (const cKey of Object.keys(acc.currencyUserMap)) {
          const cEntry = acc.currencyUserMap[cKey]?.get(channelId);
          if (cEntry && !cEntry.iconUrl) {
            cEntry.iconUrl = iconUrl;
            touchedCurrencies.add(cKey);
            rankingChanged = true;
          }
        }
      }
      if (isSupportKind || isMemberBadge) {
        if (!acc.supporterChannelIds.has(channelId)) {
          acc.supporterChannelIds.add(channelId);
          supporterSetChanged = true;
        }
      }
      if (!isSupportKind) continue;
      rankingChanged = true;
      if (kind === "superchat") acc.counts.superchat += 1;
      else if (kind === "sticker") acc.counts.sticker += 1;
      else if (kind === "membership") acc.counts.membership += 1;
      else if (kind === "membership_gift") acc.counts.membershipGift += 1;
      let sup = acc.supporterMap.get(channelId);
      if (!sup) {
        sup = {
          channelId,
          name,
          iconUrl: iconUrl || commenter.iconUrl || "",
          channelUrl,
          amountsByCurrency: {},
          superchatCount: 0,
          stickerCount: 0,
          membershipCount: 0,
          giftCount: 0,
          lastTs: ts
        };
        acc.supporterMap.set(channelId, sup);
      } else {
        if (name && (!sup.name || sup.name === sup.channelId)) sup.name = name;
        if (iconUrl && !sup.iconUrl) sup.iconUrl = iconUrl;
        if (ts > sup.lastTs) sup.lastTs = ts;
      }
      if (kind === "superchat") sup.superchatCount += 1;
      else if (kind === "sticker") sup.stickerCount += 1;
      else if (kind === "membership") sup.membershipCount += 1;
      else if (kind === "membership_gift") sup.giftCount += 1;
      if (isPaid) {
        acc.totalsByCurrency[currency] = Math.round(((acc.totalsByCurrency[currency] || 0) + amount) * 100) / 100;
        acc.currencyItemCounts[currency] = (acc.currencyItemCounts[currency] || 0) + 1;
        sup.amountsByCurrency[currency] = Math.round(((sup.amountsByCurrency[currency] || 0) + amount) * 100) / 100;
        if (!acc.currencyUserMap[currency]) {
          acc.currencyUserMap[currency] = /* @__PURE__ */ new Map();
        }
        const cMap = acc.currencyUserMap[currency];
        let cEntry = cMap.get(channelId);
        if (!cEntry) {
          cEntry = {
            channelId,
            name,
            iconUrl: iconUrl || commenter.iconUrl || "",
            channelUrl,
            amount: 0,
            currency,
            count: 0,
            lastTs: ts
          };
          cMap.set(channelId, cEntry);
        }
        cEntry.amount = Math.round((cEntry.amount + amount) * 100) / 100;
        cEntry.count += 1;
        if (name && (!cEntry.name || cEntry.name === cEntry.channelId)) cEntry.name = name;
        if (iconUrl && !cEntry.iconUrl) cEntry.iconUrl = iconUrl;
        if (ts > cEntry.lastTs) cEntry.lastTs = ts;
        touchedCurrencies.add(currency);
      }
    }
    if (rankingChanged) {
      for (const currency of touchedCurrencies) {
        const cMap = acc.currencyUserMap[currency];
        if (!cMap) continue;
        const sorted = Array.from(cMap.values()).sort((a, b) => {
          if (b.amount !== a.amount) return b.amount - a.amount;
          if (b.count !== a.count) return b.count - a.count;
          return b.lastTs - a.lastTs;
        });
        acc.snapshot.byCurrency[currency] = sorted.map((entry, idx) => ({
          rank: idx + 1,
          ...entry,
          formattedAmount: formatYtCurrencyAmount(entry.amount, currency)
        }));
      }
      acc.snapshot.supporters = Array.from(acc.supporterMap.values()).sort((a, b) => {
        const aPaid = a.superchatCount + a.stickerCount;
        const bPaid = b.superchatCount + b.stickerCount;
        if (bPaid !== aPaid) return bPaid - aPaid;
        if (b.giftCount !== a.giftCount) return b.giftCount - a.giftCount;
        if (b.membershipCount !== a.membershipCount) return b.membershipCount - a.membershipCount;
        return b.lastTs - a.lastTs;
      });
    }
    return {
      accumulator: acc,
      snapshot: acc.snapshot,
      rankingChanged,
      supporterSetChanged
    };
  }
  function aggregateYtSupportRanking(items) {
    const acc = createYtSupportRankingAccumulator();
    return applyYtSupportRankingDelta(acc, items).snapshot;
  }

  // src/lib/voiceAssignment.js
  var DEFAULT_VOICE = Object.freeze({
    styleId: 3,
    pitchOffset: 0,
    speedOffset: 0
  });
  var PITCH_OFFSETS = Object.freeze([-0.06, -0.03, 0, 0.03, 0.06]);
  var SPEED_OFFSETS = Object.freeze([0, 0.05, 0.1]);

  // src/lib/voiceNarrowing.js
  var VOICE_NARROW_STYLE_IDS = Object.freeze([3, 2, 8, 10, 13, 14]);
  var VOICE_CAPPED_STYLE_IDS = Object.freeze([3, 2, 8, 10, 13, 14, 11, 21, 20, 46, 0, 4, 6, 1, 7, 5, 81, 82, 83, 84, 85, 66, 77, 78, 79, 80]);
  var VOICE_NARROW_MODES = Object.freeze(["off", "auto", "on"]);

  // src/lib/youtube/ytVoiceQueue.js
  var YT_VOICE_MODES = Object.freeze({
    ALL: "all",
    SELECT: "select"
  });
  var YT_DEFAULT_STYLE_IDS = VOICE_CAPPED_STYLE_IDS;

  // src/lib/youtube/ytLaneAssign.js
  var YT_LANES = Object.freeze({
    RINKU: "rinku",
    KONTA: "konta",
    TANUNEE: "tanunee"
  });
  var YT_LANE_RULES = Object.freeze([
    {
      lane: YT_LANES.RINKU,
      characterName: "りんく",
      roleLabel: "配信者視点",
      description: "配信者本人・モデレーター",
      badges: Object.freeze(["owner", "moderator"]),
      kinds: Object.freeze([]),
      includeSupporterChannels: false,
      isDefault: false
    },
    {
      lane: YT_LANES.KONTA,
      characterName: "こん太",
      roleLabel: "ファン視点",
      description: "スパチャ・ステッカー・メンバー・メンバーシップギフトの人",
      badges: Object.freeze(["member"]),
      kinds: Object.freeze(["superchat", "sticker", "membership", "membership_gift"]),
      includeSupporterChannels: true,
      isDefault: false
    },
    {
      lane: YT_LANES.TANUNEE,
      characterName: "たぬ姉",
      roleLabel: "案内役",
      description: "それ以外の一般コメント",
      badges: Object.freeze([]),
      kinds: Object.freeze([]),
      includeSupporterChannels: false,
      isDefault: true
    }
  ]);
  function assignYtCommentLane(item, opts = {}) {
    if (!item || typeof item !== "object") {
      return YT_LANES.TANUNEE;
    }
    const badges = Array.isArray(item.badges) ? item.badges.map((b) => String(b || "").toLowerCase()) : [];
    const kind = String(item.kind || "text").toLowerCase();
    const channelId = String(item.channelId || "");
    const broadcasterChannelId = String(opts.broadcasterChannelId || "");
    const supporterSet = opts.supporterChannelIds instanceof Set ? opts.supporterChannelIds : Array.isArray(opts.supporterChannelIds) ? new Set(opts.supporterChannelIds) : null;
    for (const rule of YT_LANE_RULES) {
      if (rule.isDefault) {
        return (
          /** @type {'rinku' | 'konta' | 'tanunee'} */
          rule.lane
        );
      }
      if (rule.lane === YT_LANES.RINKU && broadcasterChannelId && channelId && channelId === broadcasterChannelId) {
        return YT_LANES.RINKU;
      }
      if (rule.badges.some((b) => badges.includes(b))) {
        return (
          /** @type {'rinku' | 'konta' | 'tanunee'} */
          rule.lane
        );
      }
      if (rule.kinds.includes(kind)) {
        return (
          /** @type {'rinku' | 'konta' | 'tanunee'} */
          rule.lane
        );
      }
      if (rule.includeSupporterChannels && channelId && supporterSet && supporterSet.has(channelId)) {
        return (
          /** @type {'rinku' | 'konta' | 'tanunee'} */
          rule.lane
        );
      }
    }
    return YT_LANES.TANUNEE;
  }

  // src/lib/youtube/ytStreamStorePolicy.js
  var YT_SIDE_PANEL_DISPLAY_LIMIT = 150;
  function buildYtCommentPrimaryKey(videoId, commentId) {
    const v = String(videoId || "").trim();
    const c = String(commentId || "").trim();
    if (!v || !c) return "";
    return `${v}::${c}`;
  }
  function createYtStreamIncrementalState(videoId, opts = {}) {
    const displayLimit = typeof opts.displayLimit === "number" && opts.displayLimit > 0 ? Math.floor(opts.displayLimit) : YT_SIDE_PANEL_DISPLAY_LIMIT;
    return {
      videoId: String(videoId || "").trim(),
      broadcasterChannelId: String(opts.broadcasterChannelId || "").trim(),
      displayLimit,
      totalCount: 0,
      firstRecordedAt: 0,
      lastRecordedAt: 0,
      /** @type {Set<string>} */
      seenPks: /* @__PURE__ */ new Set(),
      laneCounts: {
        rinku: 0,
        konta: 0,
        tanunee: 0
      },
      /** @type {{ rinku: any[], konta: any[], tanunee: any[] }} */
      laneDisplay: {
        rinku: [],
        konta: [],
        tanunee: []
      },
      rankingAcc: createYtSupportRankingAccumulator()
    };
  }
  function applyYtStreamIncrementalItems(state, incomingItems, opts = {}) {
    if (opts.broadcasterChannelId) {
      state.broadcasterChannelId = String(opts.broadcasterChannelId).trim();
    }
    const addedByLane = {
      rinku: [],
      konta: [],
      tanunee: []
    };
    if (!Array.isArray(incomingItems) || incomingItems.length === 0) {
      return {
        addedCount: 0,
        addedByLane,
        rankingChanged: false,
        supporterSetChanged: false,
        ranking: state.rankingAcc.snapshot,
        laneCounts: state.laneCounts,
        laneDisplay: state.laneDisplay,
        totalCount: state.totalCount
      };
    }
    const unseen = [];
    for (let i = 0; i < incomingItems.length; i += 1) {
      const item = incomingItems[i];
      if (!item || typeof item !== "object") continue;
      const pk = String(item.pk || "").trim() || buildYtCommentPrimaryKey(state.videoId || item.videoId, item.id);
      if (!pk || state.seenPks.has(pk)) continue;
      state.seenPks.add(pk);
      unseen.push(item);
      const recAt = Number(item.recordedAt || 0);
      if (Number.isFinite(recAt) && recAt > 0) {
        if (state.firstRecordedAt === 0 || recAt < state.firstRecordedAt) {
          state.firstRecordedAt = recAt;
        }
        if (recAt > state.lastRecordedAt) {
          state.lastRecordedAt = recAt;
        }
      }
    }
    if (unseen.length === 0) {
      return {
        addedCount: 0,
        addedByLane,
        rankingChanged: false,
        supporterSetChanged: false,
        ranking: state.rankingAcc.snapshot,
        laneCounts: state.laneCounts,
        laneDisplay: state.laneDisplay,
        totalCount: state.totalCount
      };
    }
    state.totalCount += unseen.length;
    const rankRes = applyYtSupportRankingDelta(state.rankingAcc, unseen);
    for (let i = 0; i < unseen.length; i += 1) {
      const item = unseen[i];
      const lane = assignYtCommentLane(item, {
        broadcasterChannelId: state.broadcasterChannelId,
        supporterChannelIds: state.rankingAcc.supporterChannelIds
      });
      state.laneCounts[lane] += 1;
      addedByLane[lane].push(item);
    }
    const limit = state.displayLimit || YT_SIDE_PANEL_DISPLAY_LIMIT;
    for (
      const lane of
      /** @type {const} */
      ["rinku", "konta", "tanunee"]
    ) {
      const added = addedByLane[lane];
      if (added.length === 0) continue;
      const addedNewestFirst = added.slice().reverse();
      if (addedNewestFirst.length >= limit) {
        state.laneDisplay[lane] = addedNewestFirst.slice(0, limit);
      } else {
        const merged = addedNewestFirst.concat(state.laneDisplay[lane]);
        if (merged.length > limit) {
          merged.length = limit;
        }
        state.laneDisplay[lane] = merged;
      }
    }
    return {
      addedCount: unseen.length,
      addedByLane,
      rankingChanged: rankRes.rankingChanged,
      supporterSetChanged: rankRes.supporterSetChanged,
      ranking: rankRes.snapshot,
      laneCounts: state.laneCounts,
      laneDisplay: state.laneDisplay,
      totalCount: state.totalCount
    };
  }

  // src/lib/youtube/ytUserLaneTiers.js
  var YT_USER_LANE_TIER_KEYS = Object.freeze(["link", "gift", "member", "konta", "tanu"]);
  var UC_RE = /^UC[A-Za-z0-9_-]{22}$/;
  function hasRealIcon(u) {
    const s = String(u?.iconUrl || "").trim();
    return /^https:\/\//i.test(s);
  }
  function hasRealName(u) {
    const n = String(u?.name || "").trim();
    return n !== "" && n !== String(u?.channelId || "").trim();
  }
  function classifyYtUserLaneTier(u) {
    if (!u || typeof u !== "object") return "tanu";
    const paid = Number(u.superchatCount || 0) + Number(u.stickerCount || 0);
    if (paid > 0) return "gift";
    if (Number(u.giftCount || 0) > 0 || Number(u.membershipCount || 0) > 0 || u.isMember === true) {
      return "member";
    }
    const hasId = UC_RE.test(String(u.channelId || ""));
    const icon = hasRealIcon(u);
    const name = hasRealName(u);
    if (hasId && icon && name) return "link";
    if (hasId && (icon || name)) return "konta";
    return "tanu";
  }
  function buildYtUserLaneTiers(commenters, opts = {}) {
    const limit = Math.max(1, Math.floor(Number(opts.limitPerTier) || 60));
    const all = { link: [], gift: [], member: [], konta: [], tanu: [] };
    const seen = /* @__PURE__ */ new Set();
    const list = Array.isArray(commenters) ? commenters : [];
    for (const u of list) {
      if (!u || typeof u !== "object") continue;
      const key = String(u.channelId || u.name || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      all[classifyYtUserLaneTier(u)].push(u);
    }
    const byRecent = (a, b) => Number(b.lastTs || 0) - Number(a.lastTs || 0);
    all.gift.sort((a, b) => {
      const d = Number(b.superchatTotalAmount || 0) - Number(a.superchatTotalAmount || 0);
      return d !== 0 ? d : byRecent(a, b);
    });
    all.member.sort((a, b) => {
      const d = Number(b.giftCount || 0) + Number(b.membershipCount || 0) - (Number(a.giftCount || 0) + Number(a.membershipCount || 0));
      return d !== 0 ? d : byRecent(a, b);
    });
    all.link.sort(byRecent);
    all.konta.sort(byRecent);
    all.tanu.sort(byRecent);
    const tiers = {};
    const totals = {};
    let displayed = 0;
    let total = 0;
    for (const k of YT_USER_LANE_TIER_KEYS) {
      totals[k] = all[k].length;
      tiers[k] = all[k].slice(0, limit);
      displayed += tiers[k].length;
      total += all[k].length;
    }
    return { tiers, totals, displayed, total };
  }

  // src/lib/commentVelocityTimeline.js
  function collectValidSorted(comments) {
    const list = Array.isArray(comments) ? comments : [];
    const valid = [];
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const at = (
        /** @type {any} */
        c.capturedAt
      );
      if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) continue;
      valid.push(c);
    }
    if (!valid.length) return null;
    valid.sort(
      (a, b) => (
        /** @type {number} */
        a.capturedAt - /** @type {number} */
        b.capturedAt
      )
    );
    return {
      valid,
      firstAt: (
        /** @type {number} */
        valid[0].capturedAt
      ),
      lastAt: (
        /** @type {number} */
        valid[valid.length - 1].capturedAt
      )
    };
  }
  function buildCommentVelocityTimeline(comments, opts = {}) {
    const bucketMs = typeof opts.bucketMs === "number" && opts.bucketMs > 0 ? opts.bucketMs : 6e4;
    const rollingWindowMin = typeof opts.rollingWindowMin === "number" && opts.rollingWindowMin > 0 ? opts.rollingWindowMin : 5;
    const collected = collectValidSorted(comments);
    if (!collected) return { buckets: [], peakValue: 0, peakMinute: null, totalCount: 0 };
    const { valid, firstAt, lastAt } = collected;
    const totalBuckets = Math.max(1, Math.floor((lastAt - firstAt) / bucketMs) + 1);
    const buckets = [];
    for (let m = 0; m < totalBuckets; m++) {
      buckets.push({ minute: m, atStart: firstAt + m * bucketMs, count: 0, rolling5: 0 });
    }
    for (const c of valid) {
      const idx = Math.floor(
        /** @type {number} */
        (c.capturedAt - firstAt) / bucketMs
      );
      if (idx >= 0 && idx < buckets.length) buckets[idx].count += 1;
    }
    const win = rollingWindowMin;
    for (let i = 0; i < buckets.length; i++) {
      const start = Math.max(0, i - win + 1);
      let sum = 0;
      let n = 0;
      for (let j = start; j <= i; j++) {
        sum += buckets[j].count;
        n += 1;
      }
      buckets[i].rolling5 = n > 0 ? Math.round(sum / n * 100) / 100 : 0;
    }
    let peakValue = 0;
    let peakMinute = null;
    for (const b of buckets) {
      if (b.count > peakValue) {
        peakValue = b.count;
        peakMinute = b.minute;
      }
    }
    return { buckets, peakValue, peakMinute, totalCount: valid.length };
  }
  function isLaughterText(text) {
    const s = String(text || "");
    if (!s) return false;
    if (/^[wｗ]{2,}$/i.test(s.trim())) return true;
    if (/[wｗ]{2,}/i.test(s)) {
      return true;
    }
    if (/8{4,}/.test(s)) return true;
    if (new RegExp("^草[ァァっぁぁ！？!?。、  ]*$").test(s.trim())) return true;
    if (s === "草") return true;
    if (/草不可避|大草原|草生える|草生やす/.test(s)) return true;
    if (/(?:^|[^一-龥])(笑)(?:[^一-龥]|$)/.test(s)) return true;
    if (/\(笑\)|（笑）/.test(s)) return true;
    if (/爆笑|ワロタ|わろた|ｗｗ/i.test(s)) return true;
    return false;
  }
  function buildLaughterDensityTimeline(comments, opts = {}) {
    const bucketMs = typeof opts.bucketMs === "number" && opts.bucketMs > 0 ? opts.bucketMs : 3e4;
    const collected = collectValidSorted(comments);
    if (!collected) {
      return {
        buckets: [],
        peakBucket: null,
        peakValue: 0,
        totalLaughter: 0,
        totalCount: 0,
        overallRatio: 0
      };
    }
    const { valid, firstAt, lastAt } = collected;
    const totalBuckets = Math.max(1, Math.floor((lastAt - firstAt) / bucketMs) + 1);
    const buckets = [];
    for (let m = 0; m < totalBuckets; m++) {
      buckets.push({ minute: m, atStart: firstAt + m * bucketMs, count: 0, total: 0, ratio: 0 });
    }
    let totalLaughter = 0;
    for (const c of valid) {
      const idx = Math.floor(
        /** @type {number} */
        (c.capturedAt - firstAt) / bucketMs
      );
      if (idx < 0 || idx >= buckets.length) continue;
      buckets[idx].total += 1;
      if (isLaughterText(
        /** @type {any} */
        c.text
      )) {
        buckets[idx].count += 1;
        totalLaughter += 1;
      }
    }
    let peakValue = 0;
    let peakBucket = null;
    for (const b of buckets) {
      b.ratio = b.total > 0 ? Math.round(b.count / b.total * 1e3) / 1e3 : 0;
      if (b.count > peakValue) {
        peakValue = b.count;
        peakBucket = b.minute;
      }
    }
    return {
      buckets,
      peakBucket,
      peakValue,
      totalLaughter,
      totalCount: valid.length,
      overallRatio: valid.length > 0 ? Math.round(totalLaughter / valid.length * 1e3) / 1e3 : 0
    };
  }

  // src/lib/commentSilenceZones.js
  function detectCommentSilenceZones(comments, opts = {}) {
    const list = Array.isArray(comments) ? comments : [];
    const threshold = typeof opts.thresholdMs === "number" && opts.thresholdMs > 0 ? opts.thresholdMs : 6e4;
    const qualityCfg = opts.quality;
    const qualityWindowMs = qualityCfg && typeof qualityCfg.windowMs === "number" && qualityCfg.windowMs > 0 ? qualityCfg.windowMs : 0;
    const valid = [];
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const at = c.capturedAt;
      if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) continue;
      valid.push(c);
    }
    valid.sort(
      (a, b) => (
        /** @type {number} */
        a.capturedAt - /** @type {number} */
        b.capturedAt
      )
    );
    if (valid.length < 2) return [];
    const zones = [];
    for (let i = 1; i < valid.length; i++) {
      const prev = valid[i - 1];
      const cur = valid[i];
      const prevAt = (
        /** @type {number} */
        prev.capturedAt
      );
      const curAt = (
        /** @type {number} */
        cur.capturedAt
      );
      const gap = curAt - prevAt;
      if (gap < threshold) continue;
      let quality = "unknown";
      let afterCount = 0;
      if (qualityWindowMs > 0) {
        const windowEnd = curAt + qualityWindowMs;
        for (let j = i; j < valid.length; j++) {
          const at = (
            /** @type {number} */
            valid[j].capturedAt
          );
          if (at > windowEnd) break;
          afterCount += 1;
        }
        if (afterCount >= 5) quality = "engaged";
        else if (afterCount <= 1) quality = "departed";
        else quality = "neutral";
      }
      zones.push({
        startAt: prevAt,
        endAt: curAt,
        durationMs: gap,
        quality,
        afterCount,
        beforeText: String(prev.text || "").slice(0, 60),
        afterText: String(cur.text || "").slice(0, 60)
      });
    }
    return zones;
  }

  // src/lib/youtube/ytReportHtml.js
  var KIND_LABEL = Object.freeze({
    text: "コメント",
    superchat: "スーパーチャット",
    sticker: "スーパーステッカー",
    membership: "メンバー加入",
    membership_gift: "メンバーシップギフト"
  });
  function attr(v) {
    return escapeHtml(String(v == null ? "" : v));
  }
  function safeImg(url) {
    const s = String(url || "").trim();
    return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : "";
  }
  function toYtAnalyticsComments(items) {
    const out = [];
    for (const it of Array.isArray(items) ? items : []) {
      if (!it || typeof it !== "object") continue;
      const at = Number(it.recordedAt || 0);
      if (!Number.isFinite(at) || at <= 0) continue;
      out.push({ capturedAt: at, text: String(it.text || ""), userId: String(it.channelId || "") });
    }
    out.sort((a, b) => a.capturedAt - b.capturedAt);
    return out;
  }
  function formatDateTimeJa(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "—";
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function formatClock(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "";
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  function formatDurationJa(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "0分";
    const min = Math.round(ms / 6e4);
    if (min < 60) return `${min}分`;
    return `${Math.floor(min / 60)}時間${min % 60}分`;
  }
  function buildYtReportFilename(kind, summary, nowMs) {
    const d = new Date(Number.isFinite(nowMs) ? nowMs : Date.now());
    const p = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    const title = String(summary?.title || summary?.videoId || "youtube").replace(/[\\/:*?"<>|]/g, "").replace(/[^\S ]/g, " ").replace(/\s+/g, "_").slice(0, 40);
    const head = kind === "marketing" ? "yt-marketing" : "yt-comments";
    return `${head}-${stamp}-${title || "youtube"}.html`;
  }
  var BASE_CSS = `
:root{color-scheme:light;--bg:#fff7ec;--soft:#fff1f4;--surface:#fffdf9;--text:#4a3b34;--sub:#7a6458;--muted:#9c8678;--border:#e3c9b5;--accent:#f06aa0;--accent-soft:#ffd9e6;--gift:#c8721c;--ok:#3fa66a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:"M PLUS Rounded 1c","Hiragino Maru Gothic ProN","Yu Gothic UI",system-ui,sans-serif;font-size:14px;line-height:1.6}
main{max-width:980px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:20px;margin:0 0 4px}
h2{font-size:16px;margin:0 0 10px;padding-left:8px;border-left:4px solid var(--accent)}
.sub{color:var(--sub);font-size:12px}
section{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin:14px 0;box-shadow:0 1px 6px rgba(120,80,50,.08)}
.head{display:flex;gap:12px;align-items:center}
.head img{width:56px;height:56px;border-radius:50%;border:2px solid var(--accent-soft);object-fit:cover}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.card{background:var(--soft);border:1px solid var(--border);border-radius:12px;padding:8px 10px}
.card .k{font-size:11px;color:var(--sub);font-weight:700}
.card .v{font-size:20px;font-weight:800}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:5px 6px;border-bottom:1px solid color-mix(in srgb,var(--border) 60%,transparent);text-align:left;vertical-align:top}
th{font-size:11px;color:var(--sub)}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.who{display:inline-flex;align-items:center;gap:6px}
.who img{width:24px;height:24px;border-radius:50%;object-fit:cover;background:var(--accent-soft)}
.who a{color:var(--text);font-weight:700;text-decoration:none}
.who a:hover{text-decoration:underline}
.id{font-size:10px;color:var(--muted)}
.chart{width:100%;height:auto;display:block}
.note{font-size:12px;color:var(--sub);margin:6px 0 0}
.pill{display:inline-block;border-radius:999px;padding:0 8px;font-size:11px;font-weight:700;background:var(--accent-soft)}
.pill.paid{background:#ffe7c7;color:var(--gift)}
.pill.member{background:#e1f5e8;color:var(--ok)}
ul.tips{margin:0;padding-left:20px}
footer{color:var(--muted);font-size:11px;text-align:center;margin-top:24px}
input[type=search]{width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:10px;font-size:14px;margin-bottom:8px;background:#fff}
`;
  function wrapDocument(title, body, extraScript = "") {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>${BASE_CSS}</style></head><body><main>${body}</main>${extraScript}</body></html>`;
  }
  function whoCell(u) {
    const name = String(u?.name || u?.channelId || "リスナー");
    const ch = String(u?.channelId || "");
    const url = buildYtChannelUrl(ch);
    const img = safeImg(u?.iconUrl);
    const imgTag = img ? `<img src="${attr(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : '<img alt="" />';
    const nameTag = url ? `<a href="${attr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a>` : `<span>${escapeHtml(name)}</span>`;
    const idTag = ch ? `<span class="id">${escapeHtml(ch)}</span>` : "";
    return `<span class="who">${imgTag}<span>${nameTag}<br />${idTag}</span></span>`;
  }
  function headerSection(summary, heading) {
    const icon = safeImg(summary?.broadcasterIconUrl);
    const title = String(summary?.title || summary?.videoId || "YouTube Live");
    const bName = String(summary?.broadcasterName || "");
    const vid = String(summary?.videoId || "");
    const watchUrl = /^[A-Za-z0-9_-]{11}$/.test(vid) ? `https://www.youtube.com/watch?v=${vid}` : "";
    const chUrl = buildYtChannelUrl(String(summary?.broadcasterChannelId || ""));
    return '<section class="head">' + (icon ? `<img src="${attr(icon)}" alt="" referrerpolicy="no-referrer" />` : "") + `<div><div class="sub">${escapeHtml(heading)}</div><h1>${watchUrl ? `<a href="${attr(watchUrl)}" target="_blank" rel="noopener noreferrer" style="color:inherit">${escapeHtml(title)}</a>` : escapeHtml(title)}</h1>` + (bName ? `<div class="sub">配信者: ${chUrl ? `<a href="${attr(chUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(bName)}</a>` : escapeHtml(bName)}</div>` : "") + "</div></section>";
  }
  function velocitySvg(buckets) {
    if (!buckets.length) return '<p class="note">まだグラフにできるほど記録がありません。</p>';
    const W = 940;
    const H = 180;
    const pad = 24;
    const max = Math.max(1, ...buckets.map((b) => b.count));
    const bw = (W - pad * 2) / buckets.length;
    let bars = "";
    buckets.forEach((b, i) => {
      const h = Math.round((H - pad * 2) * b.count / max);
      const x = pad + i * bw;
      bars += `<rect x="${x.toFixed(1)}" y="${H - pad - h}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${h}" fill="#f06aa0" opacity="0.75"><title>${escapeHtml(formatClock(b.atStart))} ${b.count}件</title></rect>`;
    });
    let line = "";
    buckets.forEach((b, i) => {
      const y = H - pad - (H - pad * 2) * b.rolling5 / max;
      const x = pad + i * bw + bw / 2;
      line += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)} `;
    });
    const first = formatClock(buckets[0].atStart).slice(0, 5);
    const last = formatClock(buckets[buckets.length - 1].atStart).slice(0, 5);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="1分ごとのコメント数"><line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#e3c9b5" />` + bars + `<path d="${line}" fill="none" stroke="#c8721c" stroke-width="2" /><text x="${pad}" y="${H - 6}" font-size="11" fill="#7a6458">${escapeHtml(first)}</text><text x="${W - pad}" y="${H - 6}" font-size="11" fill="#7a6458" text-anchor="end">${escapeHtml(last)}</text><text x="${pad}" y="14" font-size="11" fill="#7a6458">最大 ${max}件/分</text></svg>`;
  }
  function buildYtMarketingReportHtml(input) {
    const nowMs = Number.isFinite(input?.nowMs) ? Number(input.nowMs) : Date.now();
    const summary = input?.summary || null;
    const items = Array.isArray(input?.items) ? input.items : [];
    const ranking = aggregateYtSupportRanking(items);
    const comments = toYtAnalyticsComments(items);
    const velocity = buildCommentVelocityTimeline(comments, { bucketMs: 6e4, rollingWindowMin: 5 });
    const laughter = buildLaughterDensityTimeline(comments, { bucketMs: 6e4 });
    const silences = detectCommentSilenceZones(comments, { thresholdMs: 6e4, quality: { windowMs: 3e4 } });
    const firstAt = comments.length ? comments[0].capturedAt : 0;
    const lastAt = comments.length ? comments[comments.length - 1].capturedAt : 0;
    const commenters = Array.isArray(ranking.commenters) ? ranking.commenters : [];
    const currencies = Object.keys(ranking.totalsByCurrency || {}).sort(
      (a, b) => (ranking.currencyItemCounts[b] || 0) - (ranking.currencyItemCounts[a] || 0)
    );
    const paidUsers = commenters.filter((c) => c.superchatCount + c.stickerCount > 0).length;
    const memberUsers = commenters.filter((c) => c.isMember || c.membershipCount > 0 || c.giftCount > 0).length;
    const peakViewers = Number(summary?.peakConcurrentViewers || summary?.concurrentViewers || 0);
    const card = (k, v) => `<div class="card"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;
    const superchatText = currencies.length ? currencies.map((c) => `${c} ${formatNumberJa(ranking.totalsByCurrency[c])}`).join(" / ") : "—";
    let body = headerSection(summary, "追憶のきらめき for YouTube — マーケ分析レポート");
    body += '<section><h2>この配信の規模</h2><div class="cards">' + card("記録したコメント", `${formatNumberJa(items.length)}件`) + card("コメントした人", `${formatNumberJa(commenters.length)}人`) + card("記録した時間", formatDurationJa(lastAt - firstAt)) + card("同時視聴（最大の記録）", peakViewers > 0 ? `${formatNumberJa(peakViewers)}人` : "未取得") + card("スパチャした人", `${formatNumberJa(paidUsers)}人`) + card("メンバー関係", `${formatNumberJa(memberUsers)}人`) + `</div><p class="note">スーパーチャット合計（通貨別）: ${escapeHtml(superchatText)}</p><p class="note">記録期間: ${escapeHtml(formatDateTimeJa(firstAt))} 〜 ${escapeHtml(formatDateTimeJa(lastAt))}。拡張がチャット欄を見ていた間の記録です（開く前のコメントは YouTube の仕様で取れません）。</p></section>`;
    const peaks = velocity.buckets.slice().sort((a, b) => b.count - a.count).slice(0, 3).filter((b) => b.count > 0);
    body += "<section><h2>コメントの勢い（1分ごと）</h2>" + velocitySvg(velocity.buckets) + '<p class="note">棒＝1分ごとの件数、線＝直近5分の平均。</p>' + (peaks.length ? '<p class="note">盛り上がった時間: ' + peaks.map((b) => `<span class="pill">${escapeHtml(formatClock(b.atStart).slice(0, 5))} ${b.count}件</span>`).join(" ") + "</p>" : "") + "</section>";
    const laughPeaks = laughter.buckets.slice().sort((a, b) => b.count - a.count).slice(0, 3).filter((b) => b.count > 0);
    const longSilences = silences.slice().sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);
    body += `<section><h2>笑いの山と、静かになった時間</h2><p class="note">笑い系コメント（w・草・8888 など）: ${formatNumberJa(laughter.totalLaughter)}件（全体の ${Math.round((laughter.overallRatio || 0) * 100)}%）</p>` + (laughPeaks.length ? '<p class="note">笑いが多かった時間: ' + laughPeaks.map((b) => `<span class="pill">${escapeHtml(formatClock(b.atStart).slice(0, 5))} ${b.count}件</span>`).join(" ") + "</p>" : "") + (longSilences.length ? "<table><thead><tr><th>静かになった時間</th><th>長さ</th><th>直前のコメント</th><th>再開したコメント</th></tr></thead><tbody>" + longSilences.map(
      (z) => `<tr><td>${escapeHtml(formatClock(z.startAt))}</td><td class="num">${Math.round(z.durationMs / 1e3)}秒</td><td>${escapeHtml(z.beforeText || "")}</td><td>${escapeHtml(z.afterText || "")}</td></tr>`
    ).join("") + "</tbody></table>" : '<p class="note">1分以上コメントが止まった時間はありませんでした。</p>') + "</section>";
    let paidHtml = "";
    for (const cur of currencies) {
      const list = (ranking.byCurrency?.[cur] || []).slice(0, 20);
      paidHtml += `<h3 style="font-size:14px;margin:10px 0 4px">${escapeHtml(cur)}（合計 ${escapeHtml(formatNumberJa(ranking.totalsByCurrency[cur]))}・${formatNumberJa(ranking.currencyItemCounts[cur] || 0)}件）</h3><table><thead><tr><th>#</th><th>応援してくれた人</th><th>金額</th><th>回数</th></tr></thead><tbody>` + list.map(
        (u) => `<tr><td class="num">${u.rank}</td><td>${whoCell(u)}</td><td class="num">${escapeHtml(u.formattedAmount || "")}</td><td class="num">${u.count}回</td></tr>`
      ).join("") + "</tbody></table>";
    }
    body += "<section><h2>スーパーチャット・ステッカー（通貨別ランキング）</h2>" + (paidHtml || '<p class="note">この記録の間にスーパーチャットはありませんでした。</p>') + '<p class="note">通貨が違う金額は足し合わせず、通貨ごとに並べています。</p></section>';
    const members = commenters.filter((c) => c.giftCount > 0 || c.membershipCount > 0).sort((a, b) => b.giftCount + b.membershipCount - (a.giftCount + a.membershipCount)).slice(0, 30);
    body += `<section><h2>メンバー加入・メンバーシップギフト</h2><p class="note">メンバー加入 ${formatNumberJa(ranking.counts.membership)}件・ギフト ${formatNumberJa(ranking.counts.membershipGift)}件</p>` + (members.length ? "<table><thead><tr><th>人</th><th>加入</th><th>ギフト</th><th>コメント</th></tr></thead><tbody>" + members.map(
      (u) => `<tr><td>${whoCell(u)}</td><td class="num">${u.membershipCount}</td><td class="num">${u.giftCount}</td><td class="num">${u.commentCount}</td></tr>`
    ).join("") + "</tbody></table>" : "") + "</section>";
    const talkers = commenters.slice(0, 30);
    body += "<section><h2>よくコメントしてくれた人（上位30人）</h2>" + (talkers.length ? "<table><thead><tr><th>#</th><th>人</th><th>コメント</th><th>応援</th></tr></thead><tbody>" + talkers.map((u) => {
      const tags = [];
      if (u.superchatCount + u.stickerCount > 0) tags.push(`<span class="pill paid">${escapeHtml(u.primaryFormattedAmount || "スパチャ")}</span>`);
      if (u.isMember) tags.push('<span class="pill member">メンバー</span>');
      return `<tr><td class="num">${u.rank}</td><td>${whoCell(u)}</td><td class="num">${u.commentCount}件</td><td>${tags.join(" ")}</td></tr>`;
    }).join("") + "</tbody></table>" : '<p class="note">まだコメントがありません。</p>') + "</section>";
    const tips = [];
    if (peaks.length) tips.push(`いちばん盛り上がったのは ${formatClock(peaks[0].atStart).slice(0, 5)} ごろ（${peaks[0].count}件/分）。その時の話題を次回の冒頭に持ってくると入りやすいです。`);
    if (longSilences.length && longSilences[0].durationMs >= 12e4) tips.push(`${formatClock(longSilences[0].startAt).slice(0, 5)} ごろに ${Math.round(longSilences[0].durationMs / 6e4)}分ほどコメントが止まりました。質問や二択を挟むと戻りやすいです。`);
    if (commenters.length > 0) {
      const once = commenters.filter((c) => c.commentCount === 1).length;
      tips.push(`1回だけコメントした人が ${formatNumberJa(once)}人（${Math.round(once / commenters.length * 100)}%）。名前を呼んで返すと2回目が出やすくなります。`);
    }
    if (paidUsers > 0) tips.push(`スパチャをくれた ${formatNumberJa(paidUsers)}人は、配信の最後にまとめてお礼を読むと次も応援しやすくなります。`);
    body += `<section><h2>次の配信へのヒント</h2><ul class="tips">${tips.map((t) => `<li>${escapeHtml(t)}</li>`).join("") || "<li>記録が増えるとヒントが出ます。</li>"}</ul></section>`;
    body += `<footer>追憶のきらめき for YouTube（試作）・${escapeHtml(formatDateTimeJa(nowMs))} に作成・このファイルは利用者のPCの中だけで作られました</footer>`;
    return wrapDocument(`マーケ分析 — ${String(summary?.title || "YouTube Live")}`, body);
  }
  function buildYtCommentLogReportHtml(input) {
    const nowMs = Number.isFinite(input?.nowMs) ? Number(input.nowMs) : Date.now();
    const summary = input?.summary || null;
    const items = (Array.isArray(input?.items) ? input.items : []).filter((it) => it && typeof it === "object").slice().sort((a, b) => Number(a.recordedAt || 0) - Number(b.recordedAt || 0));
    const ranking = aggregateYtSupportRanking(items);
    let body = headerSection(summary, "追憶のきらめき for YouTube — 記録レポート");
    body += `<section><div class="cards"><div class="card"><div class="k">記録したコメント</div><div class="v">${formatNumberJa(items.length)}件</div></div><div class="card"><div class="k">コメントした人</div><div class="v">${formatNumberJa(ranking.uniqueCommenterCount)}人</div></div><div class="card"><div class="k">スーパーチャット</div><div class="v">${formatNumberJa(ranking.counts.superchat + ranking.counts.sticker)}件</div></div><div class="card"><div class="k">メンバー加入・ギフト</div><div class="v">${formatNumberJa(ranking.counts.membership + ranking.counts.membershipGift)}件</div></div></div></section>`;
    body += '<section><h2>コメント一覧</h2><input type="search" id="q" placeholder="名前・本文で絞り込み" aria-label="名前・本文で絞り込み" /><table id="log"><thead><tr><th>時刻</th><th>人</th><th>種類</th><th>本文</th></tr></thead><tbody>' + items.map((it) => {
      const kind = (
        /** @type {keyof typeof KIND_LABEL} */
        String(it.kind || "text")
      );
      const label = KIND_LABEL[kind] || "コメント";
      const amount = Number(it.amount || 0) > 0 ? ` ${escapeHtml(String(it.currency || ""))} ${escapeHtml(formatNumberJa(it.amount))}` : "";
      const cls = kind === "superchat" || kind === "sticker" ? "pill paid" : kind === "text" ? "pill" : "pill member";
      return `<tr data-s="${attr(`${it.name || ""} ${it.text || ""}`.toLowerCase())}"><td class="num">${escapeHtml(formatClock(Number(it.recordedAt || 0)))}</td><td>${whoCell(it)}</td><td><span class="${cls}">${escapeHtml(label)}${amount}</span></td><td>${escapeHtml(String(it.text || ""))}</td></tr>`;
    }).join("") + "</tbody></table></section>";
    body += `<footer>追憶のきらめき for YouTube（試作）・${escapeHtml(formatDateTimeJa(nowMs))} に作成</footer>`;
    const script = '<script>(function(){var q=document.getElementById("q");var rows=document.querySelectorAll("#log tbody tr");q&&q.addEventListener("input",function(){var v=q.value.toLowerCase().trim();rows.forEach(function(r){r.style.display=!v||r.getAttribute("data-s").indexOf(v)>=0?"":"none";});});})();<\/script>';
    return wrapDocument(`記録レポート — ${String(summary?.title || "YouTube Live")}`, body, script);
  }

  // src/lib/supportActivityTimeline.js
  function formatRelativeTimeJa(at, now) {
    const t = Number(at);
    if (!Number.isFinite(t) || t <= 0) return "";
    const ref = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const diffMs = ref - t;
    if (diffMs < -5e3) return "";
    const sec = Math.max(0, Math.floor(diffMs / 1e3));
    if (sec < 10) return "たった今";
    if (sec < 60) return `${sec}秒前`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}分前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}時間前`;
    const day = Math.floor(hr / 24);
    return `${day}日前`;
  }

  // src/lib/voiceAgeGate.js
  var VOICE_STALE_BACKLOG_QUEUE = Number.POSITIVE_INFINITY;

  // src/lib/voiceLagNotice.js
  var VOICE_GPU_TIP_TEXT = "⚡ 読み上げを速くするには: VOICEVOX の「設定」→「オプション」→「エンジンモード」を「GPU」に(切り替えると VOICEVOX が再起動します)";
  var VOICE_LIGHT_ACTIVE_TEXT = "VOICEVOX が追いつかないので、いまは PC の声で読んでいます。VOICEVOX が速くなったら自動で戻ります";

  // extension-youtube/src/ytIdbStore.js
  var DB_NAME = "yt_kirameki_db";
  var DB_VERSION = 2;
  var STORE_COMMENTS = "comments";
  var INDEX_BY_VIDEO_ID = "by_videoId";
  var INDEX_BY_VIDEO_ID_RECORDED_AT = "by_videoId_recordedAt";
  var dbPromise = null;
  function openYtCommentsDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          let store;
          if (!db.objectStoreNames.contains(STORE_COMMENTS)) {
            store = db.createObjectStore(STORE_COMMENTS, { keyPath: "pk" });
          } else {
            store = req.transaction.objectStore(STORE_COMMENTS);
          }
          if (store && !store.indexNames.contains(INDEX_BY_VIDEO_ID)) {
            store.createIndex(INDEX_BY_VIDEO_ID, "videoId", { unique: false });
          }
          if (store && !store.indexNames.contains(INDEX_BY_VIDEO_ID_RECORDED_AT)) {
            store.createIndex(INDEX_BY_VIDEO_ID_RECORDED_AT, ["videoId", "recordedAt"], {
              unique: false
            });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          dbPromise = null;
          reject(req.error || new Error("idb_open_failed"));
        };
      } catch (err) {
        dbPromise = null;
        reject(err);
      }
    });
    return dbPromise;
  }
  async function getYtStreamCommentsByVideoId(videoId) {
    const vid = String(videoId || "").trim();
    if (!vid) return [];
    const db = await openYtCommentsDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_COMMENTS], "readonly");
      const store = tx.objectStore(STORE_COMMENTS);
      if (store.indexNames.contains(INDEX_BY_VIDEO_ID_RECORDED_AT)) {
        const index2 = store.index(INDEX_BY_VIDEO_ID_RECORDED_AT);
        const range = IDBKeyRange.bound([vid, 0], [vid, Number.MAX_SAFE_INTEGER]);
        const req2 = index2.getAll(range);
        req2.onsuccess = () => {
          resolve(Array.isArray(req2.result) ? req2.result : []);
        };
        req2.onerror = () => {
          reject(req2.error || new Error("idb_get_failed"));
        };
        return;
      }
      const index = store.index(INDEX_BY_VIDEO_ID);
      const req = index.getAll(IDBKeyRange.only(vid));
      req.onsuccess = () => {
        const list = Array.isArray(req.result) ? req.result : [];
        list.sort((a, b) => Number(a.recordedAt || 0) - Number(b.recordedAt || 0));
        resolve(list);
      };
      req.onerror = () => {
        reject(req.error || new Error("idb_get_failed"));
      };
    });
  }
  async function getYtStreamCommentsSince(videoId, afterRecordedAt = 0) {
    const vid = String(videoId || "").trim();
    if (!vid) return [];
    const lower = typeof afterRecordedAt === "number" && Number.isFinite(afterRecordedAt) && afterRecordedAt > 0 ? afterRecordedAt : 0;
    const db = await openYtCommentsDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_COMMENTS], "readonly");
      const store = tx.objectStore(STORE_COMMENTS);
      const index = store.index(INDEX_BY_VIDEO_ID_RECORDED_AT);
      const range = IDBKeyRange.bound([vid, lower], [vid, Number.MAX_SAFE_INTEGER]);
      const req = index.getAll(range);
      req.onsuccess = () => {
        resolve(Array.isArray(req.result) ? req.result : []);
      };
      req.onerror = () => {
        reject(req.error || new Error("idb_get_since_failed"));
      };
    });
  }

  // extension-youtube/src/sidepanel-entry.js
  var STORAGE_KEYS = Object.freeze({
    STREAM_SUMMARIES: "yt_stream_summaries",
    ACTIVE_VIDEO_ID: "yt_active_video_id",
    VOICE_SETTINGS: "yt_voice_settings",
    VOICE_ASSIGNMENTS: "yt_voice_assignments",
    VOICE_QUEUE: "yt_voice_queue",
    VOICE_STATE: "yt_voice_state",
    UI_STATE: "yt_sidepanel_ui_state"
  });
  var LANE_CONFIG = Object.freeze({
    rinku: {
      listId: "lane-rinku-list",
      countId: "lane-rinku-count",
      emptyMessage: "配信者本人・モデレーターのコメントがここに表示されます",
      fallbackIcon: "images/yukkuri-charactore-english/link/link-yukkuri-normal-mouth-closed.thumb128.png"
    },
    konta: {
      listId: "lane-konta-list",
      countId: "lane-konta-count",
      emptyMessage: "スパチャ・ステッカー・メンバー・ギフトの応援がここに表示されます",
      fallbackIcon: "images/yukkuri-charactore-english/konta/kitsune-yukkuri-normal.thumb128.png"
    },
    tanunee: {
      listId: "lane-tanunee-list",
      countId: "lane-tanunee-count",
      emptyMessage: "一般リスナーのコメントがここに表示されます",
      fallbackIcon: "images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-normal-mouth-closed.thumb128.png"
    }
  });
  var BROADCASTER_FALLBACK_ICON = "images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.png";
  var TOP_SUPPORT_STRIP_LIMIT = 10;
  var STORY_USERLANE_LIMIT = 60;
  var SUPPORT_TIMELINE_LIMIT = 80;
  var AUTO_ALL_CHAT_KEY = "yt_auto_all_chat_v1";
  var STORY_TIER_GUIDE = Object.freeze({
    link: "りんく: チャンネルID・表示名・アイコンがそろった人を、直近に話した順に並べるよ。",
    gift: "ギフト列: スーパーチャット・スーパーステッカーで応援してくれた人を、金額の大きい順に並べるよ。",
    member: "メンバー列: メンバー加入・メンバーシップギフト・メンバーバッジの人を並べるよ（ニコ生版の広告列の位置）。",
    konta: "こん太: 表示名かアイコンのどちらかまで取れた人は、この段に並ぶよ。",
    tanu: "たぬ姉: チャンネルIDが取れない人や情報が薄い人は、ぜんぶこの段に集めるよ。"
  });
  var STORY_GROWTH_GRID_LIMIT = 240;
  var selectedVideoId = "";
  var currentIncrementalState = null;
  var renderJobChain = Promise.resolve();
  var visualDetailsNeedsRefresh = false;
  var identiconCache2 = /* @__PURE__ */ new Map();
  var metrics = {
    fullGetAllCount: 0,
    incrementalFetchCount: 0,
    lastIncrementalFetchedItems: 0,
    lastIncrementalAddedItems: 0,
    lastIncrementalDurationMs: 0,
    lastFullLoadDurationMs: 0,
    voiceOnlyUpdateCount: 0
  };
  if (typeof window !== "undefined") {
    window.__ytSidepanelMetrics = metrics;
  }
  function runRenderSerialized(fn) {
    const next = renderJobChain.then(fn, fn);
    renderJobChain = next.then(
      () => void 0,
      () => void 0
    );
    return next;
  }
  function clearChildren(el) {
    if (!el) return;
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }
  function getDeterministicIdenticonUrl(key) {
    const k = String(key || "anon").trim() || "anon";
    const cached = identiconCache2.get(k);
    if (cached) return cached;
    const url = anonymousIdenticonDataUrl(k, 64);
    if (identiconCache2.size > 2e3) {
      const first = identiconCache2.keys().next().value;
      if (first) identiconCache2.delete(first);
    }
    identiconCache2.set(k, url);
    return url;
  }
  function formatShortChannelId(channelId) {
    const raw = String(channelId || "").trim();
    if (!raw) return "";
    const cleaned = raw.startsWith("handle:") ? raw.slice("handle:".length) : raw;
    return cleaned.length > 14 ? `${cleaned.slice(0, 14)}…` : cleaned;
  }
  function formatElapsedDurationJa(elapsedMs) {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "—";
    const totalSec = Math.floor(elapsedMs / 1e3);
    if (totalSec < 60) return "1分未満";
    const totalMin = Math.floor(totalSec / 60);
    if (totalMin < 60) return `${totalMin}分`;
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    return `${hours}時間${String(mins).padStart(2, "0")}分`;
  }
  function createAvatarImgWithFallback(iconUrl, name, channelKey, className, explicitFallbackSrc = "") {
    const safeUrl = safeHttpUrl(iconUrl || "");
    const fallbackSrc = explicitFallbackSrc || getDeterministicIdenticonUrl(channelKey || name || "anon");
    const img = document.createElement("img");
    img.className = className;
    img.src = safeUrl || fallbackSrc;
    img.alt = name || "icon";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    if (safeUrl) {
      img.addEventListener(
        "error",
        () => {
          if (img.src !== fallbackSrc) {
            img.src = fallbackSrc;
          }
        },
        { once: true }
      );
    }
    return img;
  }
  function createAuthorHeaderFragment(user) {
    const frag = document.createDocumentFragment();
    const displayName = String(user.name || user.channelId || "匿名リスナー").trim();
    const channelId = String(user.channelId || "").trim();
    const channelUrl = safeHttpUrl(buildYtChannelUrl(channelId));
    const shortId = formatShortChannelId(channelId);
    const cell = channelUrl ? document.createElement("a") : document.createElement("span");
    cell.className = channelUrl ? "nl-story-userlane-cell nl-story-userlane-cell--linkable author-link" : "nl-story-userlane-cell author-link";
    if (channelUrl) {
      cell.href = channelUrl;
      cell.target = "_blank";
      cell.rel = "noopener noreferrer";
    }
    cell.title = channelId ? `${displayName} (${channelId})` : displayName;
    cell.appendChild(
      createAvatarImgWithFallback(
        user.iconUrl || "",
        displayName,
        channelId || displayName,
        "nl-story-userlane-avatar avatar-img"
      )
    );
    const meta = document.createElement("span");
    meta.className = "nl-story-userlane-meta";
    const nameSpan = document.createElement("span");
    nameSpan.className = "nl-story-userlane-meta__name";
    nameSpan.textContent = displayName;
    meta.appendChild(nameSpan);
    if (shortId) {
      const idTag = document.createElement("span");
      idTag.className = "nl-story-userlane-meta__id channel-id-tag";
      idTag.textContent = `(${shortId})`;
      idTag.title = channelId;
      meta.appendChild(idTag);
    }
    cell.appendChild(meta);
    frag.appendChild(cell);
    if (Number.isFinite(Number(user.voiceStyleId))) {
      const voicePill = document.createElement("span");
      voicePill.className = "voice-pill";
      voicePill.dataset.voiceStyleId = String(user.voiceStyleId);
      voicePill.textContent = `声 #${user.voiceStyleId}`;
      frag.appendChild(voicePill);
    }
    return frag;
  }
  function createChatItemElement(item) {
    const card = document.createElement("div");
    const kind = String(item.kind || "text");
    const isGiftLike = kind === "superchat" || kind === "sticker" || kind === "membership" || kind === "membership_gift";
    card.className = `chat-item ${isGiftLike ? "nl-tl-gift" : "nl-tl-row"} kind-${kind}`;
    card.dataset.itemId = String(item.id || "");
    card.dataset.channelId = String(item.channelId || "");
    if (Number.isFinite(Number(item.voiceStyleId))) {
      card.dataset.voiceStyleId = String(item.voiceStyleId);
    }
    const head = document.createElement("div");
    head.className = "chat-item-head";
    head.appendChild(createAuthorHeaderFragment(item));
    if ((kind === "superchat" || kind === "sticker") && Number(item.amount) > 0) {
      const pill = document.createElement("span");
      pill.className = "amount-pill";
      pill.textContent = formatYtCurrencyAmount(item.amount, item.currency);
      head.appendChild(pill);
    } else if (kind === "membership") {
      const pill = document.createElement("span");
      pill.className = "member-pill";
      pill.textContent = "メンバー加入";
      head.appendChild(pill);
    } else if (kind === "membership_gift") {
      const pill = document.createElement("span");
      pill.className = "member-pill";
      pill.textContent = "ギフト";
      head.appendChild(pill);
    }
    if (item.ts) {
      const tsSpan = document.createElement("span");
      tsSpan.className = "channel-id-tag";
      tsSpan.style.marginLeft = "auto";
      tsSpan.textContent = String(item.ts);
      head.appendChild(tsSpan);
    }
    card.appendChild(head);
    if (item.text) {
      const body = document.createElement("div");
      body.className = "chat-text";
      body.textContent = String(item.text);
      card.appendChild(body);
    }
    return card;
  }
  function renderLaneFull(lane, displayItems, totalLaneCount) {
    const cfg = LANE_CONFIG[lane];
    const listEl = document.getElementById(cfg.listId);
    const countEl = document.getElementById(cfg.countId);
    if (countEl) {
      countEl.textContent = `${formatNumberJa(totalLaneCount)}件`;
    }
    if (!listEl) return;
    clearChildren(listEl);
    if (displayItems.length === 0) {
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = cfg.emptyMessage;
      listEl.appendChild(hint);
      return;
    }
    const frag = document.createDocumentFragment();
    for (let i = 0; i < displayItems.length; i += 1) {
      frag.appendChild(createChatItemElement(displayItems[i]));
    }
    listEl.appendChild(frag);
  }
  function patchLaneIncremental(lane, newlyAddedChronological, totalLaneCount) {
    const cfg = LANE_CONFIG[lane];
    const countEl = document.getElementById(cfg.countId);
    if (countEl) {
      countEl.textContent = `${formatNumberJa(totalLaneCount)}件`;
    }
    if (!newlyAddedChronological || newlyAddedChronological.length === 0) return;
    const listEl = document.getElementById(cfg.listId);
    if (!listEl) return;
    const emptyHint = listEl.querySelector(".empty-hint");
    if (emptyHint) {
      emptyHint.remove();
    }
    if (newlyAddedChronological.length >= YT_SIDE_PANEL_DISPLAY_LIMIT) {
      clearChildren(listEl);
      const newest = newlyAddedChronological.slice(-YT_SIDE_PANEL_DISPLAY_LIMIT).reverse();
      const frag2 = document.createDocumentFragment();
      for (let i = 0; i < newest.length; i += 1) {
        frag2.appendChild(createChatItemElement(newest[i]));
      }
      listEl.appendChild(frag2);
      return;
    }
    const frag = document.createDocumentFragment();
    for (let i = newlyAddedChronological.length - 1; i >= 0; i -= 1) {
      frag.appendChild(createChatItemElement(newlyAddedChronological[i]));
    }
    listEl.insertBefore(frag, listEl.firstChild);
    while (listEl.children.length > YT_SIDE_PANEL_DISPLAY_LIMIT) {
      if (listEl.lastElementChild) {
        listEl.removeChild(listEl.lastElementChild);
      } else {
        break;
      }
    }
  }
  function renderLiveStatsAndOfficialRow(currentSummary, totalComments, ranking, incState) {
    const uniqueVisitors = Number(ranking?.uniqueCommenterCount || 0);
    const concurrent = typeof currentSummary?.concurrentViewers === "number" && Number.isFinite(currentSummary.concurrentViewers) && currentSummary.concurrentViewers >= 0 ? currentSummary.concurrentViewers : null;
    const commentsCardVal = document.getElementById("liveStatComments");
    if (commentsCardVal) {
      commentsCardVal.textContent = formatNumberJa(totalComments);
    }
    const concurrentEstEl = document.getElementById("watchConcurrentEst");
    if (concurrentEstEl) {
      concurrentEstEl.textContent = concurrent !== null ? formatNumberJa(concurrent) : "—";
    }
    const visitorsCardVal = document.getElementById("watchViewerDom");
    if (visitorsCardVal) {
      visitorsCardVal.textContent = formatNumberJa(uniqueVisitors);
    }
    const offVisitors = document.getElementById("officialStatVisitors");
    if (offVisitors) {
      offVisitors.textContent = formatNumberJa(uniqueVisitors);
    }
    const offComments = document.getElementById("officialStatComments");
    if (offComments) {
      offComments.textContent = formatNumberJa(totalComments);
    }
    const offElapsed = document.getElementById("officialStatElapsed");
    if (offElapsed) {
      const startMs = (incState && incState.firstRecordedAt > 0 ? incState.firstRecordedAt : 0) || Number(currentSummary?.createdAt || 0);
      const endMs = Math.max(
        incState && incState.lastRecordedAt > 0 ? incState.lastRecordedAt : 0,
        Number(currentSummary?.updatedAt || 0)
      ) || Date.now();
      if (startMs > 0 && endMs >= startMs && (totalComments > 0 || currentSummary)) {
        offElapsed.textContent = formatElapsedDurationJa(endMs - startMs);
      } else {
        offElapsed.textContent = "—";
      }
    }
    const offSuperchat = document.getElementById("officialStatSuperchat");
    if (offSuperchat) {
      const primary = ranking?.primaryCurrencySummary;
      offSuperchat.textContent = primary?.formatted || "—";
    }
    const offMemGift = document.getElementById("officialStatMemberGift");
    if (offMemGift) {
      const memGiftCount = Number(ranking?.counts?.membership || 0) + Number(ranking?.counts?.membershipGift || 0);
      offMemGift.textContent = `${formatNumberJa(memGiftCount)}件`;
    }
    const comeviewMeta = document.getElementById("yt-comeview-summary-meta");
    if (comeviewMeta) {
      comeviewMeta.textContent = `合計 ${formatNumberJa(totalComments)}件`;
    }
  }
  function createSupportRankLineCard(opts) {
    const channelUrl = safeHttpUrl(opts.channelUrl || buildYtChannelUrl(opts.channelId));
    const card = channelUrl ? document.createElement("a") : document.createElement("div");
    card.className = channelUrl ? "nl-top-support-rank__line nl-top-support-rank__line--linkable supporter-row" : "nl-top-support-rank__line supporter-row";
    card.setAttribute("role", "listitem");
    if (channelUrl) {
      card.href = channelUrl;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
    }
    const displayName = String(opts.name || opts.channelId || "リスナー").trim();
    const shortId = formatShortChannelId(opts.channelId);
    card.title = opts.channelId ? `${displayName} (${opts.channelId}) — ${opts.countText}` : `${displayName} — ${opts.countText}`;
    const placeSpan = document.createElement("span");
    placeSpan.className = "nl-top-support-rank__place";
    placeSpan.textContent = opts.placeText;
    card.appendChild(placeSpan);
    const countSpan = document.createElement("span");
    countSpan.className = "nl-top-support-rank__count";
    countSpan.textContent = opts.countText;
    card.appendChild(countSpan);
    const thumbWrap = document.createElement("span");
    thumbWrap.className = "nl-top-support-rank__thumb-wrap";
    thumbWrap.appendChild(
      createAvatarImgWithFallback(
        opts.iconUrl || "",
        displayName,
        opts.channelId || displayName,
        "nl-top-support-rank__thumb"
      )
    );
    card.appendChild(thumbWrap);
    if (shortId) {
      const idSpan = document.createElement("span");
      idSpan.className = "nl-top-support-rank__id";
      idSpan.textContent = shortId;
      idSpan.title = opts.channelId;
      card.appendChild(idSpan);
    }
    const nameSpan = document.createElement("span");
    nameSpan.className = "nl-top-support-rank__name";
    nameSpan.textContent = displayName;
    card.appendChild(nameSpan);
    return card;
  }
  function renderTopSupportRankStrip(currentSummary, ranking) {
    const listEl = document.getElementById("topSupportRankList");
    if (!listEl) return;
    clearChildren(listEl);
    const frag = document.createDocumentFragment();
    const casterTile = document.createElement("div");
    casterTile.className = "nl-top-support-rank__caster";
    casterTile.setAttribute("role", "listitem");
    const casterLabel = document.createElement("span");
    casterLabel.className = "nl-top-support-rank__caster-label";
    casterLabel.textContent = "配信者";
    casterTile.appendChild(casterLabel);
    const bName = String(
      currentSummary?.broadcasterName || currentSummary?.title || "YouTube 配信者"
    ).trim();
    const bChannelId = String(currentSummary?.broadcasterChannelId || "").trim();
    const bChannelUrl = safeHttpUrl(buildYtChannelUrl(bChannelId)) || (selectedVideoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(selectedVideoId)}` : "");
    const casterThumb = createAvatarImgWithFallback(
      currentSummary?.broadcasterIconUrl || "",
      bName,
      bChannelId || bName,
      "nl-top-support-rank__caster-thumb",
      BROADCASTER_FALLBACK_ICON
    );
    casterTile.appendChild(casterThumb);
    const casterNameSpan = document.createElement("span");
    casterNameSpan.className = "nl-top-support-rank__caster-name";
    casterNameSpan.textContent = bName;
    casterNameSpan.title = bChannelId ? `${bName} (${bChannelId})` : bName;
    casterTile.appendChild(casterNameSpan);
    if (bChannelUrl) {
      const followLink = document.createElement("a");
      followLink.className = "nl-top-support-rank__caster-follow";
      followLink.href = bChannelUrl;
      followLink.target = "_blank";
      followLink.rel = "noopener noreferrer";
      followLink.textContent = bChannelId ? "チャンネル" : "視聴ページ";
      casterTile.appendChild(followLink);
    }
    frag.appendChild(casterTile);
    const commenters = (Array.isArray(ranking?.commenters) ? ranking.commenters : []).filter(
      (c) => !bChannelId || c.channelId !== bChannelId
    );
    const topSlice = commenters.slice(0, TOP_SUPPORT_STRIP_LIMIT);
    for (let i = 0; i < topSlice.length; i += 1) {
      const c = topSlice[i];
      const countLabel = c.primaryFormattedAmount ? `${c.commentCount}件 · ${c.primaryFormattedAmount}` : `${c.commentCount}件`;
      frag.appendChild(
        createSupportRankLineCard({
          placeText: String(i + 1),
          countText: countLabel,
          name: c.name,
          channelId: c.channelId,
          iconUrl: c.iconUrl,
          channelUrl: c.channelUrl
        })
      );
    }
    listEl.appendChild(frag);
  }
  function renderNorthStarSupportLanes(ranking) {
    const summaryEl = document.getElementById("yt-support-summary");
    const currencyContainer = document.getElementById("yt-currency-ranking-container");
    const memberSummaryEl = document.getElementById("yt-member-gift-summary");
    const memberListEl = document.getElementById("yt-member-gift-list");
    const paidTotalCount = Number(ranking?.counts?.superchat || 0) + Number(ranking?.counts?.sticker || 0);
    if (summaryEl) {
      summaryEl.textContent = `スパチャ・ステッカー ${formatNumberJa(paidTotalCount)}件（通貨別集計・換算なし）`;
    }
    if (memberSummaryEl) {
      memberSummaryEl.textContent = `メンバー加入 ${formatNumberJa(ranking?.counts?.membership || 0)}件 / ギフト ${formatNumberJa(ranking?.counts?.membershipGift || 0)}件`;
    }
    if (currencyContainer) {
      clearChildren(currencyContainer);
      const currencies = Object.keys(ranking?.byCurrency || {});
      if (currencies.length === 0) {
        const hint = document.createElement("div");
        hint.className = "empty-hint";
        hint.textContent = "スーパーチャット・ステッカーが届くと通貨ごとに集計されます。";
        currencyContainer.appendChild(hint);
      } else {
        for (const currency of currencies) {
          const box = document.createElement("div");
          box.className = "currency-box";
          box.dataset.currency = currency;
          const header = document.createElement("div");
          header.className = "currency-header";
          const titleSpan = document.createElement("span");
          titleSpan.textContent = `${currency} ランキング`;
          const totalSpan = document.createElement("span");
          totalSpan.textContent = `合計 ${formatYtCurrencyAmount(
            ranking.totalsByCurrency[currency],
            currency
          )}`;
          header.appendChild(titleSpan);
          header.appendChild(totalSpan);
          box.appendChild(header);
          const listWrap = document.createElement("div");
          listWrap.className = "nl-top-support-rank__list";
          listWrap.setAttribute("role", "list");
          const rows = ranking.byCurrency[currency].slice(0, 12);
          for (const row of rows) {
            listWrap.appendChild(
              createSupportRankLineCard({
                placeText: `${row.rank}位`,
                countText: `${row.formattedAmount} (${row.count}回)`,
                name: row.name,
                channelId: row.channelId,
                iconUrl: row.iconUrl,
                channelUrl: row.channelUrl
              })
            );
          }
          box.appendChild(listWrap);
          currencyContainer.appendChild(box);
        }
      }
    }
    if (memberListEl) {
      clearChildren(memberListEl);
      const memberSupporters = (ranking?.supporters || []).filter(
        (s) => s.membershipCount > 0 || s.giftCount > 0
      );
      if (memberSupporters.length === 0) {
        const hint = document.createElement("div");
        hint.className = "empty-hint";
        hint.textContent = "メンバー加入・メンバーシップギフトが届くとここに表示されます。";
        memberListEl.appendChild(hint);
      } else {
        const frag = document.createDocumentFragment();
        for (let i = 0; i < Math.min(memberSupporters.length, 16); i += 1) {
          const sup = memberSupporters[i];
          const badgeText = sup.giftCount > 0 ? `ギフト ${sup.giftCount}回` : `メンバー加入 ${sup.membershipCount}回`;
          frag.appendChild(
            createSupportRankLineCard({
              placeText: `${i + 1}`,
              countText: badgeText,
              name: sup.name,
              channelId: sup.channelId,
              iconUrl: sup.iconUrl,
              channelUrl: sup.channelUrl
            })
          );
        }
        memberListEl.appendChild(frag);
      }
    }
  }
  function createStoryUserlaneCell(opts) {
    const channelUrl = safeHttpUrl(opts.channelUrl || buildYtChannelUrl(opts.channelId));
    const cell = channelUrl ? document.createElement("a") : document.createElement("span");
    cell.className = channelUrl ? "nl-story-userlane-cell nl-story-userlane-cell--linkable" : "nl-story-userlane-cell";
    cell.setAttribute("role", "listitem");
    if (channelUrl) {
      cell.href = channelUrl;
      cell.target = "_blank";
      cell.rel = "noopener noreferrer";
    }
    if (opts.pulseBadge) {
      cell.setAttribute("data-pulse", opts.pulseBadge);
    }
    const displayName = String(opts.name || opts.channelId || "リスナー").trim();
    const shortId = formatShortChannelId(opts.channelId);
    cell.title = opts.channelId ? `${displayName} (${opts.channelId})` : displayName;
    cell.appendChild(
      createAvatarImgWithFallback(
        opts.iconUrl || "",
        displayName,
        opts.channelId || displayName,
        "nl-story-userlane-avatar"
      )
    );
    const meta = document.createElement("span");
    meta.className = "nl-story-userlane-meta";
    if (opts.statsBadge) {
      meta.setAttribute("data-stats", opts.statsBadge);
    }
    if (shortId) {
      const idSpan = document.createElement("span");
      idSpan.className = "nl-story-userlane-meta__id";
      idSpan.textContent = shortId;
      meta.appendChild(idSpan);
    }
    const nameSpan = document.createElement("span");
    nameSpan.className = "nl-story-userlane-meta__name";
    nameSpan.textContent = displayName;
    meta.appendChild(nameSpan);
    cell.appendChild(meta);
    return cell;
  }
  function bindStoryTileClick(cell, user) {
    cell.addEventListener("click", (ev) => {
      const e = (
        /** @type {MouseEvent} */
        ev
      );
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      void showStoryUserDetail(user);
    });
  }
  function renderSupportVisualDetails(ranking) {
    const commenters = Array.isArray(ranking?.commenters) ? ranking.commenters : [];
    const built = buildYtUserLaneTiers(commenters, { limitPerTier: STORY_USERLANE_LIMIT });
    for (const key of YT_USER_LANE_TIER_KEYS) {
      const laneEl = document.getElementById(`storyTierLane-${key}`);
      const countEl = document.getElementById(`storyTierCount-${key}`);
      const guideEl = document.getElementById(`storyTierGuide-${key}`);
      const wrapEl = document.getElementById(`storyTierWrap-${key}`);
      const users = built.tiers[key];
      const total = built.totals[key];
      if (guideEl && !guideEl.textContent) guideEl.textContent = STORY_TIER_GUIDE[key];
      if (countEl) {
        countEl.textContent = total > users.length ? `${formatNumberJa(users.length)}人（ほか${formatNumberJa(total - users.length)}人）` : `${formatNumberJa(total)}人`;
      }
      if (wrapEl) wrapEl.hidden = total === 0 && (key === "gift" || key === "member");
      if (!laneEl) continue;
      clearChildren(laneEl);
      if (users.length === 0) {
        if (key === "link" || key === "tanu" || key === "konta") {
          const empty = document.createElement("p");
          empty.className = "nl-story-userlane__empty-note";
          empty.textContent = key === "link" ? "コメントが届くと、ここに丸アイコンが並びます。" : "この段に当てはまる人はまだいません。";
          laneEl.appendChild(empty);
        }
        continue;
      }
      const frag = document.createDocumentFragment();
      for (const u of users) {
        let pulse = `${u.commentCount}件`;
        if (key === "gift") pulse = u.primaryFormattedAmount || `${u.superchatCount + u.stickerCount}回`;
        else if (key === "member") {
          pulse = u.giftCount > 0 ? `🎁${u.giftCount}回` : u.membershipCount > 0 ? `加入${u.membershipCount}回` : "⭐メンバー";
        }
        const stats = u.primaryFormattedAmount ? `💬${u.commentCount}件 · ${u.primaryFormattedAmount}` : `💬${u.commentCount}件`;
        const cell = createStoryUserlaneCell({
          name: u.name,
          channelId: u.channelId,
          iconUrl: u.iconUrl,
          channelUrl: u.channelUrl,
          pulseBadge: pulse,
          statsBadge: stats
        });
        bindStoryTileClick(cell, u);
        frag.appendChild(cell);
      }
      laneEl.appendChild(frag);
    }
    const footEl = document.getElementById("storyUserLaneFoot");
    if (footEl) {
      const others = built.total - built.displayed;
      footEl.textContent = others > 0 ? `いま ${formatNumberJa(built.displayed)} 件を表示中（ほか ${formatNumberJa(others)}人・直近アクティブ順）` : `いま ${formatNumberJa(built.displayed)} 件を表示中`;
    }
    const growthGridEl = document.getElementById("sceneStoryGrowth");
    const gaugeLabelEl = document.getElementById("sceneStoryGaugeLabel");
    const gridSlice = commenters.slice(0, STORY_GROWTH_GRID_LIMIT);
    if (growthGridEl) {
      clearChildren(growthGridEl);
      const frag = document.createDocumentFragment();
      for (let i = 0; i < gridSlice.length; i += 1) {
        const u = gridSlice[i];
        const channelUrl = safeHttpUrl(u.channelUrl || buildYtChannelUrl(u.channelId));
        const cell = channelUrl ? document.createElement("a") : document.createElement("span");
        cell.className = "nl-story-growth-cell nl-story-growth-cell--repeat";
        cell.setAttribute("data-support-ordinal", String(u.commentCount));
        cell.title = `${u.name} (${u.commentCount}件)`;
        if (channelUrl) {
          cell.href = channelUrl;
          cell.target = "_blank";
          cell.rel = "noopener noreferrer";
        }
        const media = document.createElement("span");
        media.className = "nl-story-growth-cell__media";
        media.appendChild(
          createAvatarImgWithFallback(
            u.iconUrl || "",
            u.name,
            u.channelId || u.name,
            "nl-story-growth-icon nl-story-growth-icon--remote"
          )
        );
        cell.appendChild(media);
        bindStoryTileClick(cell, u);
        frag.appendChild(cell);
      }
      growthGridEl.appendChild(frag);
    }
    if (gaugeLabelEl) {
      gaugeLabelEl.textContent = commenters.length > gridSlice.length ? `いま ${formatNumberJa(gridSlice.length)} 人を表示中（ほか ${formatNumberJa(commenters.length - gridSlice.length)}人）` : `いま ${formatNumberJa(commenters.length)} 人を表示中`;
    }
    visualDetailsNeedsRefresh = false;
  }
  async function showStoryUserDetail(user) {
    const box = document.getElementById("sceneStoryDetail");
    if (!box || !user) return;
    const img = (
      /** @type {HTMLImageElement | null} */
      document.getElementById("sceneStoryDetailImg")
    );
    const nameEl = document.getElementById("sceneStoryDetailUser");
    const metaEl = document.getElementById("sceneStoryDetailUserMeta");
    const textEl = document.getElementById("sceneStoryDetailText");
    const subEl = document.getElementById("sceneStoryDetailMeta");
    const listEl = document.getElementById("sceneStoryDetailList");
    const channelId = String(user.channelId || "");
    const name = String(user.name || channelId || "リスナー");
    if (img) {
      const fallback = getDeterministicIdenticonUrl(channelId || name);
      const safe = safeHttpUrl(user.iconUrl || "");
      img.src = safe || fallback;
      img.referrerPolicy = "no-referrer";
      img.onerror = () => {
        if (img.src !== fallback) img.src = fallback;
      };
    }
    if (nameEl) {
      clearChildren(nameEl);
      const url = safeHttpUrl(user.channelUrl || buildYtChannelUrl(channelId));
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = name;
        nameEl.appendChild(a);
      } else {
        nameEl.textContent = name;
      }
    }
    if (metaEl) {
      const parts = [];
      if (channelId) parts.push(channelId);
      parts.push(`コメント ${formatNumberJa(user.commentCount || 0)}件`);
      if (user.primaryFormattedAmount) parts.push(`スパチャ ${user.primaryFormattedAmount}`);
      if (user.isMember) parts.push("メンバー");
      metaEl.textContent = parts.join(" · ");
    }
    if (textEl) textEl.textContent = "発言を読み込んでいます…";
    if (subEl) subEl.textContent = "";
    if (listEl) clearChildren(listEl);
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    let rows = [];
    try {
      const all = selectedVideoId ? await getYtStreamCommentsByVideoId(selectedVideoId) : [];
      rows = all.filter((r) => channelId ? r.channelId === channelId : r.name === name);
    } catch {
      rows = [];
    }
    rows.sort((a, b) => Number(b.recordedAt || 0) - Number(a.recordedAt || 0));
    if (textEl) textEl.textContent = rows.length ? `この配信での発言 ${formatNumberJa(rows.length)}件（新しい順）` : "この配信での発言はまだ記録されていません。";
    if (listEl) {
      const frag = document.createDocumentFragment();
      for (const r of rows.slice(0, 200)) {
        const li = document.createElement("li");
        const when = formatRelativeTimeJa(Number(r.recordedAt || 0), Date.now());
        const amount = Number(r.amount || 0) > 0 ? `【${r.currency || ""} ${formatNumberJa(r.amount)}】` : "";
        li.textContent = `${when ? `${when} ` : ""}${amount}${String(r.text || (r.kind === "membership" ? "（メンバー加入）" : ""))}`;
        frag.appendChild(li);
      }
      listEl.appendChild(frag);
    }
    if (subEl && rows.length > 200) subEl.textContent = `ほか ${formatNumberJa(rows.length - 200)}件は HTML 書き出しで見られます。`;
  }
  var supportTimelineBuffer = [];
  function pushSupportTimeline(records, reset) {
    if (reset) supportTimelineBuffer = [];
    const sorted = (Array.isArray(records) ? records : []).slice().sort((a, b) => Number(b.recordedAt || 0) - Number(a.recordedAt || 0));
    supportTimelineBuffer = sorted.concat(supportTimelineBuffer).slice(0, SUPPORT_TIMELINE_LIMIT);
  }
  function renderSupportTimeline() {
    const details = (
      /** @type {HTMLDetailsElement | null} */
      document.getElementById("supportTimelineDetails")
    );
    const body = document.getElementById("supportTimelineBody");
    const giftMeta = document.getElementById("supportTimelineGiftMeta");
    const paidCount = supportTimelineBuffer.filter((r) => r.kind && r.kind !== "text").length;
    if (giftMeta) {
      giftMeta.hidden = paidCount === 0;
      giftMeta.textContent = paidCount > 0 ? `応援 ${paidCount}件` : "";
    }
    if (!details?.open || !body) return;
    clearChildren(body);
    if (supportTimelineBuffer.length === 0) {
      const p = document.createElement("p");
      p.className = "nl-support-timeline__empty";
      p.textContent = "コメントやスパチャが届くと、ここに時刻順で並びます。";
      body.appendChild(p);
      return;
    }
    const now = Date.now();
    const frag = document.createDocumentFragment();
    for (const r of supportTimelineBuffer) {
      const isSupport = r.kind && r.kind !== "text";
      const url = safeHttpUrl(buildYtChannelUrl(r.channelId || ""));
      const row = url ? document.createElement("a") : document.createElement("div");
      if (url) {
        row.href = url;
        row.target = "_blank";
        row.rel = "noopener noreferrer";
      }
      const name = String(r.name || r.channelId || "リスナー");
      const ago = formatRelativeTimeJa(Number(r.recordedAt || 0), now);
      if (isSupport) {
        row.className = "nl-tl-gift";
        const wrap = document.createElement("span");
        wrap.className = "nl-tl-gift__avatar-wrap";
        wrap.appendChild(createAvatarImgWithFallback(r.iconUrl || "", name, r.channelId || name, "nl-tl-gift__avatar"));
        const badge = document.createElement("span");
        badge.className = "nl-tl-gift__badge";
        badge.setAttribute("aria-hidden", "true");
        badge.textContent = r.kind === "superchat" || r.kind === "sticker" ? "💰" : "⭐";
        wrap.appendChild(badge);
        row.appendChild(wrap);
        const n = document.createElement("span");
        n.className = "nl-tl-gift__name";
        n.textContent = name;
        row.appendChild(n);
        const item = document.createElement("span");
        item.className = "nl-tl-gift__item";
        item.textContent = r.kind === "superchat" ? `スーパーチャット${r.text ? `「${r.text}」` : ""}` : r.kind === "sticker" ? "スーパーステッカー" : r.kind === "membership_gift" ? "メンバーシップギフト" : "メンバー加入";
        row.appendChild(item);
        if (Number(r.amount || 0) > 0) {
          const pt = document.createElement("span");
          pt.className = "nl-tl-gift__pt";
          pt.textContent = formatYtCurrencyAmount(Number(r.amount), String(r.currency || ""));
          row.appendChild(pt);
        }
      } else {
        row.className = "nl-tl-row";
        row.appendChild(createAvatarImgWithFallback(r.iconUrl || "", name, r.channelId || name, "nl-tl-row__avatar"));
        const n = document.createElement("span");
        n.className = "nl-tl-row__name";
        n.textContent = name;
        row.appendChild(n);
        const t = document.createElement("span");
        t.className = "nl-tl-row__text";
        t.textContent = String(r.text || "");
        row.appendChild(t);
      }
      if (ago) {
        const tm = document.createElement("span");
        tm.className = "nl-tl-time";
        tm.setAttribute("aria-hidden", "true");
        tm.textContent = ago;
        row.appendChild(tm);
      }
      row.title = `${name}：${String(r.text || "")}${ago ? `（${ago}）` : ""}`;
      frag.appendChild(row);
    }
    body.appendChild(frag);
  }
  async function renderVoiceUiFromStorage(prefetchedData) {
    const data = prefetchedData || await chrome.storage.local.get([
      STORAGE_KEYS.STREAM_SUMMARIES,
      STORAGE_KEYS.VOICE_SETTINGS,
      STORAGE_KEYS.VOICE_QUEUE,
      STORAGE_KEYS.VOICE_STATE
    ]);
    const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
    const currentSummary = selectedVideoId ? summaries[selectedVideoId] : null;
    const settings = data[STORAGE_KEYS.VOICE_SETTINGS] || {
      enabled: true,
      mode: YT_VOICE_MODES.ALL,
      broadcasterNameOverride: ""
    };
    const voiceState = data[STORAGE_KEYS.VOICE_STATE] || {
      effectiveMode: settings.mode,
      autoSwitched: false
    };
    const voiceQueue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE]) ? data[STORAGE_KEYS.VOICE_QUEUE] : [];
    const lightActive = voiceState.lightVoiceActive === true && settings.enabled !== false;
    const gpuTip = voiceState.weakPcSeen === true;
    for (const id of ["yt-voice-engine-banner", "yt-voice-engine-note"]) {
      const el = document.getElementById(id);
      if (!el) continue;
      const lines = [];
      if (lightActive) lines.push(VOICE_LIGHT_ACTIVE_TEXT);
      if (gpuTip) lines.push(VOICE_GPU_TIP_TEXT);
      el.textContent = lines.join("\n");
      el.hidden = lines.length === 0;
    }
    const lightEl = (
      /** @type {HTMLInputElement | null} */
      document.getElementById("yt-voice-light")
    );
    if (lightEl && document.activeElement !== lightEl) {
      lightEl.checked = settings.lightVoice !== "off";
    }
    const enabledEl = (
      /** @type {HTMLInputElement | null} */
      document.getElementById("yt-voice-enabled")
    );
    if (enabledEl && document.activeElement !== enabledEl) {
      enabledEl.checked = Boolean(settings.enabled);
    }
    const modeEl = (
      /** @type {HTMLSelectElement | null} */
      document.getElementById("yt-voice-mode")
    );
    if (modeEl && document.activeElement !== modeEl) {
      modeEl.value = settings.mode === YT_VOICE_MODES.SELECT ? "select" : "all";
    }
    const bNameInput = (
      /** @type {HTMLInputElement | null} */
      document.getElementById("yt-broadcaster-name-input")
    );
    if (bNameInput && document.activeElement !== bNameInput) {
      bNameInput.value = settings.broadcasterNameOverride || currentSummary?.broadcasterName || "";
    }
    const queueInfoEl = document.getElementById("yt-voice-queue-info");
    if (queueInfoEl) {
      const modeLabel = voiceState.effectiveMode === YT_VOICE_MODES.SELECT ? "選んで読む" : "全部読む";
      queueInfoEl.textContent = `待機キュー: ${voiceQueue.length}件（実効モード: ${modeLabel}）`;
    }
    const autoSwitchBadge = document.getElementById("yt-voice-autoswitch-badge");
    if (autoSwitchBadge) {
      if (voiceState.autoSwitched) {
        autoSwitchBadge.classList.add("is-active");
      } else {
        autoSwitchBadge.classList.remove("is-active");
      }
    }
    const statusBox = document.getElementById("yt-voice-status-box");
    if (statusBox) {
      if (voiceState.voicevoxOnline === true) {
        const styleCount = Number(voiceState.availableStyleCount) || (Array.isArray(settings.availableStyleIds) ? settings.availableStyleIds.length : YT_DEFAULT_STYLE_IDS.length);
        statusBox.className = "voice-status-box is-online";
        statusBox.textContent = `VOICEVOX 接続中（${VOICEVOX_BASE_URL} / 利用可能スタイル: ${styleCount}種・サイドパネルを閉じていても再生継続）`;
      } else if (voiceState.voicevoxOnline === false) {
        const detail = voiceState.voicevoxReason === "timeout" ? "応答がタイムアウトしました" : "ローカルの VOICEVOX エンジンへ接続できませんでした";
        statusBox.className = "voice-status-box is-offline";
        statusBox.textContent = `VOICEVOX が起動していません（${VOICEVOX_BASE_URL} — ${detail}）。VOICEVOX を起動して「VOICEVOX 再確認」を押すと、チャンネルIDごとに決まった声で読み上げます。`;
      }
    }
    const lastSpokenEl = document.getElementById("yt-voice-last-spoken");
    if (lastSpokenEl && voiceState.lastSpokenSummary) {
      lastSpokenEl.textContent = String(voiceState.lastSpokenSummary);
    }
  }
  function updateStreamHeaderUi(summaries, activeId, totalItemsCount) {
    const videoIds = Object.keys(summaries).sort(
      (a, b) => Number(summaries[b]?.updatedAt || 0) - Number(summaries[a]?.updatedAt || 0)
    );
    if (!selectedVideoId || !summaries[selectedVideoId]) {
      selectedVideoId = activeId && summaries[activeId] ? activeId : videoIds[0] || "";
    }
    const selectEl = (
      /** @type {HTMLSelectElement | null} */
      document.getElementById("yt-stream-select")
    );
    if (selectEl && document.activeElement !== selectEl) {
      clearChildren(selectEl);
      if (videoIds.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "記録済みの配信はまだありません";
        selectEl.appendChild(opt);
      } else {
        for (const vid of videoIds) {
          const s = summaries[vid];
          const opt = document.createElement("option");
          opt.value = vid;
          const labelTitle = s.title || vid;
          opt.textContent = `${labelTitle} (${formatNumberJa(Number(s.itemCount || 0))}件)`;
          if (vid === selectedVideoId) opt.selected = true;
          selectEl.appendChild(opt);
        }
      }
    }
    const currentSummary = selectedVideoId ? summaries[selectedVideoId] : null;
    const summaryEl = document.getElementById("yt-stream-summary");
    if (summaryEl) {
      if (currentSummary) {
        const bName = currentSummary.broadcasterName ? ` / 配信者: ${currentSummary.broadcasterName}` : "";
        summaryEl.textContent = `記録中: ${currentSummary.title || currentSummary.videoId}${bName}（合計 ${formatNumberJa(totalItemsCount)}件）`;
      } else {
        summaryEl.textContent = "YouTube Live の視聴ページを開くと自動でチャットを記録します";
      }
    }
    const filterBadge = document.getElementById("yt-detected-filter-badge");
    const noticeBanner = document.getElementById("yt-all-chat-notice");
    const filterLabel = String(currentSummary?.chatFilterLabel || "").trim();
    if (filterBadge && noticeBanner) {
      if (!filterLabel) {
        filterBadge.textContent = "チャット表示: 検出待ち";
        noticeBanner.classList.remove("is-warning");
      } else if (/トップチャット|top chat/i.test(filterLabel)) {
        filterBadge.textContent = `現在「${filterLabel}」— 「すべてのチャット」推奨`;
        noticeBanner.classList.add("is-warning");
      } else {
        filterBadge.textContent = `チャット表示: ${filterLabel}`;
        noticeBanner.classList.remove("is-warning");
      }
    }
  }
  async function renderStreamFullLoad() {
    const t0 = performance.now();
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.STREAM_SUMMARIES,
      STORAGE_KEYS.ACTIVE_VIDEO_ID,
      STORAGE_KEYS.VOICE_SETTINGS,
      STORAGE_KEYS.VOICE_QUEUE,
      STORAGE_KEYS.VOICE_STATE
    ]);
    const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
    const activeId = String(data[STORAGE_KEYS.ACTIVE_VIDEO_ID] || "");
    const videoIds = Object.keys(summaries).sort(
      (a, b) => Number(summaries[b]?.updatedAt || 0) - Number(summaries[a]?.updatedAt || 0)
    );
    if (!selectedVideoId || !summaries[selectedVideoId]) {
      selectedVideoId = activeId && summaries[activeId] ? activeId : videoIds[0] || "";
    }
    const currentSummary = selectedVideoId ? summaries[selectedVideoId] : null;
    const items = selectedVideoId ? await getYtStreamCommentsByVideoId(selectedVideoId) : [];
    metrics.fullGetAllCount += 1;
    currentIncrementalState = createYtStreamIncrementalState(selectedVideoId, {
      broadcasterChannelId: currentSummary?.broadcasterChannelId || "",
      displayLimit: YT_SIDE_PANEL_DISPLAY_LIMIT
    });
    const applied = applyYtStreamIncrementalItems(currentIncrementalState, items, {
      broadcasterChannelId: currentSummary?.broadcasterChannelId || ""
    });
    updateStreamHeaderUi(summaries, activeId, applied.totalCount);
    renderLiveStatsAndOfficialRow(
      currentSummary,
      applied.totalCount,
      applied.ranking,
      currentIncrementalState
    );
    renderTopSupportRankStrip(currentSummary, applied.ranking);
    renderNorthStarSupportLanes(applied.ranking);
    renderSupportVisualDetails(applied.ranking);
    await renderVoiceUiFromStorage(data);
    renderLaneFull("rinku", applied.laneDisplay.rinku, applied.laneCounts.rinku);
    renderLaneFull("konta", applied.laneDisplay.konta, applied.laneCounts.konta);
    renderLaneFull("tanunee", applied.laneDisplay.tanunee, applied.laneCounts.tanunee);
    pushSupportTimeline(items.slice(-SUPPORT_TIMELINE_LIMIT), true);
    renderSupportTimeline();
    updateExportButtonsState(applied.totalCount);
    metrics.lastFullLoadDurationMs = Math.round((performance.now() - t0) * 100) / 100;
  }
  async function renderStreamIncrementalUpdate() {
    const t0 = performance.now();
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.STREAM_SUMMARIES,
      STORAGE_KEYS.ACTIVE_VIDEO_ID,
      STORAGE_KEYS.VOICE_SETTINGS,
      STORAGE_KEYS.VOICE_QUEUE,
      STORAGE_KEYS.VOICE_STATE
    ]);
    const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
    const activeId = String(data[STORAGE_KEYS.ACTIVE_VIDEO_ID] || "");
    const videoIds = Object.keys(summaries).sort(
      (a, b) => Number(summaries[b]?.updatedAt || 0) - Number(summaries[a]?.updatedAt || 0)
    );
    if (!selectedVideoId || !summaries[selectedVideoId]) {
      selectedVideoId = activeId && summaries[activeId] ? activeId : videoIds[0] || "";
    }
    if (!currentIncrementalState || currentIncrementalState.videoId !== selectedVideoId) {
      await renderStreamFullLoad();
      return;
    }
    const currentSummary = selectedVideoId ? summaries[selectedVideoId] : null;
    const newRecords = selectedVideoId ? await getYtStreamCommentsSince(selectedVideoId, currentIncrementalState.lastRecordedAt) : [];
    metrics.incrementalFetchCount += 1;
    metrics.lastIncrementalFetchedItems = newRecords.length;
    const applied = applyYtStreamIncrementalItems(currentIncrementalState, newRecords, {
      broadcasterChannelId: currentSummary?.broadcasterChannelId || ""
    });
    metrics.lastIncrementalAddedItems = applied.addedCount;
    updateStreamHeaderUi(summaries, activeId, applied.totalCount);
    renderLiveStatsAndOfficialRow(
      currentSummary,
      applied.totalCount,
      applied.ranking,
      currentIncrementalState
    );
    await renderVoiceUiFromStorage(data);
    if (applied.addedCount > 0) {
      pushSupportTimeline(newRecords, false);
      renderSupportTimeline();
      updateExportButtonsState(applied.totalCount);
      patchLaneIncremental("rinku", applied.addedByLane.rinku, applied.laneCounts.rinku);
      patchLaneIncremental("konta", applied.addedByLane.konta, applied.laneCounts.konta);
      patchLaneIncremental("tanunee", applied.addedByLane.tanunee, applied.laneCounts.tanunee);
      renderTopSupportRankStrip(currentSummary, applied.ranking);
      const visualDetailsEl = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("supportVisualDetails")
      );
      if (visualDetailsEl?.open) {
        renderSupportVisualDetails(applied.ranking);
      } else {
        visualDetailsNeedsRefresh = true;
      }
    }
    if (applied.rankingChanged) {
      renderNorthStarSupportLanes(applied.ranking);
    }
    metrics.lastIncrementalDurationMs = Math.round((performance.now() - t0) * 100) / 100;
  }
  function requestVoicevoxRecheck() {
    chrome.runtime.sendMessage({ type: "YT_RECHECK_VOICEVOX" }, () => {
      void chrome.runtime.lastError;
      runRenderSerialized(() => renderVoiceUiFromStorage());
    });
  }
  async function restoreCollapsibleUiState() {
    try {
      const data = await chrome.storage.local.get([STORAGE_KEYS.UI_STATE]);
      const uiState = data[STORAGE_KEYS.UI_STATE] || {};
      const settingsDetails = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("yt-settings-details")
      );
      const comeviewDetails = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("yt-comeview-details")
      );
      const supportVisualDetails = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("supportVisualDetails")
      );
      if (settingsDetails) {
        settingsDetails.open = uiState.settingsOpen === true;
      }
      if (comeviewDetails) {
        comeviewDetails.open = uiState.comeviewOpen === true;
      }
      if (supportVisualDetails) {
        supportVisualDetails.open = uiState.supportVisualOpen !== false;
      }
      const growthCollapsed = uiState.storyGrowthCollapsed === true;
      applyStoryGrowthCollapsed(growthCollapsed);
    } catch {
    }
  }
  function saveCollapsibleUiState() {
    try {
      const settingsDetails = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("yt-settings-details")
      );
      const comeviewDetails = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("yt-comeview-details")
      );
      const supportVisualDetails = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("supportVisualDetails")
      );
      chrome.storage.local.set({
        [STORAGE_KEYS.UI_STATE]: {
          settingsOpen: Boolean(settingsDetails?.open),
          comeviewOpen: Boolean(comeviewDetails?.open),
          supportVisualOpen: Boolean(supportVisualDetails?.open),
          storyGrowthCollapsed: document.getElementById("storyGrowthCollapsible")?.hidden === true
        }
      });
    } catch {
    }
  }
  function applyStoryGrowthCollapsed(collapsed) {
    const box = document.getElementById("storyGrowthCollapsible");
    const btn = document.getElementById("storyGrowthCollapseBtn");
    if (box) box.hidden = collapsed;
    if (btn) {
      btn.textContent = collapsed ? "アイコン列を表示" : "アイコン列を隠す";
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }
  }
  function updateExportButtonsState(total) {
    const has = Number(total) > 0;
    for (const id of ["exportJson", "exportMarketingQuickBtn"]) {
      const b = (
        /** @type {HTMLButtonElement | null} */
        document.getElementById(id)
      );
      if (b) b.disabled = !has;
    }
  }
  function setComposeStatus(text, tone) {
    const el = document.getElementById("commentPostStatus");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text;
    el.classList.toggle("is-ok", tone === "ok");
    el.classList.toggle("is-error", tone === "error");
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 6e4);
  }
  async function loadSelectedStreamForExport() {
    const data = await chrome.storage.local.get([STORAGE_KEYS.STREAM_SUMMARIES]);
    const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
    const summary = selectedVideoId ? summaries[selectedVideoId] || null : null;
    const items = selectedVideoId ? await getYtStreamCommentsByVideoId(selectedVideoId) : [];
    return { summary, items };
  }
  var COMMENT_SEND_REASON_JA = Object.freeze({
    "no-tab": "この配信の YouTube タブが見つかりません。視聴ページを開いてください。",
    "no-chat-frame": "チャット欄が見つかりません。視聴ページでチャットを表示してください。",
    "no-input": "チャットの入力欄がありません（チャットが閉じている・アーカイブ・コメント制限中かもしれません）。",
    "not-signed-in": "YouTube にログインしていないので送れません。YouTube 側でログインしてください。",
    "no-send-button": "送信ボタンが見つかりません。YouTube の画面が変わったかもしれません。",
    "send-disabled": "YouTube 側で送信できない状態です（低速モード・メンバー限定など）。",
    "still-in-box": "送信ボタンを押しましたが、文字が入力欄に残っています。YouTube 側の画面を確認してください。",
    empty: "コメントが空です。"
  });
  function bindComposeAndExportEvents() {
    const input = (
      /** @type {HTMLTextAreaElement | null} */
      document.getElementById("commentInput")
    );
    const postBtn = (
      /** @type {HTMLButtonElement | null} */
      document.getElementById("postCommentBtn")
    );
    const syncPostBtn = () => {
      if (postBtn && input) postBtn.disabled = !input.value.trim() || postBtn.getAttribute("aria-busy") === "true";
    };
    const send = async () => {
      if (!input || !postBtn) return;
      const text = input.value.replace(/\s+/g, " ").trim();
      if (!text) return;
      postBtn.setAttribute("aria-busy", "true");
      postBtn.disabled = true;
      setComposeStatus("送信しています…", "");
      let res = null;
      try {
        res = await chrome.runtime.sendMessage({ type: "YT_SEND_COMMENT", videoId: selectedVideoId, text });
      } catch (e) {
        res = { ok: false, reason: String(e) };
      }
      postBtn.setAttribute("aria-busy", "false");
      if (res && res.ok) {
        input.value = "";
        setComposeStatus("送信しました（YouTube のチャット欄から送っています）", "ok");
      } else {
        const reason = String(res?.reason || "");
        setComposeStatus(
          /** @type {Record<string,string>} */
          COMMENT_SEND_REASON_JA[reason] || `送信できませんでした（${reason || "理由不明"}）`,
          "error"
        );
      }
      syncPostBtn();
    };
    input?.addEventListener("input", syncPostBtn);
    input?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
        ev.preventDefault();
        void send();
      }
    });
    postBtn?.addEventListener("click", () => void send());
    document.getElementById("exportJson")?.addEventListener("click", async () => {
      setComposeStatus("HTML レポートを作っています…", "");
      try {
        const { summary, items } = await loadSelectedStreamForExport();
        const now = Date.now();
        const html = buildYtCommentLogReportHtml({ summary, items, nowMs: now });
        downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), buildYtReportFilename("html", summary, now));
        setComposeStatus(`HTML レポートを保存しました（${formatNumberJa(items.length)}件）`, "ok");
      } catch (e) {
        setComposeStatus(`HTML レポートを作れませんでした（${String(e)}）`, "error");
      }
    });
    document.getElementById("exportMarketingQuickBtn")?.addEventListener("click", async () => {
      setComposeStatus("マーケ分析を作っています…", "");
      try {
        const { summary, items } = await loadSelectedStreamForExport();
        const now = Date.now();
        const html = buildYtMarketingReportHtml({ summary, items, nowMs: now });
        downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), buildYtReportFilename("marketing", summary, now));
        setComposeStatus("マーケ分析を保存しました", "ok");
      } catch (e) {
        setComposeStatus(`マーケ分析を作れませんでした（${String(e)}）`, "error");
      }
    });
    document.getElementById("captureScreenshot")?.addEventListener("click", async () => {
      setComposeStatus("動画の画面を保存しています…", "");
      let res = null;
      try {
        res = await chrome.runtime.sendMessage({ type: "YT_CAPTURE_FRAME", videoId: selectedVideoId });
      } catch (e) {
        res = { ok: false, reason: String(e) };
      }
      if (!res?.ok || typeof res.dataUrl !== "string" || !res.dataUrl.startsWith("data:image/png")) {
        setComposeStatus(
          res?.reason === "no-video" || res?.reason === "no-tab" ? "視聴ページの動画が見つかりません。配信を開いて再生してください。" : `スクショを保存できませんでした（${String(res?.reason || "理由不明")}）`,
          "error"
        );
        return;
      }
      const blob = await (await fetch(res.dataUrl)).blob();
      const d = /* @__PURE__ */ new Date();
      const p = (n) => String(n).padStart(2, "0");
      downloadBlob(blob, `yt-screenshot-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`);
      setComposeStatus("スクショを保存しました", "ok");
    });
    document.getElementById("storyGrowthCollapseBtn")?.addEventListener("click", () => {
      const box = document.getElementById("storyGrowthCollapsible");
      applyStoryGrowthCollapsed(box?.hidden !== true);
      saveCollapsibleUiState();
    });
    document.getElementById("sceneStoryDetailClose")?.addEventListener("click", () => {
      const box = document.getElementById("sceneStoryDetail");
      if (box) box.hidden = true;
    });
    document.getElementById("supportTimelineDetails")?.addEventListener("toggle", () => {
      renderSupportTimeline();
    });
    const autoAll = (
      /** @type {HTMLInputElement | null} */
      document.getElementById("yt-auto-all-chat")
    );
    if (autoAll) {
      chrome.storage.local.get(AUTO_ALL_CHAT_KEY).then((got) => {
        autoAll.checked = got?.[AUTO_ALL_CHAT_KEY] !== false;
      });
      autoAll.addEventListener("change", () => {
        chrome.storage.local.set({ [AUTO_ALL_CHAT_KEY]: autoAll.checked });
      });
    }
  }
  function bindUiEvents() {
    const reloadBtn = document.getElementById("reloadWatchTabBtn");
    reloadBtn?.addEventListener("click", () => {
      try {
        chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
          void chrome.runtime.lastError;
          const activeTab = tabs && tabs[0];
          if (activeTab?.id && activeTab.url && /youtube\.com\/(watch|live\/)/i.test(activeTab.url)) {
            chrome.tabs.reload(activeTab.id);
          }
        });
      } catch {
      }
      runRenderSerialized(() => renderStreamFullLoad());
    });
    const openComeviewBtn = document.getElementById("openComeviewBtn");
    openComeviewBtn?.addEventListener("click", () => {
      const comeviewDetails2 = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("yt-comeview-details")
      );
      if (!comeviewDetails2) return;
      comeviewDetails2.open = !comeviewDetails2.open;
      saveCollapsibleUiState();
      if (comeviewDetails2.open) {
        comeviewDetails2.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
    const openVoiceBtn = document.getElementById("openComeviewVoiceBtn");
    openVoiceBtn?.addEventListener("click", () => {
      const settingsDetails2 = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("yt-settings-details")
      );
      if (!settingsDetails2) return;
      settingsDetails2.open = !settingsDetails2.open;
      saveCollapsibleUiState();
      if (settingsDetails2.open) {
        settingsDetails2.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
    const supportVisualDetails = (
      /** @type {HTMLDetailsElement | null} */
      document.getElementById("supportVisualDetails")
    );
    supportVisualDetails?.addEventListener("toggle", () => {
      if (supportVisualDetails.open && visualDetailsNeedsRefresh && currentIncrementalState?.rankingAcc?.snapshot) {
        renderSupportVisualDetails(currentIncrementalState.rankingAcc.snapshot);
      }
      saveCollapsibleUiState();
    });
    bindComposeAndExportEvents();
    const comeviewDetails = document.getElementById("yt-comeview-details");
    comeviewDetails?.addEventListener("toggle", () => {
      saveCollapsibleUiState();
    });
    const settingsDetails = document.getElementById("yt-settings-details");
    settingsDetails?.addEventListener("toggle", () => {
      saveCollapsibleUiState();
    });
    const selectEl = (
      /** @type {HTMLSelectElement | null} */
      document.getElementById("yt-stream-select")
    );
    selectEl?.addEventListener("change", () => {
      selectedVideoId = selectEl.value;
      runRenderSerialized(() => renderStreamFullLoad());
    });
    const enabledEl = (
      /** @type {HTMLInputElement | null} */
      document.getElementById("yt-voice-enabled")
    );
    enabledEl?.addEventListener("change", () => {
      chrome.runtime.sendMessage(
        {
          type: "YT_UPDATE_VOICE_SETTINGS",
          payload: { enabled: enabledEl.checked }
        },
        () => {
          void chrome.runtime.lastError;
          runRenderSerialized(() => renderVoiceUiFromStorage());
        }
      );
    });
    const modeEl = (
      /** @type {HTMLSelectElement | null} */
      document.getElementById("yt-voice-mode")
    );
    modeEl?.addEventListener("change", () => {
      chrome.runtime.sendMessage(
        {
          type: "YT_UPDATE_VOICE_SETTINGS",
          payload: { mode: modeEl.value === "select" ? YT_VOICE_MODES.SELECT : YT_VOICE_MODES.ALL }
        },
        () => {
          void chrome.runtime.lastError;
          runRenderSerialized(() => renderVoiceUiFromStorage());
        }
      );
    });
    const bNameInput = (
      /** @type {HTMLInputElement | null} */
      document.getElementById("yt-broadcaster-name-input")
    );
    bNameInput?.addEventListener("change", () => {
      chrome.runtime.sendMessage(
        {
          type: "YT_UPDATE_VOICE_SETTINGS",
          payload: { broadcasterNameOverride: bNameInput.value.trim() }
        },
        () => {
          void chrome.runtime.lastError;
          runRenderSerialized(() => renderVoiceUiFromStorage());
        }
      );
    });
    const lightEl = (
      /** @type {HTMLInputElement | null} */
      document.getElementById("yt-voice-light")
    );
    lightEl?.addEventListener("change", () => {
      chrome.runtime.sendMessage(
        { type: "YT_UPDATE_VOICE_SETTINGS", payload: { lightVoice: lightEl.checked ? "auto" : "off" } },
        () => {
          void chrome.runtime.lastError;
          runRenderSerialized(() => renderVoiceUiFromStorage());
        }
      );
    });
    const recheckBtn = document.getElementById("yt-voice-recheck-btn");
    recheckBtn?.addEventListener("click", () => {
      requestVoicevoxRecheck();
    });
    const clearBtn = document.getElementById("yt-voice-clear-btn");
    clearBtn?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "YT_CLEAR_VOICE_QUEUE" }, () => {
        void chrome.runtime.lastError;
        runRenderSerialized(() => renderVoiceUiFromStorage());
      });
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (changes[STORAGE_KEYS.UI_STATE] && Object.keys(changes).length === 1) {
        return;
      }
      const streamChanged = Boolean(
        changes[STORAGE_KEYS.STREAM_SUMMARIES] || changes[STORAGE_KEYS.ACTIVE_VIDEO_ID]
      );
      if (streamChanged) {
        runRenderSerialized(() => renderStreamIncrementalUpdate());
      } else {
        metrics.voiceOnlyUpdateCount += 1;
        runRenderSerialized(() => renderVoiceUiFromStorage());
      }
    });
  }
  async function initSidepanel() {
    await restoreCollapsibleUiState();
    bindUiEvents();
    await runRenderSerialized(() => renderStreamFullLoad());
    requestVoicevoxRecheck();
  }
  initSidepanel();
})();
