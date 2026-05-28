import { Router } from "express";

const router = Router();

const BASE = "https://api.h5r1xc.xyz/xxapi";
const GATE_HEADER = "A7K9X2M8Q4P1Z";
const CLIENT_ID = "qCugMQpFELOzY3tDqpWHWP0ZJxoChfXpqAxoemiO";
const ORIGIN = "https://tivrapay9.com";
const REFERER = "https://tivrapay9.com/";
const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

const commonHeaders: Record<string, string> = {
  accept: "application/json, text/plain, */*",
  "accept-language": "en-us",
  origin: ORIGIN,
  referer: REFERER,
  "x-rs-cfg-tivpayreqgate": GATE_HEADER,
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
};

function buildMultipart(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return form;
}

// Step 1: Verify phone + password credentials
router.post("/tivra/check", async (req, res) => {
  try {
    const { phone, password } = req.body as { phone: string; password: string };
    const form = buildMultipart({ phone, password });
    const r = await fetch(`${BASE}/checkSmsNew`, {
      method: "POST",
      headers: commonHeaders,
      body: form,
    });
    res.json(await r.json());
  } catch (err) {
    res.status(502).json({ code: -1, msg: "Proxy error" });
  }
});

// Step 2: Get a send-token using dummy token
router.post("/tivra/sendtoken", async (req, res) => {
  try {
    const { phone } = req.body as { phone: string };
    const params = new URLSearchParams({
      token: DUMMY_TOKEN,
      clientId: CLIENT_ID,
      phone,
    });
    const r = await fetch(`${BASE}/getsendtken`, {
      method: "POST",
      headers: {
        ...commonHeaders,
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: params.toString(),
    });
    res.json(await r.json());
  } catch (err) {
    res.status(502).json({ code: -1, msg: "Proxy error" });
  }
});

// Step 3: Trigger OTP SMS (if new IP, server sends OTP)
router.post("/tivra/sendlogin", async (req, res) => {
  try {
    const { phone, password, sendtoken } = req.body as {
      phone: string;
      password: string;
      sendtoken: string;
    };
    const form = buildMultipart({ phone, sendtoken, password, clientId: CLIENT_ID });
    const r = await fetch(`${BASE}/sendLoginSms`, {
      method: "POST",
      headers: commonHeaders,
      body: form,
    });
    res.json(await r.json());
  } catch (err) {
    res.status(502).json({ code: -1, msg: "Proxy error" });
  }
});

// Step 4: Final login — returns logintoken
router.post("/tivra/login", async (req, res) => {
  try {
    const { phone, password, ip, sendtoken, smscode } = req.body as {
      phone: string;
      password: string;
      ip: string;
      sendtoken: string;
      smscode?: string;
    };
    const form = buildMultipart({
      phone,
      password,
      ip,
      sendtoken,
      smscode: smscode ?? "",
      clientId: CLIENT_ID,
    });
    const r = await fetch(`${BASE}/login`, {
      method: "POST",
      headers: commonHeaders,
      body: form,
    });
    res.json(await r.json());
  } catch (err) {
    res.status(502).json({ code: -1, msg: "Proxy error" });
  }
});

// Step 5: Fetch user info using logintoken
router.get("/tivra/userinfo", async (req, res) => {
  try {
    const token = req.headers["x-tivra-token"] as string;
    if (!token) {
      res.status(400).json({ code: -1, msg: "Missing token" });
      return;
    }
    const r = await fetch(`${BASE}/userinfo`, {
      headers: { ...commonHeaders, indiatoken: token },
    });
    res.json(await r.json());
  } catch (err) {
    res.status(502).json({ code: -1, msg: "Proxy error" });
  }
});

// Pending orders history
router.get("/tivra/orders", async (req, res) => {
  try {
    const token = req.headers["x-tivra-token"] as string;
    if (!token) {
      res.status(400).json({ code: -1, msg: "Missing token" });
      return;
    }
    const { page = "1", limit = "10" } = req.query as { page?: string; limit?: string };
    const url = `${BASE}/buyitoken/history?page=${page}&limit=${limit}&currency=inr`;
    const r = await fetch(url, {
      headers: { ...commonHeaders, indiatoken: token },
    });
    res.json(await r.json());
  } catch (err) {
    res.status(502).json({ code: -1, msg: "Proxy error" });
  }
});

export default router;
