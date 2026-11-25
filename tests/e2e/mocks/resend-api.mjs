// Local stand-ins for Resend's Receiving API and a Web Push service during e2e runs. Tests register
// a received email with POST /__fixtures/emails/<id>; the app then fetches it
// exactly as it would from api.resend.com. SYNTHETIC data only.
import http from "node:http";

const PORT = Number(process.env.MOCK_RESEND_PORT ?? 3199);
const emails = new Map();
const pushes = new Map(); // push endpoint id → deliveries

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const fixture = url.pathname.match(/^\/__fixtures\/emails\/([^/]+)$/);
    if (req.method === "POST" && fixture) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        emails.set(fixture[1], JSON.parse(body));
        send(res, 201, { ok: true });
      });
      return;
    }
    if (url.pathname === "/") return send(res, 200, { ok: true });

    // Fake Web Push service: endpoints /push/<id>. Ids starting with "gone-"
    // answer 410 like an expired subscription (EC-PUSH-03).
    const push = url.pathname.match(/^\/push\/([^/]+)$/);
    if (req.method === "POST" && push) {
      let bytes = 0;
      req.on("data", (c) => (bytes += c.length));
      req.on("end", () => {
        const id = push[1];
        if (id.startsWith("gone-")) return send(res, 410, { message: "Gone" });
        const list = pushes.get(id) ?? [];
        list.push({
          bytes,
          encoding: req.headers["content-encoding"] ?? null,
          vapid: String(req.headers.authorization ?? "").startsWith("vapid "),
          ttl: req.headers.ttl ?? null,
        });
        pushes.set(id, list);
        res.writeHead(201);
        res.end();
      });
      return;
    }
    const pushLog = url.pathname.match(/^\/__push\/([^/]+)$/);
    if (req.method === "GET" && pushLog)
      return send(res, 200, pushes.get(pushLog[1]) ?? []);

    if (!req.headers.authorization?.startsWith("Bearer ")) {
      return send(res, 401, { message: "Missing API key" });
    }
    const att = url.pathname.match(
      /^\/emails\/receiving\/([^/]+)\/attachments$/,
    );
    if (req.method === "GET" && att) {
      return emails.has(att[1])
        ? send(res, 200, { object: "list", has_more: false, data: [] })
        : send(res, 404, { message: "Not found" });
    }
    const one = url.pathname.match(/^\/emails\/receiving\/([^/]+)$/);
    if (req.method === "GET" && one) {
      const email = emails.get(one[1]);
      return email
        ? send(res, 200, email)
        : send(res, 404, { message: "Not found" });
    }
    send(res, 404, { message: "Not found" });
  })
  .listen(PORT, () => console.log(`[mock-resend] listening on ${PORT}`));
