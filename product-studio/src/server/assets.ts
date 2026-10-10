import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { getDb } from "./db";
import { assets, type Asset, type AssetKind } from "./db/schema";
import { notFound } from "./http";
import { newId } from "./ids";
import { storage } from "./storage";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export interface SaveAssetInput {
  workspaceId: string;
  projectId?: string | null;
  createdBy?: string | null;
  kind: AssetKind;
  label?: string | null;
  data: Buffer;
  mime: "image/png" | "image/jpeg" | "image/webp";
  parentId?: string | null;
  generationId?: string | null;
  meta?: Record<string, unknown>;
  width?: number;
  height?: number;
}

export async function saveAsset(input: SaveAssetInput): Promise<Asset> {
  let { width, height } = input;
  if (!width || !height) {
    const m = await sharp(input.data).metadata();
    width = m.width ?? 0;
    height = m.height ?? 0;
  }
  const id = newId("ast");
  const now = new Date();
  const key = `ws/${input.workspaceId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.${EXT[input.mime]}`;
  await storage().put(key, input.data, input.mime);
  const db = await getDb();
  const [row] = await db
    .insert(assets)
    .values({
      id,
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      createdBy: input.createdBy ?? null,
      kind: input.kind,
      label: input.label ?? null,
      storageKey: key,
      mime: input.mime,
      width,
      height,
      bytes: input.data.length,
      parentId: input.parentId ?? null,
      generationId: input.generationId ?? null,
      meta: input.meta ?? {},
    })
    .returning();
  return row;
}

export async function getAsset(workspaceId: string, assetId: string): Promise<Asset> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.workspaceId, workspaceId)))
    .limit(1);
  if (!rows[0]) throw notFound("Image not found.");
  return rows[0];
}

export async function getAssets(workspaceId: string, ids: string[]): Promise<Asset[]> {
  if (!ids.length) return [];
  const db = await getDb();
  return db
    .select()
    .from(assets)
    .where(and(inArray(assets.id, ids), eq(assets.workspaceId, workspaceId)));
}

export async function readAsset(asset: Pick<Asset, "storageKey">): Promise<Buffer> {
  return storage().get(asset.storageKey);
}

/** Public shape of an asset sent to the browser. */
export function assetDto(a: Asset) {
  return {
    id: a.id,
    kind: a.kind,
    label: a.label,
    projectId: a.projectId,
    width: a.width,
    height: a.height,
    bytes: a.bytes,
    mime: a.mime,
    favorite: a.favorite,
    folderId: a.folderId,
    parentId: a.parentId,
    generationId: a.generationId,
    meta: publicMeta(a.meta),
    createdAt: a.createdAt.toISOString(),
    url: `/api/assets/${a.id}/file`,
  };
}

export type AssetDto = ReturnType<typeof assetDto>;

function publicMeta(meta: Record<string, unknown>) {
  const { recipe: _recipe, ...rest } = meta as { recipe?: unknown };
  void _recipe;
  return rest;
}
