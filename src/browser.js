import { chromium } from "playwright";

export async function launchBrowser(url) {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(url);
  return { browser, page };
}

export async function extractElements(page) {
  return await page.$$eval("input, button, a, select, [role='combobox'], [role='button'], [aria-haspopup], [aria-expanded], [role='gridcell'], [class*='calendar'], [class*='rbc'], [class*='slot'], [class*='event']", els =>
    els.map(el => {
      const id = el.id;
      const name = el.getAttribute("name");
      const ariaLabel = el.getAttribute("aria-label");
      const dataTestId = el.getAttribute("data-testid") || el.getAttribute("data-test-id");
      const role = el.getAttribute("role");
      const type = el.getAttribute("type");
      const href = el.getAttribute("href");
      
      let bestSelector = null;
      if (id) bestSelector = `#${id}`;
      else if (name) bestSelector = `[name="${name}"]`;
      else if (ariaLabel) bestSelector = `[aria-label="${ariaLabel}"]`;
      else if (dataTestId) bestSelector = `[data-testid="${dataTestId}"]`;
      else if (role && type) bestSelector = `${el.tagName.toLowerCase()}[role="${role}"][type="${type}"]`;
      else if (role) bestSelector = `[role="${role}"]`;
      else if (type) bestSelector = `${el.tagName.toLowerCase()}[type="${type}"]`;
      else if (href && href.startsWith('/')) bestSelector = `a[href="${href}"]`;
      
      return {
        tag: el.tagName.toLowerCase(),
        id: id || null,
        name: name || null,
        ariaLabel: ariaLabel || null,
        dataTestId: dataTestId || null,
        role: role || null,
        type: type || null,
        href: href || null,
        text: el.innerText?.trim().slice(0, 40) || null,
        placeholder: el.getAttribute("placeholder") || null,
        selector: bestSelector || el.tagName.toLowerCase(),
      };
    })
  );
}
