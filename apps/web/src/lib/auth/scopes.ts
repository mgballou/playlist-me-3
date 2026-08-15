/**
 * The scopes, and why each one is asked for. Spec §5.3 — this list is the table in the spec,
 * in the same order, so a diff between the two is visible.
 */

export const SCOPES = [
  /** Writing the playlist — the point. */
  'playlist-modify-private',
  'playlist-modify-public',
  /** Listing the person's playlists, and playlist sources and exclusions. */
  'playlist-read-private',
  /** The `library` source and the `inLibrary` exclusion. */
  'user-library-read',
  /** The `topTracks` source and familiarity scoring. */
  'user-top-read',
  /** The `heardRecently` exclusion. */
  'user-read-recently-played',
  /** The `followedArtists` source. */
  'user-follow-read',
  /** Generated cover art. */
  'ugc-image-upload',
] as const;

export type Scope = (typeof SCOPES)[number];

export const SCOPE_PARAMETER = SCOPES.join(' ');
