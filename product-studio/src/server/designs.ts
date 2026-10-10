import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { designs, type Design } from "./db/schema";
import { notFound } from "./http";

export async function getDesign(workspaceId: string, id: string): Promise<Design> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(designs)
    .where(and(eq(designs.id, id), eq(designs.workspaceId, workspaceId)))
    .limit(1);
  if (!rows[0]) throw notFound("Design not found.");
  return rows[0];
}

export function designDto(d: Design, withDoc: boolean) {
  return {
    id: d.id,
    name: d.name,
    formatId: d.formatId,
    width: d.width,
    height: d.height,
    projectId: d.projectId,
    favorite: d.favorite,
    folderId: d.folderId,
    thumbnailUrl: d.thumbnailAssetId ? `/api/assets/${d.thumbnailAssetId}/file?w=480` : null,
    doc: withDoc ? d.doc : undefined,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}
