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
  const scale = Math.min(src.scale ?? 4, 4);
  const api = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&scale=${scale}&format=png&use_absolute_bounds=true`;
  const res = await fetch(api, { headers: { "X-Figma-Token": token } });
  if (!res.ok) throw new Error(`Figma API ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { err?: string; images: Record<string, string | null> };
  const imageUrl = body.images[nodeId];
  if (!imageUrl) throw new Error(`Figma returned no image for ${nodeId}${body.err ? `: ${body.err}` : ""}`);
  const img = await fetch(imageUrl);
  await Bun.write(out, await img.arrayBuffer());
}
