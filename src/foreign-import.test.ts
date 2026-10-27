import { bingersRows, bingersTable, bingersTableKind, bingersTmdbOnlyShows, classifyForeignJson, cp1252, detectForeignSource, imdbRemoteHit, imdbRows, imdbTvRows, isImdbCsv, type ImdbTvHit, isLetterboxdImportCsv, letterboxdImportRows, letterboxdRows, serializdRecords, serializdRows, simklRows, sofaTimeItems, sofaTimeRows, traktRows } from '@/foreign-import';

/**
 * Real Letterboxd export headers, from their own documented format. The
 * mapping is tested against these rather than discovered on somebody's phone.
 */
/** What `parseCsv` hands back: the header row applied to each line. */
const csv = (rows: string[][]): Record<string, string>[] => {
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
};

describe('letterboxdRows', () => {
  it('takes the date the film was watched, not the day it was logged', () => {
    const out = letterboxdRows({
      'diary.csv': csv([
        ['Date', 'Name', 'Year', 'Letterboxd URI', 'Rating', 'Rewatch', 'Tags', 'Watched Date'],
        ['2026-08-18', 'Arrival', '2016', 'https://boxd.it/x', '4.5', 'No', '', '2026-08-11'],
      ]),
    });
    expect(out.movieRows).toHaveLength(1);
    expect(out.movieRows[0].created_at).toBe('2026-08-11 12:00:00');
    expect(out.movieRows[0].movie_name).toBe('Arrival');
    expect(out.movieRows[0].movie_year).toBe('2016');
  });

  it('keeps a rewatch as a rewatch rather than a second film', () => {
    const out = letterboxdRows({
      'diary.csv': csv([
        ['Date', 'Name', 'Year', 'Letterboxd URI', 'Rating', 'Rewatch', 'Tags', 'Watched Date'],
        ['2024-01-02', 'Heat', '1995', '', '5', 'No', '', '2024-01-02'],
        ['2026-02-03', 'Heat', '1995', '', '5', 'Yes', '', '2026-02-03'],
      ]),
    });
    expect(out.movieRows.map((r) => r.type)).toEqual(['watch', 'rewatch']);
  });

  it('keeps a film whose diary holds only a rewatch (it was missing from the library)', () => {
    const out = letterboxdRows({
      'diary.csv': csv([
        ['Date', 'Name', 'Year', 'Letterboxd URI', 'Rating', 'Rewatch', 'Tags', 'Watched Date'],
        ['2026-05-20', 'The Matrix', '1999', '', '4', 'Yes', '', '2026-05-19'],
      ]),
      'watched.csv': csv([
        ['Date', 'Name', 'Year', 'Letterboxd URI'],
        ['2026-05-20', 'The Matrix', '1999', ''],
      ]),
    });
    expect(out.movieRows.map((r) => r.type).sort()).toEqual(['rewatch', 'watch']);
  });

  it('does not lose films that predate the diary', () => {
    const out = letterboxdRows({
      'diary.csv': csv([['Date', 'Name', 'Year', 'Rewatch', 'Watched Date'], ['2026-01-01', 'Heat', '1995', 'No', '2026-01-01']]),
      'watched.csv': csv([
        ['Date', 'Name', 'Year', 'Letterboxd URI'],
        ['2019-05-05', 'Heat', '1995', ''],
        ['2019-05-06', 'Solaris', '1972', ''],
      ]),
    });
    // Heat is already in from the diary, with its real date; Solaris is not.
    expect(out.movieRows.filter((r) => r.movie_name === 'Heat')).toHaveLength(1);
    expect(out.movieRows.find((r) => r.movie_name === 'Solaris')?.type).toBe('watch');
  });

  it('carries the watchlist over instead of dropping it', () => {
    const out = letterboxdRows({
      'watchlist.csv': csv([['Date', 'Name', 'Year'], ['2026-03-01', 'Stalker', '1979']]),
    });
    expect(out.movieRows[0]).toMatchObject({ type: 'towatch', movie_name: 'Stalker' });
  });

  it('keeps a half star a half star — out of ten since 2.0.0', () => {
    const out = letterboxdRows({
      'ratings.csv': csv([
        ['Date', 'Name', 'Year', 'Letterboxd URI', 'Rating'],
        ['2026-01-01', 'Arrival', '2016', '', '3.5'],
        ['2026-01-01', 'Heat', '1995', '', '5'],
        ['2026-01-01', 'Cats', '2019', '', '0.5'],
      ]),
    });
    // 3.5 is 7, not 4 (what it became before half stars) and not 3.
    expect(out.movieRatings).toEqual([
      { name: 'Arrival', ten: 7 },
      { name: 'Heat', ten: 10 },
      { name: 'Cats', ten: 1 },
    ]);
  });

  it('brings no shows, because Letterboxd has none', () => {
    const out = letterboxdRows({ 'watched.csv': csv([['Date', 'Name', 'Year'], ['2026-01-01', 'Heat', '1995']]) });
    expect(out.showRows).toEqual([]);
    expect(out.episodeRows).toEqual([]);
  });

  it('survives an export with nothing in it', () => {
    expect(letterboxdRows({}).movieRows).toEqual([]);
    expect(letterboxdRows({ 'watched.csv': csv([]) }).movieRows).toEqual([]);
  });
});

describe('detectForeignSource', () => {
  it('recognises a Letterboxd export by what is inside it', () => {
    expect(detectForeignSource(['diary.csv', 'ratings.csv', 'watched.csv'])).toBe('letterboxd');
    expect(detectForeignSource(['letterboxd/diary.csv', 'letterboxd/ratings.csv'])).toBe('letterboxd');
  });

  it('is not fooled by the name of the ZIP or of a stray file', () => {
    expect(detectForeignSource(['user_tv_show_data.csv', 'ratings-live-votes.csv'])).toBeNull();
    expect(detectForeignSource(['letterboxd.csv'])).toBeNull();
  });
});

