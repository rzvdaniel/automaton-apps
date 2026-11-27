// Renders the Overview's disk tiles and needs-you banner with dashboard.js in a stubbed browser. Run: node test_render.js
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => "" : k === "classList" ? { add() {}, remove() {}, toggle() {} } : k === "style" || k === "dataset" ? {} : stub()), apply: () => stub() });
let api = null;
const win = {}; Object.assign(win, { __serverKeeperTest: (a) => { api = a; }, localStorage: { getItem: () => null }, addEventListener() {}, location: { reload() {} } });
const doc = { getElementById: stub, querySelectorAll: () => [], addEventListener() {}, createElement: stub, body: stub(), documentElement: stub() };
const ctx = { window: win, document: doc, fetch: () => new Promise(() => {}), setTimeout() {}, setInterval() {}, clearTimeout() {}, console, Date, Math, Object, Array, String, Number, JSON, isFinite, encodeURIComponent, matchMedia: () => ({ matches: false, addEventListener() {} }) };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + "/ui/app.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync(__dirname + "/dashboard.js", "utf8"), ctx);
assert(api, "dashboard.js exposed no test hook");
const GiB = 1024 ** 3, data = { settings: { diskFreePercent: 20 }, reclaim: {}, attention: [] };
const disk = (mountPoint, used, total) => ({ mountPoint, totalBytes: total * GiB, availableBytes: (total - used) * GiB });
const h = (disks) => ({ host: { disks } });

let html = api.diskTiles(h([disk("/", 16.9, 37.2), disk("/mnt/docker-data/docker", 11.2, 39.1)]), {}, [], data);
assert.strictEqual((html.match(/class="tile tile--disk/g) || []).length, 2, "one tile per disk");
assert(html.includes("System disk") && html.includes("Docker data") && html.includes("/mnt/docker-data/docker"));
assert(html.includes("16.9 GiB of 37.2 GiB") && html.includes("20.3 GiB free"), html);
assert(html.includes("updates need 10 GiB free") && html.includes("apps, images, app data"));
assert(html.includes("--mark:80%"), "the 80% mark");
assert(!html.includes("over 80%") && !html.includes("tile--attn"), "healthy disks are not orange");

html = api.diskTiles(h([disk("/", 16.9, 37.2), disk("/mnt/backups", 13.8, 16)]), {}, [], data);
assert(html.includes("tile--attn") && html.includes("over 80%"), "an 86% disk is orange with a pill");
assert.strictEqual((html.match(/class="s-pill/g) || []).length, 1, "only the full disk has a pill");

html = api.diskTiles(h([disk("/", 10, 40)]), {}, [], data);
assert(html.includes("<b>Disk</b>") && !html.includes("System disk"), "a single disk is just Disk");
assert(api.diskTiles({ host: {} }, {}, [], data).includes("No disk figures"));

assert.strictEqual(api.needs(data), "", "no banner when nothing needs you");
let banner = api.needs({ ...data, attention: [{ level: "warning", card: "backups", title: "Backups disk is 86% full", detail: "Delete old backups." }] });
assert(banner.includes("a-banner") && banner.includes("1 thing needs you") && banner.includes("Backups disk is 86% full"), banner);
banner = api.needs({ ...data, attention: [{ level: "warning", title: "A", detail: "" }, { level: "critical", title: "B <b>", detail: "" }] });
assert(banner.includes("2 things need you") && banner.includes("a-banner--critical") && banner.includes("B &lt;b&gt;"), banner);
console.log("render tests passed");
