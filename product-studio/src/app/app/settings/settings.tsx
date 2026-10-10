"use client";

import { AlertTriangle, Copy, KeyRound, Mail, Shield, Trash2, User, UserPlus, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app/app-provider";
import { copyText } from "@/components/app/copy-button";
import { PageHeader } from "@/components/app/shell";
import { Button, LinkButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, Card, Switch } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, useApi } from "@/lib/client/api";
import { TONES } from "@/lib/copy-schemas";
import { cn, formatDate } from "@/lib/utils";

type Tab = "profile" | "team" | "security" | "danger";

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "team", label: "Workspace & team", icon: Users },
  { id: "security", label: "Security", icon: Shield },
  { id: "danger", label: "Delete account", icon: Trash2 },
];

export function Settings() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) ?? "profile");
  return (
    <div>
      <PageHeader title="Settings" description="Manage your profile, workspace, team and security." />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm",
                tab === t.id ? "bg-surface font-semibold shadow-soft" : "text-muted hover:bg-white/60",
                t.id === "danger" && tab !== t.id && "text-danger/80",
              )}
            >
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 max-w-3xl">
          {tab === "profile" && <Profile />}
          {tab === "team" && <Team />}
          {tab === "security" && <Security />}
          {tab === "danger" && <Danger />}
        </div>
      </div>
    </div>
  );
}

function Profile() {
  const { me, refreshMe, handleError } = useApp();
  const toast = useToast();
  const [name, setName] = useState("");
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [tone, setTone] = useState("professional");
  const [updates, setUpdates] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!me) return;
    setName(me.user.name);
    setLang(me.user.preferences.defaultLanguage ?? "en");
    setTone(me.user.preferences.defaultTone ?? "professional");
    setUpdates(me.user.preferences.emailUpdates ?? true);
  }, [me]);
  return (
    <Card className="grid gap-5 p-6">
      <h2 className="font-semibold">Profile</h2>
      <Field label="Full name" htmlFor="s-name">
        <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email" htmlFor="s-email" hint="Contact support to change your sign-in email.">
        <Input id="s-email" value={me?.user.email ?? ""} disabled />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Default content language">
          <Select value={lang} onChange={(e) => setLang(e.target.value as "en" | "ar")}>
            <option value="en">English</option>
            <option value="ar">العربية (Arabic)</option>
          </Select>
        </Field>
        <Field label="Default writing style">
          <Select value={tone} onChange={(e) => setTone(e.target.value)}>
            {TONES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-line p-3.5">
        <div>
          <p className="text-sm font-medium">Product updates by email</p>
          <p className="text-xs text-muted">Occasional news about new features. Never shared.</p>
        </div>
        <Switch checked={updates} onCheckedChange={setUpdates} />
      </div>
      <div>
        <Button
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await api("/api/account", { method: "PATCH", json: { name, preferences: { defaultLanguage: lang, defaultTone: tone, emailUpdates: updates } } });
              toast.success("Profile saved");
              refreshMe();
            } catch (err) {
              handleError(err, "Couldn't save");
            } finally {
              setSaving(false);
            }
          }}
        >
          Save changes
        </Button>
      </div>
    </Card>
  );
}

interface TeamData {
  workspace: { id: string; name: string; plan: string; seats: number };
  role: "owner" | "admin" | "member";
  members: { userId: string; name: string; email: string; role: string; joinedAt: string }[];
  invites: { id: string; email: string; role: string; expiresAt: string }[];
}

