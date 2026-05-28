import { Router, type Request, type Response as ExpressResponse } from "express";

export type PlatformConfig = {
  slug: string;
  base: string;
  origin: string;
  referer: string;
  gateHeaderName: string;
  gateHeaderValue: string;
  clientId: string;
  // Optional per-endpoint path overrides (relative to `base`). Defaults match Tivra.
  paths?: Partial<{
    check: string;
    sendtoken: string;
    sendlogin: string;
    login: string;
    userinfo: string;
    tools: string;
    waitorders: string;
    orders: string;
    pickup: string;
    processpayment: string;
    orderdetail: string;
  }>;
};

const DEFAULT_PATHS: Required<NonNullable<PlatformConfig["paths"]>> = {
  check: "/checkSmsNew",
  sendtoken: "/getsendtken",
  sendlogin: "/sendLoginSms",
  login: "/login",
  userinfo: "/userinfo",
  tools: "/collectiontoollist",
  waitorders: "/buyitoken/waitpayerpaymentslip",
  orders: "/buyitoken/history",
  pickup: "/buyitoken/pickuppaymentslip",
  processpayment: "/buyitoken/processpaymentslips",
  orderdetail: "/buyitoken/paymentslipdetail",
};

const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

function buildMultipart(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return form;
}

async function forwardUpstream(
  req: Request,
  res: ExpressResponse,
  label: string,
  r: Response
): Promise<void> {
  const text = await r.text();
  if (!r.ok) {
    req.log.warn({ label, status: r.status, body: text.slice(0, 400) }, "upstream non-OK");
    res.status(502).json({ code: -1, msg: `Upstream ${r.status}`, upstream: text.slice(0, 200) });
    return;
  }
  try {
    res.json(JSON.parse(text));
  } catch {
    req.log.warn({ label, body: text.slice(0, 400) }, "upstream non-JSON");
    res.status(502).json({ code: -1, msg: "Upstream non-JSON", upstream: text.slice(0, 200) });
  }
}

