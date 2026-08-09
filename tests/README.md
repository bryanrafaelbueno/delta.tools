# Delta.tools — End-to-end smoke tests

These tests drive the real browser (via Playwright) against the running app
and API, verifying the core flows end to end:

1. Dashboard renders built-in tools
2. Sidebar navigation
3. Tool search
4. Image conversion (PNG → JPG, canvas)
5. Marketplace moderation flow — the test publishes its own plugin through the
   real API (register → publish → promote → approve) so it runs on any
   database state, including a fresh one
6. Plugin install + appears under "Manage plugins"
7. Sandboxed plugin actually converts a file (output verified)
8. Account registration
9. Plugin publishing (goes to moderation, hidden until approved)
10. Theme toggle

## Running

```bash
# terminal 1 — API server
npm run dev -w server

# terminal 2 — web dev server
npm run dev -w web

# terminal 3 — the tests
npx playwright install chromium
node tests/e2e-smoke.cjs
```

Requires `PLAYWRIGHT_BROWSERS_PATH` if you install browsers outside the
default cache location.
