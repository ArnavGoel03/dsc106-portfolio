// Print an HTML file to PDF through chrome-headless-shell on :9333 (see ~/.claude/scripts/shot.mjs for how it is started).
// usage: node print_pdf.mjs <in.html> <out.pdf>
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const [,, inPath, outPath] = process.argv;
const info = await fetch("http://127.0.0.1:9333/json/version").then((r) => r.json());
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
const send = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Page.navigate", { url: pathToFileURL(inPath).href }, sessionId);
await new Promise((r) => setTimeout(r, 2500));
const { result } = await send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true, marginTop: 0.5, marginBottom: 0.5, marginLeft: 0.5, marginRight: 0.5 }, sessionId);
writeFileSync(outPath, Buffer.from(result.data, "base64"));
await send("Target.closeTarget", { targetId });
ws.close();
console.log("wrote", outPath, readFileSync(outPath).length, "bytes");
