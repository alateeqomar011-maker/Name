// Downloads the open-source segmentation model used for local background removal.
// IS-Net (DIS) general-use model — Apache-2.0 — https://github.com/xuebinqin/DIS
// Mirrored ONNX export from the rembg project releases.
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const MODELS = {
  "isnet-general-use": {
    url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx",
    sha256: "60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a",
    bytes: 178648008,
  },
};

const dataDir = resolve(process.env.DATA_DIR || "./data");
const modelDir = process.env.MODELS_DIR ? resolve(process.env.MODELS_DIR) : join(dataDir, "models");

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

async function download(name, { url, sha256: expected, bytes }) {
  const target = join(modelDir, `${name}.onnx`);
  if (existsSync(target) && statSync(target).size === bytes) {
    if (sha256(target) === expected) {
      console.log(`✓ ${name} already present`);
      return;
    }
    console.warn(`! ${name} checksum mismatch, re-downloading`);
  }
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.part`;
  console.log(`↓ ${name} (${(bytes / 1e6).toFixed(0)} MB) from ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
  let received = 0;
  let lastPct = -1;
  const body = Readable.fromWeb(res.body);
  body.on("data", (chunk) => {
    received += chunk.length;
    const pct = Math.floor((received / bytes) * 100);
    if (pct % 10 === 0 && pct !== lastPct) {
      lastPct = pct;
      process.stdout.write(`  ${pct}%\n`);
    }
  });
  await pipeline(body, createWriteStream(tmp));
  const actual = sha256(tmp);
  if (actual !== expected) {
    unlinkSync(tmp);
    throw new Error(`Checksum mismatch for ${name}: expected ${expected}, got ${actual}`);
  }
  renameSync(tmp, target);
  console.log(`✓ ${name} saved to ${target}`);
}

for (const [name, spec] of Object.entries(MODELS)) {
  await download(name, spec);
}
