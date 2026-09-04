import { describe, expect, it } from 'vitest';
import {
  assignableMembers,
  currentMember,
  memberInitials,
  membersByUserId,
  taskAssignee,
  type Member,
} from './members';

function makeMember(overrides: Partial<Member>): Member {
  return {
    id: 'm1',
    userId: 'u1',
    role: 'worker',
    status: 'active',
    email: 'avi@example.com',
    ...overrides,
  };
}

// design.md, Member Avatar: ראשי התיבות מהחלק שלפני ה-@, שני התווים
// הראשונים באותיות גדולות.
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

// רק חבר פעיל עם מזהה משתמש ניתן להצבה.
describe('assignableMembers', () => {
  it('keeps active members that have a user id', () => {
    const active = makeMember({ id: 'a', userId: 'ua' });
    const result = assignableMembers([active]);
    expect(result).toEqual([active]);
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

// design.md, Member Avatar: מוצג רק כשהמשימה משויכת למישהו שאינו
// המשתמש המחובר. "משויך אליי" הוא ברירת המחדל, והצגתו היא רעש.
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
