#!/usr/bin/env node

import { runFileTests, runSingleTest } from "../src/runner.js";
import { setVerbose } from "../src/utils/logger.js";
import { clearCache } from "../src/cache.js";

const args = process.argv.slice(2);
const isVerbose = args.includes("--verbose");

if (isVerbose) {
  setVerbose(true);
  args.splice(args.indexOf("--verbose"), 1);
}

let specificFile = null;
const fileIndex = args.indexOf("--file");
if (fileIndex !== -1) {
  specificFile = args[fileIndex + 1];
  args.splice(fileIndex, 2);
}

const [command, arg1, arg2] = args;

if (command === "run") {
  if (arg1 && arg2) {
    await runSingleTest(arg1, arg2);
  } else {
    await runFileTests(specificFile);
  }
} else if (command === "clear-cache") {
  if (clearCache()) {
    console.log("✅ Cache cleared successfully");
  } else {
    console.log("❌ Failed to clear cache");
  }
} else {
  console.log("Usage:");
  console.log("  drunk-tester run [--verbose] [--file <path>]");
  console.log("  drunk-tester run <url> <goal> [--verbose]");
  console.log("  drunk-tester clear-cache");
  console.log("");
  console.log("Examples:");
  console.log("  drunk-tester run");
  console.log("  drunk-tester run --file tests/initial.test.drunk");
  console.log("  drunk-tester run --verbose --file tests/initial.test.drunk");
  console.log("  drunk-tester clear-cache");
}
