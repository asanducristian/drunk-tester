import fs from "fs";
import path from "path";
import crypto from "crypto";

const CACHE_DIR = path.resolve(".drunk-cache");

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
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