describe('traktRows', () => {
  const history = [
    {
      watched_at: '2026-01-02T21:00:00.000Z',
      type: 'episode',
      episode: { season: 1, number: 4 },
      show: { title: 'Dark', ids: { tvdb: 70523, tmdb: 70523 } },
    },
    { watched_at: '2026-01-03T20:00:00.000Z', type: 'movie', movie: { title: 'Heat', year: 1995, ids: { tmdb: 949 } } },
  ];

  it('keys shows by TheTVDB id, which is what this app already uses', () => {
    const out = traktRows({ history });
    expect(out.showRows).toEqual([
      { tv_show_id: '70523', tv_show_name: 'Dark', is_followed: '1', is_favorited: '0', archived: '0' },
    ]);
    expect(out.episodeRows[0]).toMatchObject({ s_id: '70523', season_number: '1', episode_number: '4' });
  });

  it('drops a show with no TheTVDB id rather than matching it by name', () => {
    const out = traktRows({
      history: [{ watched_at: 'x', episode: { season: 1, number: 1 }, show: { title: 'Dark', ids: { tmdb: 1 } } }],
    });
    expect(out.episodeRows).toEqual([]);
    expect(out.showRows).toEqual([]);
  });

  it('lists a show once however many episodes came from it', () => {
    const many = [1, 2, 3].map((n) => ({
      watched_at: 'x',
      episode: { season: 1, number: n },
      show: { title: 'Dark', ids: { tvdb: 70523 } },
    }));
    const out = traktRows({ history: many });
    expect(out.showRows).toHaveLength(1);
    expect(out.episodeRows).toHaveLength(3);
  });

  it('takes films, the watchlist and ratings', () => {
    const out = traktRows({
      history,
      watchlist: [{ type: 'movie', movie: { title: 'Stalker', year: 1979 }, listed_at: '2026-02-01' }],
      ratings: [{ type: 'movie', movie: { title: 'Heat' }, rating: 9 }],
    });
    expect(out.movieRows.find((r) => r.movie_name === 'Heat')).toMatchObject({ type: 'watch', movie_year: '1995' });
    expect(out.movieRows.find((r) => r.movie_name === 'Stalker')).toMatchObject({ type: 'towatch' });
    // 9 of 10 stays 9: four and a half stars, no longer folded into five.
    expect(out.movieRatings).toEqual([{ name: 'Heat', ten: 9 }]);
  });

  it('survives an empty payload', () => {
    expect(traktRows({})).toEqual({ showRows: [], episodeRows: [], movieRows: [], movieRatings: [] });
  });
});

describe('simklRows', () => {
  it('flattens seasons into one row per episode', () => {
    const out = simklRows({
      shows: [
        {
          title: 'Dark',
          ids: { tvdb: 70523 },
          last_watched_at: '2026-05-05',
          seasons: [{ number: 1, episodes: [{ number: 1, watched_at: '2026-01-01' }, { number: 2 }] }],
        },
      ],
    });
    expect(out.episodeRows).toHaveLength(2);
    expect(out.episodeRows[0].created_at).toBe('2026-01-01');
    // No date of its own: the show's last watch, rather than nothing at all.
    expect(out.episodeRows[1].created_at).toBe('2026-05-05');
  });

  it('reads plantowatch as the watchlist and everything else as watched', () => {
    const out = simklRows({
      movies: [
        { title: 'Heat', year: 1995, status: 'completed', watched_at: '2026-01-01', user_rating: 8 },
        { title: 'Stalker', year: 1979, status: 'plantowatch' },
      ],
    });
    expect(out.movieRows.find((r) => r.movie_name === 'Heat')?.type).toBe('watch');
    expect(out.movieRows.find((r) => r.movie_name === 'Stalker')?.type).toBe('towatch');
    expect(out.movieRatings).toEqual([{ name: 'Heat', ten: 8 }]);
  });

  /*
   * THE SHAPE OF A REAL FILE (simkl.com/apps/backup, 25 Oct 2026): the title
   * and ids sit one level down, in `show` / `movie`, and anime has its own
   * list. The two tests above were written against a guessed flat shape before
   * anybody had a file, so they passed while every real import came out empty
   * and fell through to the TV Time "no CSV" error (a German user's report).
   */
  it('reads a real backup: nested show/movie objects, and anime', () => {
    const out = simklRows({
      shows: [
        {
          status: 'watching',
          last_watched_at: '2026-10-25T11:58:42Z',
          show: { title: 'Game of Thrones', year: 2011, ids: { simkl: 17465, tvdb: '121361', tmdb: '1399' } },
          seasons: [{ number: 1, episodes: [{ number: 1, watched_at: '2026-10-25T11:57:00Z' }, { number: 2, watched_at: '2026-10-25T11:57:01Z' }] }],
        },
      ],
      anime: [
        {
          status: 'completed',
          anime_type: 'tv',
          show: { title: 'Hagane no Renkinjutsushi', ids: { tvdb: '85249', mal: 5114 } },
          seasons: [{ number: 1, episodes: [{ number: 1, watched_at: '2026-10-25T11:59:00Z' }] }],
        },
      ],
      movies: [
        { status: 'completed', last_watched_at: '2026-10-20T20:00:00Z', user_rating: 9, movie: { title: 'Heat', year: 1995, ids: { tmdb: '949' } } },
        { status: 'plantowatch', added_to_watchlist_at: '2026-10-21T10:00:00Z', movie: { title: 'Stalker', year: 1979, ids: {} } },
      ],
    });
    expect(out.episodeRows.map((r) => [r.s_id, r.season_number, r.episode_number, r.series_name])).toEqual([
      ['121361', '1', '1', 'Game of Thrones'],
      ['121361', '1', '2', 'Game of Thrones'],
      ['85249', '1', '1', 'Hagane no Renkinjutsushi'],
    ]);
    expect(out.episodeRows[0].created_at).toBe('2026-10-25T11:57:00Z');
    expect(out.showRows.map((r) => r.tv_show_id).sort()).toEqual(['121361', '85249']);
    expect(out.movieRows.find((r) => r.movie_name === 'Heat')).toMatchObject({ type: 'watch', created_at: '2026-10-20T20:00:00Z', movie_year: '1995' });
    expect(out.movieRows.find((r) => r.movie_name === 'Stalker')).toMatchObject({ type: 'towatch', created_at: '2026-10-21T10:00:00Z' });
    expect(out.movieRatings).toEqual([{ name: 'Heat', ten: 9 }]);
  });

  it('follows a show that is only on the watchlist (no episodes yet)', () => {
    const out = simklRows({
      shows: [{ status: 'plantowatch', show: { title: 'Severance', ids: { tvdb: '371980' } }, seasons: [] }],
    });
    expect(out.showRows).toEqual([expect.objectContaining({ tv_show_id: '371980', tv_show_name: 'Severance' })]);
  });

  it('dropped shows arrive archived; memos become private notes', () => {
    const out = simklRows({
      shows: [
        { status: 'dropped', show: { title: 'Lost', ids: { tvdb: '73739' } }, memo: { text: ' gave up in S3 ', is_private: true }, seasons: [{ number: 1, episodes: [{ number: 1, watched_at: '2026-01-01' }] }] },
        { status: 'watching', show: { title: 'Dark', ids: { tvdb: '334824' } }, memo: {}, seasons: [] },
      ],
      movies: [{ status: 'completed', last_watched_at: '2026-02-02', movie: { title: 'Heat', ids: {} }, memo: { text: 'Best heist' } }],
    });
    expect(out.showRows.find((r) => r.tv_show_id === '73739')?.archived).toBe('1');
    expect(out.showRows.find((r) => r.tv_show_id === '334824')?.archived).toBe('0');
    expect(out.notes).toEqual({ shows: [{ showId: 73739, season: -1, episode: -1, text: 'gave up in S3' }], movies: [{ movie: 'Heat', text: 'Best heist' }] });
  });

  it('anime films are films, with their TMDB id; anime series stay shows', () => {
    const out = simklRows({
      anime: [
        { status: 'completed', anime_type: 'movie', last_watched_at: '2019-08-24T10:31:36Z', show: { title: 'Sen to Chihiro no Kamikakushi', year: 2001, ids: { tvdb: '276', tmdb: '129' } } },
        { status: 'plantowatch', anime_type: 'movie', show: { title: 'Kimi no Na wa.', year: 2016, ids: { tvdb: '197', tmdb: '372058' } } },
        { status: 'completed', anime_type: 'tv', show: { title: 'Hagane no Renkinjutsushi', ids: { tvdb: '85249' } }, seasons: [{ number: 1, episodes: [{ number: 1, watched_at: '2026-01-01' }] }] },
      ],
    });
    expect(out.showRows.map((r) => r.tv_show_id)).toEqual(['85249']);
    expect(out.movieRows.find((r) => r.movie_name === 'Sen to Chihiro no Kamikakushi')).toMatchObject({ type: 'watch', created_at: '2019-08-24T10:31:36Z' });
    expect(out.movieRows.find((r) => r.movie_name === 'Kimi no Na wa.')?.type).toBe('towatch');
    expect(out.movieTmdb).toEqual([{ name: 'Sen to Chihiro no Kamikakushi', tmdbId: 129 }, { name: 'Kimi no Na wa.', tmdbId: 372058 }]);
  });

  it('survives a file that is not what anybody expected', () => {
    expect(simklRows(null).movieRows).toEqual([]);
    expect(simklRows({ shows: [{ title: 'x' }] }).episodeRows).toEqual([]);
  });
});

