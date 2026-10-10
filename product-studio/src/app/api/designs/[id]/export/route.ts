import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { assetDto, saveAsset } from "@/server/assets";
import { requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { designs } from "@/server/db/schema";
import { getDesign } from "@/server/designs";
import { HttpError, badRequest, json, rateLimit, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Receives the browser-rendered design (exact pixels of the editor canvas),
 * validates it, and stores it as a gallery asset. Downloads then go through the
 * normal export route, which applies plan rules (watermark on Free).
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth();
  rateLimit(`design-export:${auth.user.id}`, 120, 60 * 60 * 1000);
  const { id } = await params;
  const design = await getDesign(auth.workspace.id, id);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Missing rendered image.");
  if (file.size > 30 * 1024 * 1024) throw new HttpError(413, "Rendered image too large.");
  const kind = form?.get("kind") === "social" ? "social" : "ad";
  const asThumbnail = form?.get("thumbnail") === "1";
  const input = Buffer.from(await file.arrayBuffer());
  const meta = await sharp(input).metadata().catch(() => null);
  if (!meta || meta.format !== "png") throw badRequest("Expected a PNG render.");
  if (meta.width !== design.width || meta.height !== design.height) {
    throw badRequest(`Render size must be ${design.width}×${design.height}.`);
  }
  const data = await sharp(input).png({ compressionLevel: 8 }).toBuffer();
  const asset = await saveAsset({
    workspaceId: auth.workspace.id,
    projectId: design.projectId,
    createdBy: auth.user.id,
    kind,
    label: design.name,
    data,
    mime: "image/png",
    width: design.width,
    height: design.height,
    meta: { designId: design.id, formatId: design.formatId, thumbnail: asThumbnail },
  });
  if (asThumbnail) {
    const db = await getDb();
    await db
      .update(designs)
      .set({ thumbnailAssetId: asset.id })
      .where(and(eq(designs.id, design.id), eq(designs.workspaceId, auth.workspace.id)));
  }
  return json({ asset: assetDto(asset) }, { status: 201 });
});
