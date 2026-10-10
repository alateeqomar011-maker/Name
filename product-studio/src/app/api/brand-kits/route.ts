import { desc, eq } from "drizzle-orm";
import { requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { brandKits } from "@/server/db/schema";
import { json, route } from "@/server/http";

export const GET = route(async () => {
  const auth = await requireAuth();
  const db = await getDb();
  const rows = await db
    .select()
    .from(brandKits)
    .where(eq(brandKits.workspaceId, auth.workspace.id))
    .orderBy(desc(brandKits.updatedAt));
  return json({
    items: rows.map((b) => ({
      id: b.id,
      name: b.name,
      data: b.data,
      logoAssetId: b.logoAssetId,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    })),
  });
});
