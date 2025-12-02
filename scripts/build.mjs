import { build } from 'vite';

async function run() {
  console.log('[build] Starting Vite programmatic build...');
  try {
    await build();
    console.log('[build] Vite build completed successfully.');
  } catch (err) {
    console.error('[build] Vite build failed:', err);
    process.exit(1);
  }
}

run();
