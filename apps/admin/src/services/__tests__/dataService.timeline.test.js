import { describe, it, expect } from 'vitest';
import { buildCycleTimeline } from '../dataService.js';

function makeSubslot({
  id,
  index,
  daySpan = 7,
  startDate,
  distribution = [],
  status = 'draft',
}) {
  return {
    id,
    index,
    day_span: daySpan,
    start_date: startDate,
    distribution,
    status,
  };
}

describe('buildCycleTimeline', () => {
  it('aggregates fully scheduled subslots', () => {
    const cycle = {
      id: 'cycle-1',
      title: 'Example Cycle',
      status: 'ready',
      start_date: '2025-01-01',
      subslots: [
        makeSubslot({
          id: 'subslot-1',
          index: 1,
          startDate: '2025-01-01',
          distribution: [
            { day_offset: 0, count: 250 },
            { day_offset: 1, count: 260 },
            { day_offset: 2, count: 250 },
            { day_offset: 3, count: 240 },
            { day_offset: 4, count: 250 },
            { day_offset: 5, count: 250 },
            { day_offset: 6, count: 255 },
          ],
          status: 'ready',
        }),
      ],
    };

    const timeline = buildCycleTimeline(cycle);
    expect(timeline.total_days).toBe(7);
    expect(timeline.filled_days).toBe(6);
    expect(timeline.underfilled_days).toBe(1);
    expect(timeline.empty_days).toBe(0);
    expect(timeline.unscheduled_days).toBe(0);
    expect(timeline.missing_questions).toBeGreaterThan(0);
  });

  it('handles missing start dates as unscheduled days', () => {
    const cycle = {
      id: 'cycle-2',
      title: 'Unscheduled Cycle',
      status: 'draft',
      start_date: null,
      subslots: [
        makeSubslot({
          id: 'subslot-unscheduled',
          index: 1,
          startDate: null,
          distribution: [],
          status: 'draft',
        }),
      ],
    };

    const timeline = buildCycleTimeline(cycle);
    expect(timeline.total_days).toBe(7);
    expect(timeline.filled_days).toBe(0);
    expect(timeline.underfilled_days).toBe(0);
    expect(timeline.empty_days).toBe(7);
    expect(timeline.unscheduled_days).toBe(7);
    expect(timeline.missing_questions).toBe(1750);
  });

  it('totals missing questions across underfilled and empty days', () => {
    const cycle = {
      id: 'cycle-3',
      title: 'Partial Fill Cycle',
      status: 'ready',
      start_date: '2025-03-01',
      subslots: [
        makeSubslot({
          id: 'subslot-3',
          index: 1,
          startDate: '2025-03-01',
          distribution: [
            { day_offset: 0, count: 250 },
            { day_offset: 1, count: 100 },
            { day_offset: 2, count: 0 },
          ],
          daySpan: 3,
        }),
      ],
    };

    const timeline = buildCycleTimeline(cycle);
    expect(timeline.total_days).toBe(3);
    expect(timeline.filled_days).toBe(1);
    expect(timeline.underfilled_days).toBe(1);
    expect(timeline.empty_days).toBe(1);
    expect(timeline.missing_questions).toBe(400);
  });
});
