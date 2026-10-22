/** Probe the actual local preview, including the hashed assets referenced by its HTML. */
const base = new URL(process.argv[2] ?? "http://127.0.0.1:3000");

try {
  const response = await fetch(base, { signal: AbortSignal.timeout(10000), cache: "no-store" });
  if (!response.ok) throw new Error(`Homepage: HTTP ${response.status}`);
  const html = await response.text();
  const assets = [...new Set([...html.matchAll(/(?:href|src)="([^"<>]+)"/g)]
    .map((match) => new URL(match[1].replaceAll("&amp;", "&"), base))
    .filter((url) => url.origin === base.origin && url.pathname.startsWith("/_next/static/") && /\.(css|js)$/.test(url.pathname))
    .map((url) => url.href))];
  if (!assets.some((url) => new URL(url).pathname.endsWith(".css"))) throw new Error("Nessun foglio di stile nell’HTML");
  const failures = [];
  for (const url of assets) {
    const asset = await fetch(url, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    const type = asset.headers.get("content-type") ?? "";
    const expected = new URL(url).pathname.endsWith(".css") ? "text/css" : "javascript";
    if (!asset.ok || !type.includes(expected) || !(await asset.text()).trim()) {
      failures.push(`${new URL(url).pathname}: HTTP ${asset.status}, ${type}`);
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
  console.log(`OK ${base.origin}: homepage e ${assets.length} risorse CSS/JavaScript disponibili`);
} catch (error) {
  console.error(`ERRORE ${base.origin}: ${error.message}`);
  process.exitCode = 1;
}
