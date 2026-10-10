import { requireAuth, requireRole } from "@/server/auth/session";
import { createPortalSession } from "@/server/billing";
import { json, route } from "@/server/http";

export const POST = route(async () => {
  const auth = await requireAuth();
  requireRole(auth, ["owner", "admin"]);
  return json({ url: await createPortalSession(auth) });
});