describe('classifyForeignJson', () => {
  const show = { title: 'The Bear', year: 2022, ids: { tvdb: 409795 } };

  it('knows a Simkl backup by the lists inside it, not by a file name', () => {
    const found = classifyForeignJson([{ shows: [], movies: [{ movie: { title: 'Heat' } }] }]);
    expect(found?.source).toBe('simkl');
  });

  /**
   * A Trakt export is several files and which is which is knowable from what
   * the items carry — so a renamed download still lands in the right pile,
   * which is the whole reason not to read the name.
   */
  it('sorts Trakt’s arrays by what their items carry', () => {
    const found = classifyForeignJson([
      [{ watched_at: '2026-01-02T00:00:00Z', show, episode: { season: 1, number: 1 } }],
      [{ listed_at: '2026-01-03T00:00:00Z', movie: { title: 'Heat', ids: { tmdb: 949 } } }],
      [{ rated_at: '2026-01-04T00:00:00Z', rating: 8, movie: { title: 'Heat', ids: { tmdb: 949 } } }],
    ]);
    expect(found?.source).toBe('trakt');
    if (found?.source !== 'trakt') throw new Error('expected trakt');
    expect(found.payload.history).toHaveLength(1);
    expect(found.payload.watchlist).toHaveLength(1);
    expect(found.payload.ratings).toHaveLength(1);
  });

  it('ignores JSON that is nobody’s export', () => {
    expect(classifyForeignJson([{ hello: 'world' }, [1, 2, 3]])).toBeNull();
    expect(classifyForeignJson([])).toBeNull();
  });

  /** A ZIP named for one service holding another's backup imports as what it
   *  actually is — the same rule the CSV detector already keeps. */
  it('is not fooled by which file the shape arrived in', () => {
    const found = classifyForeignJson([
      [{ watched_at: '2026-01-02T00:00:00Z', show, episode: { season: 1, number: 1 } }],
      { shows: [{ show }] },
    ]);
    expect(found?.source).toBe('simkl');
  });
});


/**
 * IMDb, tested against BOTH header generations, because both are still in
 * people's downloads folders: the columns changed at the end of 2017 and the
 * encoding changed in 2018.
 *
 * Headers taken from IMDb's own export, not invented here:
 *   post-2017 ratings:  Const, Your Rating, Date Rated, Title, URL,
 *                       Title Type, IMDb Rating, Runtime (mins), Year,
 *                       Genres, Num Votes, Release Date, Directors
 *   watchlist/list:     Position, Const, Created, Modified, Description,
 *                       Title, Original Title, URL, Title Type, ...
 *   pre-2018 ratings:   position, const, created, modified, description,
 *                       Title, Title type, Directors, You rated, ...
 */
