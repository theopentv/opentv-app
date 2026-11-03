import { errorFromResponse } from './api';
import { formatCountdown, groupCode, mcpErrorKey, secondsLeft } from './mcp-connect';

// Hoisted above the imports by ts-jest; keeps SecureStore out of a Node suite.
jest.mock('./community-session', () => ({ getToken: () => Promise.resolve('tok') }));

describe('Claude & ChatGPT errors', () => {
  it('reads the server codes this screen has its own words for', () => {
    expect(mcpErrorKey(errorFromResponse(402, '{"error":{"code":"plus_required"}}').code)).toBe('aiConnect.errPlus');
    // `no_backup` has to be a known code, or it arrives as `unknown` and the
    // reader is told something went wrong instead of what to turn on.
    expect(mcpErrorKey(errorFromResponse(409, '{"error":{"code":"no_backup"}}').code)).toBe('aiConnect.errNoBackup');
    expect(mcpErrorKey('not_configured')).toBe('aiConnect.errNotConfigured');
    expect(mcpErrorKey('network')).toBe('community.error.network');
  });
  it('leaves everything else to the shared sentence', () => {
    expect(mcpErrorKey('rate_limited')).toBeNull();
    expect(mcpErrorKey('unknown')).toBeNull();
  });
});

describe('the code on screen', () => {
  it('groups six digits in threes', () => {
    expect(groupCode('482917')).toBe('482 917');
    expect(groupCode('12345')).toBe('12345');
  });
  it('counts down to the expiry and stops at zero', () => {
    const at = '2026-11-03T10:05:00.000Z';
    const now = Date.parse('2026-11-03T10:00:00.000Z');
    expect(secondsLeft(at, now)).toBe(300);
    expect(secondsLeft(at, now + 299_500)).toBe(1);
    expect(secondsLeft(at, now + 400_000)).toBe(0);
    expect(secondsLeft('nonsense', now)).toBe(0);
    expect(formatCountdown(300)).toBe('5:00');
    expect(formatCountdown(65)).toBe('1:05');
  });
});