function Team() {
  const { me, handleError, refreshMe } = useApp();
  const toast = useToast();
  const { data, mutate } = useApi<TeamData>("/api/workspace");
  const [wsName, setWsName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [link, setLink] = useState<{ url: string; emailed: boolean } | null>(null);
  const [inviting, setInviting] = useState(false);
  useEffect(() => data && setWsName(data.workspace.name), [data]);
  if (!data) return <div className="skeleton h-96 rounded-2xl" />;
  const admin = data.role === "owner" || data.role === "admin";
  const teamPlan = data.workspace.seats > 1;
  const used = data.members.length + data.invites.length;
  return (
    <div className="grid gap-4">
      <Card className="grid gap-4 p-6">
        <h2 className="font-semibold">Workspace</h2>
        <Field label="Workspace name">
          <div className="flex gap-2">
            <Input value={wsName} onChange={(e) => setWsName(e.target.value)} disabled={!admin} />
            <Button
              variant="secondary"
              disabled={!admin || wsName === data.workspace.name}
              onClick={async () => {
                try {
                  await api("/api/workspace", { method: "PATCH", json: { name: wsName } });
                  toast.success("Workspace renamed");
                  mutate();
                  refreshMe();
                } catch (err) {
                  handleError(err, "Couldn't rename");
                }
              }}
            >
              Save
            </Button>
          </div>
        </Field>
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Team</h2>
            <p className="text-sm text-muted">
              {used} of {data.workspace.seats} {data.workspace.seats === 1 ? "seat" : "seats"} used. Members share projects, brand kits and credits.
            </p>
          </div>
        </div>
        {!teamPlan ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-iris-50/70 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-iris-700">Invite up to 5 teammates with the Business plan.</p>
            <LinkButton href="/app/billing" size="sm" variant="accent">
              See Business
            </LinkButton>
          </div>
        ) : admin ? (
          <form
            className="grid gap-2 sm:grid-cols-[1fr_140px_auto]"
            onSubmit={async (e) => {
              e.preventDefault();
              setInviting(true);
              try {
                const res = await api<{ link: string; emailed: boolean }>("/api/workspace/invites", { method: "POST", json: { email, role } });
                setLink({ url: res.link, emailed: res.emailed });
                setEmail("");
                mutate();
              } catch (err) {
                handleError(err, "Couldn't invite");
              } finally {
                setInviting(false);
              }
            }}
          >
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@store.com" />
            <Select value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </Select>
            <Button type="submit" loading={inviting} icon={<UserPlus className="size-4" />} disabled={used >= data.workspace.seats}>
              Invite
            </Button>
          </form>
        ) : null}

        <ul className="mt-5 divide-y divide-line">
          {data.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-subtle text-xs font-semibold">{m.name.slice(0, 2).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {m.name} {m.userId === me?.user.id && <span className="text-muted">(you)</span>}
                </span>
                <span className="block truncate text-xs text-muted">{m.email}</span>
              </span>
              {m.role === "owner" || data.role !== "owner" ? (
                <Badge tone={m.role === "owner" ? "dark" : "neutral"}>{m.role}</Badge>
              ) : (
                <select
                  className="h-8 rounded-lg border border-line bg-surface px-2 text-xs"
                  value={m.role}
                  onChange={async (e) => {
                    await api(`/api/workspace/members/${m.userId}`, { method: "PATCH", json: { role: e.target.value } });
                    mutate();
                  }}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              )}
              {m.role !== "owner" && (admin || m.userId === me?.user.id) && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={async () => {
                    const self = m.userId === me?.user.id;
                    if (!confirm(self ? "Leave this workspace?" : `Remove ${m.name} from the workspace?`)) return;
                    await api(`/api/workspace/members/${m.userId}`, { method: "DELETE" });
                    if (self) window.location.href = "/app";
                    else mutate();
                  }}
                >
                  {m.userId === me?.user.id ? "Leave" : "Remove"}
                </Button>
              )}
            </li>
          ))}
          {data.invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex size-9 items-center justify-center rounded-full border border-dashed border-line-strong text-faint">
                <Mail className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{i.email}</span>
                <span className="block text-xs text-muted">Invited · expires {formatDate(i.expiresAt)}</span>
              </span>
              <Badge tone="warning">pending</Badge>
              {admin && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={async () => {
                    await api(`/api/workspace/invites/${i.id}`, { method: "DELETE" });
                    mutate();
                  }}
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Dialog open={Boolean(link)} onOpenChange={(o) => !o && setLink(null)} title="Invitation created" footer={<Button onClick={() => setLink(null)}>Done</Button>}>
        {link && (
          <div className="grid gap-3 text-sm">
            <p className="text-muted">
              {link.emailed ? "We emailed the invitation. You can also share this link:" : "Email delivery isn't configured on this server, so share this link with your teammate directly:"}
            </p>
            <div className="flex gap-2">
              <Input value={link.url} readOnly className="font-mono text-xs" />
              <Button
                variant="secondary"
                icon={<Copy className="size-4" />}
                onClick={async () => {
                  await copyText(link.url);
                  toast.success("Link copied");
                }}
              >
                Copy
              </Button>
            </div>
            <p className="text-xs text-muted">The link works once, for {"the invited email address"}, and expires in 7 days.</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function Security() {
  const toast = useToast();
  const { handleError } = useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Card className="grid gap-4 p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <KeyRound className="size-4" /> Change password
      </h2>
      <Field label="Current password">
        <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="New password" hint="At least 8 characters with letters and numbers. Other devices will be signed out.">
        <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <div>
        <Button
          loading={saving}
          disabled={!current || !next}
          onClick={async () => {
            setSaving(true);
            try {
              await api("/api/account/password", { method: "POST", json: { current, next } });
              toast.success("Password updated", "Other sessions were signed out.");
              setCurrent("");
              setNext("");
            } catch (err) {
              handleError(err, "Couldn't update password");
            } finally {
              setSaving(false);
            }
          }}
        >
          Update password
        </Button>
      </div>
      <div className="mt-2 rounded-xl bg-subtle p-4 text-xs leading-relaxed text-muted">
        Passwords are hashed with scrypt; sessions use secure, HTTP-only cookies. Uploaded photos are private to your workspace, and location metadata is removed from images on upload.
      </div>
    </Card>
  );
}

function Danger() {
  const router = useRouter();
  const { handleError } = useApp();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card className="grid gap-4 border-danger/30 p-6">
      <h2 className="flex items-center gap-2 font-semibold text-danger">
        <AlertTriangle className="size-4" /> Delete account
      </h2>
      <p className="text-sm text-muted">
        Permanently deletes your account, the workspaces you own and every product, image, text and design in them. This can&apos;t be undone. Cancel any paid subscription first.
      </p>
      <div>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Delete your account?"
        description="Type DELETE and enter your password to confirm."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={confirmText !== "DELETE" || !password}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/api/account", { method: "DELETE", json: { password, confirm: "DELETE" } });
                  router.push("/");
                } catch (err) {
                  setBusy(false);
                  handleError(err, "Couldn't delete account");
                }
              }}
            >
              Delete forever
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
        </div>
      </Dialog>
    </Card>
  );
}
