/**
 * A show arriving from another device must arrive NAMED (21 Oct).
 *
 * The bug: adding a show queued nothing, so the other device first met it as a
 * tick and `markWatched` made the row from the id — "81189", no poster.
 */
const calls: unknown[][] = [];
let nameless: number[] = [];
const rec =
  (name: string) =>
  (...args: unknown[]) =>
    void calls.push([name, ...args]);

jest.mock('@/db', () => ({
  addShow: rec('addShow'),
  markWatched: rec('markWatched'),
  setShowName: rec('setShowName'),
  setShowPoster: rec('setShowPoster'),
  getShowsMissingName: () => nameless.map((tvdbId) => ({ tvdbId })),
  getShowsMissingPoster: () => nameless.map((tvdbId) => ({ tvdbId })),
  notifyRemoteChange: () => {},
  setApplyingRemote: () => {},
}));
jest.mock('@/tvdb', () => ({
  tvdbSeries: async (id: number) => ({ name: 'Breaking Bad', image: `https://art/${id}.jpg` }),
}));

import { applyRemoteOps } from '@/sync-apply';

beforeEach(() => {
  calls.length = 0;
  nameless = [];
});

const op = (seq: number, kind: string, payload: object) => ({ seq, ts: seq, kind, payload: JSON.stringify(payload) });

it('adds a show another device added, with its name and poster', () => {
  applyRemoteOps([op(1, 'showAdd', { show: 81189, name: 'Breaking Bad', poster: 'p.jpg' })], () => {});
  expect(calls).toEqual([['addShow', 81189, 'Breaking Bad', 'p.jpg']]);
});

it('names a show it first met as a tick, instead of leaving the id as its name', async () => {
  nameless = [81189, 5]; // 5 is nameless too, but nothing in this batch touched it
  applyRemoteOps([op(1, 'watch', { show: 81189, s: 1, e: 1, at: '' })], () => {});
  await new Promise((r) => setTimeout(r, 0));
  expect(calls).toEqual([
    ['markWatched', 81189, 1, 1, undefined],
    ['setShowName', 81189, 'Breaking Bad'],
    ['setShowPoster', 81189, 'https://art/81189.jpg'],
  ]);
});

it('asks nobody when the ticked show already had a name', async () => {
  applyRemoteOps([op(1, 'watch', { show: 81189, s: 1, e: 1, at: '' })], () => {});
  await new Promise((r) => setTimeout(r, 0));
  expect(calls).toEqual([['markWatched', 81189, 1, 1, undefined]]);
});
