import { cleanNote, NOTE_MAX_LENGTH, notesFromSidecar } from '@/notes-pure';

describe('cleanNote', () => {
  it('trims, and an emptied note is no note', () => {
    expect(cleanNote('  hated the finale \n')).toBe('hated the finale');
    expect(cleanNote('   \n ')).toBeNull();
    expect(cleanNote(null)).toBeNull();
  });
  it('caps a huge paste', () => {
    expect(cleanNote('x'.repeat(NOTE_MAX_LENGTH + 50))!.length).toBe(NOTE_MAX_LENGTH);
  });
  it('keeps Arabic and line breaks inside the note', () => {
    expect(cleanNote('حلقة رائعة\nجداً')).toBe('حلقة رائعة\nجداً');
  });
});

describe('notesFromSidecar', () => {
  const now = '2026-10-17T00:00:00.000Z';
  it('reads good rows and skips bad ones without throwing', () => {
    const out = notesFromSidecar(
      {
        shows: [
          { showId: 81189, season: -1, episode: -1, text: 'show note', updatedAt: '2026-01-01' },
          { showId: 81189, season: 5, episode: 14, text: ' ozymandias ' },
          { showId: '81189', season: 1, episode: 1, text: 'string id' },
          { showId: 1, season: 1, episode: 1, text: '   ' },
          null,
        ],
        movies: [{ movie: 'Heat', text: 'the diner', updatedAt: '2026-02-02' }, { movie: '', text: 'nameless' }, 'junk'],
      },
      now,
    );
    expect(out.shows).toEqual([
      { showId: 81189, season: -1, episode: -1, text: 'show note', updatedAt: '2026-01-01' },
      { showId: 81189, season: 5, episode: 14, text: 'ozymandias', updatedAt: now },
    ]);
    expect(out.movies).toEqual([{ movie: 'Heat', text: 'the diner', updatedAt: '2026-02-02' }]);
  });
  it('an older backup with no notes key restores nothing', () => {
    expect(notesFromSidecar(undefined, now)).toEqual({ shows: [], movies: [] });
    expect(notesFromSidecar('nope', now)).toEqual({ shows: [], movies: [] });
  });
});
