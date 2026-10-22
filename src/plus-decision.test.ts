import { plusDecision } from '@/pure';

describe('plusDecision', () => {
  it('grants on either yes', () => {
    expect(plusDecision(true, null, true)).toBe(true);
    expect(plusDecision(false, true, true)).toBe(true);
    expect(plusDecision(null, true, true)).toBe(true);
  });

  it("a store 'no' waits for the server when the server can grant (the icon-reset bug)", () => {
    expect(plusDecision(false, null, true)).toBeNull();
    expect(plusDecision(false, false, true)).toBe(false);
  });

  it('with no server to ask, the store decides alone', () => {
    expect(plusDecision(false, null, false)).toBe(false);
  });

  it('nothing known yet keeps what the phone has', () => {
    expect(plusDecision(null, null, true)).toBeNull();
    expect(plusDecision(null, false, true)).toBeNull();
  });
});
