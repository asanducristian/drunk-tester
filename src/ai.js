import OpenAI from "openai";
import { debug } from "./utils/logger.js";

export async function askAI(apiKey, elements, goal) {
  const client = new OpenAI({ apiKey });

  debug("Sending to AI:\n", JSON.stringify({ elements, goal }, null, 2));

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
You are DrunkTester. 
You already have a Playwright "page" object in scope. 
Your ONLY job: output raw valid Playwright JavaScript commands that will move toward the given goal.
Use only the provided selectors. 
Do NOT add explanations. Do NOT wrap in Markdown. Output executable code only.`
      },
      { role: "user", content: JSON.stringify({ elements, goal }) }
    ]
  });

  return res.choices[0].message.content.trim();
}
