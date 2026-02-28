const { chromium } = require('playwright');
const fs = require('fs');

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
        if (response.url().includes('/api/') && response.request().method() === 'POST') {
            console.log(`<< [RES] ${response.status()} ${response.url()}`);
        }
    });

    console.log("Navigating to login...");
    await page.goto('http://localhost:3000/auth/signin');

    await page.fill('input[type="email"]', 'track3_final@example.com');
    const pwInputs = await page.$$('input[type="password"]');
    await pwInputs[0].fill('password123');
    await page.click('button[type="submit"]');

    console.log("Waiting for dashboard...");
    await page.waitForURL('http://localhost:3000/home', { timeout: 10000 });

    console.log("Navigating to Discover Papers...");
    await page.waitForTimeout(2000);
    await page.goto('http://localhost:3000/paper', { waitUntil: 'networkidle' });

    console.log("Waiting for search bar...");
    await page.waitForTimeout(2000);
    const searchInput = await page.$('input[placeholder="Search papers by title, author, or content..."]');
    if (searchInput) {
        await searchInput.fill('attention');
        await searchInput.press('Enter');
    }

    console.log("Waiting for search results...");
    await page.waitForTimeout(3000);

    console.log("Saving the first paper to the group...");
    const saveButtons = await page.$$('button:has-text("Save")');
    if (saveButtons.length > 0) {
        let isSaved = await saveButtons[0].innerText();
        if (isSaved.includes('Saved')) {
            console.log("Paper already saved. Continuing...");
        } else {
            await saveButtons[0].click();
            await page.waitForTimeout(1000);
            const groupOptions = await page.$$('button:has-text("Final Analysis Group")');
            if (groupOptions.length > 0) {
                await groupOptions[0].click();
                console.log("Clicked group option!");
            } else {
                console.log("Could not find group in dropdown.");
                return page.content().then(html => fs.writeFileSync('debug_dom_dropdown.html', html));
            }
        }
    }

    console.log("Navigating back to Home...");
    await page.goto('http://localhost:3000/home', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log("Locating 'Final Analysis Group'...");
    const groups = await page.$$('a[href^="/group?id="]');
    if (groups.length > 0) {
        await groups[0].click();
    } else {
        console.log("Group link not found.");
    }

    console.log("Waiting for group page...");
    await page.waitForURL(/\/group\?id=/, { timeout: 10000 });
    await page.waitForTimeout(2000);

    console.log("Locating Papers tab...");
    const papersLinks = await page.$$('a[href^="/group-papers?groupId="]');
    if (papersLinks.length > 0) {
        await papersLinks[0].click();
    } else {
        console.log("Papers link not found.");
    }

    console.log("Waiting for group-papers page...");
    await page.waitForURL(/\/group-papers\?groupId=/, { timeout: 10000 });
    await page.waitForTimeout(2000);

    console.log("Waiting 10s for Next.js hydration to complete...");
    await page.waitForTimeout(10000);

    console.log("Finding Summarize button...");
    const summarizeBtn = page.getByRole('button', { name: /Summarize/i }).first();
    await summarizeBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(e => {
        console.error("Could not find summarize button. Dumping page text:");
        return page.content().then(html => fs.writeFileSync('debug_dom.html', html));
    });

    if (await summarizeBtn.isVisible()) {
        console.log("Button innerHTML:", await summarizeBtn.innerHTML());
        console.log("Clicking Summarize!");
        await page.evaluate(() => console.log("TEST CONSOLE EVAL"));
        await summarizeBtn.evaluate(b => b.click());

        console.log("Clicked! Waiting up to 90 seconds for ReactMarkdown to render...");

        let found = false;
        // Check every 3 seconds for UI changes
        for (let i = 0; i < 30; i++) {
            await page.waitForTimeout(3000);
            const modalText = await page.content();
            if (modalText.includes("AI Response")) {
                console.log(">>> SUCCESS! Found 'AI Response' in DOM. Assuming rendered.");
                const aiArea = await page.evaluate(() => {
                    const aiLabel = Array.from(document.querySelectorAll('span')).find(el => el.textContent === 'AI Response');
                    if (aiLabel && aiLabel.parentElement && aiLabel.parentElement.parentElement) {
                        return aiLabel.parentElement.parentElement.innerText.replace(/\n+/g, ' ').substring(0, 300);
                    }
                    return null;
                });
                console.log("Rendered text:", aiArea);
                found = true;
                break;
            } else if (modalText.includes("Failed to generate summary")) {
                console.log(">>> FOUND ERROR TOAST IN DOM!");
                break;
            }
        }

        if (!found) {
            console.log("Timed out waiting for response. Taking screenshot just in case.");
        }
    }

    await page.screenshot({ path: 'final_ui_test.png' });
    console.log("Screenshot saved to final_ui_test.png");

    console.log("Test complete.");
    await browser.close();
})();