export function createPlatformRouter(config: PlatformConfig): Router {
  const router = Router();
  const paths = { ...DEFAULT_PATHS, ...(config.paths ?? {}) };
  const { slug, base, origin, referer, gateHeaderName, gateHeaderValue, clientId } = config;

  const commonHeaders: Record<string, string> = {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-us",
    dnt: "1",
    origin,
    priority: "u=1, i",
    referer,
    "sec-ch-ua": '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    [gateHeaderName]: gateHeaderValue,
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  };

  const tokenHeader = `x-${slug}-token`;

  function getToken(req: Request, res: ExpressResponse): string | null {
    const t = req.headers[tokenHeader] as string | undefined;
    if (!t) {
      res.status(400).json({ code: -1, msg: "Missing token" });
      return null;
    }
    return t;
  }

  // Step 1: Verify phone + password credentials
  router.post(`/${slug}/check`, async (req, res) => {
    try {
      const { phone, password } = req.body as { phone: string; password: string };
      const form = buildMultipart({ phone, password });
      const r = await fetch(`${base}${paths.check}`, {
        method: "POST",
        headers: commonHeaders,
        body: form,
      });
      res.json(await r.json());
    } catch (err: any) {
      req.log.error({ err: err?.message, slug }, "check proxy threw");
      res.status(502).json({ code: -1, msg: `Proxy error: ${err?.message || "unknown"}` });
    }
  });

  // Step 2: Get a send-token using dummy token
  router.post(`/${slug}/sendtoken`, async (req, res) => {
    try {
      const { phone } = req.body as { phone: string };
      const params = new URLSearchParams({ token: DUMMY_TOKEN, clientId, phone });
      const r = await fetch(`${base}${paths.sendtoken}`, {
        method: "POST",
        headers: { ...commonHeaders, "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: params.toString(),
      });
      res.json(await r.json());
    } catch (err: any) {
      req.log.error({ err: err?.message, slug }, "sendtoken proxy threw");
      res.status(502).json({ code: -1, msg: `Proxy error: ${err?.message || "unknown"}` });
    }
  });

  // Step 3: Trigger OTP SMS (if new IP, server sends OTP)
  router.post(`/${slug}/sendlogin`, async (req, res) => {
    try {
      const { phone, password, sendtoken } = req.body as { phone: string; password: string; sendtoken: string };
      const form = buildMultipart({ phone, sendtoken, password, clientId });
      const r = await fetch(`${base}${paths.sendlogin}`, {
        method: "POST",
        headers: commonHeaders,
        body: form,
      });
      res.json(await r.json());
    } catch (err: any) {
      req.log.error({ err: err?.message, slug }, "sendlogin proxy threw");
      res.status(502).json({ code: -1, msg: `Proxy error: ${err?.message || "unknown"}` });
    }
  });

  // Step 4: Final login — returns logintoken
  router.post(`/${slug}/login`, async (req, res) => {
    try {
      const { phone, password, ip, sendtoken, smscode } = req.body as {
        phone: string; password: string; ip: string; sendtoken: string; smscode?: string;
      };
      const form = buildMultipart({
        phone, password, ip, sendtoken,
        smscode: smscode ?? "",
        clientId,
      });
      const r = await fetch(`${base}${paths.login}`, {
        method: "POST",
        headers: commonHeaders,
        body: form,
      });
      res.json(await r.json());
    } catch (err: any) {
      req.log.error({ err: err?.message, slug }, "login proxy threw");
      res.status(502).json({ code: -1, msg: `Proxy error: ${err?.message || "unknown"}` });
    }
  });

  // Step 5: Fetch user info using logintoken
  router.get(`/${slug}/userinfo`, async (req, res) => {
    try {
      const token = getToken(req, res); if (!token) return;
      const r = await fetch(`${base}${paths.userinfo}`, {
        headers: { ...commonHeaders, indiatoken: token },
      });
      res.json(await r.json());
    } catch (err: any) {
      req.log.error({ err: err?.message, slug }, "userinfo proxy threw");
      res.status(502).json({ code: -1, msg: `Proxy error: ${err?.message || "unknown"}` });
    }
  });

  // Waiting payment slip orders (active orders to pay)
  router.get(`/${slug}/waitorders`, async (req, res) => {
    try {
      const token = getToken(req, res); if (!token) return;
      const url = `${base}${paths.waitorders}?page=1&limit=50&if_asc=false&min_amount=5000&max_amount=100000&method=1&date_asc=1`;
      const r = await fetch(url, { headers: { ...commonHeaders, indiatoken: token } });
      const text = await r.text();
      if (!r.ok) {
        req.log.warn({ slug, status: r.status, body: text.slice(0, 500) }, "waitorders upstream non-OK");
        res.status(502).json({ code: -1, msg: `Upstream ${r.status}`, upstream: text.slice(0, 200) });
        return;
      }
      try { res.json(JSON.parse(text)); }
      catch {
        req.log.warn({ slug, body: text.slice(0, 500) }, "waitorders upstream non-JSON");
        res.status(502).json({ code: -1, msg: "Upstream non-JSON", upstream: text.slice(0, 200) });
      }
    } catch (err: any) {
      req.log.error({ err: err?.message, slug }, "waitorders proxy threw");
      res.status(502).json({ code: -1, msg: `Proxy error: ${err?.message || "unknown"}` });
    }
  });

  // Collection tool list
  router.get(`/${slug}/tools`, async (req, res) => {
    try {
      const token = getToken(req, res); if (!token) return;
      const r = await fetch(`${base}${paths.tools}`, {
        headers: { ...commonHeaders, indiatoken: token },
      });
      res.json(await r.json());
    } catch (err: any) {
      req.log.error({ err: err?.message, slug }, "tools proxy threw");
      res.status(502).json({ code: -1, msg: `Proxy error: ${err?.message || "unknown"}` });
    }
  });

  // Order history
  router.get(`/${slug}/orders`, async (req, res) => {
    try {
      const token = getToken(req, res); if (!token) return;
      const { page = "1", limit = "10" } = req.query as { page?: string; limit?: string };
      const url = `${base}${paths.orders}?page=${page}&limit=${limit}&currency=inr`;
      const r = await fetch(url, { headers: { ...commonHeaders, indiatoken: token } });
      res.json(await r.json());
    } catch (err: any) {
      req.log.error({ err: err?.message, slug }, "orders proxy threw");
      res.status(502).json({ code: -1, msg: `Proxy error: ${err?.message || "unknown"}` });
    }
  });

  // Pickup (buy) an order — multipart with order_id, ct_id, ctType
  router.post(`/${slug}/pickup`, async (req, res) => {
    try {
      const token = getToken(req, res); if (!token) return;
      const { order_id, ct_id, ctType } = req.body as {
        order_id: string; ct_id: string | number; ctType: string | number;
      };
      if (!order_id || ct_id === undefined || ctType === undefined) {
        res.status(400).json({ code: -1, msg: "Missing order_id, ct_id, or ctType" });
        return;
      }
      const form = buildMultipart({
        order_id: String(order_id),
        ct_id: String(ct_id),
        ctType: String(ctType),
      });
      const r = await fetch(`${base}${paths.pickup}`, {
        method: "POST",
        headers: { ...commonHeaders, indiatoken: token },
        body: form,
      });
      await forwardUpstream(req, res, `${slug}:pickup`, r);
    } catch (err: any) {
      req.log.error({ err: err?.message, slug }, "pickup proxy threw");
      res.status(502).json({ code: -1, msg: `Proxy error: ${err?.message || "unknown"}` });
    }
  });

  // Process payment slip — cancel or finish a Paying order
  router.post(`/${slug}/processpayment`, async (req, res) => {
    try {
      const token = getToken(req, res); if (!token) return;
      const { order_id, process: action, cancel_remark } = req.body as {
        order_id: string; process: "cancel" | "finish"; cancel_remark?: string;
      };
      if (!order_id || !action) {
        res.status(400).json({ code: -1, msg: "Missing order_id or process" });
        return;
      }
      if (action !== "cancel" && action !== "finish") {
        res.status(400).json({ code: -1, msg: "process must be 'cancel' or 'finish'" });
        return;
      }
      const fields: Record<string, string> = { order_id: String(order_id), process: action };
      if (action === "cancel") {
        fields.cancel_remark = cancel_remark && cancel_remark.trim() ? cancel_remark : "Don't want to buy";
      }
      const form = buildMultipart(fields);
      const r = await fetch(`${base}${paths.processpayment}`, {
        method: "POST",
        headers: { ...commonHeaders, indiatoken: token },
        body: form,
      });
      await forwardUpstream(req, res, `${slug}:processpayment`, r);
    } catch (err: any) {
      req.log.error({ err: err?.message, slug }, "processpayment proxy threw");
      res.status(502).json({ code: -1, msg: `Proxy error: ${err?.message || "unknown"}` });
    }
  });

  // Payment slip detail
  router.get(`/${slug}/orderdetail`, async (req, res) => {
    try {
      const token = getToken(req, res); if (!token) return;
      const { id, ctime } = req.query as { id?: string; ctime?: string };
      if (!id || !ctime) {
        res.status(400).json({ code: -1, msg: "Missing id or ctime" });
        return;
      }
      const url = `${base}${paths.orderdetail}?id=${encodeURIComponent(id)}&ctime=${encodeURIComponent(ctime)}`;
      const r = await fetch(url, { headers: { ...commonHeaders, indiatoken: token } });
      res.json(await r.json());
    } catch (err: any) {
      req.log.error({ err: err?.message, slug }, "orderdetail proxy threw");
      res.status(502).json({ code: -1, msg: `Proxy error: ${err?.message || "unknown"}` });
    }
  });

  return router;
}
