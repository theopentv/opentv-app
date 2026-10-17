import {
  CHECK_CAP,
  includedServices,
  newlyOnMyServices,
  onMyServices,
  parseNames,
  pickTitlesToCheck,
  regionCatalogue,
  serviceKey,
  TITLE_GAP_MS,
} from './availability-plan';

describe('service names', () => {
  it('folds the ads tiers into the service', () => {
    expect(serviceKey('Netflix basic with Ads')).toBe('netflix');
    expect(serviceKey('Amazon Prime Video with Ads')).toBe('amazon prime video');
    expect(serviceKey('  Disney  Plus ')).toBe('disney plus');
  });

  it('counts subscription, free and ads — never rent or buy', () => {
    expect(
      includedServices([
        { name: 'Netflix', kind: 'flatrate' },
        { name: 'Netflix basic with Ads', kind: 'ads' },
        { name: 'Apple TV', kind: 'rent' },
        { name: 'Google Play', kind: 'buy' },
        { name: 'Pluto TV', kind: 'free' },
        { name: 'Old cache' }, // no kind: from when only flatrate was read
        { name: null, kind: 'flatrate' },
      ]),
    ).toEqual(['Netflix', 'Pluto TV', 'Old cache']);
  });

  it('matches the user’s services however TMDB spells them', () => {
    expect(onMyServices(['Netflix basic with Ads', 'Hulu'], ['Netflix', 'Max'])).toEqual(['Netflix']);
    expect(onMyServices([], ['Netflix'])).toEqual([]);
  });
});

describe('what is new', () => {
  const mine = ['Netflix', 'Max'];
  it('the first look is a baseline and says nothing', () => {
    expect(newlyOnMyServices(null, ['Netflix'], mine, [])).toEqual([]);
  });
  it('announces an arrival on one of theirs', () => {
    expect(newlyOnMyServices(['Hulu'], ['Hulu', 'Netflix'], mine, [])).toEqual(['Netflix']);
  });
  it('ignores arrivals on services they do not have', () => {
    expect(newlyOnMyServices([], ['Hulu'], mine, [])).toEqual([]);
  });
  it('never twice for the same title and service, even after it left and came back', () => {
    expect(newlyOnMyServices([], ['Netflix'], mine, ['Netflix'])).toEqual([]);
  });
  it('an ads tier arriving where the plain tier already was is not news', () => {
    expect(newlyOnMyServices(['Netflix'], ['Netflix', 'Netflix basic with Ads'], mine, [])).toEqual([]);
  });
});

describe('which titles to ask about', () => {
  const now = 10 * TITLE_GAP_MS;
  it('never-asked first, then oldest, skipping anything asked today', () => {
    const list = [
      { id: 'a', checkedAt: now - 2 * TITLE_GAP_MS },
      { id: 'b', checkedAt: null },
      { id: 'c', checkedAt: now - 1000 }, // today: skipped
      { id: 'd', checkedAt: now - 5 * TITLE_GAP_MS },
    ];
    expect(pickTitlesToCheck(list, now).map((x) => x.id)).toEqual(['b', 'd', 'a']);
  });
  it('caps a run, and the next run takes the next ones', () => {
    const list = Array.from({ length: 100 }, (_, i) => ({ id: i, checkedAt: null as number | null }));
    const first = pickTitlesToCheck(list, now);
    expect(first).toHaveLength(CHECK_CAP);
    for (const x of first) x.checkedAt = now;
    const second = pickTitlesToCheck(list, now + 8 * 3600000);
    expect(second[0]!.id).toBe(CHECK_CAP);
  });
  it('a clock in the future does not freeze a title', () => {
    expect(pickTitlesToCheck([{ checkedAt: now + TITLE_GAP_MS }], now)).toHaveLength(1);
  });
});

describe('storage and the picker', () => {
  it('parses stored names', () => {
    expect(parseNames('["Netflix", 3, ""]')).toEqual(['Netflix']);
    expect(parseNames('nope')).toEqual([]);
    expect(parseNames(null)).toEqual([]);
  });
  it('merges the film and tv catalogues in the region’s order, one row per service', () => {
    const films = [
      { provider_name: 'Netflix', display_priorities: { GB: 1 } },
      { provider_name: 'Netflix basic with Ads', display_priorities: { GB: 5 } },
      { provider_name: 'Mubi', display_priorities: { GB: 9 } },
    ];
    const tv = [{ provider_name: 'BBC iPlayer', display_priorities: { GB: 2 } }, { provider_name: 'Netflix', display_priorities: { GB: 1 } }];
    expect(regionCatalogue([films, tv], 'GB')).toEqual(['Netflix', 'BBC iPlayer', 'Mubi']);
  });
});