describe('imdb', () => {
  const RATINGS = [
    'Const,Your Rating,Date Rated,Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors'.split(','),
    'tt0110912,9,2026-09-24,Pulp Fiction,https://www.imdb.com/title/tt0110912/,movie,8.9,154,1994,Crime,2200000,1994-10-14,Quentin Tarantino'.split(','),
  ];

  it('knows its own header row, and nobody else\'s', () => {
    expect(isImdbCsv(RATINGS[0])).toBe(true);
    expect(isImdbCsv(['Date', 'Name', 'Year', 'Letterboxd URI', 'Rating'])).toBe(false);
    expect(isImdbCsv([])).toBe(false);
  });

  it('turns a rating into a dated watch and a star score', () => {
    const rows = imdbRows(csv(RATINGS));
    expect(rows.movieRows).toEqual([
      {
        type: 'watch',
        entity_type: 'movie',
        movie_name: 'Pulp Fiction',
        movie_year: '1994',
        created_at: '2026-09-24 12:00:00',
      },
    ]);
    // 9/10 is kept as 9 — four and a half stars on the film screen.
    expect(rows.movieRatings).toEqual([{ name: 'Pulp Fiction', ten: 9 }]);
  });

  /** A rated film is treated as a watched film — IMDb has no watch history, so
   *  the score is the only evidence there is. */
  it('reads the pre-2018 columns too', () => {
    const rows = imdbRows(
      csv([
        'position,const,created,modified,description,Title,Title type,Directors,You rated,IMDb Rating'.split(','),
        '1,tt0108052,2015-03-02,2015-03-02,,Schindler\'s List,movie,Steven Spielberg,10,9.0'.split(','),
      ]),
    );
    expect(rows.movieRows[0]).toMatchObject({ type: 'watch', movie_name: "Schindler's List" });
    expect(rows.movieRatings).toEqual([{ name: "Schindler's List", ten: 10 }]);
  });

  /** No score means it was never watched — that is a watchlist row, and its
   *  only date is the day it went on the list. */
  it('reads an unrated row as a watchlist entry', () => {
    const rows = imdbRows(
      csv([
        'Position,Const,Created,Modified,Description,Title,Original Title,URL,Title Type,Your Rating,Date Rated'.split(','),
        '1,tt1375666,2026-02-11,2026-02-11,,Inception,Inception,https://imdb.com/,movie,,'.split(','),
      ]),
    );
    expect(rows.movieRows).toEqual([
      {
        type: 'towatch',
        entity_type: 'movie',
        movie_name: 'Inception',
        movie_year: '',
        created_at: '2026-02-11 12:00:00',
      },
    ]);
    expect(rows.movieRatings).toEqual([]);
  });

  /**
   * TELEVISION IS SET ASIDE, NOT IMPORTED AS FILMS (1.7.1). The export has no
   * series column and no season or episode number, so the rows wait in
   * `imdbTv` for TheTVDB to place them by their `Const`. Importing them as
   * films would put "Ozymandias" in somebody's film library.
   */
  it('sets series and episodes aside for TheTVDB rather than importing them as films', () => {
    const rows = imdbRows(
      csv([
        'Const,Your Rating,Date Rated,Title,Title Type,Year'.split(','),
        'tt0903747,10,2026-01-01,Breaking Bad,tvSeries,2008'.split(','),
        'tt7366338,9,2026-01-04,Chernobyl,tvMiniSeries,2019'.split(','),
        'tt2301451,10,2026-01-02,Ozymandias,tvEpisode,2013'.split(','),
        'tt0110912,8,2026-01-03,Pulp Fiction,movie,1994'.split(','),
      ]),
    );
    expect(rows.movieRows.map((r) => r.movie_name)).toEqual(['Pulp Fiction']);
    expect(rows.showRows).toEqual([]);
    expect(rows.episodeRows).toEqual([]);
    expect(rows.imdbTv).toEqual([
      { imdbId: 'tt0903747', title: 'Breaking Bad', kind: 'series', at: '2026-01-01 12:00:00', ten: 10 },
      { imdbId: 'tt7366338', title: 'Chernobyl', kind: 'series', at: '2026-01-04 12:00:00', ten: 9 },
      { imdbId: 'tt2301451', title: 'Ozymandias', kind: 'episode', at: '2026-01-02 12:00:00', ten: 10 },
    ]);
  });

  it('reads the pre-2018 television types and columns too', () => {
    const rows = imdbRows(
      csv([
        'position,const,created,modified,description,Title,Title type,Directors,You rated,IMDb Rating'.split(','),
        '1,tt0903747,2015-03-02,2015-03-02,,Breaking Bad,TV Series,,9,9.5'.split(','),
        '2,tt0306414,2015-03-03,2015-03-03,,The Wire,Mini-Series,,,9.3'.split(','),
        '3,tt0959621,2015-03-04,2015-03-04,,Pilot,TV Episode,,8,9.0'.split(','),
      ]),
    );
    expect(rows.imdbTv.map((r) => [r.imdbId, r.kind, r.ten, r.at])).toEqual([
      ['tt0903747', 'series', 9, '2015-03-02 12:00:00'],
      ['tt0306414', 'series', null, '2015-03-03 12:00:00'],
      ['tt0959621', 'episode', 8, '2015-03-04 12:00:00'],
    ]);
    expect(rows.movieRows).toEqual([]);
  });

  /** TV movies and shorts ARE films — they are in a film library everywhere
   *  else, and IMDb is the only place that calls them something separate. */
  it('counts tvMovie and short as films', () => {
    const rows = imdbRows(
      csv([
        'Const,Your Rating,Date Rated,Title,Title Type,Year'.split(','),
        'tt0000001,7,2026-01-01,A TV Movie,tvMovie,1999'.split(','),
        'tt0000002,7,2026-01-01,A Short,short,1999'.split(','),
      ]),
    );
    expect(rows.movieRows).toHaveLength(2);
  });

  /** An unparseable date leaves the film with no date rather than today's:
   *  the archive is about the day, and inventing one is worse than a blank. */
  it('never invents a date it could not read', () => {
    const rows = imdbRows(
      csv([
        'Const,Your Rating,Date Rated,Title,Title Type,Year'.split(','),
        'tt0000003,7,sometime last year,A Film,movie,1999'.split(','),
      ]),
    );
    expect(rows.movieRows[0].created_at).toBe('');
  });

  it('reads the date shapes IMDb has actually used', () => {
    const at = (d: string) =>
      imdbRows(
        csv(['Const,Your Rating,Date Rated,Title,Title Type'.split(','), `tt1,7,${d},A Film,movie`.split(',')]),
      ).movieRows[0].created_at;
    expect(at('2026-09-24')).toBe('2026-09-24 12:00:00');
    expect(at('24 Sep 2026')).toBe('2026-09-24 12:00:00');
    expect(at('9/24/2026')).toBe('2026-09-24 12:00:00');
  });

  /**
   * THE ENCODING, which is the difference between importing `Amélie` and
   * importing a title that can never match TMDB. IMDb writes cp1252, where
   * `é` is one byte, 0xE9.
   */
  it('decodes windows-1252 titles', () => {
    expect(cp1252(new Uint8Array([0x41, 0x6d, 0xe9, 0x6c, 0x69, 0x65]))).toBe('Amélie');
    // The 0x80–0x9F block, which is where cp1252 and Latin-1 disagree.
    expect(cp1252(new Uint8Array([0x93, 0x92, 0x97]))).toBe('\u201c\u2019\u2014');
  });
});


/**
 * The Letterboxd IMPORT shape — one CSV, `Title`/`WatchedDate` — which is what
 * the JustWatch extension and most "get your list out of X" tools write.
 * Deliberately tested beside the EXPORT shape above, because reading one with
 * the other's keys is the failure this exists to prevent.
 */
describe('letterboxd import shape', () => {
  it('is told apart from IMDb and from Letterboxd’s own export', () => {
    expect(isLetterboxdImportCsv(['Title', 'Year', 'Rating', 'WatchedDate'])).toBe(true);
    expect(isLetterboxdImportCsv(['Title', 'Year', 'imdbID'])).toBe(true);
    // IMDb also has a Title; `Const` is what settles it.
    expect(isLetterboxdImportCsv(['Const', 'Title', 'Title Type', 'imdbID'])).toBe(false);
    // Letterboxd's own export uses Name, not Title — that goes to letterboxdRows.
    expect(isLetterboxdImportCsv(['Date', 'Name', 'Year', 'Rating'])).toBe(false);
    // A CSV that merely has a Title column is nobody's export.
    expect(isLetterboxdImportCsv(['Title', 'Notes'])).toBe(false);
  });

  it('reads a watched row with its date and score', () => {
    const rows = letterboxdImportRows(
      csv([
        'Title,Year,Rating,WatchedDate,imdbID,tmdbID'.split(','),
        'Parasite,2019,4.5,2026-03-04,tt6751668,496243'.split(','),
      ]),
    );
    expect(rows.movieRows).toEqual([
      {
        type: 'watch',
        entity_type: 'movie',
        movie_name: 'Parasite',
        movie_year: '2019',
        created_at: '2026-03-04 12:00:00',
      },
    ]);
    // 4.5 of 5 is 9 of 10, exactly — the same as letterboxdRows.
    expect(rows.movieRatings).toEqual([{ name: 'Parasite', ten: 9 }]);
  });

  /** Ten points beats five when a file carries both: 7/10 is unambiguous where
   *  3.5/5 makes the half-star decision all over again. */
  it('prefers Rating10 over Rating', () => {
    const rows = letterboxdImportRows(
      csv(['Title,Rating,Rating10,WatchedDate'.split(','), 'Heat,1,7,2026-01-01'.split(',')]),
    );
    expect(rows.movieRatings).toEqual([{ name: 'Heat', ten: 7 }]);
  });

  /** No date and no score is a watchlist row — this format has no "seen" flag,
   *  so what is in the row is the only evidence there is. */
  it('reads a bare title as a watchlist entry', () => {
    const rows = letterboxdImportRows(csv(['Title,Year,WatchedDate'.split(','), 'Dune,2021,'.split(',')]));
    expect(rows.movieRows).toEqual([
      { type: 'towatch', entity_type: 'movie', movie_name: 'Dune', movie_year: '2021', created_at: '' },
    ]);
    expect(rows.movieRatings).toEqual([]);
  });

  /** A score with no date still means watched — undated rather than dropped. */
  it('keeps a rated film that carries no date', () => {
    const rows = letterboxdImportRows(csv(['Title,Rating,WatchedDate'.split(','), 'Alien,5,'.split(',')]));
    expect(rows.movieRows[0]).toMatchObject({ type: 'watch', created_at: '' });
    expect(rows.movieRatings).toEqual([{ name: 'Alien', ten: 10 }]);
  });
});

