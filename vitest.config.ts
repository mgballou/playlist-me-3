import { defineConfig } from 'vitest/config';

/**
 * Three projects, because the layers want different worlds.
 *
 * core is pure TypeScript and must keep running under plain Node with no DOM — that
 * constraint is load-bearing (spec §3.1), so its tests get no DOM to lean on by accident.
 * spotify tests exercise the client against a local fetch stub, also under Node. The web
 * app brings its own config, which is where jsdom and Testing Library are set up.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          include: ['packages/core/test/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'spotify',
          include: ['packages/spotify/test/**/*.test.ts'],
          environment: 'node',
        },
      },
      './apps/web',
    ],
  },
});
