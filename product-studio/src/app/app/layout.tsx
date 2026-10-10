import { AppProvider } from "@/components/app/app-provider";
import { AppShell } from "@/components/app/shell";
import { requirePageAuth } from "@/server/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requirePageAuth("/app");
  return (
    <AppProvider>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
