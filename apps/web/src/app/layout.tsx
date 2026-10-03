/**
 * The document. Two families, self-hosted from `src/fonts/` by `next/font/local` — so the app
 * makes no external font request, the build needs no network, and ui-sensibility §14's
 * "nothing depends on a service being reachable" holds (§6.1). A build that fetched the files
 * from Google failed whenever that fetch did.
 *
 * The two scripts in the head run **before hydration**, which is the whole point of them:
 * they settle the theme and the collapse state on the first paint. Doing either in an effect
 * ships a visible flash of the wrong answer.
 */

import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import localFont from 'next/font/local';

import { COLLAPSE_INIT_SCRIPT } from '@/lib/layout/collapse';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import '@/styles/globals.css';

/**
 * The display face talks: headings, module labels, buttons and body copy. §6.1
 *
 * IBM Plex Sans is drawn for technical and industrial contexts, which is what a panel of
 * labelled controls is.
 *
 * The four weights are named one by one, as when Google served them, all from one variable
 * file. `--weight-bold` (650) and `--weight-black` (750) both round to the 700 face, so they
 * render identically. A single `'400 700'` range would render 650 as 650 and change the look.
 */
const plexSans = localFont({
  src: [
    { path: '../fonts/IBMPlexSans-Variable-latin.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/IBMPlexSans-Variable-latin.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/IBMPlexSans-Variable-latin.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/IBMPlexSans-Variable-latin.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-plex-sans',
});

/**
 * The mono face measures: counts, durations, years, request costs, knob readouts. §6.1
 *
 * It is the *same family*, drawn alongside the sans, so a readout under a knob and the label
 * above it share their skeleton. That is how panel silkscreen works, and it is why this pair
 * is not simply "a sans and a mono".
 */
const plexMono = localFont({
  src: [
    { path: '../fonts/IBMPlexMono-Regular-latin.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/IBMPlexMono-Medium-latin.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/IBMPlexMono-SemiBold-latin.woff2', weight: '600', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  title: 'Playlist.me',
  description:
    'Build playlists on Spotify from inputs you choose, not from everything you have ever played.',
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    // The two scripts below stamp `data-theme` and `data-collapsed` on this element before
    // React ever sees it, which is the whole point of them (§4.2, §7) — and which React
    // reports as a hydration mismatch on every load. Suppressing it here is the narrow,
    // correct answer: the mismatch is deliberate, it is confined to this element, and the
    // alternative is a visible flash of the wrong theme and the wrong layout.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: `${THEME_INIT_SCRIPT}${COLLAPSE_INIT_SCRIPT}` }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
