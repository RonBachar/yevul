// Tests for farm sharing, packages/shared/src/members.ts.
//
// Three concerns are pinned here. (1) The pure email rules, because the DB
// depends on them: the sign-in trigger matches on lower(invited_email) and the
// unique index is on lower(invited_email). (2) The write functions' mapping of
// a PostgREST answer to an outcome, because invite (INSERT) and role-change /
// remove (UPDATE) fail in two different ways. (3) The pure assignment and
// worker-mode policy — initials, assignable filter, the assign-to-someone-else
// rule, and the shell a role gets — since the two clients have no test runner.

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assignableMembers,
  avatarUrl,
  currentMember,
  inviteMember,
  isValidInviteEmail,
  memberInitials,
  membersByUserId,
  normalizeInviteEmail,
  removeMember,
  taskAssignee,
  updateMemberRole,
  workerModeShell,
  type Member,
} from './members';

// ============================================================
// Invite / role / remove — the write path (fake supabase).
// ============================================================

type WriteResult = {
  data: { id: string }[] | null;
  error: { code?: string; message: string } | null;
};

type Recorded = {
  tables: string[];
  inserts: Record<string, unknown>[];
  updates: Record<string, unknown>[];
  filters: string[];
  selected: string | null;
};

function fakeSupabase(result: WriteResult) {
  const recorded: Recorded = { tables: [], inserts: [], updates: [], filters: [], selected: null };

  const builder = {
    insert(values: Record<string, unknown>) {
      recorded.inserts.push(values);
      return builder;
    },
    update(values: Record<string, unknown>) {
      recorded.updates.push(values);
      return builder;
    },
    eq(column: string, value: string) {
      recorded.filters.push(`${column} = ${value}`);
      return builder;
    },
    select(columns: string) {
      recorded.selected = columns;
      return Promise.resolve(result);
    },
  };

  const client = {
    from(table: string) {
      recorded.tables.push(table);
      return builder;
    },
  };

  return { supabase: client as unknown as SupabaseClient, recorded };
}

const ONE_ROW: WriteResult = { data: [{ id: 'member-1' }], error: null };
const NO_ROWS: WriteResult = { data: [], error: null };

describe('normalizeInviteEmail', () => {
  it('trims and lowercases, to match the DB lower() comparison', () => {
    expect(normalizeInviteEmail('  Son@Test.Yevul ')).toBe('son@test.yevul');
  });
});

describe('isValidInviteEmail', () => {
  it('accepts a plain address', () => {
    expect(isValidInviteEmail('a@b.co')).toBe(true);
  });

  it('rejects empty, missing @, no local part, no domain, or spaces', () => {
    expect(isValidInviteEmail('')).toBe(false);
    expect(isValidInviteEmail('nobody')).toBe(false);
    expect(isValidInviteEmail('@test.yevul')).toBe(false);
    expect(isValidInviteEmail('son@')).toBe(false);
    expect(isValidInviteEmail('son @test.yevul')).toBe(false);
  });
});

describe('inviteMember', () => {
  it('rejects an invalid email before touching the database', async () => {
    const { supabase, recorded } = fakeSupabase(ONE_ROW);
    const result = await inviteMember(supabase, 'farm-1', 'not-an-email', 'worker');
    expect(result).toEqual({ ok: false, reason: 'invalidEmail' });
    expect(recorded.tables).toEqual([]);
  });

  it('inserts a pending invite with a normalized email and returns its id', async () => {
    const { supabase, recorded } = fakeSupabase(ONE_ROW);
    const result = await inviteMember(supabase, 'farm-1', '  Son@Test.Yevul ', 'worker');
    expect(result).toEqual({ ok: true, id: 'member-1' });
    expect(recorded.tables).toEqual(['farm_members']);
    expect(recorded.inserts[0]).toEqual({
      farm_id: 'farm-1',
      role: 'worker',
      status: 'invited',
      invited_email: 'son@test.yevul',
    });
    expect(recorded.selected).toBe('id');
  });

  it('maps a unique-violation to duplicate', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { code: '23505', message: 'dup' } });
    const result = await inviteMember(supabase, 'farm-1', 'son@test.yevul', 'worker');
    expect(result).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('maps an RLS refusal to forbidden', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { code: '42501', message: 'rls' } });
    const result = await inviteMember(supabase, 'farm-1', 'son@test.yevul', 'worker');
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('maps any other error to error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { code: '08006', message: 'network' } });
    const result = await inviteMember(supabase, 'farm-1', 'son@test.yevul', 'worker');
    expect(result).toEqual({ ok: false, reason: 'error' });
  });
});

describe('updateMemberRole', () => {
  it('updates the role and asks for the row back', async () => {
    const { supabase, recorded } = fakeSupabase(ONE_ROW);
    const result = await updateMemberRole(supabase, 'member-1', 'manager');
    expect(result).toEqual({ ok: true });
    expect(recorded.updates[0]).toEqual({ role: 'manager' });
    expect(recorded.filters).toEqual(['id = member-1']);
    expect(recorded.selected).toBe('id');
  });

  it('reports forbidden when RLS refuses the update, zero rows and no error', async () => {
    const { supabase } = fakeSupabase(NO_ROWS);
    const result = await updateMemberRole(supabase, 'member-1', 'manager');
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });
});

