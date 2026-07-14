/**
 * The research agent, driven through the real UI.
 *
 * This one DOES make live LLM calls, so it is opt-in rather than part of CI:
 *
 *   RUN_LLM_E2E=1 npx playwright test e2e/agent.spec.ts
 *
 * Everything else in the suite stays hermetic. This exists because the agent's
 * value is visible behaviour — the reasoning trace appearing step by step — and
 * that is not something a mocked test can tell you is working.
 */

import { test, expect } from 'playwright/test';

const LIVE = process.env.RUN_LLM_E2E === '1';

const unique = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

test.describe('research agent', () => {
  test.skip(!LIVE, 'needs a live LLM key — set RUN_LLM_E2E=1');
  test.setTimeout(180_000);

  test('investigates with tools and shows its reasoning', async ({ page }) => {
    const email = `agent-${unique()}@test.dev`;
    const password = 'Password123!';
    const groupName = `Agent Group ${unique()}`;

    // ── sign up ──
    await page.goto('/auth/signup');
    await page.getByLabel('Full Name').fill('Agent User');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm Password').fill(password);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 30_000 });

    // ── group ──
    await page.getByRole('button', { name: /create (your first )?group/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Group Name').fill(groupName);
    await dialog.getByLabel('Description').fill('Agent end-to-end test');
    await dialog.getByRole('button', { name: 'Create Group' }).click();

    await page.getByText(groupName).first().click();
    await expect(page).toHaveURL(/\/group\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // ── session ──
    await page.getByRole('button', { name: /new session/i }).first().click();
    const sessionTitle = `Agent Session ${unique()}`;
    const sessionDialog = page.getByRole('dialog');
    await sessionDialog.getByLabel('Session Title').fill(sessionTitle);
    await sessionDialog.getByRole('button', { name: /create session/i }).click();

    await page.getByText(sessionTitle).first().click();
    await expect(page).toHaveURL(/\/research\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await expect(page.getByText(/connected/i)).toBeVisible({ timeout: 30_000 });

    // ── run the agent ──
    const composer = page.getByPlaceholder(/ask a research question/i);
    await composer.fill('What are the main approaches to training very deep neural networks?');
    await page.getByRole('button', { name: /deep research/i }).click();

    // The trace is the point: the user must see it working, not a spinner.
    await expect(page.getByText(/investigating/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/searching/i).first()).toBeVisible({ timeout: 60_000 });

    // ...and then an answer, with the trace collapsed into a summary.
    await expect(page.getByText(/investigated in \d+ steps?/i)).toBeVisible({
      timeout: 150_000,
    });
  });
});
