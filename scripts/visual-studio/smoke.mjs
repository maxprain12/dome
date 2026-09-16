import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const origin = "http://127.0.0.1:5188";
const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/visual-studio.html`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /02 Many/ }).click();
  await page.getByRole("button", { name: "Resultado", exact: true }).click();
  await page.getByRole("button", { name: "Oscuro", exact: true }).click();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("button", { name: "Detail", exact: true }).click();
  await page.waitForURL(/format=detail/);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  assert.match(
    await page.locator("[data-artboard]").textContent(),
    /Turn these ideas into study cards/,
  );
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export PNG · 2×", exact: true })
    .click();
  const download = await downloadEvent;
  assert.match(download.suggestedFilename(), /many-detail-dark-en-alternate/);
  const png = await readFile(await download.path());
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.width, 1920);
  assert.equal(metadata.height, 1440);
  assert.equal(metadata.hasAlpha, true);
  const { data, info } = await sharp(png)
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(data[info.channels - 1], 0, "The corner must be transparent");
  assert.ok(
    data.some(
      (value, i) => i % info.channels === info.channels - 1 && value === 255,
    ),
    "The component must be visible",
  );
  const denied = await fetch(`${origin}/__visual-studio/export`, {
    method: "POST",
    headers: { Origin: "https://example.com" },
  });
  assert.equal(denied.status, 403);
  const getDenied = await fetch(`${origin}/__visual-studio/export`);
  assert.equal(getDenied.status, 403);
  // Pairwise coverage: each scene, language, state, orientation and theme.
  for (const query of [
    "scene=library&format=screen&state=alternate&language=pt&theme=dark",
    "scene=many&format=composition&ratio=portrait&state=alternate&language=fr",
    "scene=study&format=composition&ratio=portrait&state=alternate&language=en&theme=dark",
    "scene=study&format=screen&language=es",
  ]) {
    await page.goto(`${origin}/visual-studio.html?${query}&capture=1`, {
      waitUntil: "networkidle",
    });
    const text = await page.locator("[data-artboard]").textContent();
    assert.ok(!text.includes("visualStudio."), "Translations must resolve");
    const failedImages = await page
      .locator("img")
      .evaluateAll(
        (images) =>
          images.filter((image) => !image.complete || !image.naturalWidth)
            .length,
      );
    assert.equal(failedImages, 0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/visual-studio.html?scene=study`, {
    waitUntil: "networkidle",
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "Mobile workbench must not overflow horizontally",
  );
  await page.screenshot({
    path: "/tmp/dome-visual-studio-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(
    `${origin}/visual-studio.html?scene=study&theme=dark&state=alternate`,
    { waitUntil: "networkidle" },
  );
  await page.screenshot({
    path: "/tmp/dome-visual-studio-dark.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.info(
    "[visual-studio] Controls, URL persistence, download, 2× resolution, alpha, origin restriction, localization, images and mobile layout passed.",
  );
} finally {
  await browser.close();
}
