// Daily free-tier limits and premium allowances, enforced on the server.

import type { Plan, UsageMetric, UsageSnapshot } from '../shared/types.ts';
import { effectivePlan, type UserRow } from './auth.ts';
import { config } from './config.ts';
import { all, get, run, today } from './db.ts';

const METRICS: UsageMetric[] = ['callSeconds', 'messages', 'groupCalls', 'greetings'];

export function limitsFor(plan: Plan): Record<UsageMetric, number> {
  return { ...config.limits[plan] };
}

export function snapshot(user: UserRow): UsageSnapshot {
  const day = today();
  const used = Object.fromEntries(METRICS.map((m) => [m, 0])) as Record<UsageMetric, number>;
  for (const row of all<{ metric: UsageMetric; amount: number }>(
    'SELECT metric, amount FROM usage WHERE user_id = ? AND day = ?',
    user.id,
    day,
  )) {
    used[row.metric] = Number(row.amount);
  }
  const plan = effectivePlan(user);
  return { plan, day, used, limits: limitsFor(plan) };
}

export function remaining(user: UserRow, metric: UsageMetric): number {
  const day = today();
  const row = get<{ amount: number }>('SELECT amount FROM usage WHERE user_id = ? AND day = ? AND metric = ?', user.id, day, metric);
  return limitsFor(effectivePlan(user))[metric] - Number(row?.amount ?? 0);
}

export function hasAllowance(user: UserRow, metric: UsageMetric, amount = 1): boolean {
  return remaining(user, metric) >= amount;
}

export function consume(user: UserRow, metric: UsageMetric, amount = 1): void {
  if (amount <= 0) return;
  run(
    'INSERT INTO usage (user_id, day, metric, amount) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, day, metric) DO UPDATE SET amount = amount + excluded.amount',
    user.id,
    today(),
    metric,
    Math.round(amount),
  );
}
