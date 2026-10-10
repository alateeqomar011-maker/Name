import { assetDto, saveAsset } from "@/server/assets";
import { requireAuth } from "@/server/auth/session";
import { badRequest, json, rateLimit, route } from "@/server/http";
import { getProject } from "@/server/projects";
import { normalizeUpload } from "@/server/uploads";

/** Standalone image upload (logos, ad backgrounds, tool inputs). */
export const POST = route(async (req) => {
  const auth = await requireAuth();
  rateLimit(`upload:${auth.user.id}`, 60, 60 * 60 * 1000);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Please choose an image to upload.");
  const kind = form?.get("kind") === "logo" ? "logo" : "original";
  const rawProject = form?.get("projectId");
  const projectId = typeof rawProject === "string" && rawProject ? (await getProject(auth.workspace.id, rawProject)).id : null;
  const img = await normalizeUpload(file, 4096);
  const asset = await saveAsset({
    workspaceId: auth.workspace.id,
    projectId,
    createdBy: auth.user.id,
    kind,
    label: img.originalName,
    data: img.data,
    mime: img.mime,
    width: img.width,
    height: img.height,
  });
  return json({ asset: assetDto(asset) }, { status: 201 });
});
