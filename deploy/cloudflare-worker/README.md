# Cloudflare Worker — Tivra upstream relay

This Worker lets the Replit-published Tivra app reach upstream APIs
(`api.h5r1xc.xyz`, `api.gronix.xyz`) that block Replit's deployment IPs.
Requests flow:

```
Browser → Replit publish → Cloudflare Worker → Upstream API
```

Cloudflare's edge IPs are widely accepted by WAFs, so this bypasses the
IP block at zero cost (free tier: 100k requests/day).

---

## One-time setup (≈5 minutes)

### 1. Create a free Cloudflare account

Sign up at <https://dash.cloudflare.com/sign-up>. No credit card required
for Workers free tier.

### 2. Create the Worker

1. In the Cloudflare dashboard sidebar, click **Workers & Pages** →
   **Create application** → **Create Worker**.
2. Name it anything (e.g. `tivra-relay`). Click **Deploy**.
3. After it's created, click **Edit code**.
4. Delete everything in the editor and paste the entire contents of
   [`worker.js`](./worker.js).
5. Click **Save and deploy** (top right).

Your Worker is now live at `https://tivra-relay.<your-subdomain>.workers.dev`.
Copy this URL — you'll need it in step 4.

### 3. Set Worker secrets

Back on the Worker's main page → **Settings** → **Variables and Secrets**.

Add two entries:

| Name | Type | Value |
|---|---|---|
| `PROXY_SECRET` | Secret | Any long random string. Generate one with `openssl rand -hex 32` or use a password generator. **Save this — you'll paste it into Replit next.** |
| `ALLOWED_HOSTS` | Plaintext | `api.h5r1xc.xyz,api.gronix.xyz` |

Click **Deploy** again so the new variables take effect.

### 4. Wire the Worker into Replit

In your Replit project, open the **Secrets** pane (lock icon in the
sidebar) and add two secrets:

| Key | Value |
|---|---|
| `UPSTREAM_PROXY_URL` | The Worker URL from step 2, e.g. `https://tivra-relay.yourname.workers.dev` |
| `UPSTREAM_PROXY_SECRET` | The same random string you set as `PROXY_SECRET` on the Worker |

### 5. Re-publish

Hit **Deploy** in Replit. The published app will now route all upstream
calls through your Worker.

### 6. Verify it works

```bash
# Should return {"code":0,...} or a real upstream JSON response, NOT 403.
curl -X POST 'https://your-replit-app.replit.app/api/tivra/check' \
  -H 'content-type: application/json' \
  --data-raw '{"phone":"7505250582","password":"Gopi1998"}'
```

You can also hit the Worker's own health check directly:

```bash
curl https://tivra-relay.yourname.workers.dev/healthz
# → ok
```

---

## How it works

- The Worker accepts any request that includes:
  - `X-Proxy-Secret: <your secret>` (auth)
  - `X-Upstream-Url: https://api.h5r1xc.xyz/xxapi/...` (target)
- It strips those two headers + Cloudflare-injected ones, then forwards
  method/body/remaining-headers to the target.
- The upstream sees Cloudflare's IP, not Replit's → no block.
- Response is returned transparently with original status code and body.
- `ALLOWED_HOSTS` prevents the Worker from being used as an open proxy
  for arbitrary destinations.

## What if the upstream still returns 403?

Then the upstream is blocking Cloudflare's IPs too (rare — usually means
country-specific allowlist, e.g. India-only). In that case, the only
remaining option is a residential or country-specific proxy provider.
But try this first — it works for the vast majority of WAF blocks.

## Disabling the relay

To go back to direct upstream calls, simply delete the
`UPSTREAM_PROXY_URL` secret in Replit and re-publish. The app falls back
to direct `fetch()` automatically.
