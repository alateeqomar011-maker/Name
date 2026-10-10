import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "@/server/auth/session";
import { saveAsset } from "@/server/assets";
import { getCapabilities } from "@/server/capabilities";
import { getDb } from "@/server/db";
import { projects } from "@/server/db/schema";
import { createGeneration, generationDto } from "@/server/generations";
import { HttpError, badRequest, json, rateLimit, route } from "@/server/http";
import { newId } from "@/server/ids";
import { listProjects, projectDto } from "@/server/projects";
import { nameFromFile, normalizeUpload } from "@/server/uploads";

export const GET = route(async (req) => {
  const auth = await requireAuth();
  const url = new URL(req.url);
  const items = await listProjects(auth.workspace.id, {
    q: url.searchParams.get("q")?.slice(0, 100) || undefined,
    folderId: url.searchParams.get("folder") || undefined,
    favorite: url.searchParams.get("favorite") === "1",
    limit: Number(url.searchParams.get("limit") ?? 30),
    offset: Number(url.searchParams.get("offset") ?? 0),
  });
  return json({ items });
});

const fieldsSchema = z.object({
  name: z.string().trim().max(120).optional(),
  folderId: z.string().max(64).optional(),
  autoProcess: z.enum(["1", "0"]).optional(),
});

/** Creates a project from an uploaded product photo and starts background removal + detection. */
export const POST = route(async (req) => {
  const auth = await requireAuth();
  rateLimit(`upload:${auth.user.id}`, 60, 60 * 60 * 1000);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Expected a multipart upload.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Please choose a product photo to upload.");
  const fields = fieldsSchema.parse({
    name: form.get("name") ?? undefined,
    folderId: form.get("folderId") ?? undefined,
    autoProcess: form.get("autoProcess") ?? undefined,
  });
  const img = await normalizeUpload(file);
  const db = await getDb();
  const projectId = newId("prj");
  const name = fields.name || nameFromFile(img.originalName);
  await db.insert(projects).values({
    id: projectId,
    workspaceId: auth.workspace.id,
    createdBy: auth.user.id,
    name,
    folderId: fields.folderId ?? null,
    product: { name: /^untitled/i.test(name) ? "" : name },
  });
  const original = await saveAsset({
    workspaceId: auth.workspace.id,
    projectId,
    createdBy: auth.user.id,
    kind: "original",
    label: "Original photo",
    data: img.data,
    mime: img.mime,
    width: img.width,
    height: img.height,
    meta: { filename: img.originalName },
  });
  const [project] = await db
    .update(projects)
    .set({ originalAssetId: original.id, coverAssetId: original.id })
    .where(eq(projects.id, projectId))
    .returning();

  const started = [];
  const problems: { type: string; message: string; code?: string }[] = [];
  if (fields.autoProcess !== "0") {
    const caps = getCapabilities();
    for (const type of ["cutout", "analyze"] as const) {
      if (type === "analyze" && !caps.anthropic) continue;
      try {
        const g = await createGeneration(auth, {
          type,
          projectId,
          params: type === "cutout" ? { originalAssetId: original.id } : {},
        });
        started.push(generationDto(g));
      } catch (err) {
        if (err instanceof HttpError) problems.push({ type, message: err.message, code: err.code });
        else throw err;
      }
    }
  }
  return json({ project: projectDto(project), generations: started, problems }, { status: 201 });
});
