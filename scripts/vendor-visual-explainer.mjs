/**
 * Vendors nicobailon/visual-explainer (MIT) into .cursor/skills/visual-explainer/
 * for Cursor Agent Skills. Patches output path ~/.agent/diagrams -> docs/.visual-explainer.
 *
 * Requires: git (preferred) or tar that can extract zip (for GitHub archive fallback).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEST = path.join(REPO_ROOT, ".cursor", "skills", "visual-explainer");
const GIT_URL = "https://github.com/nicobailon/visual-explainer.git";
const ZIP_URL = "https://github.com/nicobailon/visual-explainer/archive/refs/heads/main.zip";

const TEXT_EXT = new Set([
  ".md",
  ".html",
  ".sh",
  ".json",
  ".txt",
  ".mjs",
  ".css",
  ".js",
]);

function rimraf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function patchFileContent(raw) {
  return raw.replaceAll("~/.agent/diagrams", "docs/.visual-explainer");
}

function patchTree(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      patchTree(p);
      continue;
    }
    const ext = path.extname(ent.name).toLowerCase();
    if (!TEXT_EXT.has(ext) && ent.name !== "SKILL.md") continue;
    const raw = fs.readFileSync(p, "utf8");
    const next = patchFileContent(raw);
    if (next !== raw) {
      fs.writeFileSync(p, next, "utf8");
    }
  }
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ve-vendor-"));
  let revision = "unknown";
  let sourcePlugin;
  let licenseSrc;

  try {
    const cloneDir = path.join(tmp, "visual-explainer");
    const git = spawnSync("git", ["clone", "--depth", "1", GIT_URL, cloneDir], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (git.status === 0) {
      const h = spawnSync("git", ["-C", cloneDir, "rev-parse", "HEAD"], {
        encoding: "utf8",
      });
      if (h.status === 0) revision = h.stdout.trim();
      sourcePlugin = path.join(cloneDir, "plugins", "visual-explainer");
      licenseSrc = path.join(cloneDir, "LICENSE");
    } else {
      console.warn("git clone failed, trying GitHub archive zip…");
      const zipPath = path.join(tmp, "repo.zip");
      const res = await fetch(ZIP_URL);
      if (!res.ok) {
        throw new Error(`fetch zip failed: ${res.status} ${res.statusText}`);
      }
      fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
      const unzipDir = path.join(tmp, "zipout");
      fs.mkdirSync(unzipDir, { recursive: true });
      const tar = spawnSync("tar", ["-xf", zipPath, "-C", unzipDir], {
        encoding: "utf8",
      });
      if (tar.status !== 0) {
        throw new Error(
          "Extracting zip failed (tar -xf). Install Git (includes tar on Windows) or use WSL.",
        );
      }
      const top = fs.readdirSync(unzipDir)[0];
      const root = path.join(unzipDir, top);
      sourcePlugin = path.join(root, "plugins", "visual-explainer");
      licenseSrc = path.join(root, "LICENSE");
      revision = "main-archive";
    }

    if (!fs.existsSync(sourcePlugin)) {
      throw new Error("plugins/visual-explainer not found in upstream tree");
    }
    if (!fs.existsSync(licenseSrc)) {
      throw new Error("LICENSE not found in upstream tree");
    }

    rimraf(DEST);
    fs.mkdirSync(path.dirname(DEST), { recursive: true });
    copyDir(sourcePlugin, DEST);
    fs.copyFileSync(licenseSrc, path.join(DEST, "LICENSE"));
    patchTree(DEST);
    fs.writeFileSync(
      path.join(DEST, "VENDOR_REVISION.txt"),
      `${revision}\n`,
      "utf8",
    );

    const readme = `# visual-explainer（nicolivelog 向けメモ）

このディレクトリは \`npm run vendor:visual-explainer\` で [visual-explainer](https://github.com/nicobailon/visual-explainer) から同期されています。MIT License（同梱の LICENSE を参照）。

## 生成 HTML の出力先

Skill の指示どおり **リポジトリルートからの相対パス** \`docs/.visual-explainer/\` に保存します（\`.gitignore\` 済み）。

## ブラウザで開く

- **Windows（cmd）**: \`start "" "docs\\\\.visual-explainer\\\\your-file.html"\`
- **Windows（PowerShell）**: \`Start-Process "docs/.visual-explainer/your-file.html"\`
- **macOS**: \`open docs/.visual-explainer/your-file.html\`
- **Linux**: \`xdg-open docs/.visual-explainer/your-file.html\`

## Vercel / surf-cli

共有用デプロイや画像生成は任意です。トークンや API キーをリポジトリに含めないでください。
`;
    fs.writeFileSync(path.join(DEST, "README.nicolivelog.md"), readme, "utf8");

    console.log(`Vendored visual-explainer -> ${path.relative(REPO_ROOT, DEST)}`);
    console.log(`Revision: ${revision}`);
  } finally {
    rimraf(tmp);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
