import { launchBrowser, extractElements } from "../browser.js";


export async function runAICommands(page, commands) {
  for (const step of commands) {
    switch (step.type) {
      case "playwright": {
        const [object, action] = step.command.split(".");

        if (object !== "page") {
          throw new Error(`Unsupported object: ${object}`);
        }

        if (typeof page[action] !== "function") {
          throw new Error(`Unknown Playwright command: ${step.command}`);
        }

        console.log(`▶ Running: page.${action}(${step.args.map(a => JSON.stringify(a)).join(", ")})`);
        await page[action](...step.args);
        break;
      }

      case "internal": {
        if (step.command === "sleep") {
          const ms = step.args[0] || 1000;
          console.log(`⏸ Sleeping for ${ms}ms`);
          await new Promise(res => setTimeout(res, ms));
        } else {
          throw new Error(`Unknown internal command: ${step.command}`);
        }
        break;
      }

      default:
        throw new Error(`Unsupported step type: ${step.type}`);
    }
  }
}

export async function snapshotFullBody(page) {
  const url = page.url();
  const visibleText = await page.evaluate(() => document.body.innerText || "").catch(() => "");

  return { url, visibleText };
}

export async function htmlToJSON(page, maxDepth = 10) {
  return await page.evaluate((depth) => {
    function elementToJSON(element, currentDepth) {
      if (currentDepth > depth) return null;
      if (!element || element.nodeType !== 1) return null;

      const obj = {
        tag: element.tagName.toLowerCase(),
        attributes: {},
      };

      for (const attr of element.attributes) {
        obj.attributes[attr.name] = attr.value;
      }

      const directText = Array.from(element.childNodes)
        .filter(node => node.nodeType === 3)
        .map(node => node.textContent.trim())
        .filter(text => text.length > 0)
        .join(' ');

      if (directText) {
        obj.text = directText;
      }

      const children = [];
      for (const child of element.children) {
        const childJSON = elementToJSON(child, currentDepth + 1);
        if (childJSON) {
          children.push(childJSON);
        }
      }

      if (children.length > 0) {
        obj.children = children;
      }

      return obj;
    }

    return elementToJSON(document.body, 0);
  }, maxDepth).catch(() => null);
}


export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export function cleanAIResponse(aiResponse) {
  return aiResponse
    .trim()
    .replace(/^```(json)?/i, "")   // remove starting ``` or ```json
    .replace(/```$/, "");          // remove ending ```
}

export function computePageDiff(prevState, currentState) {
  const diff = {
    urlChanged: prevState.url !== currentState.url,
    textChanges: [],
    elementChanges: {
      added: [],
      removed: []
    }
  };

  if (diff.urlChanged) {
    diff.newUrl = currentState.url;
  }

  const prevTextLines = prevState.visibleText.split('\n').map(l => l.trim()).filter(l => l);
  const currTextLines = currentState.visibleText.split('\n').map(l => l.trim()).filter(l => l);

  const prevTextSet = new Set(prevTextLines);
  const currTextSet = new Set(currTextLines);

  diff.textChanges = {
    added: currTextLines.filter(line => !prevTextSet.has(line)).slice(0, 50),
    removed: prevTextLines.filter(line => !currTextSet.has(line)).slice(0, 50)
  };

  const prevDOMStr = JSON.stringify(prevState.domJSON);
  const currDOMStr = JSON.stringify(currentState.domJSON);

  if (prevDOMStr !== currDOMStr) {
    diff.elementChanges = {
      summary: "DOM structure changed",
      sizeChange: currDOMStr.length - prevDOMStr.length
    };
  }

  return diff;
}

export function formatDiffForAI(diff, goal = null) {
  let message = '';

  if (diff.urlChanged) {
    message += `\n🔄 URL CHANGED: ${diff.newUrl}\n`;
  }

  if (diff.textChanges.added.length > 0) {
    message += `\n➕ TEXT ADDED (${diff.textChanges.added.length} lines):\n`;
    
    const addedText = diff.textChanges.added.slice(0, 20);
    
    if (goal) {
      const goalLower = goal.toLowerCase();
      const conflictingActions = {
        'add': ['delete', 'remove'],
        'create': ['delete', 'remove'],
        'delete': ['add', 'create'],
        'remove': ['add', 'create'],
        'edit': ['delete', 'remove'],
        'update': ['delete', 'remove']
      };
      
      for (const [goalAction, conflictWords] of Object.entries(conflictingActions)) {
        if (goalLower.includes(goalAction)) {
          const hasConflict = addedText.some(line => 
            conflictWords.some(word => line.toLowerCase().includes(word))
          );
          
          if (hasConflict) {
            message += `   ⚠️ WARNING: Goal is "${goalAction}" but detected "${conflictWords.join('/')}" text\n`;
            message += `   This might be the wrong action! Consider using recovery commands.\n`;
          }
          break;
        }
      }
    }
    
    const hasErrors = addedText.some(line => 
      ['error', 'failed', 'invalid'].some(kw => line.toLowerCase().includes(kw))
    );
    
    if (hasErrors) {
      message += `   ⚠️ ERROR detected in new text - your action may have failed\n`;
    }
    
    addedText.forEach(line => {
      message += `   "${line}"\n`;
    });
    if (diff.textChanges.added.length > 20) {
      message += `   ... and ${diff.textChanges.added.length - 20} more lines\n`;
    }
  }

  if (diff.textChanges.removed.length > 0) {
    message += `\n➖ TEXT REMOVED (${diff.textChanges.removed.length} lines):\n`;
    diff.textChanges.removed.slice(0, 20).forEach(line => {
      message += `   "${line}"\n`;
    });
    if (diff.textChanges.removed.length > 20) {
      message += `   ... and ${diff.textChanges.removed.length - 20} more lines\n`;
    }
  }

  if (diff.elementChanges && diff.elementChanges.summary) {
    message += `\n📊 DOM CHANGES: ${diff.elementChanges.summary}\n`;
    message += `   Size change: ${diff.elementChanges.sizeChange > 0 ? '+' : ''}${diff.elementChanges.sizeChange} bytes\n`;
    
    if (diff.elementChanges.sizeChange > 5000) {
      message += `   ℹ️ Large increase suggests a modal or new section appeared\n`;
    } else if (diff.elementChanges.sizeChange < -5000) {
      message += `   ℹ️ Large decrease suggests a modal closed or section removed\n`;
    }
  }

  if (!diff.urlChanged && diff.textChanges.added.length === 0 && diff.textChanges.removed.length === 0) {
    message += `\n⚠️ NO VISIBLE CHANGES detected on the page\n`;
    message += `   This might mean: 1) Wrong selector, 2) Element not clickable, 3) Page still loading\n`;
  }

  return message;
}