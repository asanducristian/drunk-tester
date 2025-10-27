import { getApiKey } from "../config.js";
import OpenAI from "openai";
import MessageHistory from "./messageHistory.js";
import { snapshotFullBody, htmlToJSON } from "./utils.js";

export async function askAI() {
  const apiKey = await getApiKey();
  const client = new OpenAI({ apiKey });

  console.log("Messages:", MessageHistory.getMessages());
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: MessageHistory.getMessages()
  });

  return res.choices[0].message.content;
}

export async function assertGoal(page, goal, assertText = null) {
  const apiKey = await getApiKey();
  const client = new OpenAI({ apiKey });

  const { url, visibleText } = await snapshotFullBody(page);
  const domJSON = await htmlToJSON(page);

  const assertionMessages = [
    {
      role: "system",
      content: `You are a test assertion evaluator. Your job is to determine if a test goal has been achieved based on the current page state.

You will receive:
- The original goal
- The assertion to verify (if any)
- Current page URL
- Current visible text
- Current DOM structure

Respond with ONLY a JSON object in this format:
{
  "achieved": true/false,
  "reason": "Brief explanation why goal is/isn't achieved"
}

Be semantic and flexible in your evaluation:
- For login goals: Check if URL changed to dashboard/home or if page shows "welcome" or user info
- For selection goals: Check if the selected value appears in the visible text or URL
- For navigation goals: Check if URL or page heading changed appropriately
- For form goals: Check if form/modal appeared or data was submitted

Be OPTIMISTIC - if the goal appears to be substantially achieved, mark it as true.`
    },
    {
      role: "user",
      content: `
Goal: ${goal}
${assertText ? `Assertion: ${assertText}` : ''}

Current page state:
URL: ${url}

Visible Text:
${visibleText}

DOM Structure (JSON):
${JSON.stringify(domJSON)}

Has the goal been achieved?`
    }
  ];

  console.log("\n🔍 Checking if goal is achieved...");
  
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: assertionMessages
  });

  const response = res.choices[0].message.content.trim();
  console.log("Assertion response:", response);

  try {
    const cleaned = response.replace(/^```json\n?/i, "").replace(/\n?```$/i, "").trim();
    const result = JSON.parse(cleaned);
    
    console.log(result.achieved ? `✅ ${result.reason}` : `⏳ ${result.reason}`);
    
    return result.achieved;
  } catch (err) {
    console.error("Failed to parse assertion response:", err);
    return false;
  }
}
