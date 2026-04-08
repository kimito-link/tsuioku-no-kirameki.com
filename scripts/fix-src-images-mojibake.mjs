/**
 * Normalizes known mojibake paths under src/images (mirrored from kimito-link).
 * Safe to run after robocopy from kimito-link; re-run if bad names reappear.
 */
import fs from "node:fs";
import path from "node:path";

const IMAGES = "src/images";

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function main() {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const images = path.join(root, IMAGES);
  if (!exists(images)) {
    console.error(`skip: missing ${images}`);
    process.exit(0);
  }

  // 1) Top-level export folder: contains logo_guide_funlink_ol.pdf + black/color/white
  const tops = fs.readdirSync(images, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const ent of tops) {
    const name = ent.name;
    if (
      name === "brand" ||
      name === "company" ||
      name === "creator" ||
      name === "downloads" ||
      name === "icon" ||
      name === "kobou" ||
      name === "line" ||
      name === "logo" ||
      name === "og" ||
      name === "utilized-multiple-ways" ||
      name === "yukkuri-charactore-english" ||
      name === "データ出力"
    ) {
      continue;
    }
    const full = path.join(images, name);
    let children;
    try {
      children = fs.readdirSync(full);
    } catch {
      continue;
    }
    const hasFunlink = children.includes("logo_guide_funlink_ol.pdf");
    const hasTri = children.includes("black") && children.includes("white") && children.includes("color");
    if (hasFunlink && hasTri) {
      const dest = path.join(images, "データ出力");
      if (exists(dest)) {
        console.warn("skip top rename: データ出力 already exists");
        break;
      }
      fs.renameSync(full, dest);
      console.log("renamed top export folder -> データ出力");
      break;
    }
  }

  // 2) logo/データ一式: flat files with garbled prefix + RGB dir
  const logo = path.join(images, "logo");
  if (exists(logo)) {
    const destDir = path.join(logo, "データ一式");
    const entries = fs.readdirSync(logo, { withFileTypes: true });
    const ai = entries.find(
      (e) => e.isFile() && e.name.includes("251016_logo_guide_kimitolink_ol.ai"),
    );
    const pdf = entries.find(
      (e) => e.isFile() && e.name.includes("251016_logo_guide_kimitolink_ol.pdf"),
    );
    const rgbDir = entries.find((e) => e.isDirectory() && e.name.endsWith("RGB"));

    if (!ai && !pdf && !rgbDir) {
      if (exists(destDir)) {
        console.log("logo: already normalized (データ一式)");
      }
    } else {
      if (!exists(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const moveInto = (fromName, toBase) => {
        const from = path.join(logo, fromName);
        const to = path.join(destDir, toBase);
        if (!exists(from)) return;
        if (exists(to)) {
          fs.rmSync(from, { recursive: true, force: true });
          return;
        }
        fs.renameSync(from, to);
        console.log("moved", fromName, "->", path.join("データ一式", toBase));
      };

      if (ai) moveInto(ai.name, "251016_logo_guide_kimitolink_ol.ai");
      if (pdf) moveInto(pdf.name, "251016_logo_guide_kimitolink_ol.pdf");
      if (rgbDir) moveInto(rgbDir.name, "RGB");

      // 0-byte junk next to garbled "データ一式" name
      for (const ent of entries) {
        if (!ent.isFile()) continue;
        if (ent.name.includes("251016_logo_guide")) continue;
        if (ent.name === "logo-text.png" || ent.name === "nc321221_creatorcross.png") continue;
        const fp = path.join(logo, ent.name);
        try {
          const st = fs.statSync(fp);
          if (st.size === 0) {
            fs.unlinkSync(fp);
            console.log("removed 0-byte junk:", ent.name);
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  // 3) データ出力/color: CMYK_* / RGB_* mojibake suffix → データ用
  const exportColor = path.join(images, "データ出力", "color");
  if (exists(exportColor)) {
    const dirs = fs
      .readdirSync(exportColor, { withFileTypes: true })
      .filter((d) => d.isDirectory());
    const cmykBad = dirs.filter((d) => d.name.startsWith("CMYK_") && d.name !== "CMYK_データ用");
    const rgbBad = dirs.filter((d) => d.name.startsWith("RGB_") && d.name !== "RGB_データ用");
    if (cmykBad.length === 1 && !exists(path.join(exportColor, "CMYK_データ用"))) {
      fs.renameSync(
        path.join(exportColor, cmykBad[0].name),
        path.join(exportColor, "CMYK_データ用"),
      );
      console.log("renamed color/", cmykBad[0].name, "-> CMYK_データ用");
    }
    if (rgbBad.length === 1 && !exists(path.join(exportColor, "RGB_データ用"))) {
      fs.renameSync(
        path.join(exportColor, rgbBad[0].name),
        path.join(exportColor, "RGB_データ用"),
      );
      console.log("renamed color/", rgbBad[0].name, "-> RGB_データ用");
    }
  }
}

main();
