import { getAsset } from "@/server/assets";
import { requireAuth } from "@/server/auth/session";
import { route } from "@/server/http";
import { previewRendition, shouldWatermark } from "@/server/imaging/renditions";

type Ctx = { params: Promise<{ id: string }> };

/** In-app preview image (private, cached per user session in the browser). */
export const GET = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  const asset = await getAsset(auth.workspace.id, id);
  const w = Number(new URL(req.url).searchParams.get("w") ?? 1024) || 1024;
  const watermark = shouldWatermark(auth.workspace, asset);
  const data = await previewRendition(asset, w, watermark);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=3600",
      ETag: `"${asset.id}-${w}-${watermark ? 1 : 0}"`,
    },
  });
});
