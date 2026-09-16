import type { Plugin, ViteDevServer } from "vite";
import { chromium } from "@playwright/test";
import {
  readSettings,
  sceneFilename,
  sceneParams,
  sceneSize,
} from "../../app/visual-studio/settings";

/** Local developer tool only: no arbitrary URLs, paths, or browser evaluation accepted. */
export function visualStudioExport(): Plugin {
  let busy = false;
  return {
    name: "dome-visual-studio-export",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/__visual-studio/export", async (req, res) => {
        const origin = server.resolvedUrls?.local[0];
        if (
          !origin ||
          req.method !== "POST" ||
          req.headers.origin !== new URL(origin).origin
        ) {
          res.writeHead(403).end("Local same-origin POST required.");
          return;
        }
        if (busy) {
          res.writeHead(429).end("An export is already running.");
          return;
        }
        if ((req.url?.length ?? 0) > 2048) {
          res.writeHead(400).end("Invalid parameters.");
          return;
        }
        busy = true;
        let browser;
        try {
          const settings = readSettings(
            new URL(req.url ?? "/", origin).searchParams,
          );
          const params = sceneParams(settings);
          params.set("capture", "1");
          browser = await chromium.launch({ headless: true });
          const page = await browser.newPage({
            viewport: sceneSize(settings),
            deviceScaleFactor: 2,
            reducedMotion: "reduce",
          });
          await page.goto(
            new URL(`/visual-studio.html?${params}`, origin).href,
            { waitUntil: "networkidle", timeout: 45000 },
          );
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(
              Array.from(document.images, (image) => image.decode()),
            );
          });
          await page.locator('[data-artboard-ready="true"]').waitFor();
          const png = await page
            .locator("[data-artboard]")
            .screenshot({
              type: "png",
              omitBackground: settings.format === "detail",
              animations: "disabled",
            });
          await browser.close();
          browser = undefined;
          busy = false;
          res.writeHead(200, {
            "Content-Type": "image/png",
            "Content-Disposition": `attachment; filename="${sceneFilename(settings)}"`,
            "Cache-Control": "no-store",
          });
          res.end(png);
        } catch (error) {
          server.config.logger.error(`[visual-studio] ${String(error)}`);
          res
            .writeHead(500)
            .end(
              "Export failed. Install Chromium with pnpm exec playwright install chromium, then retry.",
            );
        } finally {
          try {
            if (browser) await browser.close();
          } finally {
            busy = false;
          }
        }
      });
    },
  };
}
