import type { ThreadTarget } from '@/community-comments';
import { episodeGateKey, episodeGated, revealEpisode } from '@/spoiler-gate';

const ep = (key: string, season: number | null, episode: number | null, source: ThreadTarget['source'] = 'tvdb'): ThreadTarget => ({
  source,
  key,
  season,
  episode,
});
const never = () => false;
const always = () => true;

describe('episode spoiler gate', () => {
  it('gates only an episode thread', () => {
    expect(episodeGateKey(ep('81189', 1, 2))).toBe('81189-1-2');
    expect(episodeGateKey(ep('81189', null, null))).toBeNull(); // show-level
    expect(episodeGateKey(ep('tvdb-369369', null, null, 'title'))).toBeNull(); // film
    expect(episodeGateKey(ep('1399', 1, 2, 'tmdb'))).toBeNull();
    expect(episodeGateKey(ep('', 1, 2))).toBeNull();
  });

  it('asks for an unwatched episode, not a watched one', () => {
    expect(episodeGated(ep('100', 1, 1), never, null)).toBe(true);
    expect(episodeGated(ep('100', 1, 1), always, null)).toBe(false);
    expect(episodeGated(ep('100', null, null), never, null)).toBe(false);
  });

  it('passes the right episode to the watched check', () => {
    const seen: number[][] = [];
    episodeGated(ep('200', 3, 0), (a, b, c) => (seen.push([a, b, c]), true), null);
    expect(seen).toEqual([[200, 3, 0]]);
  });

  it('"Display anyway" opens that episode for the session, and only that one', () => {
    const t = ep('300', 2, 5);
    expect(episodeGated(t, never, null)).toBe(true);
    expect(revealEpisode(t)).toBe('300-2-5');
    expect(episodeGated(t, never, null)).toBe(false); // a fresh mount, same session
    expect(episodeGated(ep('300', 2, 6), never, null)).toBe(true);
  });

  it('the screen-local key opens it too', () => {
    expect(episodeGated(ep('400', 1, 1), never, '400-1-1')).toBe(false);
  });
});
