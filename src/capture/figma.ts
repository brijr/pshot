import type { FigmaSource } from "../types";

export function parseFigmaUrl(url: string): { fileKey: string; nodeId: string } {
  const u = new URL(url);
  const parts = u.pathname.split("/").filter(Boolean);
  // /design/:key/... or /file/:key/... or /design/:key/branch/:branchKey/...
  const branch = parts.indexOf("branch");
  const fileKey = branch > -1 ? parts[branch + 1] : parts[1];
  const nodeId = u.searchParams.get("node-id")?.replace(/-/g, ":");
  if (!fileKey || !nodeId) throw new Error(`Figma URL needs a file key and ?node-id=: ${url}`);
  return { fileKey, nodeId };
}

/** Export a Figma node as PNG via the REST API (needs FIGMA_TOKEN). */
export async function captureFigma(src: FigmaSource, out: string) {
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    throw new Error(
      "FIGMA_TOKEN is not set (add it to .env). Alternative: export via the Figma MCP " +
        "(download_assets / get_screenshot) into raw/ and use a `file` source.",
    );
  }
  const { fileKey, nodeId } = parseFigmaUrl(src.url);
  // Figma returns a null image when a large render times out: retry, then step the scale down.
  const want = Math.min(src.scale ?? 4, 4);
  const scales = [want, want, Math.min(want, 3), Math.min(want, 2)];
  let lastErr = "";
  for (const scale of scales) {
    const api = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&scale=${scale}&format=png`;
    const res = await fetch(api, { headers: { "X-Figma-Token": token } });
    if (!res.ok) throw new Error(`Figma API ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { err?: string; images: Record<string, string | null> };
    const imageUrl = body.images[nodeId];
    if (imageUrl) {
      if (scale < want) console.log(`   ! Figma render timed out at ${want}×, exported at ${scale}×`);
      const img = await fetch(imageUrl);
      await Bun.write(out, await img.arrayBuffer());
      return;
    }
    lastErr = body.err ?? "null image";
  }
  throw new Error(`Figma returned no image for ${nodeId}: ${lastErr}`);
}
