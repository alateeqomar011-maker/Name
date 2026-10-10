import JSZip from "jszip";
import { z } from "zod";
import { getPlan } from "@/lib/plans";
import { getAssets } from "@/server/assets";
import { requireAuth } from "@/server/auth/session";
import { badRequest, parseJson, rateLimit, route } from "@/server/http";
import { exportCap, exportFilename, exportRendition, shouldWatermark, type OutputFormat } from "@/server/imaging/renditions";

const schema = z.object({
  assetIds: z.array(z.string().max(64)).min(1).max(100),
  format: z.enum(["png", "jpeg", "webp"]).optional(),
  captions: z.record(z.string(), z.string().max(5000)).optional(),
});

/** Bundles several exports (and optional caption text files) into one ZIP download. */
export const POST = route(async (req) => {
  const auth = await requireAuth();
  rateLimit(`zip:${auth.user.id}`, 20, 10 * 60 * 1000);
  const body = await parseJson(req, schema);
  const found = await getAssets(auth.workspace.id, body.assetIds);
  if (!found.length) throw badRequest("No images to export.");
  const plan = getPlan(auth.workspace.plan);
  const zip = new JSZip();
  const used = new Set<string>();
  for (const asset of found) {
    const format: OutputFormat = body.format ?? (asset.mime === "image/png" ? "png" : "jpeg");
    const out = await exportRendition(asset, {
      format,
      longEdge: exportCap(plan, asset),
      watermark: shouldWatermark(auth.workspace, asset),
    });
    let name = exportFilename(asset.label, asset.id, format, out.width, out.height);
    while (used.has(name)) name = `1-${name}`;
    used.add(name);
    zip.file(name, out.data);
    const caption = body.captions?.[asset.id];
    if (caption) zip.file(name.replace(/\.\w+$/, ".txt"), caption);
  }
  const data = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  return new Response(data as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="vitrine-export-${new Date().toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
});
