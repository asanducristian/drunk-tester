import fs from "fs";
import os from "os";
import path from "path";
import inquirer from "inquirer";
import { log } from "./utils/logger.js";

const CONFIG_PATH = path.join(os.homedir(), ".drunk-tester", "config.json");

export async function getApiKey() {
  if (fs.existsSync(CONFIG_PATH)) {
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    if (data.OPENAI_API_KEY) return data.OPENAI_API_KEY;
  }

  const { apiKey } = await inquirer.prompt([
    { type: "password", name: "apiKey", message: "Enter your OpenAI API key:", mask: "*" }
  ]);

  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ OPENAI_API_KEY: apiKey }, null, 2));
  log("API key saved in", CONFIG_PATH);

  return apiKey;
}
