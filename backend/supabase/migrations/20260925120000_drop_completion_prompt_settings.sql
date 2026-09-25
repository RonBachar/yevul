-- Completion Prompts is gone, and so are the two switches that configured it.
--
-- Added in 20260826050000 for a sheet that asked two questions when a task was
-- ticked off: save this to the journal, and file this as an expense. The
-- founder deleted the whole mechanism on 2026-09-25 (docs/spec-money-and-tasks.md
-- section 3). Completing a task now writes the journal entry by itself, and the
-- expense question does not exist in any form.
--
-- Dropped rather than left in place: a boolean nothing reads is a switch the
-- next person will wire back up to something.

alter table public.settings
  drop column if exists journal_prompt_enabled,
  drop column if exists expense_prompt_enabled;
