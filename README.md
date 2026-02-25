# `NoFallbackError` logged to `console.error` when `dynamicParams = false` rejects a param

## Description

When `dynamicParams = false` is set in a Next.js App Router page and a request arrives for a param not returned by `generateStaticParams`, Next.js internally throws a `NoFallbackError` as control flow. The error is caught internally and the response is correctly sent as a 404. However, during this throw→catch propagation, Next.js logs the error to `console.error`.

This happens in **all server modes** — `next start`, custom servers via `getRequestHandler()`, and standalone builds. The 404 response itself is correct; the problem is the `console.error` side effect.

## Why this matters

`NoFallbackError` is internal control flow, not an application error. Logging it to `console.error` causes real problems:

- **APM tools** (Datadog dd-trace, Sentry, New Relic, etc.) hook into `console.error` or intercept thrown errors during propagation. Every 404 from a `dynamicParams = false` route generates a false-positive error alert.
- **Log monitoring** — any infrastructure that monitors `stderr` or `console.error` for error rates will see inflated error counts on routes that legitimately 404 (bots, crawlers, typos, old URLs).
- **Netlify's Next.js plugin** (`@netlify/plugin-nextjs`) — wraps `getRequestHandler()` and surfaces these errors in function logs.

In production at scale, this means hundreds or thousands of false-positive error events per day from bot traffic alone.

## Reproduction

### Setup

```bash
npm install
npm run build
```

### Test with `next start`

```bash
npm start
```

1. Visit `http://localhost:3000/about` → **200 OK**, no errors in server console
2. Visit `http://localhost:3000/nonexistent` → **404**, `Error: Internal: NoFallbackError` logged to console

### Test with custom server (makes the leak more visible)

```bash
npm run start:custom
```

The custom server intercepts `console.error` to highlight when `NoFallbackError` leaks — simulating what APM tools do.

1. Visit `http://localhost:3000/about` → **200 OK**, no intercepted errors
2. Visit `http://localhost:3000/nonexistent` → **404**, and the server console shows:

```
======================================================================
[INTERCEPTED] NoFallbackError leaked to console.error (count: 1)
This is an internal control-flow error that should not be logged.
APM tools (dd-trace, Sentry) will report this as a real error.
======================================================================
```

## Expected behavior

When `dynamicParams = false` rejects a param, the response should be a 404 with **no error logged to `console.error`**. Internal control-flow errors should not leak to the console.

## Actual behavior

The 404 response is correct, but `NoFallbackError` is logged to `console.error` on every rejected request. This triggers APM tools and log monitors that treat `console.error` as indicative of real errors.

## Relevant source code

- `NoFallbackError` is thrown in the page module (`app-page.js`) when `dynamicParams = false` and the param isn't in `generateStaticParams`
- The error propagates through `base-server.js` and is caught/re-thrown at multiple levels
- During this propagation, it passes through error handling code that calls `console.error`
- The error is eventually caught and converted to a 404 response, but the `console.error` call has already happened

## Workaround

Monkey-patch `console.error` to suppress or downgrade `NoFallbackError`:

```js
// instrumentation.ts (Next.js instrumentation hook)
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const message = args.map(String).join(' ');
  if (message.includes('NoFallbackError')) {
    // Downgrade to warning — this is expected control flow, not an error
    console.warn('[suppressed NoFallbackError]', ...args);
    return;
  }
  originalConsoleError(...args);
};
```

This is fragile — it relies on string matching against an internal error name that could change.

## Environment

- Next.js: 15.5.12
- Node.js: 22.x
- OS: macOS / Linux
