const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => console.log(`BROWSER CONSOLE: ${msg.type()}: ${msg.text()}`));

    page.on('request', request => {
        if (request.url().includes('/api/')) {
            console.log(`>> [REQ] ${request.method()} ${request.url()}`);
        }
    });

    page.on('response', async response => {
        if (response.url().includes('/api/')) {
            console.log(`<< [RES] ${response.status()} ${response.url()}`);
            if (!response.ok()) {
                try {
                    console.error(`   Body: ${await response.text()}`);
                } catch (e) { }
            }
        }
    });

    console.log("Creating new user...");
    await page.goto('http://localhost:3000/auth/signup');
    const userId = Date.now();
    await page.fill('input[type="text"]', `Test User ${userId}`);
    await page.fill('input[type="email"]', `test${userId}@example.com`);

    const pwInputs = await page.$$('input[type="password"]');
    await pwInputs[0].fill('password123');
    await pwInputs[1].fill('password123');

    await page.click('input[type="checkbox"]');
    await page.click('button[type="submit"]');

    console.log("Waiting for dashboard...");
    await page.waitForURL('http://localhost:3000/home', { timeout: 10000 });

    // Create group
    console.log("Creating group...");
    await page.click('button:has-text("Create Group")');
    await page.fill('input[placeholder="e.g., Quantum Computing Research"]', 'Playwright Group');
    await page.fill('textarea[placeholder="What is this group about?"]', 'Testing');
    await page.click('button[type="submit"]:has-text("Create Group")');

    await page.waitForURL(/\/group\?id=/, { timeout: 10000 });
    const groupId = page.url().split('id=')[1];
    console.log(`Group ID: ${groupId}`);

    console.log("Going to Discover papers...");
    await page.click('a[href="/papers"]:has-text("Papers")');

    console.log("WAITING for trending papers to load...");
    await page.waitForTimeout(3000);

    console.log("Adding paper to group...");
    const addToGroupBtn = page.getByRole('button', { name: "Add to Group" }).first();
    await addToGroupBtn.waitFor({ state: 'visible' });
    await addToGroupBtn.click();

    // Select group
    const groupOption = page.locator(`button:has-text("Playwright Group")`);
    await groupOption.waitFor({ state: 'visible' });
    await groupOption.click();

    console.log("Waiting for Add paper to succeed...");
    await page.waitForTimeout(3000);

    console.log("Navigating back to group...");
    await page.click('a[href="/home"]:has-text("Groups")');
    await page.click('text="Playwright Group"');
    await page.waitForURL(/\/group\?id=/, { timeout: 10000 });

    console.log("Opening Group Papers...");
    await page.click('button:has-text("Papers")');
    await page.waitForTimeout(2000);

    console.log("Clicking Summarize on the paper...");
    const summarizeBtn = page.getByRole('button', { name: /Summarize/i }).first();
    await summarizeBtn.waitFor({ state: 'visible' });
    await summarizeBtn.click();

    console.log("Clicked Summarize! Waiting up to 90 seconds...");
    await page.waitForTimeout(90000);

    console.log("Checking UI state...");
    const modalText = await page.content();
    if (modalText.includes("Generating summary")) {
        console.log("Still generating summary...");
    } else if (modalText.includes("AI Response")) {
        console.log("SUCCESS! AI Response rendered!");
    } else {
        console.log("Modal text neither matched generator nor response");
    }

    await browser.close();
})();
