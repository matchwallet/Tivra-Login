import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, Terminal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Need to provide auth header if not using cookies, but let's assume customFetch handles it via localStorage
  const { data: user, isLoading, error } = useGetMe({ 
    query: { 
      retry: false
    },
    request: {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("tivra_token") || ""}`
      }
    }
  });

  const logout = useLogout();

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

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        localStorage.removeItem("tivra_token");
        setLocation("/");
      }
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b border-border h-16 flex items-center px-6">
          <div className="flex items-center gap-2 text-primary font-bold text-xl tracking-tighter">
            <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center text-primary-foreground">T</div>
            Tivra
          </div>
          <div className="ml-auto">
            <Skeleton className="h-9 w-24" />
          </div>
        </header>
        <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
          <Skeleton className="h-10 w-1/3 mb-4" />
          <Skeleton className="h-6 w-1/4 mb-12" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-50 h-16 flex items-center px-6">
        <div className="flex items-center gap-2 text-primary font-bold text-xl tracking-tighter">
          <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center text-primary-foreground shadow-[0_0_10px_hsl(var(--primary)_/_0.4)]">T</div>
          Tivra
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="text-sm text-muted-foreground hidden sm:block">
            {user.email}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
            disabled={logout.isPending}
          >
            {logout.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogOut className="w-4 h-4 mr-2" />}
            Sign Out
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6 sm:p-12 max-w-7xl mx-auto w-full relative">
        {/* Glow behind main content */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-[100%] blur-[100px] pointer-events-none" />

        <div className="relative z-10 mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-3">
            Welcome back, <span className="text-primary">{user.name.split(' ')[0]}</span>
          </h1>
          <p className="text-lg text-muted-foreground flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            Your command center is ready.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
          <div className="bg-card border border-border/50 rounded-xl p-6 shadow-sm hover:border-primary/50 hover:shadow-[0_0_20px_hsl(var(--primary)_/_0.1)] transition-all group">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </div>
            <h3 className="font-semibold text-lg mb-2">Projects</h3>
            <p className="text-muted-foreground text-sm">Manage your active initiatives and track progress across all streams.</p>
          </div>

          <div className="bg-card border border-border/50 rounded-xl p-6 shadow-sm hover:border-primary/50 hover:shadow-[0_0_20px_hsl(var(--primary)_/_0.1)] transition-all group">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
            </div>
            <h3 className="font-semibold text-lg mb-2">Finances</h3>
            <p className="text-muted-foreground text-sm">Monitor runway, revenue streams, and resource allocation.</p>
          </div>

          <div className="bg-card border border-border/50 rounded-xl p-6 shadow-sm hover:border-primary/50 hover:shadow-[0_0_20px_hsl(var(--primary)_/_0.1)] transition-all group">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            </div>
            <h3 className="font-semibold text-lg mb-2">Intel</h3>
            <p className="text-muted-foreground text-sm">Review incoming reports, metrics, and system diagnostics.</p>
          </div>
        </div>
      </main>
    </div>
  );
}