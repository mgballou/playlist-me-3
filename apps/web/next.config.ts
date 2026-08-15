import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@pm/core', '@pm/spotify'],
  // Next writes its own AGENTS.md and CLAUDE.md into apps/web on every dev start. This repo
  // keeps one CLAUDE.md at the root and does not want a generated second one beside it.
  agentRules: false,
  // The dev-tools badge sits in the bottom-left corner, which is where the ledger states the
  // track count — so every README screenshot came out with the count under it. Hiding the
  // badge costs nothing: the error overlay still appears when something breaks.
  devIndicators: false,
  images: {
    // Album art comes from Spotify's CDN. Nothing else is remote.
    remotePatterns: [{ protocol: 'https', hostname: 'i.scdn.co' }],
  },
};

export default config;
