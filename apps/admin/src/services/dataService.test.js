import { describe, it, expect } from 'vitest';
import { __userSubscriptionHelpers } from './dataService.js';

const {
  getUserSubscriptionStatus,
  normalizeUserSubscription,
  compareNormalizedSubscriptions,
} = __userSubscriptionHelpers;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function buildSubscription({
  id,
  status = 'active',
  startOffsetDays = -5,
  endOffsetDays = 25,
}) {
  const now = Date.now();
  const startedAt = new Date(now + startOffsetDays * DAY_IN_MS).toISOString();
  const expiresAt = new Date(now + endOffsetDays * DAY_IN_MS).toISOString();
  return {
    id,
    status,
    plan_id: `plan-${id}`,
    started_at: startedAt,
    expires_at: expiresAt,
    purchased_at: startedAt,
    subscription_plans: {
      id: `plan-${id}`,
      name: `Plan ${id.toUpperCase()}`,
      code: `P-${id.toUpperCase()}`,
      price: 12000,
      currency: 'NGN',
      daily_question_limit: 30,
      duration_days: 30,
      plan_tier: 'standard',
      subscription_products: {
        id: 'product-nursing',
        name: 'School of Nursing Access',
        department_id: 'dept-nursing',
        departments: {
          id: 'dept-nursing',
          name: 'School of Nursing',
          slug: 'nursing',
          color_theme: 'nursing',
        },
      },
    },
  };
}

describe('user subscription helpers', () => {
  it('normalises active subscription metadata', () => {
    const entry = buildSubscription({ id: 'a1' });
    const normalized = normalizeUserSubscription(entry);

    expect(normalized).toBeTruthy();
    expect(normalized.status_key).toBe('active');
    expect(normalized.is_active_now).toBe(true);
    expect(normalized.plan_name).toContain('Plan A1');
    expect(normalized.department.name).toBe('School of Nursing');
  });

  it('detects expired subscriptions based on expiry date', () => {
    const entry = buildSubscription({ id: 'b2', status: 'active', startOffsetDays: -40, endOffsetDays: -5 });
    const normalized = normalizeUserSubscription(entry);

    expect(getUserSubscriptionStatus(entry)).toBe('expired');
    expect(normalized.status_key).toBe('expired');
    expect(normalized.is_active_now).toBe(false);
  });

  it('sorts active subscriptions ahead of expired ones', () => {
    const active = normalizeUserSubscription(buildSubscription({ id: 'c3' }));
    const expired = normalizeUserSubscription(
      buildSubscription({ id: 'd4', status: 'active', startOffsetDays: -60, endOffsetDays: -1 })
    );

    const ordered = [expired, active].sort(compareNormalizedSubscriptions);
    expect(ordered[0].id).toBe(active.id);
    expect(ordered[1].id).toBe(expired.id);
  });
});
