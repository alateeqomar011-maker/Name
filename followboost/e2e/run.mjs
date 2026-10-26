// End-to-end checks in a real browser. Run `npm run build` first, then `npm run test:e2e`.
// Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`).
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'e2e', 'screenshots');
mkdirSync(shots, { recursive: true });

const server = await preview({ root, preview: { port: 0, open: false }, logLevel: 'silent' });
const BASE = server.resolvedUrls.local[0];
const browser = await chromium.launch();

const results = [];
async function test(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`  ✗ ${name}\n    ${err.message.split('\n').join('\n    ')}`);
  }
}

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  ipad: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true },
  iphone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

async function open(kind = 'desktop', hash = '#/generate') {
  const context = await browser.newContext({ ...VIEWPORTS[kind], acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + hash);
  await page.waitForSelector('#main');
  return { page, context, errors };
}

const usernameInput = (page) => page.getByRole('textbox', { name: /username/i });
const generate = (page) => page.locator('.summary').getByRole('button', { name: /Run demo simulation|Create growth plan/ });
const dialog = (page) => page.locator('dialog.modal-processing');
const fieldMsg = (page, text) => page.locator('.field-msg', { hasText: text });
const heading = (scope, name) => scope.getByRole('heading', { name });

async function runDemo(page, { username, platform = 'Instagram', quantity = '1,000' }) {
  await page.locator('label.qty-card', { hasText: quantity }).click();
  await page.locator('label.platform-card', { hasText: new RegExp(`^${platform}$`) }).click();
  await usernameInput(page).fill(username);
  await generate(page).click();
  await dialog(page).waitFor({ state: 'visible' });
}

async function noHorizontalScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `page scrolls horizontally by ${overflow}px`);
}

console.log(`FollowBoost e2e against ${BASE}`);

await test('username validation explains every error', async () => {
  const { page, context, errors } = await open();
  await generate(page).click();
  await fieldMsg(page, 'Enter a username to continue.').waitFor();
  assert.equal(await usernameInput(page).getAttribute('aria-invalid'), 'true');

  await usernameInput(page).fill('me@example.com');
  await fieldMsg(page, 'looks like an email address').waitFor();
  await usernameInput(page).fill('myname:hunter2');
  await fieldMsg(page, 'may include a password').waitFor();
  await usernameInput(page).fill('two words');
  await fieldMsg(page, "Usernames can't contain spaces.").waitFor();
  await usernameInput(page).fill('.dotted');
  await fieldMsg(page, "Instagram usernames can't start or end with a period.").waitFor();
  await usernameInput(page).fill('https://www.tiktok.com/@someone');
  await fieldMsg(page, "That link isn't from Instagram.").waitFor();

  await usernameInput(page).fill('https://instagram.com/Nova.Creates/');
  await fieldMsg(page, 'Looks good:').waitFor();
  await page.locator('.summary').getByText('@nova.creates').waitFor();

  await page.locator('label.platform-card', { hasText: /^X$/ }).click();
  await usernameInput(page).fill('this_name_is_way_too_long');
  await fieldMsg(page, 'X usernames are up to 15 characters long.').waitFor();
  assert.equal(await page.locator('input[type=password]').count(), 0, 'no password fields');
  assert.deepEqual(errors, []);
  await context.close();
});

