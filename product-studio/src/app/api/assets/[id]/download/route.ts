import { getPlan } from "@/lib/plans";
import { getAsset } from "@/server/assets";
import { requireAuth } from "@/server/auth/session";
import { badRequest, route } from "@/server/http";
import { MIME, exportCap, exportFilename, exportRendition, shouldWatermark, type OutputFormat } from "@/server/imaging/renditions";

type Ctx = { params: Promise<{ id: string }> };

/** Full-quality download with plan rules (max resolution, watermark on Free). */
export const GET = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  const asset = await getAsset(auth.workspace.id, id);
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? (asset.mime === "image/png" ? "png" : "jpeg")) as OutputFormat;
  if (!(format in MIME)) throw badRequest("Format must be png, jpeg or webp.");
  const plan = getPlan(auth.workspace.plan);
  const cap = exportCap(plan, asset);
  const requested = Number(url.searchParams.get("size") ?? cap) || cap;
  const longEdge = Math.min(requested, cap);
  const out = await exportRendition(asset, { format, longEdge, watermark: shouldWatermark(auth.workspace, asset) });
  return new Response(new Uint8Array(out.data), {
    headers: {
      "Content-Type": MIME[format],
      "Content-Disposition": `attachment; filename="${exportFilename(asset.label, asset.id, format, out.width, out.height)}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
