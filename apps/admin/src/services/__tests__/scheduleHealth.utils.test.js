import { describe, it, expect } from 'vitest';
import {
  getHealthSeverity,
  describeHealthAlerts,
  getHealthLabel,
  classifyHealth,
} from '../../utils/scheduleHealth.js';

describe('schedule health utilities', () => {
  it('marks schedules with missing questions as critical', () => {
    const entry = {
      last_run_status: 'success',
      total_days: 7,
      ready_days: 4,
      underfilled_days: 2,
      empty_days: 1,
      unscheduled_days: 0,
      missing_questions: 125,
      alerts: ['missing_questions'],
    };
    expect(getHealthSeverity(entry)).toBe('critical');
    const messages = describeHealthAlerts(entry);
    expect(messages).toContain('125 questions missing across buckets');
  });

  it('returns warning when schedule has never been rebuilt', () => {
    const entry = {
      last_run_status: null,
      total_days: 0,
      ready_days: 0,
      underfilled_days: 0,
      empty_days: 0,
      unscheduled_days: 0,
      missing_questions: 0,
      alerts: ['no_runs'],
    };
    expect(getHealthSeverity(entry)).toBe('warning');
    const messages = describeHealthAlerts(entry);
    expect(messages[0]).toMatch(/not been generated/i);
  });

  it('returns healthy badge label when all pools are ready', () => {
    const entry = {
      last_run_status: 'success',
      total_days: 7,
      ready_days: 7,
      underfilled_days: 0,
      empty_days: 0,
      unscheduled_days: 0,
      missing_questions: 0,
      alerts: [],
    };
    const badge = classifyHealth(entry);
    expect(badge.severity).toBe('healthy');
    expect(getHealthLabel(badge.severity)).toBe('Healthy');
    expect(badge.messages[0]).toContain('7/7');
  });
});