/**
 * SERIALIZD, which has no export yet (Oct 2026) — so these fixtures are
 * Serializd's own API vocabulary as the one public tool, serializd_to_trakt,
 * reads it field for field: `showId` (a TMDB id), `dateAdded`, the five
 * account lists, `seasonNumber`, `episodeNumber`, `episodeLogs`. Not a file
 * anybody has downloaded. The first real export file replaces them.
 */
describe('serializd', () => {
  /** What the importer resolves TMDB ids to; `serializdRows` never looks anything up itself. */
  const link = new Map([
    [1396, { tvdbId: 81189, name: 'Breaking Bad' }],
    [60059, { tvdbId: 273181, name: 'Better Call Saul' }],
    [1399, { tvdbId: 121361, name: 'Game of Thrones' }],
  ]);

  /** The `context` the account endpoint answers: lists of season records,
   *  one of them carrying its season's episode logs. */
  const CONTEXT = {
    context: {
      watched: [
        {
          showId: 1396,
          seasonNumber: 1,
          dateAdded: '2023-10-01T03:41:43Z',
          episodeLogs: [
            { episodeNumber: 1, dateAdded: '2023-10-01T03:41:43Z' },
            { episodeNumber: 2, dateAdded: '2023-10-02T20:00:00Z', rating: 4.5, review: 'The RV.' },
          ],
        },
      ],
      currentlyWatching: [{ showId: 60059, dateAdded: '2026-01-05T10:00:00Z' }],
      droppedShows: [{ showId: 1399, dateAdded: '2024-02-02T00:00:00Z' }],
      watchlist: [{ showId: 60059, dateAdded: '2024-05-20T03:59:01Z' }],
    },
  };

  /** The flat record the script builds for every watched episode. */
  const FLAT = [
    { showId: 1396, showName: 'Breaking Bad', seasonNumber: 5, episodeNumber: 14, dateAdded: '2024-06-01T21:00:00Z' },
    { showId: 1396, showName: 'Breaking Bad', seasonNumber: 5, episodeNumber: 15, dateAdded: '2024-06-02T21:00:00Z' },
  ];

  it('flattens a context dump into records that know their list and inherit the show and season', () => {
    const recs = serializdRecords(CONTEXT);
    expect(recs.map((r) => [r.showId, r.season, r.episode, r.list])).toEqual([
      [1396, 1, null, 'watched'],
      [1396, 1, 1, 'watched'],
      [1396, 1, 2, 'watched'],
      [60059, null, null, 'currentlyWatching'],
      [1399, null, null, 'droppedShows'],
      [60059, null, null, 'watchlist'],
    ]);
    expect(recs[2]).toMatchObject({ rating: 4.5, review: 'The RV.', at: '2023-10-02T20:00:00Z' });
  });

  it('reads the flat record the script writes, ids as numbers or as digits', () => {
    const recs = serializdRecords([...FLAT, { showId: '60059', seasonNumber: '1', episodeNumber: '1', dateAdded: '2026-01-05T10:00:00Z' }]);
    expect(recs).toHaveLength(3);
    expect(recs[0]).toMatchObject({ showId: 1396, showName: 'Breaking Bad', season: 5, episode: 14 });
    expect(recs[2]).toMatchObject({ showId: 60059, season: 1, episode: 1 });
  });

  it('keys shows by TheTVDB id through the link, one row per show, and drops what the link cannot place', () => {
    const out = serializdRows(serializdRecords(CONTEXT), new Map([[1396, { tvdbId: 81189, name: 'Breaking Bad' }]]));
    expect(out.showRows).toEqual([
      { tv_show_id: '81189', tv_show_name: 'Breaking Bad', is_followed: '1', is_favorited: '0', archived: '0' },
    ]);
    expect(out.episodeRows).toEqual([
      { s_id: '81189', season_number: '1', episode_number: '1', created_at: '2023-10-01T03:41:43Z', series_name: 'Breaking Bad' },
      { s_id: '81189', season_number: '1', episode_number: '2', created_at: '2023-10-02T20:00:00Z', series_name: 'Breaking Bad' },
    ]);
    // Never by name: the two unlinked shows are simply absent, not guessed.
    expect(out.movieRows).toEqual([]);
  });

  it('names a show from the file first, and from the link when the file is silent', () => {
    const out = serializdRows(serializdRecords([...FLAT, { showId: 60059, dateAdded: '2026-01-05T10:00:00Z' }]), link);
    expect(out.showRows.map((r) => r.tv_show_name).sort()).toEqual(['Better Call Saul', 'Breaking Bad']);
  });

  it('archives a dropped show and keeps a watchlisted one followed with no episodes', () => {
    const out = serializdRows(serializdRecords(CONTEXT), link);
    const byId = Object.fromEntries(out.showRows.map((r) => [r.tv_show_id, r]));
    expect(byId['121361']).toMatchObject({ archived: '1', is_followed: '1' });
    expect(byId['273181']).toMatchObject({ archived: '0', is_followed: '1' });
    expect(out.episodeRows.filter((r) => r.s_id === '273181')).toEqual([]);
  });

  /** Episode scores only — a season or show score spread over its episodes
   *  would invent opinions nobody expressed. Half a star goes UP. */
  it('keeps a half star as a half (2.0.0), and ignores a score on a season', () => {
    const out = serializdRows(
      serializdRecords([
        { showId: 1396, seasonNumber: 1, dateAdded: 'x', rating: 5 },
        { showId: 1396, seasonNumber: 1, episodeNumber: 1, dateAdded: 'x', rating: 3.5 },
        { showId: 1396, seasonNumber: 1, episodeNumber: 2, dateAdded: 'x', rating: 0 },
      ]),
      link,
    );
    // 3.5 stars is 7 out of ten, exactly — no longer rounded up to a 4
    expect(out.episodeRatings).toEqual([{ name: 'Breaking Bad', season: 1, episode: 1, ten: 7 }]);
  });

  it('reads a file that counts to ten as a file that counts to ten', () => {
    const out = serializdRows(
      serializdRecords([
        { showId: 1396, seasonNumber: 1, episodeNumber: 1, dateAdded: 'x', rating: 7 },
        { showId: 1396, seasonNumber: 1, episodeNumber: 2, dateAdded: 'x', rating: 10 },
        { showId: 1396, seasonNumber: 1, episodeNumber: 3, dateAdded: 'x', rating: 4 },
      ]),
      link,
    );
    // kept out of ten: 7 is 3.5 stars, and the 4 is a 4/10 (two stars), not four.
    expect(out.episodeRatings?.map((r) => r.ten)).toEqual([7, 10, 4]);
  });

  it('turns reviews into comments: on the episode, or on the show with the season named', () => {
    const out = serializdRows(
      serializdRecords([
        { showId: 1396, seasonNumber: 1, episodeNumber: 2, dateAdded: '2023-10-02T20:00:00Z', review: 'The RV.' },
        { showId: 1396, seasonNumber: 2, dateAdded: '2023-11-01T20:00:00Z', reviewText: 'Fly.' },
        { showId: 1396, dateAdded: '2023-12-01T20:00:00Z', review: 'Best show.' },
      ]),
      link,
    );
    expect(out.comments).toEqual([
      { entity: 'Breaking Bad S1E2', text: 'The RV.', date: '2023-10-02T20:00:00Z' },
      { entity: 'Breaking Bad', text: 'S2: Fly.', date: '2023-11-01T20:00:00Z' },
      { entity: 'Breaking Bad', text: 'Best show.', date: '2023-12-01T20:00:00Z' },
    ]);
  });

  it('skips an episode it cannot place, and brings no films because Serializd has none', () => {
    const out = serializdRows(serializdRecords([{ showId: 1396, episodeNumber: 3, dateAdded: 'x' }]), link);
    expect(out.episodeRows).toEqual([]);
    expect(out.showRows).toHaveLength(1);
    expect(out.movieRows).toEqual([]);
    expect(serializdRows([], link)).toMatchObject({ showRows: [], episodeRows: [] });
  });

  describe('detection', () => {
    it('knows a Serializd file by its records, in either shape', () => {
      expect(classifyForeignJson([CONTEXT])?.source).toBe('serializd');
      expect(classifyForeignJson([FLAT])?.source).toBe('serializd');
      // Two files in one ZIP are one library.
      const found = classifyForeignJson([CONTEXT, FLAT]);
      if (found?.source !== 'serializd') throw new Error('expected serializd');
      expect(found.records).toHaveLength(8);
    });

    /** A ZIP named for Serializd holding somebody else's export imports as
     *  what it actually is — names mean nothing, the CSV rule, kept. The
     *  importer only reaches JSON once no TV Time CSV was found, so a
     *  serializd.zip holding a TV Time export never gets this far. */
    it('is not fooled by a name, nor by other JSON that carries a showId', () => {
      expect(detectForeignSource(['serializd.json'])).toBeNull();
      expect(detectForeignSource(['serializd/user_tv_show_data.csv'])).toBeNull();
      // OpenTV's own backup sidecar: `showId` there is a TheTVDB id on a rating
      // row, with no date and no list — reading it as Serializd would import
      // the wrong shows.
      const sidecar = { shows: [{ tvdbId: 81189, tmdbId: 1396, addedAt: '2026-01-01' }], epStars: [{ showId: 81189, season: 1, episode: 1, stars: 5 }] };
      expect(classifyForeignJson([sidecar])?.source).not.toBe('serializd');
      // Trakt and Simkl speak `show`/`ids`, never `showId`: still theirs.
      const trakt = [{ watched_at: '2026-01-02T00:00:00Z', show: { title: 'Dark', ids: { tvdb: 70523, tmdb: 70523 } }, episode: { season: 1, number: 1 } }];
      expect(classifyForeignJson([trakt])?.source).toBe('trakt');
      expect(classifyForeignJson([{ shows: [{ title: 'Dark', ids: { tmdb: 70523 } }] }])?.source).toBe('simkl');
    });
  });
});

