import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const origin = "http://127.0.0.1:5188";
const output = path.resolve("visual-studio-exports");
await mkdir(output, { recursive: true });
const manifest = [];
for (const scene of ["library", "many", "study"]) {
  for (const format of ["composition", "screen", "detail"]) {
    const settings = {
      scene,
      format,
      theme: "light",
      language: "es",
      state: "primary",
      ratio: "landscape",
    };
    const params = new URLSearchParams(settings);
    const response = await fetch(`${origin}/__visual-studio/export?${params}`, {
      method: "POST",
      headers: { Origin: origin },
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.startsWith("image/png")
    )
      throw new Error(
        `Export ${scene}/${format}: ${response.status} ${await response.text()}`,
      );
    const filename = `dome-${scene}-${format}-light-es-primary-landscape.png`;
    await writeFile(
      path.join(output, filename),
      Buffer.from(await response.arrayBuffer()),
    );
    manifest.push({
      ...settings,
      filename,
      preview: `${origin}/visual-studio.html?${params}&capture=1`,
    });
    console.info(`[visual-studio] ${filename}`);
  }
}
await writeFile(
  path.join(output, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.info(`[visual-studio] ${manifest.length} PNGs exported to ${output}`);
