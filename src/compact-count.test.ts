import { compactCount } from './compact-count';

describe('compactCount', () => {
  it('uses the locale decimal separator', () => {
    expect(compactCount(83_400, 'en')).toBe('83.4K');
    expect(compactCount(83_400, 'it')).toBe('83,4K');
    expect(compactCount(1_250_000, 'de')).toBe('1,3M');
    expect(compactCount(950, 'it')).toBe('950');
  });
});
