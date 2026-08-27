import { describe, expect, it } from 'vitest';
import { completionPromptVisibility } from './completionPrompts';

// שתי השאלות עצמאיות, design.md: "Both toggles live in Settings and
// can be turned off independently." אם שתיהן כבויות אין מה להציג
// בכלל, כדי שלא ייפתח גיליון ריק אחרי כל השלמת משימה.
describe('completionPromptVisibility', () => {
  it('shows nothing when both toggles are off', () => {
    expect(completionPromptVisibility(false, false)).toEqual({
      showJournal: false,
      showExpense: false,
      showPrompt: false,
    });
  });

  it('shows only the journal question when only it is enabled', () => {
    expect(completionPromptVisibility(true, false)).toEqual({
      showJournal: true,
      showExpense: false,
      showPrompt: true,
    });
  });

  it('shows only the expense question when only it is enabled', () => {
    expect(completionPromptVisibility(false, true)).toEqual({
      showJournal: false,
      showExpense: true,
      showPrompt: true,
    });
  });

  it('shows both questions when both toggles are on', () => {
    expect(completionPromptVisibility(true, true)).toEqual({
      showJournal: true,
      showExpense: true,
      showPrompt: true,
    });
  });
});
