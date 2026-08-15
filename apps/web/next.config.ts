import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@pm/core', '@pm/spotify'],
  images: {
    // Album art comes from Spotify's CDN. Nothing else is remote.
    remotePatterns: [{ protocol: 'https', hostname: 'i.scdn.co' }],
  },
};

export default config;