/**
 * TheTVDB's answers to `/search/remoteid/{tt…}`, shaped exactly as the live API
 * gave them on 14 Oct 2026 (trimmed): Breaking Bad's series, its pilot's
 * episode -- season and number NULL there, which is why the importer asks
 * `/episodes/{id}` -- Pulp Fiction's film, and an unknown id's `null`.
 */
describe('imdbRemoteHit', () => {
  it('reads a series', () => {
    expect(imdbRemoteHit([{ series: { id: 81189, name: 'Breaking Bad' } }])).toEqual({ kind: 'series', tvdbId: 81189, name: 'Breaking Bad' });
  });
  it('reads an episode, with the series it belongs to', () => {
    expect(
      imdbRemoteHit([{ episode: { id: 349232, seriesId: 81189, name: null, number: null, seasonNumber: null } }]),
    ).toEqual({ kind: 'episode', episodeId: 349232, seriesId: 81189 });
  });
  it('ignores a film, and answers nothing for an unknown id', () => {
    expect(imdbRemoteHit([{ movie: { id: 228, name: 'Pulp Fiction' } }])).toBeNull();
    expect(imdbRemoteHit(null)).toBeNull();
    expect(imdbRemoteHit([])).toBeNull();
  });
});

describe('imdbTvRows', () => {
  const refs = [
    { imdbId: 'tt0903747', title: 'Breaking Bad', kind: 'series' as const, at: '2026-01-01 12:00:00', ten: 10 },
    { imdbId: 'tt7366338', title: 'Chernobyl', kind: 'series' as const, at: '', ten: null },
    { imdbId: 'tt0959621', title: 'Pilot', kind: 'episode' as const, at: '2026-01-02 12:00:00', ten: 8 },
    { imdbId: 'tt2301451', title: 'Ozymandias', kind: 'episode' as const, at: '2026-01-03 12:00:00', ten: 10 },
    { imdbId: 'tt1000001', title: 'Some Episode', kind: 'episode' as const, at: '', ten: null },
    { imdbId: 'tt9999991', title: 'Nobody', kind: 'series' as const, at: '', ten: null },
    { imdbId: 'tt9999992', title: 'Offline Ep', kind: 'episode' as const, at: '', ten: 6 },
  ];
  const link = new Map<string, ImdbTvHit>([
    ['tt0903747', { kind: 'series', tvdbId: 81189, name: 'Breaking Bad' }],
    ['tt7366338', { kind: 'series', tvdbId: 360893, name: 'Chernobyl' }],
    ['tt0959621', { kind: 'episode', tvdbId: 81189, name: 'Breaking Bad', season: 1, episode: 1, episodeId: 349232 }],
    ['tt2301451', { kind: 'episode', tvdbId: 81189, name: 'Breaking Bad', season: 5, episode: 14, episodeId: 4553040 }],
    ['tt1000001', { kind: 'episode', tvdbId: 79168, name: 'Friends', season: 1, episode: 1, episodeId: 303821 }],
    ['tt9999991', 'none'],
    ['tt9999992', 'failed'],
  ]);

  it('follows each series once, and marks only the RATED episodes watched', () => {
    const { rows } = imdbTvRows(refs, link);
    expect(rows.showRows.map((r) => [r.tv_show_id, r.tv_show_name, r.is_followed])).toEqual([
      ['81189', 'Breaking Bad', '1'],
      ['360893', 'Chernobyl', '1'],
      // An unrated episode brings its show and no watch.
      ['79168', 'Friends', '1'],
    ]);
    expect(rows.episodeRows).toEqual([
      { s_id: '81189', season_number: '1', episode_number: '1', episode_id: '349232', created_at: '2026-01-02 12:00:00', series_name: 'Breaking Bad' },
      { s_id: '81189', season_number: '5', episode_number: '14', episode_id: '4553040', created_at: '2026-01-03 12:00:00', series_name: 'Breaking Bad' },
    ]);
    expect(rows.episodeRatings).toEqual([
      { name: 'Breaking Bad', season: 1, episode: 1, ten: 8 },
      { name: 'Breaking Bad', season: 5, episode: 14, ten: 10 },
    ]);
  });

  it('reports every row it could not place, with a reason that says what to do', () => {
    const { misses } = imdbTvRows(refs, link);
    expect(misses).toEqual([
      { kind: 'show', name: 'Nobody', reason: expect.stringContaining('no show with this IMDb id') },
      { kind: 'episodes', name: 'Offline Ep', reason: expect.stringContaining('could not be reached') },
    ]);
    // A row nobody asked about (no entry in the link) is a miss too, never a drop.
    expect(imdbTvRows([refs[0]], new Map()).misses).toHaveLength(1);
  });

  it('says the same thing once, however many times the file says it', () => {
    const once = imdbTvRows(refs, link);
    const twice = imdbTvRows([...refs, ...refs], link);
    expect(twice).toEqual(once);
  });
});

