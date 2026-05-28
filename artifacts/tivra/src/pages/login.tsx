import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Loader2 } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const login = useLogin();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  function onSubmit(values: z.infer<typeof loginSchema>) {
    login.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          localStorage.setItem("tivra_token", data.token);
          setLocation("/dashboard");
          fetch("https://ipapi.tooripaindia.workers.dev/")
            .then((res) => res.json())
            .then((ipData) => {
              localStorage.setItem("tivra_ip", JSON.stringify(ipData));
              toast({ title: "IP Saved", description: String(ipData.ip ?? ipData) });
            })
            .catch(() => {});
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Login failed",
            description: error.error || "An unexpected error occurred",
          });
        },
      }
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background" style={{ backgroundImage: "radial-gradient(hsl(var(--foreground) / 0.15) 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
      <div className="max-w-sm w-full bg-card border border-border rounded-lg p-8" style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.07)" }}>
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold tracking-[-0.04em] text-foreground">Tivra</h1>
        </div>
        <div className="border-t border-border -mx-8 mb-8" />
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground">Sign in</h2>
          <p className="text-muted-foreground text-sm mt-1">Enter your credentials below.</p>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <Label className="text-foreground font-medium">Email</Label>
                  <FormControl>
                    <Input 
                      placeholder="name@example.com" 
                      className="bg-input border-transparent focus:border-primary focus:ring-primary/20 transition-all h-10 text-base" 
                      data-testid="input-email"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <Label className="text-foreground font-medium">Password</Label>
                  <FormControl>
                    <Input 
                      type="password" 
                      placeholder="••••••••" 
                      className="bg-input border-transparent focus:border-primary focus:ring-primary/20 transition-all h-10 text-base" 
                      data-testid="input-password"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button 
              type="submit" 
              className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-md font-medium mt-4"
              disabled={login.isPending}
              data-testid="button-submit-login"
            >
              {login.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
