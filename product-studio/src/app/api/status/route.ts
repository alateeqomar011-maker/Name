import { getCapabilities } from "@/server/capabilities";
import { json, route } from "@/server/http";

export const GET = route(async () => json({ capabilities: getCapabilities() }));
