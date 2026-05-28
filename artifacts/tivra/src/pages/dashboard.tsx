import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { 
  Loader2, LayoutDashboard, Users, Clock, Wrench, 
  ShoppingCart, ScrollText, LogOut, Power, Menu,
  Search, X, Plus, RefreshCw
} from "lucide-react";
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
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Account Manager", icon: Users },
  { label: "Order History", icon: Clock },
  { label: "Tools Status", icon: Wrench },
  { label: "Orders", icon: ShoppingCart },
  { label: "Live Logs", icon: ScrollText },
];

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
  const [waitOrdersLoading, setWaitOrdersLoading] = useState(false);
  const [waitOrdersAuto, setWaitOrdersAuto] = useState(false);

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

  // Load accounts on mount
  useEffect(() => {
    try {
      const storedAccounts = localStorage.getItem("tivra_accounts");
      if (storedAccounts) {
        setAccounts(JSON.parse(storedAccounts));
      }
    } catch (e) {
      // ignore
    }
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
    setAddInput("");
    
    toast({
      title: `Added ${addedCount} account(s)`
    });
  };

  const handleRemoveAccount = (account: string) => {
    const updated = accounts.filter(a => a !== account);
    setAccounts(updated);
    localStorage.setItem("tivra_accounts", JSON.stringify(updated));
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

  const fetchWaitOrders = async () => {
    const pToken = localStorage.getItem("tivra_platform_token");
    if (!pToken) return;
    setWaitOrdersLoading(true);
    try {
      const res = await platformFetch("/api/tivra/waitorders", {
        headers: { "x-tivra-token": pToken },
      });
      if (res.code === 0) {
        const filtered = (res.data?.list || []).filter(
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

  // Fetch orders / tools when active section changes (declared after the functions they call)
  useEffect(() => {
    if (activeSection === "Order History") fetchOrders(1);
    if (activeSection === "Tools Status") fetchTools();
    if (activeSection === "Orders") fetchWaitOrders();
  }, [activeSection]);

  // Auto-refresh waitOrders every 5s when toggle is on and section is active
  const waitOrdersAutoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (waitOrdersAutoRef.current) { clearInterval(waitOrdersAutoRef.current); waitOrdersAutoRef.current = null; }
    if (waitOrdersAuto && activeSection === "Orders") {
      waitOrdersAutoRef.current = setInterval(() => { fetchWaitOrders(); }, 5000);
    }
    return () => { if (waitOrdersAutoRef.current) clearInterval(waitOrdersAutoRef.current); };
  }, [waitOrdersAuto, activeSection]);

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
          {MENU_ITEMS.map((item) => (
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
                        return (
                          <li key={tool.id} className="flex items-center gap-3 py-3 px-4 hover:bg-muted/40 transition-colors duration-150">
                            {/* Status dot */}
                            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${online ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                            {/* UPI + ID */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{tool.upi}</p>
                              <p className="text-xs text-muted-foreground">ID {tool.id} · type {tool.ctType}</p>
                            </div>
                            {/* Badge */}
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
                          
                          return (
                            <li key={order.id || i} className="py-3 px-4 flex flex-col gap-1.5 hover:bg-muted/50 transition-colors">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-xs truncate max-w-[200px] sm:max-w-xs">{order.orderNo}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${status.color}`}>
                                  {status.label}
                                </span>
                              </div>
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
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {!waitOrdersLoading && (
                      <>
                        <span className="font-semibold text-foreground">{waitOrders.length}</span> SBIN orders
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
              </div>
            )}

            {!["Dashboard", "Account Manager", "Tools Status", "Order History", "Orders"].includes(activeSection) && (
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
