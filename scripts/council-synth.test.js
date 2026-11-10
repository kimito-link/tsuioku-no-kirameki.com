import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import {
  estimateSynthTokens, orderSynthChain, shouldWaitAndRetry,
  SYNTH_STEPS, SYNTH_BLOCKS, SYNTH_MAX_TOKENS, SYNTH_OVERHEAD_TOKENS,
  buildSynthSystem, buildSynthPrompt, checkSynthAnswer, pickLeastIncomplete,
} from "./council-synth.mjs";
import { buildSystem, DESIGN_STANCE } from "./council-roles.mjs";

const groq = { label: "groq/gpt-oss-120b", provider: "groq" };
const cf = { label: "cloudflare/nemotron-120b", provider: "" };
const gem = { label: "gemini-2.5-flash", provider: "gemini" };

describe("統合候補の並べ替え", () => {
  it("入力が小さいときは元の順（能力優先）のまま", () => {
    const r = orderSynthChain([groq, cf, gem], 2000);
    expect(r.chain.map(c => c.label)).toEqual([groq.label, cf.label, gem.label]);
    expect(r.moved).toEqual([]);
  });
  it("2026-10-28 実測の 11686字では groq を末尾へ回す（捨てない）", () => {
    const r = orderSynthChain([groq, cf, gem], 11686);
    expect(r.chain.map(c => c.label)).toEqual([cf.label, gem.label, groq.label]);
    expect(r.moved).toEqual([groq.label]);
    expect(r.estimatedTokens).toBeGreaterThan(8000);
  });
  it("見積もりは字数に比例して増える", () => {
    expect(estimateSynthTokens(10000)).toBeGreaterThan(estimateSynthTokens(1000));
  });
});

describe("429で待って再試行するか", () => {
  it("TPMが一時的に埋まっているだけなら待つ", () => {
    expect(shouldWaitAndRetry("HTTP 429 Rate limit reached on tokens per minute (TPM): Limit 8000, Used 4520, Requested 7046. Please try again in 12s")).toBe(true);
  });
  it("413（入力そのものが上限超え）は待たない", () => {
    expect(shouldWaitAndRetry("HTTP 413 Request too large for model on tokens per minute (TPM): Limit 8000, Requested 15300")).toBe(false);
  });
  it("Requested が Limit を超えていれば 429 でも待たない", () => {
    expect(shouldWaitAndRetry("HTTP 429 tokens per minute (TPM): Limit 8000, Used 0, Requested 15300")).toBe(false);
  });
  it("1日の上限(TPD)や TPM 以外の 429 は待たない", () => {
    expect(shouldWaitAndRetry("HTTP 429 tokens per day (TPD): Limit 200000")).toBe(false);
    expect(shouldWaitAndRetry("HTTP 429 You exceeded your current quota")).toBe(false);
  });
});

const GOOD = [
  "## 統合の手順",
  "(1)対立点: A案は先読み、B案はキャッシュ。",
  "(2)判定: B案を採る。先読みは費用が読めないため。",
  "(3)少数意見: 「そもそも待ち時間は問題でない」は却下。実測3.5秒のため。",
  "(4)自己検証: 費用の読める案を優先した。(2)の判定と矛盾しない。",
  "## 結論", "B案。", "## 根拠", "実測。", "## 反論・リスク", "キャッシュの古さ。", "## 具体案", "60秒で捨てる。",
].join("\n");

describe("統合役へ渡す文（手順を飛ばさせない）", () => {
  it("system に、批判役の型と『見出しは4つまで』を入れない（手順が消えた原因の2つ）", () => {
    const sys = buildSynthSystem();
    expect(sys).not.toContain("(0)擁護");
    expect(sys).not.toContain("増やさないこと");
    expect(sys).toContain("統括役");
    expect(sys).toContain(DESIGN_STANCE);
  });
  it("統合の筆頭 groq/gpt-oss-120b は名前からは批判役になる＝名前で system を決めてはいけない理由", () => {
    expect(buildSystem({ modelName: "groq/gpt-oss-120b", taskText: "x" }).system).toContain("(0)擁護");
  });
  it("system と本文の両方に、手順4つと見出し4つが同じ名前で入る", () => {
    for (const text of [buildSynthSystem(), buildSynthPrompt("■ a: x")]) {
      for (const s of SYNTH_STEPS) expect(text).toContain(`(${s.n})${s.name}`);
      for (const b of SYNTH_BLOCKS) expect(text).toContain(`## ${b.name}`);
    }
  });
  it("本文は回答(digest)を削らずそのまま含み、問い返さず1案に決めるよう求める", () => {
    const digest = "■ groq/x（批判）:\n" + "あ".repeat(5000);
    const p = buildSynthPrompt(digest);
    expect(p).toContain(digest);
    expect(p).toContain("問い返さず");
  });
  it("自分が示した型どおりの文は、自分の検査を通る（文と検査がずれていない）", () => {
    const sys = buildSynthSystem();
    const shape = sys.slice(sys.indexOf("## 統合の手順"));
    expect(checkSynthAnswer(shape).ok).toBe(true);
  });
  it("出力上限を広げた分は、入力の見積もりにも入っている", () => {
    expect(SYNTH_MAX_TOKENS).toBeGreaterThan(1600);
    expect(SYNTH_OVERHEAD_TOKENS).toBeGreaterThan(SYNTH_MAX_TOKENS);
  });
});

