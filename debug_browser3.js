const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => console.log(`BROWSER CONSOLE: ${msg.type()}: ${msg.text()}`));

    page.on('request', request => {
        if (request.url().includes('/api/groups')) {
            console.log(`>> [REQ] ${request.method()} ${request.url()}`);
        }
    });

    page.on('response', async response => {
        if (response.url().includes('/api/groups')) {
            console.log(`<< [RES] ${response.status()} ${response.url()}`);
            if (!response.ok()) {
                try {
                    console.error(`   Body: ${await response.text()}`);
                } catch (e) { }
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

    // Get token and test directly
    const token = await page.evaluate(() => localStorage.getItem('token'));

    // Hardcoded group and paper ID from earlier logs
    const groupId = "966b7602-8e8a-450c-b029-301d3d59e0fe";
    const paperId = "0d35140a-c492-540f-a996-6c78651fbdac";

    await page.evaluate(async ({ groupId, paperId, token }) => {
        console.log("Directly testing summarize fetch...");
        try {
            const sumRes = await fetch(`http://localhost:3001/api/groups/${groupId}/papers/${paperId}/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({})
            });
            console.log("Summarize status:", sumRes.status);
            const text = await sumRes.text();
            console.log("Summary result:", text.substring(0, 100));
        } catch (e) {
            console.error("Summarize failed:", e.message, e.stack);
        }
    }, { groupId, paperId, token });

    await page.waitForTimeout(20000);
    console.log("Done.");
    await browser.close();
})();
