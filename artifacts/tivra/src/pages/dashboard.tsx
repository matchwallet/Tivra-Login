import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { 
  Loader2, LayoutDashboard, Users, Clock, Wrench, 
  ShoppingCart, ScrollText, LogOut, Power, Menu,
  Search, X, Plus, RefreshCw, Shield, Star, CheckCircle2, AlertCircle, Info
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type PlatformUser = {
  username: string;
  itoken: number | string;
  frozenItoken: number | string;
  totalProfit: number | string;
};

const MENU_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { label: "Account Manager", icon: Users, adminOnly: false },
  { label: "Order History", icon: Clock, adminOnly: false },
  { label: "Tools Status", icon: Wrench, adminOnly: false },
  { label: "Orders", icon: ShoppingCart, adminOnly: false },
  { label: "Live Logs", icon: ScrollText, adminOnly: false },
  { label: "Admin", icon: Shield, adminOnly: true },
];

type DefaultTool = { id: number | string; ctType: number | string; upi: string };
type PickupLog = { id: string; ts: number; level: "info" | "success" | "warn" | "error"; message: string };
type AdminUserRow = { id: number; email: string; name: string; role: string; showOrderLogs: boolean };

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: user, isLoading, error } = useGetMe({ 
    query: { retry: false },
    request: { headers: { Authorization: `Bearer ${localStorage.getItem("tivra_token") || ""}` } }
  });

  const logout = useLogout();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("Dashboard");
  const [platformUser, setPlatformUser] = useState<PlatformUser | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<1 | 2 | 3>(1);
  const [isLoadingPlatform, setIsLoadingPlatform] = useState(false);

  // Form state
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [sendtoken, setSendtoken] = useState("");
  const [loginMode, setLoginMode] = useState<"credentials" | "token">("credentials");
  const [manualToken, setManualToken] = useState("");

  // Account Manager state
  const [accounts, setAccounts] = useState<string[]>([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [addInput, setAddInput] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);

  // Pending Orders state
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersTotal, setOrdersTotal] = useState(0);

  // Tools Status state
  const [tools, setTools] = useState<any[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);

  // Active Orders (waiting payment) state
  const [waitOrders, setWaitOrders] = useState<any[]>([]);
  const [waitOrdersTotal, setWaitOrdersTotal] = useState(0);
  const [waitOrdersLoading, setWaitOrdersLoading] = useState(false);
  const [waitOrdersAuto, setWaitOrdersAuto] = useState(false);

  // Default tool & pickup logs
  const [defaultTool, setDefaultTool] = useState<DefaultTool | null>(() => {
    try { const s = localStorage.getItem("tivra_default_tool"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [pickupLogs, setPickupLogs] = useState<PickupLog[]>([]);
  const pickupBusyRef = useRef(false);
  const handledRptsRef = useRef<Set<string>>(new Set());

  // Admin state
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);

  // Process-payment (cancel / finish) dialog state
  const [processOrder, setProcessOrder] = useState<any | null>(null);
  const [processBusy, setProcessBusy] = useState(false);
  const [cancelRemark, setCancelRemark] = useState("Don't want to buy");

  useEffect(() => {
    if (error) {
      localStorage.removeItem("tivra_token");
      setLocation("/");
      toast({
        variant: "destructive",
        title: "Session expired",
        description: "Please log in again.",
      });
    }
  }, [error, setLocation, toast]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("tivra_platform_user");
      if (stored) {
        setPlatformUser(JSON.parse(stored));
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Load accounts on mount: server is source of truth, localStorage is cache
  useEffect(() => {
    // 1. Hydrate from cache immediately so UI/autoTick don't see empty state
    try {
      const storedAccounts = localStorage.getItem("tivra_accounts");
      if (storedAccounts) setAccounts(JSON.parse(storedAccounts));
    } catch (e) {
      // ignore
    }
    // 2. Fetch authoritative list from server, then mirror to localStorage
    const jwt = localStorage.getItem("tivra_jwt");
    if (jwt) {
      fetch("/api/me/accounts", { headers: { Authorization: `Bearer ${jwt}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.accounts)) {
            setAccounts(data.accounts);
            localStorage.setItem("tivra_accounts", JSON.stringify(data.accounts));
          }
        })
        .catch(() => {});
    }
    // 3. Cross-tab sync: if another tab edits accounts, mirror into this tab
    const onStorage = (e: StorageEvent) => {
      if (e.key === "tivra_accounts" && e.newValue) {
        try { setAccounts(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ── Platform session management ───────────────────────────────────────────

  const handlePlatformSessionExpired = useCallback(() => {
    localStorage.removeItem("tivra_platform_token");
    localStorage.removeItem("tivra_platform_user");
    setPlatformUser(null);
    setModalStep(1);
    setPhone("");
    setPassword("");
    setOtp("");
    setSendtoken("");
    setIsModalOpen(true);
    toast({
      variant: "destructive",
      title: "Platform session expired",
      description: "Please log in to the platform again.",
    });
  }, [toast]);

  // Wrapper: fetch any /api/tivra/* endpoint and auto-handle 403
  const platformFetch = useCallback(async (input: RequestInfo, init?: RequestInit): Promise<any> => {
    const res = await fetch(input, init);
    const json = await res.json();
    if (json.code === 403) {
      handlePlatformSessionExpired();
      throw new Error("session_expired");
    }
    return json;
  }, [handlePlatformSessionExpired]);

  // Background poll: verify platform session every 5 s
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const token = localStorage.getItem("tivra_platform_token");
    if (!token || !platformUser) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const check = async () => {
      try {
        const json = await fetch("/api/tivra/userinfo", {
          headers: { "x-tivra-token": localStorage.getItem("tivra_platform_token") || "" },
        }).then(r => r.json());
        if (json.code === 403) handlePlatformSessionExpired();
      } catch { /* network errors are silent */ }
    };
    pollRef.current = setInterval(check, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [platformUser, handlePlatformSessionExpired]);

  const handleAppLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        localStorage.removeItem("tivra_token");
        setLocation("/");
      }
    });
  };

  const handlePlatformLogout = () => {
    localStorage.removeItem("tivra_platform_token");
    localStorage.removeItem("tivra_platform_user");
    setPlatformUser(null);
    toast({
      title: "Platform Logged Out",
      description: "Successfully disconnected from Tivra platform."
    });
  };

  const handlePlatformLoginNext = async () => {
    setIsLoadingPlatform(true);
    try {
      if (modalStep === 1) {
        const checkRes = await fetch("/api/tivra/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, password })
        }).then(r => r.json());
        if (checkRes.code !== 0) throw new Error(checkRes.msg || "Invalid credentials");

        const tokenRes = await fetch("/api/tivra/sendtoken", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone })
        }).then(r => r.json());

        if (tokenRes.code === 2085) {
          await executeFinalLogin("", "0000");
          return;
        }

        if (tokenRes.code !== 0) throw new Error(tokenRes.msg || "Failed to get send token");

        const currentSendtoken = tokenRes.data as string;
        setSendtoken(currentSendtoken);

        const sendRes = await fetch("/api/tivra/sendlogin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, password, sendtoken: currentSendtoken })
        }).then(r => r.json());

        if (sendRes.code === 2085 || sendRes.data !== "Send Success") {
          await executeFinalLogin(currentSendtoken, "0000");
        } else {
          setModalStep(2);
        }
      } else if (modalStep === 2) {
        await executeFinalLogin(sendtoken, otp);
      } else if (modalStep === 3) {
        setIsModalOpen(false);
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Login Error",
        description: error.message
      });
    } finally {
      setIsLoadingPlatform(false);
    }
  };

  const executeFinalLogin = async (stoken: string, smscode: string) => {
    let ipObj: any = {};
    try {
      ipObj = JSON.parse(localStorage.getItem("tivra_ip") || "{}");
    } catch (e) {}
    const ip = ipObj.ip || "";

    const res = await fetch("/api/tivra/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password, ip, sendtoken: stoken, smscode })
    }).then(r => r.json());
    
    if (res.code !== 0) throw new Error(res.msg || "Login failed");

    const logintoken = res.data as string;
    localStorage.setItem("tivra_platform_token", logintoken);

    toast({
      title: "Platform token received",
      description: logintoken,
    });

    const userRes = await fetch("/api/tivra/userinfo", {
      method: "GET",
      headers: { "x-tivra-token": logintoken }
    }).then(r => r.json());
    
    if (userRes.code !== 0) throw new Error(userRes.msg || "Failed to fetch user info");
    
    const userData = userRes.data;
    localStorage.setItem("tivra_platform_user", JSON.stringify(userData));
    setPlatformUser({
      username: userData.username,
      itoken: userData.itoken,
      frozenItoken: userData.frozenItoken,
      totalProfit: userData.totalProfit
    });
    setModalStep(3);
  };

  const openPlatformLogin = () => {
    setModalStep(1);
    setPhone("");
    setPassword("");
    setOtp("");
    setSendtoken("");
    setManualToken("");
    setLoginMode("credentials");
    setIsModalOpen(true);
  };

  const handleTokenLogin = async () => {
    const token = manualToken.trim();
    if (!token) return;
    setIsLoadingPlatform(true);
    try {
      const userRes = await fetch("/api/tivra/userinfo", {
        method: "GET",
        headers: { "x-tivra-token": token }
      }).then(r => r.json());

      if (userRes.code !== 0) throw new Error(userRes.msg || "Invalid token");

      const userData = userRes.data;
      localStorage.setItem("tivra_platform_token", token);
      localStorage.setItem("tivra_platform_user", JSON.stringify(userData));
      setPlatformUser({
        username: userData.username,
        itoken: userData.itoken,
        frozenItoken: userData.frozenItoken,
        totalProfit: userData.totalProfit
      });
      toast({
        title: "Connected with token",
        description: `Signed in as ${userData.username}`,
      });
      setModalStep(3);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Token Login Failed",
        description: error.message
      });
    } finally {
      setIsLoadingPlatform(false);
    }
  };

  const handleAddAccounts = () => {
    if (!addInput.trim()) return;
    
    const tokens = addInput.split(/[\s\n]+/).filter(t => t.length > 0);
    const validTokens = tokens.filter(t => /^\d{4}$/.test(t));
    
    if (validTokens.length === 0) {
      toast({
        title: "No valid 4-digit numbers found",
        variant: "destructive"
      });
      return;
    }
    
    const newAccountsSet = new Set([...accounts, ...validTokens]);
    const newAccountsArray = Array.from(newAccountsSet);
    
    const addedCount = newAccountsArray.length - accounts.length;
    
    setAccounts(newAccountsArray);
    localStorage.setItem("tivra_accounts", JSON.stringify(newAccountsArray));
    persistAccounts(newAccountsArray);
    setAddInput("");
    
    toast({
      title: `Added ${addedCount} account(s)`
    });
  };

  const handleRemoveAccount = (account: string) => {
    const updated = accounts.filter(a => a !== account);
    setAccounts(updated);
    localStorage.setItem("tivra_accounts", JSON.stringify(updated));
    persistAccounts(updated);
  };

  const persistAccounts = (accounts: string[]) => {
    const jwt = localStorage.getItem("tivra_jwt");
    if (!jwt) return;
    fetch("/api/me/accounts", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ accounts }),
    }).catch(() => {});
  };

  const fetchOrders = async (page: number) => {
    const pToken = localStorage.getItem("tivra_platform_token");
    if (!pToken) return;
    setOrdersLoading(true);
    try {
      const res = await platformFetch(`/api/tivra/orders?page=${page}&limit=10`, {
        headers: { "x-tivra-token": pToken },
      });
      if (res.code === 0) {
        if (page === 1) {
          setOrders(res.data.list || []);
        } else {
          setOrders((prev: any[]) => [...prev, ...(res.data.list || [])]);
        }
        setOrdersTotal(res.data.total || 0);
        setOrdersPage(page);
      }
    } catch (e: any) {
      if (e?.message !== "session_expired") console.error("Failed to fetch orders", e);
    } finally {
      setOrdersLoading(false);
    }
  };

  const fetchTools = async () => {
    const pToken = localStorage.getItem("tivra_platform_token");
    if (!pToken) return;
    setToolsLoading(true);
    try {
      const res = await platformFetch("/api/tivra/tools", {
        headers: { "x-tivra-token": pToken },
      });
      if (res.code === 0) {
        const filtered = (res.data as any[]).filter(
          t => t.upi && (t.upi.includes("@mbkns") || t.upi.includes("@freecharge"))
        );
        setTools(filtered);
      }
    } catch (e: any) {
      if (e?.message !== "session_expired") { /* ignore */ }
    } finally {
      setToolsLoading(false);
    }
  };

  const addPickupLog = useCallback((level: PickupLog["level"], message: string) => {
    setPickupLogs(prev => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), level, message },
      ...prev,
    ].slice(0, 100));
  }, []);

  const setToolAsDefault = (tool: any) => {
    const d: DefaultTool = { id: tool.id, ctType: tool.ctType, upi: tool.upi };
    localStorage.setItem("tivra_default_tool", JSON.stringify(d));
    setDefaultTool(d);
    toast({ title: "Default tool set", description: tool.upi });
  };

  const clearDefaultTool = () => {
    localStorage.removeItem("tivra_default_tool");
    setDefaultTool(null);
    toast({ title: "Default tool cleared" });
  };

  const notify = (title: string, body: string) => {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(title, { body });
      }
    } catch { /* ignore */ }
  };

  const fetchAdminUsers = async () => {
    setAdminLoading(true);
    try {
      const r = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${localStorage.getItem("tivra_token") || ""}` },
      });
      if (r.ok) setAdminUsers(await r.json());
    } finally {
      setAdminLoading(false);
    }
  };

  const updateUserShowOrderLogs = async (id: number, showOrderLogs: boolean) => {
    const r = await fetch(`/api/admin/users/${id}/show-order-logs`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("tivra_token") || ""}`,
      },
      body: JSON.stringify({ showOrderLogs }),
    });
    if (r.ok) {
      setAdminUsers(prev => prev.map(u => (u.id === id ? { ...u, showOrderLogs } : u)));
      toast({ title: "Updated", description: `Order logs ${showOrderLogs ? "enabled" : "disabled"}.` });
    } else {
      toast({ variant: "destructive", title: "Update failed" });
    }
  };

  const processPaymentSlip = async (order: any, action: "cancel" | "finish") => {
    const pToken = localStorage.getItem("tivra_platform_token");
    if (!pToken) return;
    setProcessBusy(true);
    try {
      const body: any = { order_id: order.rptNo || order.orderNo, process: action };
      if (action === "cancel") body.cancel_remark = cancelRemark || "Don't want to buy";
      const r = await platformFetch("/api/tivra/processpayment", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tivra-token": pToken },
        body: JSON.stringify(body),
      });
      if (r.code === 0) {
        toast({
          title: action === "cancel" ? "Order cancelled" : "Order marked paid",
          description: order.orderNo,
        });
        setProcessOrder(null);
        setCancelRemark("Don't want to buy");
        fetchOrders(1);
      } else {
        toast({
          variant: "destructive",
          title: action === "cancel" ? "Cancel failed" : "Mark paid failed",
          description: r.msg || "Unknown error",
        });
      }
    } catch (e: any) {
      if (e?.message !== "session_expired") {
        toast({ variant: "destructive", title: "Request failed", description: e?.message || String(e) });
      }
    } finally {
      setProcessBusy(false);
    }
  };

  const fetchWaitOrders = async () => {
    const pToken = localStorage.getItem("tivra_platform_token");
    if (!pToken) return;
    setWaitOrdersLoading(true);
    try {
      const res = await platformFetch("/api/tivra/waitorders", {
        headers: { "x-tivra-token": pToken },
      });
      if (res.code === 0) {
        const list = res.data?.list || [];
        setWaitOrdersTotal(list.length);
        const filtered = list.filter(
          (o: any) => typeof o.acctCode === "string" && o.acctCode.startsWith("SBIN")
        );
        setWaitOrders(filtered);
      }
    } catch (e: any) {
      if (e?.message !== "session_expired") { /* ignore */ }
    } finally {
      setWaitOrdersLoading(false);
    }
  };

  // Auto-buy tick: runs the entire pipeline on each interval
  const autoTick = useCallback(async () => {
    if (pickupBusyRef.current) return;
    const pToken = localStorage.getItem("tivra_platform_token");
    if (!pToken) return;
    // Claim the tick immediately so a slow tick can never overlap with the next interval.
    pickupBusyRef.current = true;
    try {
    // 1. Always fetch wait orders first so the count updates every tick,
    //    regardless of any guard failures below.
    let sbinOrders: any[] = [];
    try {
      const woRes = await platformFetch("/api/tivra/waitorders", {
        headers: { "x-tivra-token": pToken },
      });
      if (woRes.code === 0) {
        const list = woRes.data?.list || [];
        setWaitOrdersTotal(list.length);
        sbinOrders = list.filter(
          (o: any) => typeof o.acctCode === "string" && o.acctCode.startsWith("SBIN")
        );
        setWaitOrders(sbinOrders);
      }
    } catch (e: any) {
      if (e?.message === "session_expired") return;
    }

    // 2. Read default tool
    const dtRaw = localStorage.getItem("tivra_default_tool");
    if (!dtRaw) {
      addPickupLog("warn", "No default tool selected — open Tools Status to pick one.");
      setWaitOrdersAuto(false);
      return;
    }
    let dt: DefaultTool;
    try { dt = JSON.parse(dtRaw); } catch { addPickupLog("error", "Default tool config invalid."); setWaitOrdersAuto(false); return; }

    // 3. Hard abort if user already has a Paying order
    try {
      const histRes = await platformFetch("/api/tivra/orders?page=1&limit=10", {
        headers: { "x-tivra-token": pToken },
      });
      if (histRes.code === 0) {
        const paying = (histRes.data?.list || []).find((o: any) => o.orderState === 1);
        if (paying) {
          addPickupLog("error", `Hard abort — order ${paying.orderNo} is still Paying.`);
          setWaitOrdersAuto(false);
          return;
        }
      }
    } catch (e: any) {
      if (e?.message === "session_expired") return;
    }

    // 4. Confirm default tool is online
    try {
      const toolsRes = await platformFetch("/api/tivra/tools", {
        headers: { "x-tivra-token": pToken },
      });
      if (toolsRes.code === 0) {
        const list: any[] = toolsRes.data || [];
        const match = list.find(t => String(t.id) === String(dt.id));
        if (!match) { addPickupLog("warn", `Default tool ${dt.upi} not in tool list.`); return; }
        if (match.state !== 2) { addPickupLog("warn", `Default tool ${dt.upi} is offline — skipping tick.`); return; }
        setTools(list.filter(t => t.upi && (t.upi.includes("@mbkns") || t.upi.includes("@freecharge"))));
      }
    } catch (e: any) {
      if (e?.message === "session_expired") return;
    }

    // 5. Filter by acctNo last-4 matching saved accounts
    const accountsRaw = localStorage.getItem("tivra_accounts");
    const savedAccounts: string[] = accountsRaw ? (() => { try { return JSON.parse(accountsRaw); } catch { return []; } })() : [];
    if (savedAccounts.length === 0) {
      addPickupLog("warn", "No saved accounts in Account Manager — auto cannot match.");
      return;
    }
    const matches = sbinOrders.filter((o: any) => {
      const acct = String(o.acctNo || "");
      if (acct.length < 4) return false;
      const last4 = acct.slice(-4);
      return savedAccounts.includes(last4) && !handledRptsRef.current.has(String(o.rptNo));
    });
    if (matches.length === 0) {
      addPickupLog("info", `No matching SBIN orders — scanned ${sbinOrders.length}.`);
      return;
    }

    // 6. Pickup first match
    const pick = matches[0];
    addPickupLog("info", `Picking up ${pick.rptNo} · ₹${pick.amount} · ${pick.acctName} (…${String(pick.acctNo).slice(-4)})`);
    try {
      const buyRes = await platformFetch("/api/tivra/pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tivra-token": pToken },
        body: JSON.stringify({ order_id: pick.rptNo, ct_id: dt.id, ctType: dt.ctType }),
      });
      if (buyRes.code !== 0) {
        // Only dedup on success — let transient failures be retried on the next tick.
        addPickupLog("error", `Pickup failed: ${buyRes.msg || "unknown error"}`);
        return;
      }
      handledRptsRef.current.add(String(pick.rptNo));
      const { ctime } = buyRes.data || {};
      addPickupLog("success", `Picked up ${pick.rptNo} via ${dt.upi}.`);

      // 7. Fetch detail and notify
      try {
        const detailRes = await platformFetch(`/api/tivra/orderdetail?id=${encodeURIComponent(pick.rptNo)}&ctime=${encodeURIComponent(ctime)}`, {
          headers: { "x-tivra-token": pToken },
        });
        if (detailRes.code === 0) {
          const d = detailRes.data;
          addPickupLog("success", `Detail: ₹${d.amount} → ${d.payee_recipients_name} (${d.payee_bank_account})`);
          notify("Order Picked Up", `₹${d.amount} · ${d.payee_recipients_name} · ${d.payee_bank_account}`);
        }
      } catch (e: any) {
        if (e?.message !== "session_expired") addPickupLog("warn", "Order detail fetch failed.");
      }
    } catch (e: any) {
      if (e?.message !== "session_expired") addPickupLog("error", `Pickup error: ${e?.message || e}`);
    }
    } finally {
      pickupBusyRef.current = false;
    }
  }, [addPickupLog]);

  // Fetch orders / tools when active section changes (declared after the functions they call)
  useEffect(() => {
    if (activeSection === "Order History") fetchOrders(1);
    if (activeSection === "Tools Status") fetchTools();
    if (activeSection === "Orders") fetchWaitOrders();
    if (activeSection === "Admin") fetchAdminUsers();
  }, [activeSection]);

  // Auto-buy loop: runs every 5s when toggle is on AND on Orders section
  const waitOrdersAutoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (waitOrdersAutoRef.current) { clearInterval(waitOrdersAutoRef.current); waitOrdersAutoRef.current = null; }
    if (waitOrdersAuto && activeSection === "Orders") {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
      addPickupLog("info", "Auto-buy started.");
      autoTick();
      waitOrdersAutoRef.current = setInterval(() => { autoTick(); }, 5000);
    } else if (!waitOrdersAuto) {
      // clear seen-set when user toggles off so we can re-attempt next time
      handledRptsRef.current.clear();
    }
    return () => { if (waitOrdersAutoRef.current) clearInterval(waitOrdersAutoRef.current); };
  }, [waitOrdersAuto, activeSection, autoTick, addPickupLog]);

  const filteredAccounts = accounts.filter(a => a.includes(accountSearch));

  if (isLoading) {
    return (
      <div className="min-h-screen flex">
        <div className="w-64 border-r border-border bg-card hidden md:block"></div>
        <div className="flex-1 flex flex-col">
          <header className="h-16 flex items-center px-8 border-b border-border bg-card">
            <Skeleton className="h-9 w-24 ml-auto" />
          </header>
          <main className="flex-1 p-8">
            <Skeleton className="h-32 w-full max-w-4xl" />
          </main>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-[100dvh] flex bg-background text-foreground">
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } fixed md:relative z-30 md:z-10 top-0 left-0 h-screen border-r border-border bg-card flex flex-col transition-all duration-300 overflow-hidden flex-shrink-0`}
      >
        <div className="h-16 flex items-center border-b border-border px-4">
          <div className="font-bold text-xl tracking-tight text-foreground truncate">Tivra</div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {MENU_ITEMS.filter(item => !item.adminOnly || (user as any)?.role === "admin").map((item) => (
            <button
              key={item.label}
              onClick={() => { setActiveSection(item.label); setSidebarOpen(false); }}
              className={`w-full flex items-center px-3 py-2 rounded-md transition-colors whitespace-nowrap ${
                activeSection === item.label
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className="h-5 w-5 flex-shrink-0 mr-3" />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-2 border-t border-border space-y-1">
          <button
            onClick={handlePlatformLogout}
            className="w-full flex items-center px-3 py-2 rounded-md transition-colors whitespace-nowrap text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-5 w-5 flex-shrink-0 mr-3" />
            <span className="font-medium">Platform Logout</span>
          </button>
          <button
            onClick={handleAppLogout}
            disabled={logout.isPending}
            data-testid="button-signout"
            className="w-full flex items-center px-3 py-2 rounded-md transition-colors whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {logout.isPending
              ? <Loader2 className="h-5 w-5 animate-spin flex-shrink-0 mr-3" />
              : <Power className="h-5 w-5 flex-shrink-0 mr-3" />
            }
            <span className="font-medium">App Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center px-6 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="mr-4 text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-medium">{activeSection}</h2>
          
          <div className="ml-auto flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline-block truncate max-w-[200px]" data-testid="text-user-email">
              {user.email}
            </span>
            
            {platformUser ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full">
                <span className="h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0"></span>
                <span className="text-sm font-medium truncate">{platformUser.username}</span>
              </div>
            ) : (
              <Button 
                onClick={openPlatformLogin}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                data-testid="button-tivra-login"
                size="sm"
              >
                Tivra Login
              </Button>
            )}
          </div>
        </header>

        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto space-y-8">
            
            {/* Dashboard Content */}
            {activeSection === "Dashboard" && (
              <div className="w-full">
                {platformUser ? (
                  <div className="flex flex-col border border-border rounded-lg bg-card overflow-hidden">
                    <div className="border-b border-border py-3 px-4 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground font-medium">Balance</span>
                      <span className="text-sm font-semibold text-foreground">{platformUser.itoken}</span>
                    </div>
                    <div className="border-b border-border py-3 px-4 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground font-medium">Frozen</span>
                      <span className="text-sm font-semibold text-foreground">{platformUser.frozenItoken}</span>
                    </div>
                    <div className="border-b border-border py-3 px-4 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground font-medium">Total Profit</span>
                      <span className="text-sm font-semibold text-foreground">{platformUser.totalProfit}</span>
                    </div>
                    <div className="py-3 px-4 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground font-medium">Username</span>
                      <span className="text-sm font-semibold text-foreground">{platformUser.username}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-3">Connect platform to see account data.</p>
                )}
              </div>
            )}

            {/* Account Manager Content */}
            {activeSection === "Account Manager" && (
              <div className="flex flex-col space-y-3">
                {/* Toolbar */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{accounts.length}</span> accounts
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant={showSearch ? "secondary" : "ghost"}
                      size="sm"
                      className="h-8 px-2.5 gap-1.5 text-xs transition-all duration-200"
                      onClick={() => { setShowSearch(p => !p); if (showSearch) setAccountSearch(""); }}
                    >
                      <Search className="h-3.5 w-3.5" />
                      Search
                    </Button>
                    <Button
                      variant={showAddPanel ? "secondary" : "ghost"}
                      size="sm"
                      className="h-8 px-2.5 gap-1.5 text-xs transition-all duration-200"
                      onClick={() => setShowAddPanel(p => !p)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>
                </div>

                {/* Search panel — animated */}
                <div className={`overflow-hidden transition-all duration-200 ease-in-out ${showSearch ? "max-h-16 opacity-100" : "max-h-0 opacity-0"}`}>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      type="text"
                      placeholder="Search by account number…"
                      className="pl-8 h-9 text-sm"
                      value={accountSearch}
                      onChange={e => setAccountSearch(e.target.value)}
                      autoFocus={showSearch}
                    />
                    {accountSearch && (
                      <button
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setAccountSearch("")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Add panel — animated */}
                <div className={`overflow-hidden transition-all duration-200 ease-in-out ${showAddPanel ? "max-h-48 opacity-100" : "max-h-0 opacity-0"}`}>
                  <div className="border border-border rounded-lg bg-card p-3 flex flex-col gap-2">
                    <Textarea
                      placeholder={"Enter 4-digit numbers separated by spaces or newlines\ne.g. 8979 9879 9877"}
                      className="resize-none text-sm h-20 text-foreground"
                      value={addInput}
                      onChange={e => setAddInput(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => { setAddInput(""); setShowAddPanel(false); }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 px-3 text-xs gap-1.5"
                        onClick={() => { handleAddAccounts(); setShowAddPanel(false); }}
                        disabled={!addInput.trim()}
                      >
                        <Plus className="h-3 w-3" /> Add
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Account list */}
                <div className="border border-border rounded-lg bg-card overflow-hidden">
                  {filteredAccounts.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground text-sm">
                      {accountSearch ? "No matching accounts." : "No accounts saved."}
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {filteredAccounts.map(account => (
                        <li key={account} className="flex items-center justify-between py-2.5 px-4 hover:bg-muted/40 transition-colors duration-150">
                          <span className="font-mono text-sm font-medium tracking-widest">{account}</span>
                          <button
                            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
                            onClick={() => handleRemoveAccount(account)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* Tools Status Content */}
            {activeSection === "Tools Status" && (
              <div className="flex flex-col space-y-3">
                {/* Toolbar */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {!toolsLoading && tools.length > 0 && (
                      <>
                        <span className="font-semibold text-emerald-600">{tools.filter(t => t.state === 2).length}</span> online
                        <span className="mx-1.5 text-border">·</span>
                        <span className="font-semibold text-foreground">{tools.filter(t => t.state !== 2).length}</span> offline
                      </>
                    )}
                  </span>
                  <button
                    onClick={fetchTools}
                    disabled={toolsLoading}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${toolsLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>

                {defaultTool && (
                  <div className="flex items-center justify-between text-xs px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
                    <span className="flex items-center gap-1.5">
                      <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                      <span className="text-muted-foreground">Default:</span>
                      <span className="font-medium text-foreground truncate">{defaultTool.upi}</span>
                    </span>
                    <button onClick={clearDefaultTool} className="text-muted-foreground hover:text-foreground">Clear</button>
                  </div>
                )}

                {!localStorage.getItem("tivra_platform_token") ? (
                  <p className="text-sm text-muted-foreground py-3">Connect platform first.</p>
                ) : toolsLoading && tools.length === 0 ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : tools.length === 0 ? (
                  <div className="border border-border rounded-lg bg-card py-10 text-center text-sm text-muted-foreground">
                    No @mbkns or @freecharge tools found.
                  </div>
                ) : (
                  <div className="border border-border rounded-lg bg-card overflow-hidden">
                    <ul className="divide-y divide-border">
                      {tools.map(tool => {
                        const online = tool.state === 2;
                        const isDefault = defaultTool && String(defaultTool.id) === String(tool.id);
                        return (
                          <li
                            key={tool.id}
                            onClick={() => setToolAsDefault(tool)}
                            className={`flex items-center gap-3 py-3 px-4 transition-colors duration-150 cursor-pointer ${
                              isDefault ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/40"
                            }`}
                          >
                            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${online ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate flex items-center gap-1.5">
                                {tool.upi}
                                {isDefault && <Star className="h-3 w-3 fill-primary text-primary flex-shrink-0" />}
                              </p>
                              <p className="text-xs text-muted-foreground">ID {tool.id} · type {tool.ctType}</p>
                            </div>
                            {isDefault && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 bg-primary/15 text-primary">
                                DEFAULT
                              </span>
                            )}
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                              online
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                                : "bg-muted text-muted-foreground"
                            }`}>
                              {online ? "Online" : "Offline"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground px-1">
                  Tap a tool to set it as the default for auto-buy.
                </p>
              </div>
            )}

            {/* Order History Content */}
            {activeSection === "Order History" && (
              <div className="flex flex-col space-y-4">
                {!localStorage.getItem("tivra_platform_token") ? (
                  <p className="text-sm text-muted-foreground py-3">Connect platform first.</p>
                ) : (
                  <div className="flex flex-col border border-border rounded-lg bg-card overflow-hidden">
                    {orders.length === 0 && !ordersLoading ? (
                      <div className="p-8 text-center text-muted-foreground text-sm">
                        No pending orders found.
                      </div>
                    ) : (
                      <ul className="divide-y divide-border">
                        {orders.map((order, i) => {
                          const orderStatusMap: Record<number, { label: string, color: string }> = {
                            1: { label: "Paying", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
                            2: { label: "Under Review", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
                            3: { label: "Success", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
                            4: { label: "Canceled", color: "bg-muted text-muted-foreground" }
                          };
                          
                          const status = orderStatusMap[order.orderState] || { label: "Unknown", color: "bg-muted text-muted-foreground" };
                          
                          const isActionable = order.orderState === 1 || order.orderState === 2;
                          const hoverCls = order.orderState === 1
                            ? "hover:bg-amber-50 dark:hover:bg-amber-900/10"
                            : order.orderState === 2
                              ? "hover:bg-blue-50 dark:hover:bg-blue-900/10"
                              : "hover:bg-muted/50";
                          return (
                            <li
                              key={order.id || i}
                              onClick={isActionable ? () => setProcessOrder(order) : undefined}
                              className={`py-3 px-4 flex flex-col gap-1.5 transition-colors ${hoverCls} ${
                                isActionable ? "cursor-pointer" : ""
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-xs truncate max-w-[200px] sm:max-w-xs">{order.orderNo}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${status.color}`}>
                                  {status.label}
                                </span>
                              </div>
                              {isActionable && (
                                <div className={`text-[10px] font-medium ${
                                  order.orderState === 1
                                    ? "text-amber-700 dark:text-amber-400"
                                    : "text-blue-700 dark:text-blue-400"
                                }`}>
                                  Tap to cancel or mark as paid
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground">
                                {order.acctName} · {order.acctNo} · {order.acctCode}
                              </div>
                              <div className="text-sm mt-0.5 flex items-center gap-2">
                                <span className="font-bold">₹{order.amount}</span>
                                <span className="text-emerald-500 font-medium">+{order.reward}</span>
                                <span className="text-muted-foreground text-xs ml-auto">
                                  {new Date(order.crtDate * 1000).toLocaleDateString()}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    
                    {ordersLoading && (
                      <div className="py-8 flex justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    
                    {orders.length > 0 && orders.length < ordersTotal && (
                      <div className="p-4 border-t border-border flex justify-center">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => fetchOrders(ordersPage + 1)}
                          disabled={ordersLoading}
                          className="flex items-center gap-2"
                        >
                          {ordersLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          Load More
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Other Sections */}
            {/* Orders (SBIN waiting payment) */}
            {activeSection === "Orders" && (
              <div className="flex flex-col space-y-3">
                {/* Default tool indicator */}
                <div className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg border ${
                  defaultTool ? "bg-primary/5 border-primary/20" : "bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-900/40"
                }`}>
                  {defaultTool ? (
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Star className="h-3.5 w-3.5 fill-primary text-primary flex-shrink-0" />
                      <span className="text-muted-foreground">Auto-buy via</span>
                      <span className="font-medium text-foreground truncate">{defaultTool.upi}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                      No default tool — pick one in Tools Status before enabling Auto.
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {!waitOrdersLoading && (
                      <>
                        <span className="font-semibold text-foreground">{waitOrders.length}</span> SBIN
                        <span className="text-muted-foreground/70"> · {waitOrdersTotal} total fetched</span>
                      </>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setWaitOrdersAuto(p => !p)}
                      className={`flex items-center gap-1.5 text-xs px-2.5 h-7 rounded-full border transition-all duration-200 ${
                        waitOrdersAuto
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                          : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full transition-all duration-200 ${
                        waitOrdersAuto ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"
                      }`} />
                      Auto {waitOrdersAuto ? "On" : "Off"}
                    </button>
                    <button
                      onClick={fetchWaitOrders}
                      disabled={waitOrdersLoading}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${waitOrdersLoading ? "animate-spin" : ""}`} />
                      Refresh
                    </button>
                  </div>
                </div>

                {!localStorage.getItem("tivra_platform_token") ? (
                  <p className="text-sm text-muted-foreground py-3">Connect platform first.</p>
                ) : waitOrdersLoading && waitOrders.length === 0 ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : waitOrders.length === 0 ? (
                  <div className="border border-border rounded-lg bg-card py-10 text-center text-sm text-muted-foreground">
                    No SBIN orders waiting.
                  </div>
                ) : (
                  <div className="border border-border rounded-lg bg-card overflow-hidden">
                    <ul className="divide-y divide-border">
                      {waitOrders.map(o => (
                        <li key={o.rptNo} className="py-3 px-4 flex flex-col gap-1 hover:bg-muted/40 transition-colors duration-150">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-mono text-xs text-muted-foreground truncate">{o.rptNo}</span>
                            <span className="font-bold text-sm flex-shrink-0">₹{o.amount}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-medium text-foreground truncate">{o.acctName}</span>
                            <span className="font-mono text-muted-foreground flex-shrink-0">{o.acctNo}</span>
                          </div>
                          <div className="text-[11px] font-mono text-primary">{o.acctCode}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Pickup logs — gated by admin-controlled showOrderLogs */}
                {(user as any)?.showOrderLogs && (
                  <div className="mt-2 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <ScrollText className="h-3.5 w-3.5 text-muted-foreground" />
                        Auto-buy Logs
                        {pickupLogs.length > 0 && (
                          <span className="text-xs text-muted-foreground font-normal">({pickupLogs.length})</span>
                        )}
                      </span>
                      {pickupLogs.length > 0 && (
                        <button
                          onClick={() => setPickupLogs([])}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="border border-border rounded-lg bg-card max-h-72 overflow-y-auto">
                      {pickupLogs.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-6 text-center">
                          No activity yet. Enable Auto to start picking up matching SBIN orders.
                        </p>
                      ) : (
                        <ul className="divide-y divide-border">
                          {pickupLogs.map(log => {
                            const map = {
                              info: { Icon: Info, cls: "text-muted-foreground" },
                              success: { Icon: CheckCircle2, cls: "text-emerald-600 dark:text-emerald-400" },
                              warn: { Icon: AlertCircle, cls: "text-amber-600 dark:text-amber-400" },
                              error: { Icon: AlertCircle, cls: "text-destructive" },
                            }[log.level];
                            const { Icon, cls } = map;
                            return (
                              <li key={log.id} className="flex items-start gap-2 px-3 py-2 text-xs">
                                <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${cls}`} />
                                <span className="font-mono text-[10px] text-muted-foreground flex-shrink-0 mt-0.5">
                                  {new Date(log.ts).toLocaleTimeString()}
                                </span>
                                <span className="text-foreground/90 break-words">{log.message}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Admin Section */}
            {activeSection === "Admin" && (user as any)?.role === "admin" && (
              <div className="flex flex-col space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {!adminLoading && (
                      <><span className="font-semibold text-foreground">{adminUsers.length}</span> users</>
                    )}
                  </span>
                  <button
                    onClick={fetchAdminUsers}
                    disabled={adminLoading}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${adminLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>

                {adminLoading && adminUsers.length === 0 ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="border border-border rounded-lg bg-card overflow-hidden">
                    <ul className="divide-y divide-border">
                      {adminUsers.map(u => (
                        <li key={u.id} className="flex items-center gap-3 py-3 px-4 hover:bg-muted/40 transition-colors duration-150">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate flex items-center gap-1.5">
                              {u.name}
                              {u.role === "admin" && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-primary/15 text-primary">ADMIN</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-muted-foreground hidden sm:inline">Order Logs</span>
                            <Switch
                              checked={u.showOrderLogs}
                              onCheckedChange={(c) => updateUserShowOrderLogs(u.id, c)}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Process Paying-order dialog */}
            <Dialog
              open={!!processOrder}
              onOpenChange={(o) => { if (!o && !processBusy) { setProcessOrder(null); setCancelRemark("Don't want to buy"); } }}
            >
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Resolve pending order</DialogTitle>
                  <DialogDescription>
                    Choose to mark this order as paid or cancel it.
                  </DialogDescription>
                </DialogHeader>
                {processOrder && (
                  <div className="flex flex-col gap-3">
                    <div className="border border-border rounded-lg p-3 bg-muted/30 text-sm space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Order</span>
                        <span className="font-mono text-xs truncate">{processOrder.orderNo}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Amount</span>
                        <span className="font-bold">₹{processOrder.amount}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Account</span>
                        <span className="text-xs truncate">{processOrder.acctName} · {processOrder.acctNo}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="cancel-remark" className="text-xs">Cancel remark (used if you cancel)</Label>
                      <Input
                        id="cancel-remark"
                        value={cancelRemark}
                        onChange={(e) => setCancelRemark(e.target.value)}
                        placeholder="Don't want to buy"
                        disabled={processBusy}
                      />
                    </div>
                  </div>
                )}
                <DialogFooter className="flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { setProcessOrder(null); setCancelRemark("Don't want to buy"); }}
                    disabled={processBusy}
                  >
                    Close
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => processOrder && processPaymentSlip(processOrder, "cancel")}
                    disabled={processBusy}
                  >
                    {processBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                    Cancel order
                  </Button>
                  <Button
                    onClick={() => processOrder && processPaymentSlip(processOrder, "finish")}
                    disabled={processBusy}
                  >
                    {processBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                    Mark as paid
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {!["Dashboard", "Account Manager", "Tools Status", "Order History", "Orders", "Admin"].includes(activeSection) && (
              <div className="flex items-center justify-center h-64 border border-dashed border-border rounded-lg bg-card/50">
                <p className="text-muted-foreground">Content for {activeSection} coming soon.</p>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* Tivra Login Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {modalStep === 1 && "Sign in to Tivra"}
              {modalStep === 2 && "Enter OTP"}
              {modalStep === 3 && "Connected"}
            </DialogTitle>
            <DialogDescription>
              {modalStep === 1 && "Connect your Tivra platform account to access tools."}
              {modalStep === 2 && "We sent a code to your phone. Please enter it below."}
              {modalStep === 3 && "Your account is successfully linked."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {modalStep === 1 && (
              <>
                <div className="flex p-1 bg-muted rounded-lg">
                  <button
                    type="button"
                    onClick={() => setLoginMode("credentials")}
                    className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all duration-200 ${
                      loginMode === "credentials"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Credentials
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoginMode("token")}
                    className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all duration-200 ${
                      loginMode === "token"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Token
                  </button>
                </div>

                {loginMode === "credentials" ? (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="Enter phone number"
                        data-testid="input-tivra-phone"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Enter password"
                        data-testid="input-tivra-password"
                      />
                    </div>
                  </>
                ) : (
                  <div className="grid gap-2">
                    <Label htmlFor="manual-token">Platform Token</Label>
                    <Input
                      id="manual-token"
                      type="text"
                      value={manualToken}
                      onChange={e => setManualToken(e.target.value)}
                      placeholder="Paste your indiatoken"
                      className="font-mono text-xs"
                      data-testid="input-tivra-token"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Skip the OTP flow by pasting a valid platform token directly.
                    </p>
                  </div>
                )}
              </>
            )}

            {modalStep === 2 && (
              <div className="grid gap-2">
                <Label htmlFor="otp">Verification Code</Label>
                <Input 
                  id="otp" 
                  type="text"
                  maxLength={6}
                  value={otp} 
                  onChange={e => setOtp(e.target.value)} 
                  placeholder="000000" 
                  className="text-center tracking-widest text-lg"
                  data-testid="input-tivra-otp"
                />
              </div>
            )}

            {modalStep === 3 && platformUser && (
              <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
                <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                  <LayoutDashboard className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">{platformUser.username}</h3>
                  <p className="text-muted-foreground mt-1">Balance: {platformUser.itoken}</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {modalStep < 3 ? (
              <Button
                onClick={modalStep === 1 && loginMode === "token" ? handleTokenLogin : handlePlatformLoginNext}
                disabled={
                  isLoadingPlatform ||
                  (modalStep === 1 && loginMode === "credentials" && (!phone || !password)) ||
                  (modalStep === 1 && loginMode === "token" && !manualToken.trim()) ||
                  (modalStep === 2 && !otp)
                }
                className="w-full"
                data-testid="button-tivra-submit"
              >
                {isLoadingPlatform ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {modalStep === 1
                  ? loginMode === "token"
                    ? "Connect with Token"
                    : "Sign In"
                  : "Verify & Connect"}
              </Button>
            ) : (
              <Button onClick={() => setIsModalOpen(false)} className="w-full" data-testid="button-tivra-close">
                Continue to Dashboard
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