await test('demo run shows live progress, then a clearly labeled report', async () => {
  const { page, context, errors } = await open();
  await runDemo(page, { username: '@nova.creates', platform: 'TikTok', quantity: '1,000' });
  const d = dialog(page);
  await heading(d, 'Running demo simulation').waitFor();
  await d.getByText(/Simulation only/).waitFor();
  await page.screenshot({ path: join(shots, 'desktop-processing.png') });
  await heading(d, 'Simulation complete').waitFor({ timeout: 15000 });
  await d.getByText(/Nothing was added to @nova\.creates/).waitFor();
  await d.getByRole('button', { name: /View demo report/ }).click();
  await page.waitForURL(/#\/requests\/FB-/);
  await page.getByText('Simulation only.', { exact: true }).waitFor();
  await page.locator('.stat', { hasText: 'Real followers added' }).getByText('0', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Show data table' }).click();
  await page.getByRole('cell', { name: 'Hour 24' }).waitFor();
  await page.screenshot({ path: join(shots, 'desktop-demo-report.png'), fullPage: true });

  // Export, run again, and the "plan real growth" hand-off all respond.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  assert.match((await download).suggestedFilename(), /^followboost-FB-.+\.json$/);
  await page.getByRole('button', { name: /Plan real growth instead/ }).click();
  await page.waitForURL(/#\/generate/);
  assert.ok(await page.locator('label.mode-card-growth').evaluate((el) => el.classList.contains('is-selected')));
  assert.deepEqual(errors, []);
  await context.close();
});

await test('real growth plan builds and its checklist persists', async () => {
  const { page, context, errors } = await open();
  await page.locator('label.mode-card-growth').click();
  await page.getByLabel(/Your niche/).selectOption('fitness');
  await page.locator('label.qty-card', { hasText: '5,000' }).click();
  await page.locator('label.platform-card', { hasText: /^YouTube$/ }).click();
  await usernameInput(page).fill('fitwithkai');
  await page.locator('.summary').getByText('Realistic timeline').waitFor();
  await generate(page).click();
  const d = dialog(page);
  await heading(d, 'Your growth plan is ready').waitFor({ timeout: 15000 });
  await d.getByRole('button', { name: /Open growth plan/ }).click();
  await page.getByRole('heading', { name: 'Projected growth' }).waitFor();
  await page.getByText('Workout tutorials').waitFor();
  await page.getByText('Real growth plan.').waitFor();

  const box = page.getByRole('checkbox', { name: /Reply to every comment/ });
  await box.check({ force: true });
  await page.getByText('1 of 7 done this week.', { exact: false }).waitFor();
  await page.reload();
  assert.ok(await page.getByRole('checkbox', { name: /Reply to every comment/ }).isChecked(), 'checklist survives reload');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download \.md/ }).click();
  assert.match((await download).suggestedFilename(), /followboost-plan-fitwithkai-youtube\.md/);
  await page.screenshot({ path: join(shots, 'desktop-growth-plan.png'), fullPage: true });
  assert.deepEqual(errors, []);
  await context.close();
});

await test('reserved handles fail with a clear reason', async () => {
  const { page, context, errors } = await open();
  await runDemo(page, { username: 'admin' });
  const d = dialog(page);
  await d.getByRole('heading', { name: 'Request failed' }).waitFor({ timeout: 10000 });
  await d.getByText(/reserved or platform-owned handle/).waitFor();
  await d.getByRole('button', { name: /Use a different username/ }).click();
  await page.waitForURL(/#\/generate/);
  assert.equal(await usernameInput(page).inputValue(), '');
  assert.deepEqual(errors, []);
  await context.close();
});

await test('queue, duplicate guard, cancel and background runs', async () => {
  const { page, context, errors } = await open();
  await runDemo(page, { username: 'first.run', quantity: '100,000' });
  await dialog(page).getByRole('button', { name: 'Run in background' }).click();
  await dialog(page).waitFor({ state: 'hidden' });

  // Identical request while the first is active is refused.
  await generate(page).click();
  await page.getByText('Already in progress').waitFor();

  await runDemo(page, { username: 'second.run', quantity: '1,000' });
  await heading(dialog(page), 'Waiting in queue').waitFor();
  await dialog(page).getByRole('button', { name: 'Run in background' }).click();

  await page.locator('.sidebar').getByRole('link', { name: 'Dashboard' }).click();
  await page.getByText('Queue · 1').waitFor();
  await page.locator('.current').getByRole('button', { name: /Cancel/ }).click();
  await page.getByText('Request cancelled').first().waitFor();
  // The queued request starts once the running one is cancelled.
  await page.locator('.current').getByText('@second.run').waitFor();
  await page.screenshot({ path: join(shots, 'desktop-dashboard.png'), fullPage: true });
  await page.locator('.current').getByText('Completed').waitFor({ timeout: 15000 });
  assert.deepEqual(errors, []);
  await context.close();
});

await test('history search, filters, export, delete and clear', async () => {
  const { page, context, errors } = await open();
  for (const name of ['alpha.one', 'beta.two']) {
    await runDemo(page, { username: name });
    await heading(dialog(page), 'Simulation complete').waitFor({ timeout: 15000 });
    await dialog(page).getByRole('button', { name: 'Close' }).click();
  }
  await page.goto(BASE + '#/history');
  await page.getByText('2 of 2 requests').waitFor();
  await page.getByRole('searchbox', { name: 'Search requests' }).fill('alpha');
  await page.getByText('1 of 2 requests').waitFor();
  await page.getByRole('button', { name: 'Reset filters' }).first().click();
  await page.getByLabel('Filter by status').selectOption('failed');
  await page.getByText('No matching requests').waitFor();
  await page.getByRole('button', { name: 'Reset filters' }).first().click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  assert.match((await download).suggestedFilename(), /followboost-history-.+\.csv/);

  await page.locator('.history-table').getByRole('button', { name: /^Delete FB-/ }).first().click();
  await page.getByRole('button', { name: 'Delete request' }).click();
  await page.getByText('1 of 1 request').waitFor();

  await page.getByRole('button', { name: 'Clear history' }).click();
  await page.getByRole('button', { name: 'Keep it' }).click();
  await page.getByText('1 of 1 request').waitFor();
  await page.getByRole('button', { name: 'Clear history' }).click();
  await page.locator('dialog.modal-sm').getByRole('button', { name: 'Clear history' }).click();
  await page.getByText('No requests yet').waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

await test('help page FAQ and reset', async () => {
  const { page, context, errors } = await open('desktop', '#/help');
  await page.getByText('Does demo mode add followers to my account?').click();
  await page.getByText(/runs entirely in your browser/).waitFor();
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.getByRole('button', { name: 'Reset everything' }).click();
  await page.getByText('Demo data reset').waitFor();
  await page.goto(BASE + '#/nowhere');
  await page.getByText('Page not found').waitFor();
  await page.goto(BASE + '#/requests/FB-NOPE00');
  await page.getByText('Request not found').waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

for (const kind of ['iphone', 'ipad']) {
  await test(`${kind}: layout fits and navigation works`, async () => {
    const { page, context, errors } = await open(kind);
    await noHorizontalScroll(page);
    await page.screenshot({ path: join(shots, `${kind}-generate.png`), fullPage: true });
    // The docked button submits from the top of the form.
    await page.locator('.dock').getByRole('button', { name: 'Run demo' }).click();
    await fieldMsg(page, 'Enter a username to continue.').waitFor();
    await usernameInput(page).fill('mobile.maker');
    await page.locator('.dock').getByRole('button', { name: 'Run demo' }).click();
    await heading(dialog(page), 'Simulation complete').waitFor({ timeout: 20000 });
    await page.screenshot({ path: join(shots, `${kind}-complete.png`) });
    await dialog(page).getByRole('button', { name: /View demo report/ }).click();
    await page.getByText('Simulation only.', { exact: true }).waitFor();
    await noHorizontalScroll(page);
    await page.screenshot({ path: join(shots, `${kind}-report.png`), fullPage: true });
    for (const [tab, check] of [
      ['Dashboard', 'Latest result'],
      ['History', '1 of 1 request'],
      ['Help', 'Our safety promises'],
      ['Generate', 'How many followers?'],
    ]) {
      await page.locator('.tabbar').getByRole('link', { name: tab }).click();
      await page.getByText(check).first().waitFor();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(shots, `${kind}-${tab.toLowerCase()}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    await context.close();
  });
}

await browser.close();
await new Promise((resolve) => server.httpServer.close(resolve));

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed. Screenshots in e2e/screenshots/`);
process.exit(failed ? 1 : 0);
