import { LIVE_OR_REMIX_PATTERNS, isLiveOrRemix } from '@pm/core';
import { describe, expect, it } from 'vitest';

import {
  DEMO_GENRES,
  KIDS_GENRES,
  KIDS_PLAYLIST_ID,
  buildDemoCatalog,
  demoCatalog,
} from '../src/index';

const tracks = demoCatalog.albums.flatMap((album) => album.tracks);

describe('the demo catalog', () => {
  it('has a roster worth looking at', () => {
    expect(demoCatalog.artists.length).toBeGreaterThanOrEqual(40);
  });

  it('has a catalog worth searching', () => {
    expect(demoCatalog.albums.length).toBeGreaterThanOrEqual(100);
  });

  it('has a pool worth building from', () => {
    expect(tracks.length).toBeGreaterThanOrEqual(600);
  });

  it('spans more than one genre per act', () => {
    expect(DEMO_GENRES.length).toBeGreaterThanOrEqual(10);
  });

  it('spans decades', () => {
    const years = demoCatalog.albums.map((album) => album.releaseYear);
    expect(Math.max(...years) - Math.min(...years)).toBeGreaterThanOrEqual(40);
  });

  it('gives every artist a unique id', () => {
    const ids = new Set(demoCatalog.artists.map((artist) => artist.id));
    expect(ids.size).toBe(demoCatalog.artists.length);
  });

  it('gives every album a unique id', () => {
    const ids = new Set(demoCatalog.albums.map((album) => album.id));
    expect(ids.size).toBe(demoCatalog.albums.length);
  });

  it('gives every track a unique id', () => {
    const ids = new Set(tracks.map((track) => track.id));
    expect(ids.size).toBe(tracks.length);
  });

  it('numbers every album from one', () => {
    const wrong = demoCatalog.albums.filter((album) => album.tracks[0]?.trackNumber !== 1);
    expect(wrong).toEqual([]);
  });

  it('numbers every album consecutively', () => {
    const wrong = demoCatalog.albums.filter((album) =>
      album.tracks.some((track, index) => track.trackNumber !== index + 1),
    );
    expect(wrong).toEqual([]);
  });

  it('credits every track to an artist on the roster', () => {
    const known = new Set(demoCatalog.artists.map((artist) => artist.id));
    const orphans = tracks.filter((track) => track.artistIds.some((id) => !known.has(id)));
    expect(orphans).toEqual([]);
  });

  it('varies duration', () => {
    const durations = tracks.map((track) => track.durationMs);
    expect(Math.max(...durations) - Math.min(...durations)).toBeGreaterThan(120_000);
  });

  it('has collaborations for the expansion path to walk', () => {
    expect(tracks.filter((track) => track.artistIds.length > 1).length).toBeGreaterThanOrEqual(30);
  });

  it('has explicit tracks for the exclusion to catch', () => {
    expect(tracks.filter((track) => track.explicit).length).toBeGreaterThanOrEqual(30);
  });

  it('has hipster albums for tag:hipster to find', () => {
    expect(demoCatalog.albums.filter((album) => album.hipster).length).toBeGreaterThanOrEqual(20);
  });

  it('has new releases for tag:new to find', () => {
    expect(demoCatalog.albums.filter((album) => album.isNew).length).toBeGreaterThanOrEqual(10);
  });

  it('has singles as well as albums', () => {
    expect(demoCatalog.albums.filter((album) => album.group === 'single').length).toBeGreaterThan(
      10,
    );
  });

  it('writes release dates at all three precisions', () => {
    const precisions = new Set(demoCatalog.albums.map((album) => album.releaseDate.length));
    expect([...precisions].sort((a, b) => a - b)).toEqual([4, 7, 10]);
  });
});

describe('release markers', () => {
  it('marks enough titles for the liveOrRemix exclusion to do visible work', () => {
    expect(tracks.filter((track) => isLiveOrRemix(track.title)).length).toBeGreaterThanOrEqual(40);
  });

  it('keeps marked titles a minority', () => {
    const marked = tracks.filter((track) => isLiveOrRemix(track.title)).length;
    expect(marked / tracks.length).toBeLessThan(0.2);
  });

  it('carries studio titles that name a marker word away from suffix position', () => {
    const decoys = tracks.filter((track) =>
      LIVE_OR_REMIX_PATTERNS.some((pattern) => pattern.test(track.title)),
    );
    expect(decoys.length).toBeGreaterThan(tracks.filter((t) => isLiveOrRemix(t.title)).length);
  });

  it('never catches a decoy title', () => {
    expect(isLiveOrRemix('Long Live the Hallway')).toBe(false);
  });
});

