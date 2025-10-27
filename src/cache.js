import fs from "fs";
import path from "path";
import crypto from "crypto";

const CACHE_DIR = path.resolve(".drunk-cache");

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    createPlaywrightConfig();
  }
}

function createPlaywrightConfig() {
  const configPath = path.join(CACHE_DIR, 'playwright.config.js');
  if (fs.existsSync(configPath)) return;
  
  const config = `import { defineConfig } from '@playwright/test';

/**
 * Playwright config for drunk-tester generated tests
 * Run these tests with: npx playwright test --config=.drunk-cache/playwright.config.js
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
`;
  
  fs.writeFileSync(configPath, config, 'utf8');
  
  const readmePath = path.join(CACHE_DIR, 'README.md');
  const readme = `# Drunk Tester - Generated Playwright Tests

This directory contains auto-generated Playwright test files from successful drunk-tester runs.

## Running the Tests

Run all generated tests:
\`\`\`bash
npx playwright test --config=.drunk-cache/playwright.config.js
\`\`\`

Run a specific test:
\`\`\`bash
npx playwright test .drunk-cache/<hash>.spec.js
\`\`\`

Run with UI:
\`\`\`bash
npx playwright test --config=.drunk-cache/playwright.config.js --ui
\`\`\`

## Test Format

Each \`.spec.js\` file contains:
- **Goal**: The original test goal from your \`.drunk\` file
- **URL**: The target URL
- **Commands**: The exact Playwright commands that successfully completed the test

## Maintenance

- These tests are cached versions of successful runs
- Re-run \`drunk-tester\` to regenerate/update tests
- Clear cache with: \`drunk-tester clear-cache\`
`;
  
  fs.writeFileSync(readmePath, readme, 'utf8');
}

function getCacheKey(url, goal) {
  const hash = crypto.createHash("md5").update(`${url}:${goal}`).digest("hex");
  return path.join(CACHE_DIR, `${hash}.json`);
}

export function getCachedCommands(url, goal) {
  try {
    ensureCacheDir();
    const cacheFile = getCacheKey(url, goal);
    
    if (fs.existsSync(cacheFile)) {
      const data = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      return data.commands || null;
    }
  } catch (err) {
    return null;
  }
  return null;
}

export function saveCachedCommands(url, goal, commands) {
  try {
    ensureCacheDir();
    const cacheFile = getCacheKey(url, goal);
    
    const data = {
      url,
      goal,
      commands,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
    
    const hash = crypto.createHash("md5").update(`${url}:${goal}`).digest("hex");
    const testFilePath = path.join(CACHE_DIR, `${hash}.spec.js`);
    const testName = goal.slice(0, 80).replace(/'/g, "\\'");
    const timestamp = new Date().toISOString();
    
    const playwrightTest = `import { test, expect } from '@playwright/test';

/**
 * Auto-generated test from drunk-tester
 * Goal: ${goal}
 * URL: ${url}
 * Generated: ${timestamp}
 */
test('${testName}', async ({ page }) => {
  // Navigate to the page
  await page.goto('${url}');
  
  // Execute test commands
${commands.map(cmd => `  ${cmd}`).join('\n')}
  
  // Test completed successfully
});
`;
    
    fs.writeFileSync(testFilePath, playwrightTest, 'utf8');
    return true;
  } catch (err) {
    console.error("Failed to save cache:", err.message);
    return false;
  }
}

export function clearCache() {
  try {
    if (fs.existsSync(CACHE_DIR)) {
      const files = fs.readdirSync(CACHE_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(CACHE_DIR, file));
      }
    }
    return true;
  } catch (err) {
    console.error("Failed to clear cache:", err.message);
    return false;
  }
}

