// Tests for the "My Plots" toggle policy, packages/shared/src/myPlots.ts.
// The two clients have no test runner, so the toggle's whole decision surface
// is pinned here: when it is visible at all, which plots count as "mine", and
// how the task board narrows to them. design.md, "My Plots" Toggle, and prd.md
// section 11 ("a view, not a block").

import { describe, expect, it } from 'vitest';
import { myPlotIds, myPlotsToggleVisible, tasksOnPlots } from './myPlots';
import type { Plot } from './plots';
import type { Task } from './tasks';

function makePlot(overrides: Partial<Plot>): Plot {
  return {
    id: 'p1',
    farmId: 'farm-1',
    name: 'Plot',
    area: null,
    areaUnit: null,
    responsibleUserId: null,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    farmId: 'farm-1',
    plotId: null,
    title: 'Task',
    dueDate: null,
    estimatedCost: null,
    assignedTo: null,
    completedAt: null,
    snoozedUntil: null,
    snoozeCount: 0,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('myPlotsToggleVisible', () => {
  it('is hidden on a solo farm even when a plot has a responsible', () => {
    expect(myPlotsToggleVisible(1, [makePlot({ responsibleUserId: 'u1' })])).toBe(false);
  });

  it('is hidden on a multi-member farm when no plot has a responsible', () => {
    expect(myPlotsToggleVisible(3, [makePlot({}), makePlot({ id: 'p2' })])).toBe(false);
  });

  it('is shown when the farm has more than one member and a plot is assigned', () => {
    expect(
      myPlotsToggleVisible(2, [makePlot({}), makePlot({ id: 'p2', responsibleUserId: 'u1' })]),
    ).toBe(true);
  });

  it('is hidden when there are no plots at all', () => {
    expect(myPlotsToggleVisible(2, [])).toBe(false);
  });
});

describe('myPlotIds', () => {
  const plots = [
    makePlot({ id: 'a', responsibleUserId: 'u-me' }),
    makePlot({ id: 'b', responsibleUserId: 'u-other' }),
    makePlot({ id: 'c', responsibleUserId: 'u-me' }),
    makePlot({ id: 'd', responsibleUserId: null }),
  ];

  it('returns the ids of the plots the current user is responsible for', () => {
    expect(myPlotIds(plots, 'u-me')).toEqual(['a', 'c']);
  });

  it('returns an empty array when the user is responsible for none', () => {
    expect(myPlotIds(plots, 'u-nobody')).toEqual([]);
  });

  it('returns an empty array when there is no current user', () => {
    expect(myPlotIds(plots, null)).toEqual([]);
  });
});

describe('tasksOnPlots', () => {
  const onA = makeTask({ id: 't-a', plotId: 'a' });
  const onB = makeTask({ id: 't-b', plotId: 'b' });
  const general = makeTask({ id: 't-general', plotId: null });
  const tasks = [onA, onB, general];

  it('leaves the list untouched when no plot ids are given', () => {
    expect(tasksOnPlots(tasks, undefined)).toBe(tasks);
  });

  it('keeps only tasks whose plot is in the set', () => {
    expect(tasksOnPlots(tasks, ['a'])).toEqual([onA]);
  });

  it('drops plot-less (farm-wide) tasks from the filtered view', () => {
    expect(tasksOnPlots(tasks, ['a', 'b'])).toEqual([onA, onB]);
  });

  it('returns nothing when the set of my plots is empty', () => {
    expect(tasksOnPlots(tasks, [])).toEqual([]);
  });
});