describe('the kids cluster', () => {
  const kidsGenres: readonly string[] = KIDS_GENRES;
  const kidsArtists = demoCatalog.artists.filter((artist) =>
    artist.genres.some((genre) => kidsGenres.includes(genre)),
  );

  it('has its own acts', () => {
    expect(kidsArtists.length).toBeGreaterThanOrEqual(4);
  });

  it('has a playlist to exclude', () => {
    const list = demoCatalog.playlists.find((playlist) => playlist.id === KIDS_PLAYLIST_ID);
    expect(list?.name).toBe('Kids Jams (demo)');
  });

  it('fills that playlist with kids music and nothing else', () => {
    const kidsIds = new Set(kidsArtists.map((artist) => artist.id));
    const list = demoCatalog.playlists.find((playlist) => playlist.id === KIDS_PLAYLIST_ID);
    const byId = new Map(demoCatalog.albums.flatMap((a) => a.tracks).map((t) => [t.id, t]));
    const strays = (list?.trackIds ?? []).filter(
      (id) => !(byId.get(id)?.artistIds ?? []).some((artistId) => kidsIds.has(artistId)),
    );
    expect(strays).toEqual([]);
  });

  it('makes that playlist worth excluding', () => {
    const list = demoCatalog.playlists.find((playlist) => playlist.id === KIDS_PLAYLIST_ID);
    expect(list?.trackIds.length).toBeGreaterThanOrEqual(20);
  });

  it('leaves kids music in the demo listening history, which is the whole problem', () => {
    const kidsIds = new Set(kidsArtists.map((artist) => artist.id));
    const byId = new Map(demoCatalog.albums.flatMap((a) => a.tracks).map((t) => [t.id, t]));
    const infiltrators = demoCatalog.topTrackIds.shortTerm.filter((id) =>
      (byId.get(id)?.artistIds ?? []).some((artistId) => kidsIds.has(artistId)),
    );
    expect(infiltrators.length).toBeGreaterThan(0);
  });

  it('keeps kids tracks short', () => {
    const kidsIds = new Set(kidsArtists.map((artist) => artist.id));
    const kidsTracks = tracks.filter((track) => track.artistIds.some((id) => kidsIds.has(id)));
    expect(Math.max(...kidsTracks.map((track) => track.durationMs))).toBeLessThan(180_000);
  });

  it('never marks kids tracks explicit', () => {
    const kidsIds = new Set(kidsArtists.map((artist) => artist.id));
    const kidsTracks = tracks.filter((track) => track.artistIds.some((id) => kidsIds.has(id)));
    expect(kidsTracks.filter((track) => track.explicit)).toEqual([]);
  });
});

describe('the demo listener', () => {
  it('has a library', () => {
    expect(demoCatalog.savedTrackIds.length).toBeGreaterThanOrEqual(50);
  });

  it('has top tracks in every range', () => {
    const empty = (['shortTerm', 'mediumTerm', 'longTerm'] as const).filter(
      (range) => demoCatalog.topTrackIds[range].length === 0,
    );
    expect(empty).toEqual([]);
  });

  it('follows some artists', () => {
    expect(demoCatalog.followedArtistIds.length).toBeGreaterThanOrEqual(5);
  });

  it('has heard things recently', () => {
    expect(demoCatalog.recentlyPlayedTrackIds.length).toBeGreaterThan(0);
  });
});

describe('determinism', () => {
  it('builds the same track count every time', () => {
    const rebuilt = buildDemoCatalog();
    expect(rebuilt.albums.flatMap((album) => album.tracks)).toHaveLength(tracks.length);
  });

  it('builds the same titles every time', () => {
    const rebuilt = buildDemoCatalog();
    expect(rebuilt.albums.map((album) => album.title)).toEqual(
      demoCatalog.albums.map((album) => album.title),
    );
  });

  it('builds the same playlists every time', () => {
    expect(buildDemoCatalog().playlists[0]?.trackIds).toEqual(demoCatalog.playlists[0]?.trackIds);
  });
});
