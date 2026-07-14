/**
 * Hermetic end-to-end smoke test.
 *
 * Drives the real UI through the core flow — sign up, create a group, open a
 * session, send a message and see it appear over the websocket — against the
 * real server and database.
 *
 * It never triggers @ai, so it makes no LLM call: no API keys, no cost, no
 * multi-minute waits. (The previous suite drove live agent runs with 10-minute
 * timeouts and needed a pre-seeded user, which is why it never ran in CI.)
 */

import { test, expect } from 'playwright/test';

const unique = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

test.describe('core flow', () => {
  test('sign up → create group → start session → send a message', async ({ page }) => {
    const email = `e2e-${unique()}@test.dev`;
    const password = 'Password123!';
    const groupName = `E2E Group ${unique()}`;

    // ── Sign up ──
    await page.goto('/auth/signup');
    await page.getByLabel('Full Name').fill('E2E User');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm Password').fill(password);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/home/, { timeout: 30_000 });

    // ── Create a group ──
    // "Create Group" appears twice once the modal is open (the page button and
    // the modal's submit), so scope the second one to the dialog.
    await page.getByRole('button', { name: /create (your first )?group/i }).first().click();
    const groupDialog = page.getByRole('dialog');
    await groupDialog.getByLabel('Group Name').fill(groupName);
    await groupDialog.getByLabel('Description').fill('Created by the e2e smoke test');
    await groupDialog.getByRole('button', { name: 'Create Group' }).click();

    await expect(page.getByText(groupName)).toBeVisible({ timeout: 15_000 });

    // ── Open it (dynamic route: /group/[id]) ──
    await page.getByText(groupName).first().click();
    await expect(page).toHaveURL(/\/group\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // ── Start a discussion session ──
    await page.getByRole('button', { name: /new session/i }).first().click();
    const sessionTitle = `Session ${unique()}`;
    const sessionDialog = page.getByRole('dialog');
    await sessionDialog.getByLabel('Session Title').fill(sessionTitle);
    await sessionDialog.getByRole('button', { name: /create session/i }).click();

    await expect(page.getByText(sessionTitle)).toBeVisible({ timeout: 15_000 });

    // ── Enter the research workspace (/research/[sessionId]) ──
    await page.getByText(sessionTitle).first().click();
    await expect(page).toHaveURL(/\/research\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // Socket.IO has to connect before messages can be sent.
    await expect(page.getByText(/connected/i)).toBeVisible({ timeout: 30_000 });

    // ── Send a message; it round-trips through the server and back over the socket ──
    const messageText = `hello from the smoke test ${unique()}`;
    const composer = page.getByPlaceholder(/ask a research question/i);
    await composer.fill(messageText);
    await composer.press('Enter');

    await expect(page.getByText(messageText)).toBeVisible({ timeout: 15_000 });
  });

  test('protected routes redirect an anonymous visitor to sign-in', async ({ page }) => {
    await page.goto('/home');

    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 15_000 });
  });
});
