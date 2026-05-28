import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { 
  Loader2, LayoutDashboard, Users, Clock, Wrench, 
  ShoppingCart, ScrollText, LogOut, Power, Menu, ChevronLeft 
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PlatformUser = {
  username: string;
  itoken: number | string;
  frozenItoken: number | string;
  totalProfit: number | string;
};

const MENU_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Account Manager", icon: Users },
  { label: "Pending Orders", icon: Clock },
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

  const [sidebarOpen, setSidebarOpen] = useState(true);
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
        // Step 1: verify credentials
        const checkRes = await fetch("/api/tivra/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, password })
        }).then(r => r.json());
        if (checkRes.code !== 0) throw new Error(checkRes.msg || "Invalid credentials");

        // Step 2: get send token
        const tokenRes = await fetch("/api/tivra/sendtoken", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone })
        }).then(r => r.json());

        // code 2085 = server already knows this IP, no OTP needed
        if (tokenRes.code === 2085) {
          // Skip OTP entirely — login with empty sendtoken + dummy smscode
          await executeFinalLogin("", "0000");
          return;
        }

        if (tokenRes.code !== 0) throw new Error(tokenRes.msg || "Failed to get send token");

        const currentSendtoken = tokenRes.data as string;
        setSendtoken(currentSendtoken);

        // Step 3: trigger OTP SMS
        const sendRes = await fetch("/api/tivra/sendlogin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, password, sendtoken: currentSendtoken })
        }).then(r => r.json());

        if (sendRes.code === 2085 || sendRes.data !== "Send Success") {
          // No OTP needed — go straight to final login
          await executeFinalLogin(currentSendtoken, "0000");
        } else {
          // OTP was sent to phone
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
    setIsModalOpen(true);
  };

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
      {/* Sidebar */}
      <aside 
        className={`${
          sidebarOpen ? "w-64" : "w-16"
        } border-r border-border bg-card flex flex-col transition-all duration-300 flex-shrink-0 z-10 sticky top-0 h-screen`}
      >
        <div className={`h-16 flex items-center border-b border-border px-4 ${sidebarOpen ? "justify-between" : "justify-center"}`}>
          {sidebarOpen && <div className="font-bold text-xl tracking-tight text-foreground truncate">Tivra</div>}
          {!sidebarOpen && <div className="font-bold text-xl tracking-tight text-foreground flex-shrink-0">T</div>}
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.label}
              onClick={() => setActiveSection(item.label)}
              className={`w-full flex items-center rounded-md transition-colors ${sidebarOpen ? "px-3 py-2" : "justify-center py-3"} ${
                activeSection === item.label
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title={!sidebarOpen ? item.label : undefined}
            >
              <item.icon className={`h-5 w-5 flex-shrink-0 ${sidebarOpen ? "mr-3" : ""}`} />
              {sidebarOpen && <span className="font-medium truncate">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-2 border-t border-border space-y-1">
          <button
            onClick={handlePlatformLogout}
            className={`w-full flex items-center rounded-md transition-colors text-muted-foreground hover:bg-destructive/10 hover:text-destructive ${sidebarOpen ? "px-3 py-2" : "justify-center py-3"}`}
            title={!sidebarOpen ? "Platform Logout" : undefined}
          >
            <LogOut className={`h-5 w-5 flex-shrink-0 ${sidebarOpen ? "mr-3" : ""}`} />
            {sidebarOpen && <span className="font-medium truncate">Platform Logout</span>}
          </button>
          <button
            onClick={handleAppLogout}
            disabled={logout.isPending}
            data-testid="button-signout"
            className={`w-full flex items-center rounded-md transition-colors text-muted-foreground hover:bg-muted hover:text-foreground ${sidebarOpen ? "px-3 py-2" : "justify-center py-3"}`}
            title={!sidebarOpen ? "App Logout" : undefined}
          >
            {logout.isPending ? (
              <Loader2 className={`h-5 w-5 animate-spin flex-shrink-0 ${sidebarOpen ? "mr-3" : ""}`} />
            ) : (
              <Power className={`h-5 w-5 flex-shrink-0 ${sidebarOpen ? "mr-3" : ""}`} />
            )}
            {sidebarOpen && <span className="font-medium truncate">App Logout</span>}
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
              <>
                {/* Platform Stats Row */}
                {platformUser && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="bg-card shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Balance</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold truncate">{platformUser.itoken}</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-card shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Frozen</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold truncate">{platformUser.frozenItoken}</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-card shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Profit</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold truncate">{platformUser.totalProfit}</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-card shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Username</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xl font-bold truncate" title={platformUser.username}>{platformUser.username}</div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Legacy Stats Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="bg-card shadow-sm border-border" data-testid="card-sessions">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Sessions</CardTitle>
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-xs">Active</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mt-1">Manage active sessions</p>
                    </CardContent>
                  </Card>

                  <Card className="bg-card shadow-sm border-border" data-testid="card-reports">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Reports</CardTitle>
                        <Badge variant="secondary" className="bg-accent/20 text-accent-foreground border-none text-xs">Ready</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mt-1">View latest analytics</p>
                    </CardContent>
                  </Card>

                  <Card className="bg-card shadow-sm border-border" data-testid="card-settings">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Settings</CardTitle>
                        <Badge variant="secondary" className="bg-secondary text-secondary-foreground border-none text-xs">Configure</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mt-1">Update preferences</p>
                    </CardContent>
                  </Card>

                  <Card className="bg-card shadow-sm border-border" data-testid="card-support">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Support</CardTitle>
                        <Badge variant="secondary" className="bg-muted text-muted-foreground border-none text-xs">Help</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mt-1">Get team help</p>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}

            {activeSection !== "Dashboard" && (
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
                onClick={handlePlatformLoginNext} 
                disabled={isLoadingPlatform || (modalStep === 1 && (!phone || !password)) || (modalStep === 2 && !otp)}
                className="w-full"
                data-testid="button-tivra-submit"
              >
                {isLoadingPlatform ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {modalStep === 1 ? "Sign In" : "Verify & Connect"}
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
