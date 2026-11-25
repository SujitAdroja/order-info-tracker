// Local stand-in for Resend's Receiving API during e2e runs. Tests register
// a received email with POST /__fixtures/emails/<id>; the app then fetches it
// exactly as it would from api.resend.com. SYNTHETIC data only.
import http from "node:http";

const PORT = Number(process.env.MOCK_RESEND_PORT ?? 3199);
const emails = new Map();

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
