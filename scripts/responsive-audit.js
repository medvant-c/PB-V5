/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CommonJS QA script, not app code */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = "http://localhost:3001";
const SCREENSHOT_DIR = path.join(__dirname, "..", "screenshots");

const devices = [
  { name: "mobile-375x667", width: 375, height: 667 },
  { name: "mobile-390x844", width: 390, height: 844 },
  { name: "mobile-360x800", width: 360, height: 800 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "tablet-1024x768", width: 1024, height: 768 },
];

const pages = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "academy", path: "/academy" },
  { name: "ai", path: "/ai" },
  { name: "business", path: "/business" },
  { name: "cases", path: "/cases" },
  { name: "case-detail", path: "/cases/kids-clothing-brand" },
  { name: "contacts", path: "/contacts" },
  { name: "ecosystem", path: "/ecosystem" },
  { name: "factory", path: "/factory" },
  { name: "fulfillment", path: "/fulfillment" },
  { name: "logistics", path: "/logistics" },
  { name: "privacy", path: "/privacy" },
  { name: "reviews", path: "/reviews" },
  { name: "scenarios", path: "/scenarios" },
  { name: "start", path: "/start" },
  { name: "terms", path: "/terms" },
  { name: "hub-os", path: "/hub-os" },
];

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const report = [];

  for (const device of devices) {
    for (const pageInfo of pages) {
      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
      });
      const page = await context.newPage();

      try {
        await page.goto(BASE_URL + pageInfo.path, { waitUntil: "networkidle", timeout: 30000 });
      } catch (err) {
        report.push({
          page: pageInfo.name,
          device: device.name,
          error: `navigation failed: ${err.message}`,
        });
        await context.close();
        continue;
      }

      const audit = await page.evaluate((viewportWidth) => {
        const scrollWidth = document.documentElement.scrollWidth;
        const hasHorizontalOverflow = scrollWidth > viewportWidth + 1;

        // An element only causes real page-level overflow if no ancestor
        // clips it with overflow-x (e.g. an intentional horizontal carousel).
        function isClippedByAncestor(el) {
          let node = el.parentElement;
          while (node) {
            const overflowX = getComputedStyle(node).overflowX;
            if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden" || overflowX === "clip") {
              return true;
            }
            node = node.parentElement;
          }
          return false;
        }

        // Find the widest offending element to help pinpoint the cause
        let overflowCulprits = [];
        if (hasHorizontalOverflow) {
          const all = document.querySelectorAll("body *");
          for (const el of all) {
            const rect = el.getBoundingClientRect();
            if ((rect.right > viewportWidth + 1 || rect.left < -1) && !isClippedByAncestor(el)) {
              overflowCulprits.push({
                tag: el.tagName,
                className: typeof el.className === "string" ? el.className.slice(0, 80) : "",
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
              });
            }
          }
          overflowCulprits.sort((a, b) => b.right - a.right);
          overflowCulprits = overflowCulprits.slice(0, 5);
        }

        // Tap target size check for interactive elements
        const interactive = document.querySelectorAll(
          'a[href], button, input, select, textarea, [role="button"]',
        );
        const smallTargets = [];
        for (const el of interactive) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue; // hidden
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          if (rect.width < 44 || rect.height < 44) {
            smallTargets.push({
              tag: el.tagName,
              text: (el.textContent || "").trim().slice(0, 30),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            });
          }
        }

        return {
          scrollWidth,
          hasHorizontalOverflow,
          overflowCulprits,
          smallTargetsCount: smallTargets.length,
          smallTargetsSample: smallTargets.slice(0, 8),
        };
      }, device.width);

      const screenshotPath = path.join(SCREENSHOT_DIR, `${pageInfo.name}-${device.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      report.push({
        page: pageInfo.name,
        device: device.name,
        ...audit,
      });

      await context.close();
    }
  }

  await browser.close();
  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, "audit-report.json"),
    JSON.stringify(report, null, 2),
  );

  const overflowIssues = report.filter((r) => r.hasHorizontalOverflow);
  console.log(`\nTotal checks: ${report.length}`);
  console.log(`Horizontal overflow issues: ${overflowIssues.length}`);
  for (const issue of overflowIssues) {
    console.log(`  - ${issue.page} @ ${issue.device}: scrollWidth=${issue.scrollWidth}`);
    for (const culprit of issue.overflowCulprits || []) {
      console.log(
        `      <${culprit.tag} class="${culprit.className}"> right=${culprit.right} width=${culprit.width}`,
      );
    }
  }

  const smallTargetPages = report.filter((r) => r.smallTargetsCount > 0);
  console.log(`\nPages with small tap targets (<44x44): ${smallTargetPages.length}`);
  for (const issue of smallTargetPages) {
    console.log(`  - ${issue.page} @ ${issue.device}: ${issue.smallTargetsCount} small targets`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
