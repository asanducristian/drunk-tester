import fs from "fs";
import path from "path";
import { drunkTest } from "./tester.js";
import { launchBrowser } from "./browser.js";
import { log, error, debug } from "./utils/logger.js";

const TEST_DIR = path.resolve("tests");

/**
 * Run all .drunk test files in /tests or a specific file
 * @param {string} specificFile - Optional path to a specific test file
 */
export async function runFileTests(specificFile = null) {
    let files;
    
    if (specificFile) {
        const filePath = path.resolve(specificFile);
        if (!fs.existsSync(filePath)) {
            error(`\n❌ File not found: ${specificFile}\n`);
            return;
        }
        files = [path.basename(filePath)];
        const fileDir = path.dirname(filePath);
        if (fileDir !== TEST_DIR) {
            files = [filePath];
        }
    } else {
        files = fs.readdirSync(TEST_DIR).filter(f => f.endsWith(".drunk")).map(f => path.join(TEST_DIR, f));
    }
    
    const failedTests = [];

    for (const filePath of files) {
        const file = path.basename(filePath);
        const fullPath = filePath.includes(path.sep) ? filePath : path.join(TEST_DIR, filePath);
        const content = fs.readFileSync(fullPath, "utf8").trim();
        const lines = content.split("\n");

        let url = "http://localhost:3000";
        const steps = [];
        let currentGoal = null;

        for (const line of lines) {
            if (line.startsWith("url:")) {
                url = line.replace("url:", "").trim();
            } else if (line.startsWith("goal:")) {
                if (currentGoal) steps.push(currentGoal);
                currentGoal = { goal: line.replace("goal:", "").trim(), assert: null, complex: false };
            } else if (line.startsWith("assert:") && currentGoal) {
                currentGoal.assert = line.replace("assert:", "").trim();
            } else if (line.startsWith("complex:") && currentGoal) {
                currentGoal.complex = line.replace("complex:", "").trim().toLowerCase() === "true";
            }
        }
        if (currentGoal) steps.push(currentGoal);

        log(`\n${file}`);
        debug(`   URL: ${url}`);
        debug(`   ${steps.length} step${steps.length !== 1 ? 's' : ''}`);

        debug(`\nLaunching browser...`);
        const { browser, page } = await launchBrowser(url);
        
        try {
            await page.goto(url, { waitUntil: "domcontentloaded" });
        } catch {}

        let allPassed = true;

        for (let i = 0; i < steps.length; i++) {
            const { goal, assert, complex } = steps[i];
            debug(`\n   Step ${i + 1}: ${goal}`);
            if (assert) debug(`   Assert: ${assert}`);
            if (complex) debug(`   Complex mode: enabled`);

            const success = await drunkTest(url, goal, assert, page, complex);
            if (success) {
                log(`   ✅ Step ${i + 1}`);
            } else {
                error(`   ❌ Step ${i + 1}: ${goal}`);
                failedTests.push({ file, step: i + 1, goal });
                allPassed = false;
            }
        }

        if (allPassed) {
            log(`   ✅ All tests passed\n`);
        } else {
            log(`   ❌ Some tests failed\n`);
        }
        await browser.close().catch(() => {});
    }

    if (failedTests.length > 0) {
        log(`\n${"=".repeat(50)}`);
        log(`Failed Tests Summary:`);
        log(`${"=".repeat(50)}`);
        for (const { file, step, goal } of failedTests) {
            error(`❌ ${file} - Step ${step}: ${goal}`);
        }
        log(`${"=".repeat(50)}`);
        log(`Total: ${failedTests.length} test${failedTests.length !== 1 ? 's' : ''} failed\n`);
    }
}

/**
 * Run a single test directly from CLI
 */
export async function runSingleTest(url, goal, assertText = null) {
    log(`\nSingle test: ${goal}`);
    debug(`   URL: ${url}`);
    if (assertText) debug(`   Assert: ${assertText}`);
    
    const success = await drunkTest(url, goal, assertText);
    if (success) {
        log(`✅ Passed\n`);
    } else {
        error(`❌ Failed\n`);
    }
}