describe('isSimklCsv', () => {
  it('knows Simkl\'s CSV by its first column, and nothing else', () => {
    const { isSimklCsv } = jest.requireActual('@/pure') as typeof import('@/pure');
    expect(isSimklCsv('SIMKL_ID,Title,Type,Year,Watchlist,LastEpWatched,WatchedDate,Rating,Memo,TVDB,TMDB,IMDB')).toBe(true);
    expect(isSimklCsv('\uFEFF"SIMKL_ID","Title"')).toBe(true);
    expect(isSimklCsv('Date,Name,Year,Letterboxd URI,Rating')).toBe(false);
    expect(isSimklCsv('Const,Your Rating,Date Rated,Title')).toBe(false);
  });
});

describe('Sofa Time', () => {
  // Invented, in the real export's shape: arrays of items carrying `tmdb`.
  const files = {
    'watchedShow_(2026_10_26).json': [
      {
        title: 'Dark',
        tmdb: 70523,
        type: 'tv',
        runtime: 55,
        addedDate: '2026-01-05T00:00:00Z',
        seasons: [
          { number: 1, episodes: [{ number: 1, addedDate: '2026-01-01T20:00:00Z' }, { number: 2, addedDate: '2026-01-02T20:00:00Z', rating: 8 }] },
          { number: 0, episodes: [{ number: 1, addedDate: '' }] },
        ],
      },
    ],
    'stopWatchingShow_(2026_10_26).json': [
      { title: 'Lost', tmdb: 4607, type: 'tv', archive_type: 'hold', addedDate: '2026-02-01T00:00:00Z', seasons: [{ number: 1, episodes: [{ number: 1, addedDate: '2020-01-01T00:00:00Z' }] }] },
    ],
    'watchlistShow_(2026_10_26).json': [{ title: 'The Shield', tmdb: 1414, type: 'tv', addedDate: '2026-03-01T00:00:00Z' }],
    'watchedMovie_(2026_10_26).json': [{ title: 'Heat', tmdb: 949, type: 'movie', release_date: '1995-12-15T00:00:00Z', addedDate: '2026-04-01T00:00:00Z', rating: 9 }],
    'watchlistMovie_(2026_10_26).json': [{ title: 'Ran', tmdb: 11645, type: 'movie', addedDate: '2026-05-01T00:00:00Z' }],
    'stopWatchingMovie_(2026_10_26).json': [{ title: 'Cats', tmdb: 536869, type: 'movie', archive_type: 'dropped', addedDate: '2026-06-01T00:00:00Z' }],
  };
  const link = new Map([
    [70523, { tvdbId: 334824, name: 'Dark (TheTVDB)' }],
    [4607, { tvdbId: 73739, name: 'Lost' }],
    [1414, { tvdbId: 78261, name: 'The Shield' }],
  ]);

  it('knows its files by their items, and nobody else claims them', () => {
    expect(sofaTimeItems(files)).toHaveLength(6);
    expect(classifyForeignJson(Object.values(files))).toBeNull();
    // A Trakt history is not Sofa Time's.
    expect(sofaTimeItems({ 'x.json': [{ watched_at: '2026-01-02T00:00:00Z', movie: { title: 'Heat', ids: { tmdb: 949 } }, type: 'movie' }] })).toEqual([]);
  });

  it('maps watched, stopped and watchlist shows onto TheTVDB ids, with dates and the rare rating', () => {
    const out = sofaTimeRows(sofaTimeItems(files), link);
    expect(out.showRows).toEqual([
      { tv_show_id: '334824', tv_show_name: 'Dark', is_followed: '1', is_favorited: '0', archived: '0' },
      { tv_show_id: '73739', tv_show_name: 'Lost', is_followed: '1', is_favorited: '0', archived: '1' },
      { tv_show_id: '78261', tv_show_name: 'The Shield', is_followed: '1', is_favorited: '0', archived: '0' },
    ]);
    expect(out.episodeRows.map((r) => [r.s_id, r.season_number, r.episode_number, r.created_at])).toEqual([
      ['334824', '1', '1', '2026-01-01T20:00:00Z'],
      ['334824', '1', '2', '2026-01-02T20:00:00Z'],
      // A special with no date of its own takes the show's.
      ['334824', '0', '1', '2026-01-05T00:00:00Z'],
      ['73739', '1', '1', '2020-01-01T00:00:00Z'],
    ]);
    expect(out.episodeRows[0].runtime).toBe('55');
    expect(out.episodeRatings).toEqual([{ name: 'Dark', season: 1, episode: 2, ten: 8 }]);
  });

  it('brings films by TMDB id, leaves out a film you stopped, and drops a show it cannot place', () => {
    const out = sofaTimeRows(sofaTimeItems(files), new Map());
    expect(out.showRows).toEqual([]);
    expect(out.movieRows.map((r) => [r.type, r.movie_name, r.movie_year])).toEqual([
      ['watch', 'Heat', '1995'],
      ['towatch', 'Ran', ''],
    ]);
    expect(out.movieRatings).toEqual([{ name: 'Heat', ten: 9 }]);
    expect(out.movieTmdb).toEqual([{ name: 'Heat', tmdbId: 949 }, { name: 'Ran', tmdbId: 11645 }]);
  });

  it('says each episode once, when a show sits in two of the files', () => {
    const twice = { ...files, 'watchedShow_copy.json': files['watchedShow_(2026_10_26).json'] };
    expect(sofaTimeRows(sofaTimeItems(twice), link).episodeRows).toHaveLength(4);
  });
});

