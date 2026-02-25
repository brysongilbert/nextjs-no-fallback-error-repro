import { createServer } from 'node:http';
import next from 'next';

const app = next({ dev: false });
const handle = app.getRequestHandler();

await app.prepare();

// Intercept console.error to detect NoFallbackError leaking from Next.js internals.
// This simulates what APM tools (dd-trace, Sentry) do — they hook into console.error
// or intercept thrown errors, and NoFallbackError triggers them on every 404 from
// dynamicParams = false routes.
const originalConsoleError = console.error;
let noFallbackCount = 0;

console.error = (...args) => {
  const message = args.map(String).join(' ');
  if (message.includes('NoFallbackError')) {
    noFallbackCount++;
    originalConsoleError(
      `\n${'='.repeat(70)}`,
      `\n[INTERCEPTED] NoFallbackError leaked to console.error (count: ${noFallbackCount})`,
      `\nThis is an internal control-flow error that should not be logged.`,
      `\nAPM tools (dd-trace, Sentry) will report this as a real error.`,
      `\n${'='.repeat(70)}\n`,
    );
    // Still call original so you can see what Next.js logged:
    originalConsoleError('[original Next.js output]', ...args);
    return;
  }
  originalConsoleError(...args);
};

createServer(async (req, res) => {
  await handle(req, res);
}).listen(3000, () => {
  console.log('Ready on http://localhost:3000');
  console.log('');
  console.log('Test plan:');
  console.log('  1. Visit http://localhost:3000/about     → 200, no errors');
  console.log('  2. Visit http://localhost:3000/contact   → 200, no errors');
  console.log('  3. Visit http://localhost:3000/anything  → 404, NoFallbackError leaked to console.error');
  console.log('');
});
