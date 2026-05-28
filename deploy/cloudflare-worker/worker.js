// Tivra upstream relay — Cloudflare Worker.
//
// Purpose: forward HTTP requests from the Replit-published app to the
// real upstream APIs (api.h5r1xc.xyz, api.gronix.xyz). Cloudflare's edge
// IPs are widely accepted by WAFs, so this bypasses the IP block that
// affects Replit's deployment outbound range.
//
// Deploy this as a Cloudflare Worker (free tier: 100k requests/day).
// See deploy/cloudflare-worker/README.md for step-by-step instructions.
//
// Protocol:
//   • Caller sends any request to this Worker's URL.
//   • Header `X-Upstream-Url` must contain the full target URL.
//   • Header `X-Proxy-Secret` must equal the secret you set in the Worker.
//   • All other headers, method, query, and body are forwarded as-is.
//   • Response status, headers, and body are returned transparently.
//
// Configuration (set as Cloudflare Worker secret/var):
//   • PROXY_SECRET — any random string; must match what the Replit app sends.
//   • ALLOWED_HOSTS — comma-separated list of upstream hostnames that may
//     be proxied (prevents the Worker becoming an open proxy).
//     Example: "api.h5r1xc.xyz,api.gronix.xyz"

export default {
  async fetch(request, env) {
    // ── Health check ──
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return new Response("ok", { status: 200 });
    }

    // ── Auth ──
    const providedSecret = request.headers.get("x-proxy-secret");
    if (!env.PROXY_SECRET || providedSecret !== env.PROXY_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    // ── Resolve target ──
    const upstreamUrl = request.headers.get("x-upstream-url");
    if (!upstreamUrl) {
      return new Response("Missing X-Upstream-Url header", { status: 400 });
    }

    let target;
    try {
      target = new URL(upstreamUrl);
    } catch {
      return new Response("Invalid X-Upstream-Url", { status: 400 });
    }

    const allowed = (env.ALLOWED_HOSTS || "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    if (allowed.length && !allowed.includes(target.hostname.toLowerCase())) {
      return new Response(`Host not allowed: ${target.hostname}`, { status: 403 });
    }

    // ── Build forwarded request ──
    // Strip our control headers, plus hop-by-hop / origin headers that
    // Cloudflare would otherwise rewrite incorrectly for the upstream.
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.delete("x-upstream-url");
    forwardedHeaders.delete("x-proxy-secret");
    forwardedHeaders.delete("host");
    forwardedHeaders.delete("cf-connecting-ip");
    forwardedHeaders.delete("cf-ipcountry");
    forwardedHeaders.delete("cf-ray");
    forwardedHeaders.delete("cf-visitor");
    forwardedHeaders.delete("x-forwarded-for");
    forwardedHeaders.delete("x-forwarded-proto");
    forwardedHeaders.delete("x-real-ip");

    const init = {
      method: request.method,
      headers: forwardedHeaders,
      redirect: "manual",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.arrayBuffer();
    }

    let upstreamResp;
    try {
      upstreamResp = await fetch(target.toString(), init);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Upstream fetch failed", message: String(err) }),
        { status: 502, headers: { "content-type": "application/json" } }
      );
    }

    // ── Return response transparently ──
    const respHeaders = new Headers(upstreamResp.headers);
    // Strip CDN/CF-side caching directives that would confuse our client.
    respHeaders.delete("cf-cache-status");
    respHeaders.delete("cf-ray");
    respHeaders.delete("content-encoding"); // body is already decoded by fetch()

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: respHeaders,
    });
  },
};
