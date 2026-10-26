import type { ReactNode } from 'react';
import { FlaskConical, History, LayoutDashboard, ShieldCheck, Sparkles } from 'lucide-react';
import { getPlatform } from '../lib/platforms';
import { progressAt } from '../lib/requests';
import type { Route } from '../lib/router';
import { useNow, useStore } from '../state/store';
import { ProgressBar } from './bits';
import { Logo, PlatformBadge } from './icons';

const NAV = [
  { name: 'generate', href: '#/generate', label: 'Generate', short: 'Generate', icon: Sparkles },
  { name: 'dashboard', href: '#/dashboard', label: 'Dashboard', short: 'Dashboard', icon: LayoutDashboard },
  { name: 'history', href: '#/history', label: 'History', short: 'History', icon: History },
  { name: 'help', href: '#/help', label: 'Safety & help', short: 'Help', icon: ShieldCheck },
] as const;

function isCurrent(route: Route, name: string): boolean {
  if (route.name === 'request') return name === 'dashboard';
  return route.name === name;
}

/** The running (or next queued) request, shown wherever the user is. */
function useLiveRequest() {
  const { requests } = useStore();
  const running = requests.find((r) => r.status === 'processing');
  const queued = requests.filter((r) => r.status === 'queued').length;
  return { running, queued };
}

function LiveRun({ compact }: { compact?: boolean }) {
  const { running, queued } = useLiveRequest();
  const now = useNow();
  if (!running) return null;
  const pct = progressAt(running, now);
  const label = `Running: @${running.username} on ${getPlatform(running.platform).name}, ${Math.round(pct * 100)}%`;
  if (compact) {
    return (
      <a className="live-pill" href={`#/requests/${running.id}`} aria-label={label}>
        <span className="live-dot" aria-hidden />
        {Math.round(pct * 100)}%
      </a>
    );
  }
  return (
    <a className="live-run" href={`#/requests/${running.id}`} aria-label={label}>
      <div className="live-run-head">
        <PlatformBadge id={running.platform} size={28} />
        <div className="live-run-text">
          <span className="live-run-title">
            <span className="live-dot" aria-hidden /> Running now
          </span>
          <span className="live-run-user">@{running.username}</span>
        </div>
        <span className="live-run-pct">{Math.round(pct * 100)}%</span>
      </div>
      <ProgressBar value={pct} label="Current request progress" />
      {queued > 0 && <span className="live-run-queue">{queued} more in queue</span>}
    </a>
  );
}

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  return (
    <div className="shell">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          // Hash links are routes here, so move focus without touching the URL.
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Main">
        <a href="#/generate" className="sidebar-logo" aria-label="FollowBoost AI home">
          <Logo />
        </a>
        <nav className="sidebar-nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            const current = isCurrent(route, item.name);
            return (
              <a key={item.name} href={item.href} className={`nav-item ${current ? 'is-current' : ''}`} aria-current={current ? 'page' : undefined}>
                <Icon size={18} aria-hidden />
                {item.label}
              </a>
            );
          })}
        </nav>
        <LiveRun />
        <div className="sidebar-foot">
          <div className="env-card">
            <div className="env-card-head">
              <FlaskConical size={16} aria-hidden />
              Demo environment
            </div>
            <p>Demo results are simulated. FollowBoost never adds followers to a real account or asks for passwords.</p>
            <a href="#/help" className="link-btn">
              How it works
            </a>
          </div>
        </div>
      </aside>

      <header className="topbar">
        <a href="#/generate" aria-label="FollowBoost AI home">
          <Logo />
        </a>
        <div className="topbar-right">
          <LiveRun compact />
          <span className="env-chip">
            <FlaskConical size={13} aria-hidden /> Demo
          </span>
        </div>
      </header>

      <main id="main" className="main" tabIndex={-1}>
        {children}
      </main>

      <nav className="tabbar" aria-label="Main">
        {NAV.map((item) => {
          const Icon = item.icon;
          const current = isCurrent(route, item.name);
          return (
            <a key={item.name} href={item.href} className={`tab ${current ? 'is-current' : ''}`} aria-current={current ? 'page' : undefined}>
              <Icon size={20} aria-hidden />
              <span>{item.short}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
