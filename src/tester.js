import { getApiKey } from "./config.js";
import { launchBrowser, extractElements } from "./browser.js";
import OpenAI from "openai";
import { runPlaywrightCode, snapshot, waitForPageToSettle } from "./utils/utils.js";
import { DRUNK_TESTER_PROMPT, ASSERTION_PROMPT } from "./utils/constants.js";
import { debug, error, log } from "./utils/logger.js";
import { getCachedCommands, saveCachedCommands } from "./cache.js";

export async function drunkTest(url, goal, assertText = null, existingPage = null) {
  const apiKey = await getApiKey();
  const client = new OpenAI({ apiKey });

  let browser = null;
  let page = existingPage;
  const shouldCloseBrowser = !existingPage;

  if (!page) {
    debug(`Launching browser and navigating to ${url}`);
    ({ browser, page } = await launchBrowser(url));
    try { await page.goto(url, { waitUntil: "domcontentloaded" }); } catch {}
  } else {
    debug(`Continuing in current session...`);
  }

  let { url: curUrl, visibleText, elements } = await snapshot(page);
  let lastResult = null;
  let noChangeCount = 0;
  const maxIters = assertText ? 15 : 30;
  const conversationHistory = [
    { role: "system", content: DRUNK_TESTER_PROMPT }
  ];
  const executedCommands = [];

  const cachedCommands = getCachedCommands(url, goal);
  if (cachedCommands && cachedCommands.length > 0) {
    log(`   ⚡ Using cached commands (${cachedCommands.length})`);
    debug(`Found ${cachedCommands.length} cached commands, trying them first...`);
    
    let cacheSuccess = true;
    for (const cmd of cachedCommands) {
      try {
        debug(`Cached command: ${cmd}`);
        await runPlaywrightCode(page, cmd);
        await waitForPageToSettle(page);
        executedCommands.push(cmd);
      } catch (err) {
        debug(`Cached command failed: ${err.message}`);
        cacheSuccess = false;
        break;
      }
    }
    
    if (cacheSuccess && assertText) {
      log(`   🔍 Verifying assertion...`);
      ({ url: curUrl, visibleText, elements } = await snapshot(page));
      const checkRes = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: ASSERTION_PROMPT },
          {
            role: "user",
            content: `
Assertion: "${assertText}"
URL: ${curUrl}
Visible Text: ${visibleText.slice(0, 4000)}
Elements: ${JSON.stringify((elements || []).slice(0, 100), null, 2)}
`
          }
        ]
      });
      
      const checkVerdict = (checkRes.choices[0].message.content || "").trim();
      const [status, ...reasonParts] = checkVerdict.split("\n");
      const reason = reasonParts.join("\n").trim();
      
      if (checkVerdict.toUpperCase().includes("PASS")) {
        debug("Assertion verdict: PASS");
        if (reason) debug(`Reason: ${reason}`);
        log(`   ✅ Assertion passed`);
        return true;
      } else {
        log(`   ❌ Cached assertion failed, retrying with AI...`);
        debug("Cached commands executed but assertion failed, using AI...");
        if (reason) debug(`Reason: ${reason}`);
      }
    } else if (cacheSuccess) {
      log(`   ✅ Commands executed successfully`);
      debug("Cached commands executed successfully!");
      return true;
    } else {
      log(`   ⚠️ Cache invalid, using AI...`);
      debug("Cached commands failed, falling back to AI...");
    }
  }

  for (let loopCount = 0; loopCount < maxIters; loopCount++) {
    const pageStructure = await page.evaluate(() => {
      const hasCalendar = document.querySelector('[class*="calendar"], [class*="rbc"], [role="grid"]') !== null;
      const hasTable = document.querySelector('table') !== null;
      const hasForm = document.querySelector('form') !== null;
      const hasModal = document.querySelector('[role="dialog"], .modal') !== null;
      const mainClasses = Array.from(document.querySelectorAll('[class*="calendar"], [class*="rbc"], [class*="grid"], [class*="schedule"]'))
        .map(el => el.className)
        .slice(0, 5);
      
      return {
        hasCalendar,
        hasTable,
        hasForm,
        hasModal,
        mainClasses: mainClasses.join(', ')
      };
    }).catch(() => ({}));

    conversationHistory.push({
          role: "user",
          content: `
Goal: ${goal}
Current URL: ${curUrl}
Page Structure: ${JSON.stringify(pageStructure)}
Last Result: ${JSON.stringify(lastResult)}
Visible Text: ${visibleText.slice(0, 5000)}
Known Elements: ${JSON.stringify((elements || []).slice(0, 120), null, 2)}

What is your next SINGLE command?`
    });

    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: conversationHistory
    });

    const code = (res.choices[0].message.content || "").trim();
    conversationHistory.push({ role: "assistant", content: code });
    
    if (code === "DONE") { 
      debug("AI decided it is done"); 
      break; 
    }

    if (code.startsWith("INSPECT:")) {
      const selector = code.replace("INSPECT:", "").trim();
      debug(`Inspecting elements: ${selector}`);
      
      try {
        const inspectInfo = await page.$$eval(selector, els => 
          els.slice(0, 20).map((el, idx) => ({
            index: idx,
            tag: el.tagName.toLowerCase(),
            id: el.id,
            class: el.className,
            text: (el.innerText || el.textContent || "").trim().slice(0, 100),
            attributes: Array.from(el.attributes).reduce((acc, attr) => {
              acc[attr.name] = attr.value;
              return acc;
            }, {}),
            isVisible: el.offsetParent !== null,
            rect: { x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y }
          }))
        );
        
        lastResult = { 
          inspected: inspectInfo,
          message: `Found ${inspectInfo.length} elements matching "${selector}"`
        };
        debug(`Found ${inspectInfo.length} elements`);
      } catch (err) {
        lastResult = { error: `Failed to inspect "${selector}": ${err.message}` };
      }
      continue;
    }

    if (code === "INSPECT_ALL") {
      debug("Getting full page content...");
      try {
        const fullText = await page.evaluate(() => document.body.innerText || "");
        lastResult = { 
          fullPageText: fullText.slice(0, 8000),
          message: "Full page text retrieved"
        };
      } catch (err) {
        lastResult = { error: `Failed to get full page: ${err.message}` };
      }
      continue;
    }

    debug(`Command ${loopCount + 1}:`, code);

    const prevUrl = curUrl;
    const prevElementCount = elements.length;
    let commandSucceeded = false;
    
    try {
      lastResult = await runPlaywrightCode(page, code);
      await waitForPageToSettle(page);
      
      const newSnapshot = await snapshot(page);
      ({ url: curUrl, visibleText, elements } = newSnapshot);
      
      const urlChanged = prevUrl !== curUrl;
      const elementsChanged = Math.abs(elements.length - prevElementCount) > 2;
      const hasError = lastResult && lastResult.error;
      
      if (!urlChanged && !elementsChanged && !hasError && code.includes('fill')) {
        lastResult = { success: "Input filled successfully" };
        noChangeCount = 0;
        commandSucceeded = true;
      } else if (!urlChanged && !elementsChanged && !hasError) {
        noChangeCount++;
        if (noChangeCount >= 2) {
          lastResult = { 
            error: "Command executed but no visible change detected. Try a different element or approach." 
          };
          debug(`No change detected ${noChangeCount} times - flagging as error`);
          commandSucceeded = false;
        } else {
          lastResult = lastResult || { success: "Command executed" };
          debug(`No major change detected (${noChangeCount})`);
          commandSucceeded = true;
        }
      } else {
        noChangeCount = 0;
        lastResult = lastResult || { success: "Command executed successfully" };
        commandSucceeded = true;
      }
    } catch (err) {
      debug("Execution failed:", err.message);
      lastResult = { error: `Command failed: ${err.message}. Try a different approach.` };
      if (/Target page, context or browser has been closed/i.test(err.message)) break;
      noChangeCount = 0;
      commandSucceeded = false;
    }
    
    if (commandSucceeded && !code.startsWith("INSPECT") && code !== "INSPECT_ALL") {
      executedCommands.push(code);
      debug(`Command saved to cache (total: ${executedCommands.length})`);
    }
    
    if (assertText && !lastResult?.error && loopCount > 0) {
      const checkRes = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: ASSERTION_PROMPT },
          {
            role: "user",
            content: `
Assertion: "${assertText}"
URL: ${curUrl}
Visible Text: ${visibleText.slice(0, 4000)}
Elements: ${JSON.stringify((elements || []).slice(0, 100), null, 2)}
`
          }
        ]
      });
      
      const checkVerdict = (checkRes.choices[0].message.content || "").trim();
      if (checkVerdict.toUpperCase().includes("PASS")) {
        debug("Goal achieved! Will verify and cache after final check.");
        break;
      } else {
        debug("Progressive check: Goal not yet achieved, continuing...");
      }
    }
  }

  let success = true;
  if (assertText) {
    const dom = await page.content().catch(() => "");
    const urlNow = page.url();
    const elementsFinal = await extractElements(page).catch(() => []);
    const vis = await page.evaluate(() => document.body.innerText || "").catch(() => "");

    const res2 = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: ASSERTION_PROMPT },
        {
          role: "user",
          content: `
Assertion: "${assertText}"
URL: ${urlNow}
Visible Text: ${vis.slice(0, 4000)}
Elements: ${JSON.stringify((elementsFinal || []).slice(0, 100), null, 2)}
DOM: ${dom.slice(0, 3000)}
`
        }
      ]
    });

    const verdictRaw = (res2.choices[0].message.content || "").trim();
    const [status, ...reasonParts] = verdictRaw.split("\n");
    const verdict = (status || "").toUpperCase();
    const reason = reasonParts.join("\n").trim();

    debug(`Assertion verdict: ${verdict}`);
    if (reason) debug(`Reason: ${reason}`);
    success = verdict.includes("PASS");
    
    if (success && executedCommands.length > 0) {
      saveCachedCommands(url, goal, executedCommands);
      debug(`Cached ${executedCommands.length} commands for future runs`);
    }
  }

  await page.waitForTimeout(200).catch(() => {});
  
  if (shouldCloseBrowser && browser) {
    await browser.close().catch(() => {});
  }
  
  return success;
}