describe("統合文に手順が書かれたかの検査", () => {
  it("手順4つと見出し4つがそろえば合格", () => {
    expect(checkSynthAnswer(GOOD)).toEqual({ ok: true, missingSteps: [], missingBlocks: [] });
  });
  it("全角の括弧・丸数字・太字でも手順として数える", () => {
    const t = GOOD.replace("(1)対立点", "**① 対立点の列挙**").replace("(2)判定", "（２）**判定**").replace("(3)少数意見", "手順3: 少数意見");
    expect(checkSynthAnswer(t).ok).toBe(true);
  });
  it("手順を飛ばして最終案から書いた文は不合格で、欠けた手順を名指しする", () => {
    const t = GOOD.split("\n").filter(l => !/^\(\d\)|統合の手順/.test(l)).join("\n");
    const r = checkSynthAnswer(t);
    expect(r.ok).toBe(false);
    expect(r.missingSteps).toEqual(["(1)対立点", "(2)判定", "(3)少数意見", "(4)自己検証"]);
    expect(r.missingBlocks).toEqual([]);
  });
  it("手順4の文中の『(2)の判定』だけでは、手順2を書いたことにしない", () => {
    const t = GOOD.replace(/^\(2\)判定.*\n/m, "");
    expect(checkSynthAnswer(t).missingSteps).toEqual(["(2)判定"]);
  });
  it("批判役の型で返ってきた文（実際に記録されていた形）は不合格", () => {
    const r = checkSynthAnswer("**(0) 擁護**\n先読みが最も直接的。\n(1)初期評価: …\n(2)反証: …\n(3)修正指示: …");
    expect(r.ok).toBe(false);
    expect(r.missingBlocks.length).toBe(4);
  });
  it("見出しが欠けた文（途中で終わった等）は不合格", () => {
    const r = checkSynthAnswer(GOOD.slice(0, GOOD.indexOf("## 反論")));
    expect(r.missingBlocks).toEqual(["反論・リスク", "具体案"]);
  });
  it("直す前に記録された統合は、1件もこの検査を通らない（検査が実物を見分ける）", () => {
    const dir = new URL("../council/", import.meta.url);
    const old = [];
    const walk = (o) => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== "object") return;
      if (o.synthesis && typeof o.answer === "string" && !o.stepsMissing) old.push(o.answer);
      Object.values(o).forEach(walk);
    };
    for (const f of readdirSync(dir).filter(f => f.endsWith("-answers.json"))) {
      let j; try { j = JSON.parse(readFileSync(new URL(f, dir), "utf8")); } catch { continue; }
      if (Date.parse(j.at || "") >= Date.parse("2026-11-10")) continue; // 直した後の会議は対象外
      walk(j);
    }
    expect(old.length).toBeGreaterThan(0);
    expect(old.filter(a => checkSynthAnswer(a).ok)).toEqual([]);
  });
});

describe("全候補が手順を欠いたときの選び方", () => {
  const mk = (id, s, b) => ({ id, check: { missingSteps: Array(s).fill("x"), missingBlocks: Array(b).fill("y") } });
  it("欠けの最も少ない1件を選ぶ", () => {
    expect(pickLeastIncomplete([mk("a", 4, 0), mk("b", 1, 0), mk("c", 2, 2)]).id).toBe("b");
  });
  it("同数なら先の候補（能力優先の順）を保つ", () => {
    expect(pickLeastIncomplete([mk("a", 1, 1), mk("b", 2, 0)]).id).toBe("a");
  });
  it("候補が無ければ null", () => {
    expect(pickLeastIncomplete([])).toBe(null);
  });
});
