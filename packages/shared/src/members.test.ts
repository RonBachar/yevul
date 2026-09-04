import { describe, expect, it } from 'vitest';
import { workerModeShell } from './members';

// Worker Mode, שלב 6, design.md, "Worker Mode". החלטת המעטפת טהורה
// ובדיקה כאן, כי שני הלקוחות חסרי ריצת טסטים ומקבלים את התוצאה מוכנה.
// הכלל המרכזי שנבדק: עובד, וגם מצב לא ידוע (טעינה או כשל), לעולם לא
// מקבלים מעטפת כסף.
describe('workerModeShell', () => {
  it('gives owner the full shell', () => {
    expect(workerModeShell('owner', false)).toEqual({
      isWorker: false,
      showMoney: true,
      captureKinds: ['expense', 'task', 'journal'],
      plotDetailTabs: ['income', 'expenses', 'tasks', 'journal'],
      showExpenseCompletionPrompt: true,
    });
  });

  it('gives manager the full shell too', () => {
    expect(workerModeShell('manager', false)).toEqual({
      isWorker: false,
      showMoney: true,
      captureKinds: ['expense', 'task', 'journal'],
      plotDetailTabs: ['income', 'expenses', 'tasks', 'journal'],
      showExpenseCompletionPrompt: true,
    });
  });

  it('strips every money surface for a worker', () => {
    expect(workerModeShell('worker', false)).toEqual({
      isWorker: true,
      showMoney: false,
      captureKinds: ['task', 'journal'],
      plotDetailTabs: ['tasks', 'journal'],
      showExpenseCompletionPrompt: false,
    });
  });

  it('hides money while the role is still loading, so a worker never sees it for a frame', () => {
    const shell = workerModeShell(null, true);
    expect(shell.showMoney).toBe(false);
    expect(shell.captureKinds).toEqual(['task', 'journal']);
    expect(shell.plotDetailTabs).toEqual(['tasks', 'journal']);
    expect(shell.showExpenseCompletionPrompt).toBe(false);
    // לא הוכרע כעובד, רק "לא ידוע": isWorker נשאר false כדי שהמעטפת לא
    // תציג הודעות ספציפיות לעובד לפני שהתפקיד ידוע בפועל.
    expect(shell.isWorker).toBe(false);
  });

  it('treats an unknown role (load finished, no membership) as money-hidden', () => {
    const shell = workerModeShell(null, false);
    expect(shell.showMoney).toBe(false);
    expect(shell.isWorker).toBe(false);
  });
});
