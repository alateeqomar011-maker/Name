import { MODE_LABEL, getNiche } from './catalog';
import { formatNumber } from './format';
import type { GrowthPlan } from './growthPlan';
import { getPlatform } from './platforms';
import type { GrowthRequest } from './requests';

const STATUS_LABEL = {
  queued: 'Queued',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
} as const;

export { STATUS_LABEL };

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function requestsToCsv(requests: GrowthRequest[]): string {
  const header = ['id', 'platform', 'username', 'quantity', 'mode', 'status', 'created_at', 'finished_at', 'note'];
  const rows = requests.map((r) => [
    r.id,
    getPlatform(r.platform).name,
    r.username,
    r.quantity,
    MODE_LABEL[r.mode],
    STATUS_LABEL[r.status],
    new Date(r.createdAt).toISOString(),
    r.finishedAt ? new Date(r.finishedAt).toISOString() : '',
    r.mode === 'demo' ? 'Simulated only; no followers were added' : 'Growth plan; no followers were added',
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function planToMarkdown(req: GrowthRequest, plan: GrowthPlan): string {
  const platform = getPlatform(req.platform);
  const lines = [
    `# Growth plan for @${req.username} on ${platform.name}`,
    '',
    `Target: +${formatNumber(plan.target)} ${plan.noun} · Realistic timeline: ${plan.timeline}`,
    `Niche: ${getNiche(req.niche).name} · Request ${req.id}`,
    '',
    '## Posting cadence',
    plan.cadence,
    '',
    `Formats: ${plan.formats.join(', ')}`,
    `Start testing: ${plan.bestTimes.join('; ')}`,
    '',
    '## Content pillars',
    ...plan.pillars.map((p) => `- **${p.title}**: ${p.detail}`),
    '',
    '## Weekly routine',
    ...plan.tasks.map((t) => `- [${req.doneTasks.includes(t.id) ? 'x' : ' '}] ${t.label}`),
    '',
    '## Milestones',
    ...plan.milestones.map((m) => `- ${formatNumber(m.followers)} ${plan.noun} by about week ${m.week}`),
    '',
    '## Numbers to watch',
    ...plan.kpis.map((k) => `- ${k.name}: ${k.target}`),
    '',
    'Estimates assume consistent posting and vary by niche and content quality.',
    'FollowBoost AI never adds followers to an account or asks for your password.',
  ];
  return lines.join('\n');
}

export function downloadText(filename: string, text: string, type = 'text/plain'): void {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers that block the async clipboard API.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
