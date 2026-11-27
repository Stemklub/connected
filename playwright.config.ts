import { defineConfig } from '@playwright/test'

// Podrazumijevano: lažni Supabase (tests/server/fake-supabase.ts, PGlite sa istim setup.sql)
// + lokalni build. Pravi server: E2E_BASE_URL=https://stemklub.github.io/connected/
// (mentor: E2E_MENTOR_NICK / E2E_MENTOR_PASS, podrazumijevano prof.e2e / demo1234).
const deployed = process.env.E2E_BASE_URL
const FAKE = 'http://localhost:54321'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: deployed ?? 'http://localhost:4173/connected/', trace: 'off' },
  webServer: deployed
    ? undefined
    : [
        { command: 'npx tsx tests/server/fake-supabase.ts', url: `${FAKE}/rest/v1/rpc/get_screen`, reuseExistingServer: false, timeout: 60_000 },
        {
          command: `VITE_BASE=/connected/ VITE_SUPABASE_URL=${FAKE} VITE_SUPABASE_ANON_KEY=fake npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4173 --strictPort`,
          url: 'http://localhost:4173/connected/',
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ],
})
