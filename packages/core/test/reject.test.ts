import { describe, expect, it } from 'vitest';

import type { Exclusion } from '../src/index';
import {
  LIVE_OR_REMIX_PATTERNS,
  isExcluded,
  isLiveOrRemix,
  playlistId,
  reject,
} from '../src/index';
import { artistAt, makeContext, makePool, makeTrack } from './fixtures/index';

const context = makeContext();
const pool = makePool();

describe('artist exclusion', () => {
  const exclusion: Exclusion = { kind: 'artist', artistId: artistAt(0).id };

  it('removes every track by that artist', () => {
    const { kept } = reject({ pool, exclusions: [exclusion], context });
    expect(kept.some((track) => track.artists.some((a) => a.id === artistAt(0).id))).toBe(false);
  });

  it('keeps tracks by other artists', () => {
    const { kept } = reject({ pool, exclusions: [exclusion], context });
    expect(kept.length).toBe(pool.length - 10);
  });

  it('catches a track where the artist is only a guest', () => {
    const track = makeTrack({ artists: [artistAt(3), artistAt(0)] });
    expect(isExcluded(track, exclusion, context)).toBe(true);
  });
});

describe('playlist exclusion', () => {
  it('removes anything on the named playlist', () => {
    const banned = pool.slice(0, 6).map((track) => track.id);
    const exclusions: Exclusion[] = [{ kind: 'playlist', playlistId: playlistId('pl-kids') }];
    const withPlaylist = makeContext({ playlistTrackIds: { 'pl-kids': banned } });
    const { kept } = reject({ pool, exclusions, context: withPlaylist });
    expect(kept.length).toBe(pool.length - 6);
  });

  it('ignores a playlist the context does not know', () => {
    const exclusions: Exclusion[] = [{ kind: 'playlist', playlistId: playlistId('pl-missing') }];
    const { kept } = reject({ pool, exclusions, context });
    expect(kept.length).toBe(pool.length);
  });
});

describe('inLibrary exclusion', () => {
  it('removes saved tracks', () => {
    const saved = pool.slice(0, 4).map((track) => track.id);
    const withLibrary = makeContext({ libraryTrackIds: saved });
    const { kept } = reject({ pool, exclusions: [{ kind: 'inLibrary' }], context: withLibrary });
    expect(kept.length).toBe(pool.length - 4);
  });
});

describe('heardRecently exclusion', () => {
  it('removes recently played tracks', () => {
    const heard = pool.slice(2, 9).map((track) => track.id);
    const withHistory = makeContext({ recentlyHeardTrackIds: heard });
    const { kept } = reject({
      pool,
      exclusions: [{ kind: 'heardRecently' }],
      context: withHistory,
    });
    expect(kept.length).toBe(pool.length - 7);
  });
});

describe('years exclusion', () => {
  it('removes everything inside the range', () => {
    const exclusions: Exclusion[] = [{ kind: 'years', range: { from: 1990, to: 2100 } }];
    const { kept } = reject({ pool, exclusions, context });
    expect(kept.every((track) => track.releaseYear < 1990)).toBe(true);
  });

  it('treats the range as inclusive', () => {
    const track = makeTrack({ releaseYear: 1990 });
    expect(isExcluded(track, { kind: 'years', range: { from: 1990, to: 1990 } }, context)).toBe(
      true,
    );
  });
});

describe('duration exclusion', () => {
  it('removes everything inside the range', () => {
    const exclusions: Exclusion[] = [{ kind: 'duration', range: { minMs: 0, maxMs: 200_000 } }];
    const { kept } = reject({ pool, exclusions, context });
    expect(kept.every((track) => track.durationMs > 200_000)).toBe(true);
  });

  it('treats the range as inclusive', () => {
    const track = makeTrack({ durationMs: 200_000 });
    const exclusion: Exclusion = { kind: 'duration', range: { minMs: 200_000, maxMs: 300_000 } };
    expect(isExcluded(track, exclusion, context)).toBe(true);
  });
});

describe('explicit exclusion', () => {
  it('leaves nothing explicit behind', () => {
    const { kept } = reject({ pool, exclusions: [{ kind: 'explicit' }], context });
    expect(kept.some((track) => track.explicit)).toBe(false);
  });
});

describe('liveOrRemix exclusion', () => {
  it('leaves nothing matching the patterns behind', () => {
    const { kept } = reject({ pool, exclusions: [{ kind: 'liveOrRemix' }], context });
    expect(kept.some((track) => isLiveOrRemix(track.title))).toBe(false);
  });

  it('removes the variants the fixture pool carries', () => {
    const { report } = reject({ pool, exclusions: [{ kind: 'liveOrRemix' }], context });
    expect(report.removals[0]?.removed).toBe(pool.filter((t) => isLiveOrRemix(t.title)).length);
  });
});

