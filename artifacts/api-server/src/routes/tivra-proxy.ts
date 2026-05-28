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

// Waiting payment slip orders (active orders to pay)
router.get("/tivra/waitorders", async (req, res) => {
  try {
    const token = req.headers["x-tivra-token"] as string;
    if (!token) {
      res.status(400).json({ code: -1, msg: "Missing token" });
      return;
    }
    const url = `${BASE}/buyitoken/waitpayerpaymentslip?page=1&limit=50&if_asc=false&min_amount=5000&max_amount=100000&method=1&date_asc=1`;
    const r = await fetch(url, {
      headers: { ...commonHeaders, indiatoken: token },
    });
    res.json(await r.json());
  } catch (err) {
    res.status(502).json({ code: -1, msg: "Proxy error" });
  }
});

// Collection tool list
router.get("/tivra/tools", async (req, res) => {
  try {
    const token = req.headers["x-tivra-token"] as string;
    if (!token) {
      res.status(400).json({ code: -1, msg: "Missing token" });
      return;
    }
    const r = await fetch(`${BASE}/collectiontoollist`, {
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

// Pickup (buy) an order — multipart with order_id, ct_id, ctType
router.post("/tivra/pickup", async (req, res) => {
  try {
    const token = req.headers["x-tivra-token"] as string;
    if (!token) {
      res.status(400).json({ code: -1, msg: "Missing token" });
      return;
    }
    const { order_id, ct_id, ctType } = req.body as {
      order_id: string;
      ct_id: string | number;
      ctType: string | number;
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
    const r = await fetch(`${BASE}/buyitoken/pickuppaymentslip`, {
      method: "POST",
      headers: { ...commonHeaders, indiatoken: token },
      body: form,
    });
    res.json(await r.json());
  } catch (err) {
    res.status(502).json({ code: -1, msg: "Proxy error" });
  }
});

// Process payment slip — cancel or finish a Paying order
router.post("/tivra/processpayment", async (req, res) => {
  try {
    const token = req.headers["x-tivra-token"] as string;
    if (!token) {
      res.status(400).json({ code: -1, msg: "Missing token" });
      return;
    }
    const { order_id, process, cancel_remark } = req.body as {
      order_id: string;
      process: "cancel" | "finish";
      cancel_remark?: string;
    };
    if (!order_id || !process) {
      res.status(400).json({ code: -1, msg: "Missing order_id or process" });
      return;
    }
    if (process !== "cancel" && process !== "finish") {
      res.status(400).json({ code: -1, msg: "process must be 'cancel' or 'finish'" });
      return;
    }
    const fields: Record<string, string> = {
      order_id: String(order_id),
      process,
    };
    if (process === "cancel") {
      fields.cancel_remark = cancel_remark && cancel_remark.trim() ? cancel_remark : "Don't want to buy";
    }
    const form = buildMultipart(fields);
    const r = await fetch(`${BASE}/buyitoken/processpaymentslips`, {
      method: "POST",
      headers: { ...commonHeaders, indiatoken: token },
      body: form,
    });
    res.json(await r.json());
  } catch (err) {
    res.status(502).json({ code: -1, msg: "Proxy error" });
  }
});

// Payment slip detail
router.get("/tivra/orderdetail", async (req, res) => {
  try {
    const token = req.headers["x-tivra-token"] as string;
    if (!token) {
      res.status(400).json({ code: -1, msg: "Missing token" });
      return;
    }
    const { id, ctime } = req.query as { id?: string; ctime?: string };
    if (!id || !ctime) {
      res.status(400).json({ code: -1, msg: "Missing id or ctime" });
      return;
    }
    const url = `${BASE}/buyitoken/paymentslipdetail?id=${encodeURIComponent(id)}&ctime=${encodeURIComponent(ctime)}`;
    const r = await fetch(url, {
      headers: { ...commonHeaders, indiatoken: token },
    });
    res.json(await r.json());
  } catch (err) {
    res.status(502).json({ code: -1, msg: "Proxy error" });
  }
});

export default router;
