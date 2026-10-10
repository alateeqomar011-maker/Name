import { eq } from "drizzle-orm";
import { getPlan } from "@/lib/plans";
import { getAuth } from "@/server/auth/session";
import { getCapabilities } from "@/server/capabilities";
import { getDb } from "@/server/db";
import { memberships, workspaces } from "@/server/db/schema";
import { json, route, unauthorized } from "@/server/http";

export const GET = route(async () => {
  const auth = await getAuth();
  if (!auth) throw unauthorized();
  const db = await getDb();
  const all = await db
    .select({ id: workspaces.id, name: workspaces.name, plan: workspaces.plan, role: memberships.role })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, auth.user.id));
  const plan = getPlan(auth.workspace.plan);
  return json({
    user: { id: auth.user.id, name: auth.user.name, email: auth.user.email, preferences: auth.user.preferences },
    workspace: {
      id: auth.workspace.id,
      name: auth.workspace.name,
      plan: plan.id,
      role: auth.role,
      planCredits: auth.workspace.planCredits,
      bonusCredits: auth.workspace.bonusCredits,
      credits: auth.workspace.planCredits + auth.workspace.bonusCredits,
      monthlyCredits: plan.limits.monthlyCredits,
      creditsResetAt: auth.workspace.creditsResetAt.toISOString(),
      limits: plan.limits,
    },
    workspaces: all,
    capabilities: getCapabilities(),
  });
});
