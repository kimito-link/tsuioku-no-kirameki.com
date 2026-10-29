import { describe, expect, it } from "vitest";
import { estimateSynthTokens, orderSynthChain, shouldWaitAndRetry } from "./council-synth.mjs";

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