describe('LIVE_OR_REMIX_PATTERNS', () => {
  it('is exported as a list of patterns', () => {
    expect(LIVE_OR_REMIX_PATTERNS.length).toBe(6);
  });

  it('carries no global flag, so repeated tests do not drift', () => {
    expect(LIVE_OR_REMIX_PATTERNS.every((pattern) => !pattern.global)).toBe(true);
  });

  it('matches a bracketed live marker', () => {
    expect(isLiveOrRemix('Copper Chorus (Live)')).toBe(true);
  });

  it('matches a dashed live marker', () => {
    expect(isLiveOrRemix('Copper Chorus - Live at the Dockyard')).toBe(true);
  });

  it('matches a remix', () => {
    expect(isLiveOrRemix('Neon Signal (Club Remix)')).toBe(true);
  });

  it('matches a remaster', () => {
    expect(isLiveOrRemix('Velvet Lantern - 2011 Remaster')).toBe(true);
  });

  it('matches a karaoke version', () => {
    expect(isLiveOrRemix('Ember Bridge [Karaoke]')).toBe(true);
  });

  it('matches an instrumental', () => {
    expect(isLiveOrRemix('Quartz Parade (Instrumental)')).toBe(true);
  });

  it('matches a radio edit', () => {
    expect(isLiveOrRemix('Static Orchard - Radio Edit')).toBe(true);
  });

  it('matches a bare dashed live suffix', () => {
    expect(isLiveOrRemix('Song - Live')).toBe(true);
  });

  it('matches a venue after the live marker', () => {
    expect(isLiveOrRemix('Song - Live at Budokan')).toBe(true);
  });

  it('matches a dated remaster', () => {
    expect(isLiveOrRemix('Song - 2011 Remaster')).toBe(true);
  });

  it('matches a bare remastered suffix', () => {
    expect(isLiveOrRemix('Song - Remastered')).toBe(true);
  });

  it('matches a bracketed radio edit', () => {
    expect(isLiveOrRemix('Song (Radio Edit)')).toBe(true);
  });

  it('matches a square-bracketed instrumental', () => {
    expect(isLiveOrRemix('Song [Instrumental]')).toBe(true);
  });

  it('matches a karaoke version suffix', () => {
    expect(isLiveOrRemix('Song - Karaoke Version')).toBe(true);
  });

  it('matches a qualified remix', () => {
    expect(isLiveOrRemix('Song (Extended Remix)')).toBe(true);
  });

  it('leaves an ordinary title alone', () => {
    expect(isLiveOrRemix('Marble Tideline')).toBe(false);
  });

  it('does not fire on a word that merely contains a pattern', () => {
    expect(isLiveOrRemix('Olive Ledger')).toBe(false);
  });
});

// §3.4: the marker has to sit in a suffix, so a studio track that merely says one of
// these words keeps its place. These are the titles the old whole-title match threw away.
describe('LIVE_OR_REMIX_PATTERNS outside a suffix', () => {
  it('keeps Live and Let Die', () => {
    expect(isLiveOrRemix('Live and Let Die')).toBe(false);
  });

  it('keeps Live Forever', () => {
    expect(isLiveOrRemix('Live Forever')).toBe(false);
  });

  it('keeps Live Wire', () => {
    expect(isLiveOrRemix('Live Wire')).toBe(false);
  });

  it('keeps Long Live', () => {
    expect(isLiveOrRemix('Long Live')).toBe(false);
  });

  it('keeps Live to Tell', () => {
    expect(isLiveOrRemix('Live to Tell')).toBe(false);
  });

  it('keeps a plain title named Instrumental Break', () => {
    expect(isLiveOrRemix('Instrumental Break')).toBe(false);
  });

  it('keeps a plain title named Remix Artist Name', () => {
    expect(isLiveOrRemix('Remix Artist Name')).toBe(false);
  });

  it('still catches a suffix on a title that also uses the word plainly', () => {
    expect(isLiveOrRemix('Live and Let Die - Live at Wembley Arena')).toBe(true);
  });

  it('still catches a bracketed suffix on such a title', () => {
    expect(isLiveOrRemix('Live and Let Die (2011 Remaster)')).toBe(true);
  });

  // The honest limitation, stated the other way round now: a live recording whose title
  // carries no marker at all is invisible to any title heuristic. §3.4, §9
  it('misses a live recording that carries no marker', () => {
    expect(isLiveOrRemix('Song')).toBe(false);
  });
});

describe('reject report', () => {
  it('counts the pool it started from', () => {
    const { report } = reject({ pool, exclusions: [], context });
    expect(report.poolSize).toBe(pool.length);
  });

  it('keeps everything when there are no exclusions', () => {
    const { report } = reject({ pool, exclusions: [], context });
    expect(report.keptCount).toBe(pool.length);
  });

  it('records one removal entry per exclusion', () => {
    const exclusions: Exclusion[] = [{ kind: 'explicit' }, { kind: 'liveOrRemix' }];
    const { report } = reject({ pool, exclusions, context });
    expect(report.removals.length).toBe(2);
  });

  it('names each exclusion kind', () => {
    const exclusions: Exclusion[] = [{ kind: 'explicit' }, { kind: 'liveOrRemix' }];
    const { report } = reject({ pool, exclusions, context });
    expect(report.removals.map((entry) => entry.kind)).toEqual(['explicit', 'liveOrRemix']);
  });

  it('sums removals to the total removed', () => {
    const exclusions: Exclusion[] = [
      { kind: 'explicit' },
      { kind: 'liveOrRemix' },
      { kind: 'artist', artistId: artistAt(2).id },
    ];
    const { report } = reject({ pool, exclusions, context });
    const summed = report.removals.reduce((total, entry) => total + entry.removed, 0);
    expect(summed).toBe(report.removedCount);
  });

  it('credits the first exclusion that catches a track', () => {
    const track = makeTrack({ explicit: true, title: 'Paper Arcade (Live)' });
    const exclusions: Exclusion[] = [{ kind: 'explicit' }, { kind: 'liveOrRemix' }];
    const { report } = reject({ pool: [track], exclusions, context });
    expect(report.removals[1]?.removed).toBe(0);
  });

  it('empties out when every exclusion applies', () => {
    const { kept } = reject({
      pool,
      exclusions: [{ kind: 'years', range: { from: 0, to: 3000 } }],
      context,
    });
    expect(kept).toEqual([]);
  });

  it('handles an empty pool', () => {
    const { report } = reject({ pool: [], exclusions: [{ kind: 'explicit' }], context });
    expect(report.keptCount).toBe(0);
  });
});
