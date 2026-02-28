const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Listen to all console logs
    page.on('console', msg => console.log(`BROWSER CONSOLE: ${msg.type()}: ${msg.text()}`));

    // Listen to all network requests
    page.on('request', request => {
        if (request.url().includes('/api/groups')) {
            console.log(`>> [REQ] ${request.method()} ${request.url()}`);
        }
    });

    page.on('response', async response => {
        if (response.url().includes('/api/groups')) {
            console.log(`<< [RES] ${response.status()} ${response.url()}`);
            if (!response.ok()) {
                console.error(`   Body: ${await response.text()}`);
            }
        }
    });

    console.log("Navigating to login...");
    await page.goto('http://localhost:3000/auth/signin');

    await page.fill('input[type="email"]', 'track3_final@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    console.log("Waiting for dashboard...");
    await page.waitForURL('http://localhost:3000/home');

    console.log("Going to group...");
    // Find group link
    await page.click('a[href^="/group?id="]');

    console.log("Waiting for group papers...");
    await page.click('text="Papers"');
    await page.waitForTimeout(2000);

    console.log("Clicking Summarize on the first paper...");
    const summarizeBtn = page.getByRole('button', { name: /Summarize/i }).first();
    await summarizeBtn.waitFor({ state: 'visible' });
    await summarizeBtn.click();

    console.log("Clicked! Waiting 15 seconds to observe network...");
    await page.waitForTimeout(15000);

    console.log("Done.");
    await browser.close();
})();
