import en from './locales/en.json';
import { showEnumKey } from './pure';

// Every value TheTVDB and TMDB are known to send must land on a key, or the
// show page prints it in English in every language again.
describe('showEnumKey', () => {
  const statuses = ['Continuing', 'Returning Series', 'Ended', 'Canceled', 'Cancelled', 'Upcoming', 'In Production', 'Post Production', 'Planned', 'Pilot', 'Announced', 'Released', 'Rumored'];
  const genres = [
    // TheTVDB
    'Action', 'Adventure', 'Animation', 'Anime', 'Children', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'Food', 'Game Show',
    'Home and Garden', 'Horror', 'Indie', 'Martial Arts', 'Mini-Series', 'Musical', 'Mystery', 'News', 'Podcast', 'Reality', 'Romance',
    'Science Fiction', 'Soap', 'Sport', 'Suspense', 'Talk Show', 'Thriller', 'Travel', 'War', 'Western', 'Awards Show', 'Short',
    // TMDB, TV and film
    'Action & Adventure', 'Kids', 'Sci-Fi & Fantasy', 'Talk', 'War & Politics', 'History', 'Music', 'TV Movie',
  ];
  it.each(statuses)('status %s', (s) => expect(Object.keys(en.showEnums.status)).toContain(showEnumKey('status', s)));
  it.each(genres)('genre %s', (g) => expect(Object.keys(en.showEnums.genre)).toContain(showEnumKey('genre', g)));
  it('folds the two words for a running show into one', () => {
    expect(showEnumKey('status', 'Continuing')).toBe(showEnumKey('status', 'Returning Series'));
  });
  it('leaves an unknown value unmatched, so it shows as sent', () => {
    expect(Object.keys(en.showEnums.genre)).not.toContain(showEnumKey('genre', 'Drame'));
  });
});
