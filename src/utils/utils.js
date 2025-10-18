import { launchBrowser, extractElements } from "../browser.js";
export async function runPlaywrightCode(page, code) {
    code = code.replace(/```[a-z]*\n?/gi, "").replace(/```$/, "").trim();

    const fn = new Function("page", `
        return (async () => {
            ${code}
        })();
    `);
    return fn(page);
}

export async function snapshotFirst(page) {
    const [url, visibleText] = await Promise.all([
        page.url(),
        page.evaluate(() => document.body.innerText || "")
    ]);
    const elements = await extractElements(page).catch(() => []);
    return { url, visibleText, elements };
}


export async function waitForPageToSettle(page, timeout = 500) {
    try {
      const navPromise = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout }).catch(() => null);
      const loadPromise = page.waitForLoadState("networkidle", { timeout }).catch(() => null);
  
      await Promise.all([
        navPromise,
        loadPromise,
        page.waitForTimeout(500)
      ]);
    } catch {
      await page.waitForTimeout(500);
    }
  }
  
  export async function snapshot(page) {
    const url = page.url();
    const visibleText = await page.evaluate(() => document.body.innerText || "").catch(() => "");
    const elements = await page.$$eval("input, button, a, select, textarea, [role='combobox'], [role='button'], [aria-haspopup], [aria-expanded], [role='gridcell'], [class*='calendar'], [class*='rbc'], [class*='slot'], [class*='event']", els =>
      els.map(el => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type"),
        id: el.id,
        name: el.getAttribute("name"),
        role: el.getAttribute("role"),
        ariaExpanded: el.getAttribute("aria-expanded"),
        ariaHasPopup: el.getAttribute("aria-haspopup"),
        text: (el.innerText || "").trim().slice(0, 50),
        placeholder: el.getAttribute("placeholder"),
        className: el.className?.split(' ').slice(0, 2).join(' '),
        selector: el.id
          ? `#${el.id}`
          : el.name
          ? `[name="${el.name}"]`
          : el.getAttribute("role")
          ? `[role="${el.getAttribute("role")}"]`
          : el.getAttribute("aria-haspopup")
          ? `[aria-haspopup="${el.getAttribute("aria-haspopup")}"]`
          : el.getAttribute("type")
          ? `${el.tagName.toLowerCase()}[type="${el.getAttribute("type")}"]`
          : el.className
          ? `.${el.className.split(' ')[0]}`
          : el.tagName.toLowerCase()
      }))
    ).catch(() => []);
  
    return { url, visibleText, elements };
  }