describe('Bingers', () => {
  // Invented rows under the real header rows, BOM and all.
  const csv = (header: string, ...rows: string[][]) =>
    bingersTable(rows.map((r) => Object.fromEntries(header.split(',').map((h, i) => [h, r[i] ?? '']))));
  const LIB = '﻿type,title,original_title,year,tvdb_id,tmdb_id,favorite,list_status,added_at,for_later_at,stopped_watching_at,hidden_at';
  const WATCH = '﻿type,title,tvdb_id,tmdb_id,season_number,episode_number,first_watched_at,last_watched_at,plays';
  const RATE = '﻿type,title,tvdb_id,tmdb_id,season_number,episode_number,rating,favorite_character,emotions';
  const LISTS = '﻿list_name,list_description,title,type,tvdb_id,tmdb_id';
  const t = {
    library: csv(
      LIB,
      ['show', 'Arcane', 'Arcane', '2021', '371028', '94605', 'yes', 'watching', '2021-11-01T00:00:00.000Z', '', '', ''],
      ['show', 'Lost', 'Lost', '2004', '73739', '4607', 'no', 'watching', '2020-01-01T00:00:00.000Z', '', '2021-01-01T00:00:00.000Z', ''],
      ['show', 'Only TMDB', 'Only TMDB', '2020', '', '555', 'no', 'for_later', '2022-01-01T00:00:00.000Z', '2022-01-01T00:00:00.000Z', '', ''],
      ['movie', 'Thor', 'Thor', '2011', '', '10195', 'yes', 'following', '2021-12-01T00:00:00.000Z', '', '', ''],
      ['movie', 'Ran', '乱', '1985', '', '11645', 'no', 'for_later', '2026-06-08T00:00:00.000Z', '2026-06-08T00:00:00.000Z', '', ''],
    ),
    watches: csv(
      WATCH,
      ['episode', 'Arcane', '371028', '94605', '1', '1', '2021-11-13T14:52:59.000Z', '2025-09-27T00:11:45.000Z', '3'],
      ['episode', 'Arcane', '371028', '94605', '1', '2', '2021-11-13T17:44:04.000Z', '2021-11-13T17:44:04.000Z', '1'],
      ['movie', 'Thor', '', '10195', '', '', '2021-12-11T00:57:28.000Z', '2023-01-01T00:00:00.000Z', '2'],
    ),
    ratings: csv(
      RATE,
      ['episode', 'Arcane', '371028', '94605', '1', '1', '5', 'Jinx|Vi', 'shocked|thrilled'],
      ['episode', 'Arcane', '371028', '94605', '1', '2', '', 'Vi', 'grumpy'],
      ['movie', 'Thor', '', '10195', '', '', '4', 'Loki', 'amused'],
    ),
    lists: csv(LISTS, ['avenger', '', 'Thor', 'movie', '', '10195'], ['avenger', '', 'Iron Man', 'movie', '', '1726'], ['avenger', '', 'Arcane', 'show', '371028', '94605']),
  };

  it('knows its four files by their header rows, BOM and all', () => {
    expect(bingersTableKind(LIB.split(','))).toBe('library');
    expect(bingersTableKind(WATCH.split(','))).toBe('watches');
    expect(bingersTableKind(RATE.split(','))).toBe('ratings');
    expect(bingersTableKind(LISTS.split(','))).toBe('lists');
    // Letterboxd and IMDb headers are not Bingers'.
    expect(bingersTableKind(['Date', 'Name', 'Year', 'Letterboxd URI', 'Rating'])).toBeNull();
    expect(bingersTableKind(['Const', 'Your Rating', 'Title', 'Title Type'])).toBeNull();
    expect(t.library[0].type).toBe('show');
  });

  it('asks the link only for shows that have no TheTVDB id', () => {
    expect(bingersTmdbOnlyShows(t)).toEqual([{ showId: 555, showName: 'Only TMDB' }]);
  });

  it('maps follows, stops and favourites, and turns extra plays into rewatches', () => {
    const out = bingersRows(t, new Map([[555, { tvdbId: 999, name: 'Linked' }]]));
    expect(out.showRows).toEqual([
      { tv_show_id: '371028', tv_show_name: 'Arcane', is_followed: '1', is_favorited: '1', archived: '0' },
      { tv_show_id: '73739', tv_show_name: 'Lost', is_followed: '1', is_favorited: '0', archived: '1' },
      { tv_show_id: '999', tv_show_name: 'Only TMDB', is_followed: '1', is_favorited: '0', archived: '0' },
    ]);
    expect(out.episodeRows.map((r) => [r.episode_number, r.created_at, r.rewatch_count ?? ''])).toEqual([
      ['1', '2021-11-13T14:52:59.000Z', ''],
      ['1', '2025-09-27T00:11:45.000Z', '1'],
      ['1', '2025-09-27T00:11:45.000Z', '1'],
      ['2', '2021-11-13T17:44:04.000Z', ''],
    ]);
    const films = out.movieRows.map((r) => [r.type, r.movie_name, r.rewatch_count ?? '']);
    expect(films).toEqual([
      ['watch', 'Thor', '1'],
      ['towatch', 'Ran', ''],
      // On a list and nowhere else: named for the list, not put in the library.
      ['list', 'Iron Man', ''],
    ]);
    expect(out.movieTmdb).toEqual([
      { name: 'Thor', tmdbId: 10195 },
      { name: 'Ran', tmdbId: 11645 },
      { name: 'Iron Man', tmdbId: 1726 },
    ]);
  });

  it('maps ratings, the emotions the app has, and the first favourite character', () => {
    const out = bingersRows(t, new Map());
    expect(out.episodeRatings).toEqual([{ name: 'Arcane', season: 1, episode: 1, ten: 10 }]);
    expect(out.movieRatings).toEqual([{ name: 'Thor', ten: 8 }]);
    // shocked = 0, thrilled = 9 in EMOTION_NAMES; "grumpy" is not one of the twelve.
    expect(out.episodeEmotions).toEqual([
      { name: 'Arcane', season: 1, episode: 1, emotion: 0 },
      { name: 'Arcane', season: 1, episode: 1, emotion: 9 },
    ]);
    expect(out.movieEmotions).toEqual([{ name: 'Thor', value: 5 + 28 }]);
    expect(out.episodeCharacters).toEqual([
      { name: 'Arcane', season: 1, episode: 1, character: 'Jinx' },
      { name: 'Arcane', season: 1, episode: 2, character: 'Vi' },
    ]);
    expect(out.movieCharacters).toEqual([{ movie: 'Thor', character: 'Loki' }]);
  });

  it('writes favourites and lists as TV Time list rows the importer already reads', () => {
    const { listEntries, movieNamesByUuid, readFavorites } = jest.requireActual('../packages/tvtime-export/src') as typeof import('../packages/tvtime-export/src');
    const out = bingersRows(t, new Map());
    const names = movieNamesByUuid(out.movieRows);
    expect(readFavorites(out.listRows!, names)).toEqual({ showIds: [371028], movieNames: ['Thor'] });
    const list = out.listRows!.find((r) => r.name === 'avenger')!;
    const entries = listEntries(list.objects);
    expect(entries.map((e) => (e.kind === 'show' ? e.tvdbId : names.get(e.uuid!)))).toEqual(['Thor', 'Iron Man', 371028]);
  });
});
