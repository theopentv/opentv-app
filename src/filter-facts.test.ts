/** "On my services" is Plus: without it no title carries the fact, so the axis is never offered. */
let plus = true;
jest.mock('@/plus', () => ({ isPlus: () => plus }));
jest.mock('@/availability', () => ({
  myServices: () => ['Netflix'],
  servicesSeen: () => new Map([['movie:1', ['Netflix']]]),
}));
jest.mock('@/db', () => ({ getShowFilterFacts: () => new Map() }));
jest.mock('@/metadata', () => ({ showMeta: () => null }));
jest.mock('@/movie-metadata', () => ({ movieMeta: () => null }));
jest.mock('@/show-meta-fetch', () => ({ watchRegion: () => 'US' }));
jest.mock('@/show-status', () => ({ airedTotalOf: () => 0 }));
jest.mock('@/star-rating', () => ({ starsValue: (n: number) => n / 2 }));

import { movieFacts } from '@/filter-facts';
import type { MovieRow } from '@/db';

const row = { name: 'A', tmdbId: 1, watchedAt: null, stars: null, runtime: null, year: '2020' } as unknown as MovieRow;

it('marks a title on my services only with Plus', () => {
  expect(movieFacts([row])[0].services).toEqual(['mine']);
  plus = false;
  expect(movieFacts([row])[0].services).toEqual([]);
});
