// Reports whether the CI browser can create a WebGL context, as a GitHub annotation,
// so a missing GPU/driver stack shows up directly instead of as unrelated e2e timeouts.
import { chromium, firefox, webkit } from '@playwright/test';

const browserName = process.argv[2] ?? 'firefox';
const headless = !process.env.HEADED;
const name = `${browserName}, ${headless ? 'headless' : 'headed'}`;
const browserType = { chromium, firefox, webkit }[browserName as 'chromium' | 'firefox' | 'webkit'];
const prefs = browserName === 'firefox' ? { firefoxUserPrefs: { 'webgl.force-enabled': true } } : {};
const browser = await browserType.launch({ headless, ...prefs });
const page = await browser.newPage();
const messages: string[] = [];
page.on('console', (msg) => messages.push(`${msg.type()}: ${msg.text()}`));
const result = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
  if (!gl) return null;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
await browser.close();
const detail = messages.join(' | ').replace(/\r?\n/g, ' ');
if (result) console.log(`::notice title=WebGL (${name})::available, renderer: ${result}`);
else console.log(`::error title=WebGL (${name})::not available. ${detail}`);
