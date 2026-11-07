#!/usr/bin/env bun
/**
 * Quick-call smoke test: two tabs in the same Chrome context, BroadcastChannel
 * signaling, no manual SDP codes. Verifies the call reaches "Connected".
 *
 * Usage: bun scripts/e2e-quick-call.mjs
 */
import { chromium } from 'playwright-core';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const logs = [];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
const host = await context.newPage();
const guest = await context.newPage();

for (const [name, page] of [
  ['host', host],
  ['guest', guest],
]) {
  page.on('console', (message) => {
    if (message.type() === 'error') logs.push(`[${name}:console] ${message.text()}`);
  });
  page.on('pageerror', (error) => logs.push(`[${name}:pageerror] ${error.message}`));
}

async function enterCall(page) {
  await page.goto(APP);
  await page.getByRole('button', { name: /English/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Simple WebRTC call (temporary)' }).click();
}

try {
  await Promise.all([enterCall(host), enterCall(guest)]);

  await host.getByRole('button', { name: 'Quick test in this browser' }).click();
  await host.getByRole('button', { name: 'Create quick room' }).click();
  const codeElement = host.getByTestId('room-code');
  await codeElement.waitFor({ state: 'visible', timeout: 20_000 });
  const code = (await codeElement.textContent())?.trim() ?? '';
  if (!/^[A-Z0-9]{6}$/u.test(code)) throw new Error(`Bad room code: "${code}"`);
  console.info(`room code: ${code}`);

  await guest.getByRole('button', { name: 'Quick test in this browser' }).click();
  await guest.getByLabel('Room code').fill(code);
  await guest.getByRole('button', { name: 'Join quick room' }).click();

  await host.getByText('Connected', { exact: false }).first().waitFor({ timeout: 30_000 });
  await guest.getByText('Connected', { exact: false }).first().waitFor({ timeout: 30_000 });
  console.info('PASS: quick call connected');
} catch (error) {
  console.error('FAIL:', error instanceof Error ? error.message : error);
  for (const line of logs) console.error(line);
  for (const [name, page] of [
    ['host', host],
    ['guest', guest],
  ]) {
    try {
      const debugToggle = page.getByRole('button', { name: /Debug console/ });
      if (await debugToggle.count()) await debugToggle.click();
      console.error(`--- ${name} ---\n${(await page.locator('body').innerText()).slice(0, 2000)}`);
    } catch {
      // ignore dump errors
    }
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