describe('removeMember', () => {
  it('soft-deletes with an ISO instant scoped to the one member', async () => {
    const { supabase, recorded } = fakeSupabase(ONE_ROW);
    const result = await removeMember(supabase, 'member-1');
    expect(result).toEqual({ ok: true });
    expect(Object.keys(recorded.updates[0] ?? {})).toEqual(['deleted_at']);
    expect(String(recorded.updates[0]?.deleted_at)).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(recorded.filters).toEqual(['id = member-1']);
  });

  it('reports forbidden when a non-owner attempt returns zero rows', async () => {
    const { supabase } = fakeSupabase(NO_ROWS);
    const result = await removeMember(supabase, 'member-1');
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });
});

// ============================================================
// Assignment helpers — initials, assignable filter, lookup, avatar rule.
// ============================================================

function makeMember(overrides: Partial<Member>): Member {
  return {
    id: 'm1',
    userId: 'u1',
    role: 'worker',
    status: 'active',
    email: 'avi@example.com',
    isSelf: false,
    avatarPath: null,
    ...overrides,
  };
}

describe('memberInitials', () => {
  it('takes the first two characters of the email local-part, uppercased', () => {
    expect(memberInitials('avi@example.com')).toBe('AV');
  });

  it('strips a dot separator so a two-word local-part reads its two words', () => {
    expect(memberInitials('avi.cohen@example.com')).toBe('AV');
  });

  it('returns a single letter when the local-part has only one character', () => {
    expect(memberInitials('a@example.com')).toBe('A');
  });

  it('returns an empty string for a null or empty email', () => {
    expect(memberInitials(null)).toBe('');
    expect(memberInitials(undefined)).toBe('');
    expect(memberInitials('')).toBe('');
  });
});

describe('avatarUrl', () => {
  // getPublicUrl is a client-side string builder; a tiny fake stands in for it.
  function fakeStorage(): SupabaseClient {
    return {
      storage: {
        from: (bucket: string) => ({
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://cdn/${bucket}/${path}` },
          }),
        }),
      },
    } as unknown as SupabaseClient;
  }

  it('returns null when there is no avatar path', () => {
    const supabase = fakeStorage();
    expect(avatarUrl(supabase, null)).toBe(null);
    expect(avatarUrl(supabase, '')).toBe(null);
  });

  it('builds the public URL from the avatars bucket and the stored path', () => {
    expect(avatarUrl(fakeStorage(), 'u1/avatar.jpg')).toBe('https://cdn/avatars/u1/avatar.jpg');
  });
});

describe('assignableMembers', () => {
  it('keeps active members that have a user id', () => {
    const active = makeMember({ id: 'a', userId: 'ua' });
    expect(assignableMembers([active])).toEqual([active]);
  });

  it('drops invited members with no user id yet', () => {
    const invited = makeMember({ id: 'b', userId: null, status: 'invited', email: 'b@x.com' });
    expect(assignableMembers([invited])).toEqual([]);
  });

  it('drops active rows that never got a user id', () => {
    const orphan = makeMember({ id: 'c', userId: null, status: 'active' });
    expect(assignableMembers([orphan])).toEqual([]);
  });
});

describe('membersByUserId', () => {
  it('maps each member by its user id and skips those without one', () => {
    const withId = makeMember({ id: 'a', userId: 'ua' });
    const withoutId = makeMember({ id: 'b', userId: null });
    const map = membersByUserId([withId, withoutId]);
    expect(map.get('ua')).toBe(withId);
    expect(map.size).toBe(1);
  });
});

describe('currentMember', () => {
  it('finds the member whose user id is the current user', () => {
    const me = makeMember({ id: 'me', userId: 'u-me' });
    const other = makeMember({ id: 'other', userId: 'u-other' });
    expect(currentMember([me, other], 'u-me')).toBe(me);
  });

  it('returns null when there is no current user', () => {
    expect(currentMember([makeMember({})], null)).toBe(null);
  });
});

describe('taskAssignee', () => {
  const me = makeMember({ id: 'me', userId: 'u-me', email: 'me@example.com' });
  const dan = makeMember({ id: 'dan', userId: 'u-dan', email: 'dan.levi@example.com' });
  const byUserId = membersByUserId([me, dan]);

  it('returns the assignee initials and label for a task assigned to someone else', () => {
    expect(taskAssignee('u-dan', 'u-me', byUserId)).toEqual({
      initials: 'DA',
      label: 'dan.levi@example.com',
    });
  });

  it('returns null for a task assigned to the current user', () => {
    expect(taskAssignee('u-me', 'u-me', byUserId)).toBe(null);
  });

  it('returns null for an unassigned task', () => {
    expect(taskAssignee(null, 'u-me', byUserId)).toBe(null);
  });

  it('returns null when the assignee is no longer in the roster', () => {
    expect(taskAssignee('u-gone', 'u-me', byUserId)).toBe(null);
  });
});

// ============================================================
// Worker Mode shell — a worker, and any unknown/loading role, never gets money.
// ============================================================

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
    expect(shell.isWorker).toBe(false);
  });

  it('treats an unknown role (load finished, no membership) as money-hidden', () => {
    const shell = workerModeShell(null, false);
    expect(shell.showMoney).toBe(false);
    expect(shell.isWorker).toBe(false);
  });
});
