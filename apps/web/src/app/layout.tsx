/**
 * The document. Two families, self-hosted at build time by `next/font/google` — so the app
 * makes no external font request and ui-sensibility §14's "nothing depends on a service being
 * reachable" holds (§6.1).
 *
 * The two scripts in the head run **before hydration**, which is the whole point of them:
 * they settle the theme and the collapse state on the first paint. Doing either in an effect
 * ships a visible flash of the wrong answer.
 */

import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Bricolage_Grotesque, JetBrains_Mono } from 'next/font/google';

import { COLLAPSE_INIT_SCRIPT } from '@/lib/layout/collapse';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import '@/styles/globals.css';

/** The display face talks: headings, module labels, buttons and body copy. §6.1 */
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bricolage',
});

/** The mono face measures: counts, durations, years, request costs, dial values. §6.1 */
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
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
      className={`${bricolage.variable} ${jetbrains.variable}`}
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
