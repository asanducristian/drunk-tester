import { chromium } from "playwright";

export async function launchBrowser(url) {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(url);
  return { browser, page };
}

export async function extractElements(page) {
  return await page.$$eval("input, button, a, select, [role='combobox'], [role='button'], [aria-haspopup], [aria-expanded], [role='gridcell'], [class*='calendar'], [class*='rbc'], [class*='slot'], [class*='event']", els =>
    els.map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type"),
      id: el.id,
      name: el.getAttribute("name"),
      role: el.getAttribute("role"),
      ariaExpanded: el.getAttribute("aria-expanded"),
      ariaHasPopup: el.getAttribute("aria-haspopup"),
      text: el.innerText?.trim().slice(0, 40),
      placeholder: el.getAttribute("placeholder"),
      className: el.className?.split(' ').slice(0, 2).join(' '),
      selector:
        el.id
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
          : el.tagName.toLowerCase(),
    }))
  );
}
