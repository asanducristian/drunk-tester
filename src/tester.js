import { launchBrowser } from "./browser.js";
import { sleep, snapshotFullBody, htmlToJSON, cleanAIResponse, runAICommands, computePageDiff, formatDiffForAI } from "./utils/utils.js";
import { debug, error, log } from "./utils/logger.js";
import { askAI, assertGoal } from "./utils/ai-utils.js";
import MessageHistory from "./utils/messageHistory.js";

export async function drunkTest(url, goal, assertText = null, existingPage = null, isComplex = false) {
  let browser = null;
  let page = existingPage;
  const shouldCloseBrowser = !existingPage;

  if (!page) {
    debug(`Launching browser and navigating to ${url}`);
    ({ browser, page } = await launchBrowser(url));
    try { await page.goto(url, { waitUntil: "domcontentloaded" }); } catch { }
  } else {
    debug(`Continuing in current session...`);
  }

  let attempts = 0;
  const maxAttempts = 20;

  if (isComplex) {
    console.log("\n🔧 COMPLEX MODE ENABLED - AI will output ONE command at a time\n");
  }

  const { url: pageUrl, visibleText } = await snapshotFullBody(page);
  const domJSON = await htmlToJSON(page);

  let previousPageState = {
    url: pageUrl,
    visibleText: visibleText,
    domJSON: domJSON
  };

  if (isComplex) {
    MessageHistory.addSystem(`
🚨 CRITICAL: COMPLEX MODE ENABLED 🚨

You MUST output ONLY ONE SINGLE COMMAND at a time.
Your response must be a JSON array with EXACTLY ONE item.

Example (correct):
[
  {
    "type": "playwright",
    "command": "page.click",
    "args": ["button#submit"]
  }
]

DO NOT output multiple commands!
`);
  }

  console.log("📤 Sending FULL page state (first request)");
  MessageHistory.addUser(`
URL: ${pageUrl}
Goal: ${goal}

DOM Structure (JSON):
${JSON.stringify(domJSON)}

Visible Text:
${visibleText}
`);

  while (attempts < maxAttempts) {
    attempts++;

    const aiResponse = await askAI();
    console.log("\nAI Response:", aiResponse);

    let commands;
    try {
      const cleaned = cleanAIResponse(aiResponse);
      commands = JSON.parse(cleaned);
      
      if (isComplex && Array.isArray(commands) && commands.length > 1) {
        console.error(`\n❌❌❌ COMPLEX MODE VIOLATION ❌❌❌`);
        console.error(`AI returned ${commands.length} commands instead of 1!`);
        console.error(`Complex mode is: ${isComplex}`);
        
        MessageHistory.addAssistant(aiResponse);
        MessageHistory.addUser(`
🚨🚨🚨 CRITICAL ERROR 🚨🚨🚨

You returned ${commands.length} commands, but COMPLEX MODE requires EXACTLY ONE command per response.

You MUST return a JSON array with EXACTLY ONE item like this:
[
  {
    "type": "playwright",
    "command": "page.click",
    "args": ["selector"]
  }
]

Try again with ONLY ONE command!
`);
        continue;
      }
      
      MessageHistory.addAssistant(aiResponse);
    } catch (err) {
      console.error("❌ Failed to parse AI response as JSON:", err);
      console.error("Response was:", aiResponse);
      MessageHistory.addError(err.message);

      const { url: updatedPageUrl, visibleText: updatedVisibleText } = await snapshotFullBody(page);
      const updatedDomJSON = await htmlToJSON(page);
      
      const currentPageState = {
        url: updatedPageUrl,
        visibleText: updatedVisibleText,
        domJSON: updatedDomJSON
      };

      const pageDiff = computePageDiff(previousPageState, currentPageState);
      const diffMessage = formatDiffForAI(pageDiff, goal);

      console.log("📤 Sending DIFF after parse error");
      
      MessageHistory.addUser(`
Failed to parse your response. Please output valid JSON.

PAGE CHANGES:${diffMessage}

Current URL: ${updatedPageUrl}
`);

      previousPageState = currentPageState;
      continue;
    }

    try {
      await runAICommands(page, commands);
      await sleep(1000);

      const goalAchieved = await assertGoal(page, goal, assertText);

      if (goalAchieved) {
        console.log(`\n✅ Goal successfully achieved!`);
        MessageHistory.reset();
        if (shouldCloseBrowser && browser) {
          await browser.close().catch(() => { });
        }
        return true;
      }

      console.log(`\n⏳ Goal not yet achieved, getting updated page state... (attempt ${attempts}/${maxAttempts})`);
      
      const { url: updatedPageUrl, visibleText: updatedVisibleText } = await snapshotFullBody(page);
      const updatedDomJSON = await htmlToJSON(page);

      const currentPageState = {
        url: updatedPageUrl,
        visibleText: updatedVisibleText,
        domJSON: updatedDomJSON
      };

      const pageDiff = computePageDiff(previousPageState, currentPageState);
      const diffMessage = formatDiffForAI(pageDiff, goal);

      console.log("📤 Sending DIFF (incremental changes only)");
      
      MessageHistory.addUser(`
Commands executed successfully, but goal not yet achieved.

PAGE CHANGES:${diffMessage}

Current URL: ${updatedPageUrl}

What's the next step to achieve the goal: ${goal}?
${assertText ? `Remember to verify: ${assertText}` : ''}
`);

      previousPageState = currentPageState;

    } catch (err) {
      console.error(`❌ Execution failed on attempt ${attempts}:`, err.message);
      MessageHistory.addError(err.message);
      
      const { url: updatedPageUrl, visibleText: updatedVisibleText } = await snapshotFullBody(page);
      const updatedDomJSON = await htmlToJSON(page);
      
      const currentPageState = {
        url: updatedPageUrl,
        visibleText: updatedVisibleText,
        domJSON: updatedDomJSON
      };

      const pageDiff = computePageDiff(previousPageState, currentPageState);
      const diffMessage = formatDiffForAI(pageDiff, goal);

      console.log("📤 Sending DIFF after error");
      
      MessageHistory.addUser(`
Last command failed with error: ${err.message}
Try a different approach.

PAGE CHANGES:${diffMessage}

Current URL: ${updatedPageUrl}
`);

      previousPageState = currentPageState;
    }
  }

  console.error(`\n❌ Max attempts (${maxAttempts}) reached without achieving goal`);
  MessageHistory.reset();
  
  await sleep(2000);

  if (shouldCloseBrowser && browser) {
    await browser.close().catch(() => { });
  }

  return false;
}