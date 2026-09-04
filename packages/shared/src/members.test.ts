// Tests for farm sharing, packages/shared/src/members.ts.
//
// Two things are pinned here. First, the pure email rules, because the DB
// depends on them: the sign-in trigger matches on lower(invited_email) and the
// unique index is on lower(invited_email), so a client that stored a
// mixed-case address would create an invite the trigger could still match but a
// human comparing the two would think differed. Second, the write functions'
// mapping of a PostgREST answer to an outcome, because invite (INSERT) and
// remove/role-change (UPDATE) fail in two different ways: an INSERT blocked by
// RLS throws with a code, an UPDATE blocked by RLS returns zero rows and no
// error. Getting either mapping wrong tells the owner an action worked when it
// did not. What stays untested is the hook and the screens: neither client has
// a test runner, so useMembers and the settings UI are verified by running the
// app, not here.

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  inviteMember,
  isValidInviteEmail,
  normalizeInviteEmail,
  removeMember,
  updateMemberRole,
} from './members';

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
    // Last link in every chain here, so this is where the write resolves.
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

  // A manager's attempt is refused by RLS as zero rows, never an error. Without
  // the select there would be no way to tell that from success. See postgrest.ts.
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
