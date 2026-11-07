#!/usr/bin/env bun
/**
 * Manual-WebRTC smoke test: opens two independent Chrome contexts with fake
 * media devices, exchanges SDP codes through the UI and waits for "Connected".
 *
 * Usage: bun scripts/e2e-manual-call.mjs
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

function watch(page, name) {
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

async function waitForCode(page, label, timeout = 25_000) {
  const field = page.getByLabel(label);
  await field.waitFor({ state: 'visible', timeout });
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await field.inputValue();
    if (value.startsWith('LC1.')) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const contextA = await browser.newContext({ permissions: ['camera', 'microphone'] });
const contextB = await browser.newContext({ permissions: ['camera', 'microphone'] });
const a = await contextA.newPage();
const b = await contextB.newPage();
watch(a, 'A');
watch(b, 'B');

try {
  await Promise.all([enterCall(a), enterCall(b)]);

  await a.getByRole('button', { name: 'Manual codes (two machines)' }).click();
  await a.getByRole('button', { name: 'Create invite code' }).click();
  const offer = await waitForCode(a, 'Your invite code');
  console.info(`offer code: ${offer.length} chars`);

  await b.getByRole('button', { name: 'Manual codes (two machines)' }).click();
  await b.getByLabel('Paste invite code').fill(offer);
  await b.getByRole('button', { name: 'Generate answer' }).click();
  const answer = await waitForCode(b, 'Answer code');
  console.info(`answer code: ${answer.length} chars`);

  await a.getByLabel('Paste answer code').fill(answer);
  await a.getByRole('button', { name: 'Connect', exact: true }).click();

  await a.getByText('Connected', { exact: false }).first().waitFor({ timeout: 30_000 });
  await b.getByText('Connected', { exact: false }).first().waitFor({ timeout: 30_000 });
  console.info('PASS: both peers connected');
} catch (error) {
  console.error('FAIL:', error instanceof Error ? error.message : error);
  for (const line of logs) console.error(line);
  const texts = [];
  for (const [name, page] of [
    ['A', a],
    ['B', b],
  ]) {
    try {
      const toggle = page.getByRole('button', { name: /Debug console/ });
      if (await toggle.count()) await toggle.click();
      texts.push(`--- ${name} ---\n${(await page.locator('body').innerText()).slice(0, 2500)}`);
    } catch {
      // ignore
    }
  }
  console.error(texts.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
