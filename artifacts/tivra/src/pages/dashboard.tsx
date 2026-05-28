import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
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
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="h-16 flex items-center px-8 border-b border-border bg-card">
          <div className="font-bold text-xl tracking-[-0.04em]">Tivra</div>
          <div className="ml-auto">
            <Skeleton className="h-9 w-24" />
          </div>
        </header>
        <main className="flex-1 p-8 sm:p-12 max-w-5xl mx-auto w-full">
          <Skeleton className="h-12 w-64 mb-4" />
          <Skeleton className="h-6 w-48 mb-12" />
          <hr className="border-border mb-12" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-32 rounded-lg" />
            <Skeleton className="h-32 rounded-lg" />
            <Skeleton className="h-32 rounded-lg" />
            <Skeleton className="h-32 rounded-lg" />
          </div>
        </main>
      </div>
    );
  }

  if (!user) return null;

  const firstName = user.name ? user.name.split(' ')[0] : 'User';

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-50 h-16 flex items-center px-8 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="font-bold text-xl tracking-[-0.04em] text-foreground">Tivra</div>
        <div className="ml-auto flex items-center gap-6">
          <span className="text-sm font-medium text-foreground hidden sm:inline-block" data-testid="text-user-email">
            {user.email}
          </span>
          <Button 
            variant="ghost" 
            className="text-foreground hover:bg-muted"
            onClick={handleLogout}
            disabled={logout.isPending}
            data-testid="button-signout"
          >
            {logout.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Sign out
          </Button>
        </div>
      </header>

      <main className="flex-1 p-8 sm:p-16 max-w-5xl mx-auto w-full">
        <div className="mb-12 pt-8">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-foreground mb-4" data-testid="text-hero-greeting">
            Good to see you, {firstName}.
          </h1>
          <p className="text-lg text-muted-foreground" data-testid="text-hero-subline">
            {user.email}
          </p>
        </div>

        <hr className="border-border mb-12" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-card shadow-sm border-border" data-testid="card-sessions">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardTitle className="text-xl font-medium">Sessions</CardTitle>
              <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 border-none font-medium">Active</Badge>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-muted-foreground text-base">Manage your current active sessions and connections.</CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-card shadow-sm border-border" data-testid="card-reports">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardTitle className="text-xl font-medium">Reports</CardTitle>
              <Badge variant="secondary" className="bg-accent/20 text-accent-foreground hover:bg-accent/30 border-none font-medium">Ready</Badge>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-muted-foreground text-base">View your latest analytics and system reports.</CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-card shadow-sm border-border" data-testid="card-settings">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardTitle className="text-xl font-medium">Settings</CardTitle>
              <Badge variant="secondary" className="bg-secondary text-secondary-foreground hover:bg-secondary/80 border-none font-medium">Configure</Badge>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-muted-foreground text-base">Update your preferences and account details.</CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-card shadow-sm border-border" data-testid="card-support">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardTitle className="text-xl font-medium">Support</CardTitle>
              <Badge variant="secondary" className="bg-muted text-muted-foreground border-none font-medium">Help</Badge>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-muted-foreground text-base">Get help from our support team or view documentation.</CardDescription>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
