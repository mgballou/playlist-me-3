// @vitest-environment node
// The live client, which reaches for Node's fetch and Web Crypto.
import type { Source } from '@pm/core';
import { artistId, playlistId } from '@pm/core';
import { demoCatalog, resolveSources } from '@pm/spotify';
import { describe, expect, it } from 'vitest';

import type { Session } from '@/lib/auth/session';
import { readSpotifyEnv } from '@/lib/env';
import { chooseClient } from '@/lib/spotify/factory';
import type { SessionCaches } from '@/lib/spotify/session-cache';
import { createSessionCaches } from '@/lib/spotify/session-cache';

import type { SpotifyStub } from './support/spotify-stub';
import { spotifyStub } from './support/spotify-stub';

const CONFIGURED = {
  SPOTIFY_CLIENT_ID: 'client-id',
  SESSION_SECRET: 'a-secret-of-at-least-thirty-two-characters',
};

const NOW = 1_770_000_000_000;

function sessionFor(sid: string): Session {
  return {
    sid,
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: NOW + 3_600_000,
    scope: '',
  };
}

/** What `resolveWorkbench` reads about the person, at the ceilings it names today. */
const CONTEXT_LIMITS = {
  savedTracks: 200,
  topTracks: 100,
  recentlyPlayed: 50,
  followedArtists: 50,
  playlistTracks: 400,
} as const;

const first = demoCatalog.artists[0];
const second = demoCatalog.artists[1];
if (first === undefined || second === undefined) throw new Error('the demo catalog is empty');

function artistSource(id: string): Source {
  return { kind: 'artist', artistId: artistId(id), depth: 'albumsAndSingles' };
}

const ONE_ARTIST: readonly Source[] = [artistSource(first.id)];
const TWO_ARTISTS: readonly Source[] = [artistSource(first.id), artistSource(second.id)];

type Resolve = {
  readonly stub: SpotifyStub;
  readonly caches?: SessionCaches | undefined;
  readonly sid?: string | undefined;
  readonly sources: readonly Source[];
  readonly excludedPlaylistIds?: readonly string[] | undefined;
};

/**
 * One server action, start to finish: build a client the way the app does, resolve the
 * sources, read the person, and answer with the requests it spent. A fresh handle every
 * time, because outliving the handle is the whole point of the store.
 */
async function resolve(args: Resolve): Promise<number> {
  const spent = args.stub.calls.length;
  const handle = chooseClient({
    reading: readSpotifyEnv(CONFIGURED),
    session: sessionFor(args.sid ?? 'session-a'),
    now: () => NOW,
    transport: { fetch: args.stub.fetchImpl, baseUrl: args.stub.baseUrl },
    ...(args.caches === undefined ? {} : { caches: args.caches }),
  });

  await resolveSources({ client: handle.client, sources: args.sources });
  await Promise.all([
    handle.client.getSavedTracks({ maxItems: CONTEXT_LIMITS.savedTracks }),
    handle.client.getTopTracks('mediumTerm', { maxItems: CONTEXT_LIMITS.topTracks }),
    handle.client.getRecentlyPlayed({ maxItems: CONTEXT_LIMITS.recentlyPlayed }),
    handle.client.getFollowedArtists({ maxItems: CONTEXT_LIMITS.followedArtists }),
    ...(args.excludedPlaylistIds ?? []).map(async (id) =>
      handle.client.getPlaylistTracks(playlistId(id), {
        maxItems: CONTEXT_LIMITS.playlistTracks,
      }),
    ),
  ]);

  return args.stub.calls.length - spent;
}

describe('what a second resolve costs', () => {
  it('costs twelve requests for one artist', async () => {
    const stub = spotifyStub();

    await expect(resolve({ stub, sources: ONE_ARTIST })).resolves.toBe(12);
  });

  it('pays the first twelve again when a second artist is added', async () => {
    const stub = spotifyStub();
    await resolve({ stub, sources: ONE_ARTIST });

    await expect(resolve({ stub, sources: TWO_ARTISTS })).resolves.toBe(20);
  });

  it('pays only the eight the second artist is worth, with a store', async () => {
    const stub = spotifyStub();
    const caches = createSessionCaches();
    await resolve({ stub, caches, sources: ONE_ARTIST });

    await expect(resolve({ stub, caches, sources: TWO_ARTISTS })).resolves.toBe(8);
  });

  it('spends nothing at all when nothing changed', async () => {
    const stub = spotifyStub();
    const caches = createSessionCaches();
    await resolve({ stub, caches, sources: ONE_ARTIST });

    await expect(resolve({ stub, caches, sources: ONE_ARTIST })).resolves.toBe(0);
  });

  it('reads the person once when a blocked playlist is added', async () => {
    const stub = spotifyStub();
    const caches = createSessionCaches();
    const list = demoCatalog.playlists[0];
    if (list === undefined) throw new Error('the demo catalog has no playlists');

    await resolve({ stub, caches, sources: ONE_ARTIST });
    const withBlock = await resolve({
      stub,
      caches,
      sources: ONE_ARTIST,
      excludedPlaylistIds: [list.id],
    });

    expect(withBlock).toBe(1);
  });
});

describe('two people never share a store', () => {
  it('reads the second person for themselves', async () => {
    const stub = spotifyStub();
    const caches = createSessionCaches();
    const mine = await resolve({ stub, caches, sid: 'session-a', sources: ONE_ARTIST });

    await expect(resolve({ stub, caches, sid: 'session-b', sources: ONE_ARTIST })).resolves.toBe(
      mine,
    );
  });

  it('keeps a cookie with no id out of every store', async () => {
    const stub = spotifyStub();
    const caches = createSessionCaches();
    const handle = chooseClient({
      reading: readSpotifyEnv(CONFIGURED),
      session: { ...sessionFor('unused'), sid: null },
      now: () => NOW,
      caches,
      transport: { fetch: stub.fetchImpl, baseUrl: stub.baseUrl },
    });

    await handle.client.getSavedTracks({ maxItems: CONTEXT_LIMITS.savedTracks });

    expect(caches.size).toBe(0);
  });
});
