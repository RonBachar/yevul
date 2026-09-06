import { describe, expect, it } from 'vitest';
import { resolveDisplayName } from './displayName';

// סדר העדיפויות הוא לב הכלל: מה שהמשתמש הגדיר גובר על מה שספק הזהות
// סיפק, וריק או רווחים נחשבים חוסר ולא ערך.
describe('resolveDisplayName', () => {
  it('prefers display_name over full_name and name', () => {
    expect(
      resolveDisplayName({
        user_metadata: { display_name: 'רון', full_name: 'Ron Bachar', name: 'ron' },
      }),
    ).toBe('רון');
  });

  it('falls back to full_name when display_name is missing', () => {
    expect(
      resolveDisplayName({ user_metadata: { full_name: 'Ron Bachar', name: 'ron' } }),
    ).toBe('Ron Bachar');
  });

  it('falls back to name when display_name and full_name are missing', () => {
    expect(resolveDisplayName({ user_metadata: { name: 'ron' } })).toBe('ron');
  });

  it('trims surrounding whitespace', () => {
    expect(resolveDisplayName({ user_metadata: { display_name: '  רון  ' } })).toBe('רון');
  });

  it('treats a whitespace-only value as absent and falls through', () => {
    expect(
      resolveDisplayName({ user_metadata: { display_name: '   ', full_name: 'Ron' } }),
    ).toBe('Ron');
  });

  it('returns null when nothing usable is present', () => {
    expect(resolveDisplayName({ user_metadata: { display_name: '  ' } })).toBeNull();
    expect(resolveDisplayName({ user_metadata: {} })).toBeNull();
  });

  it('returns null for a null or undefined user', () => {
    expect(resolveDisplayName(null)).toBeNull();
    expect(resolveDisplayName(undefined)).toBeNull();
  });
});
