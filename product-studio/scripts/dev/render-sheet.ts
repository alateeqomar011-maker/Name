// Dev utility: cut out a product photo and render every procedural style into a contact sheet.
// Usage: npx tsx --conditions=react-server scripts/dev/render-sheet.ts <photo> <out.jpg> [layout]
import fs from "node:fs";
import sharp from "sharp";
import { removeBackground } from "@/server/imaging/segment";
import { renderRecipe } from "@/server/imaging/compose";
import { STUDIO_STYLES, type Layout } from "@/lib/studio-styles";

async function main() {
  const [photo, out, layoutArg] = process.argv.slice(2);
  const layout = (layoutArg ?? "standing") as Layout;
  const t0 = Date.now();
  const cut = await removeBackground(fs.readFileSync(photo));
  console.log("cutout", cut.width, cut.height, cut.method, `${Date.now() - t0}ms`);
  fs.writeFileSync(out.replace(/\.\w+$/, "-cutout.png"), cut.png);
  const styles = STUDIO_STYLES.filter((s) => s.kind === "procedural");
  const tiles: Buffer[] = [];
  for (const s of styles) {
    const t = Date.now();
    const r = await renderRecipe({
      recipe: { version: 1, styleId: s.id, aspect: "1:1", layout, variation: 0, cutoutAssetId: "x" },
      product: { data: cut.png, width: cut.width, height: cut.height },
      longEdge: 640,
    });
    console.log(s.id, `${Date.now() - t}ms`);
    tiles.push(await sharp(r.data).flatten({ background: "#ffffff" }).resize(320, 320).jpeg().toBuffer());
  }
  const cols = 6;
  const rows = Math.ceil(tiles.length / cols);
  await sharp({ create: { width: cols * 320, height: rows * 320, channels: 3, background: "#fff" } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * 320, top: Math.floor(i / cols) * 320 })))
    .jpeg({ quality: 88 })
    .toFile(out);
  console.log("done", out);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
