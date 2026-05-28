import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Loader2, ArrowRight } from "lucide-react";

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
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-background">
      {/* Visual side */}
      <div className="hidden md:flex flex-1 relative overflow-hidden bg-card border-r border-border">
        {/* Glow effects */}
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="relative z-10 flex flex-col justify-between p-12 h-full">
          <div className="flex items-center gap-2 text-primary font-bold text-2xl tracking-tighter">
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)_/_0.3)]">T</div>
            Tivra
          </div>
          
          <div className="max-w-md">
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-foreground mb-4">
              Focus is your <br/><span className="text-primary">ultimate advantage.</span>
            </h1>
            <p className="text-lg text-muted-foreground">
              Command your workday with the premium productivity platform designed for those who operate at a higher frequency.
            </p>
          </div>
        </div>
      </div>

      {/* Form side */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="md:hidden flex items-center gap-2 text-primary font-bold text-2xl tracking-tighter mb-8">
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center text-primary-foreground">T</div>
            Tivra
          </div>

          <div>
            <h2 className="text-3xl font-bold tracking-tight">Welcome back</h2>
            <p className="text-muted-foreground mt-2">Enter your credentials to access your command center.</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <Label className="text-foreground">Email address</Label>
                      <FormControl>
                        <Input 
                          placeholder="you@example.com" 
                          className="bg-card border-border/50 focus:border-primary focus:ring-primary/20 transition-all h-12" 
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
                      <div className="flex justify-between items-center">
                        <Label className="text-foreground">Password</Label>
                        <Link href="#" className="text-sm text-primary hover:text-primary/80 transition-colors">Forgot password?</Link>
                      </div>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="••••••••" 
                          className="bg-card border-border/50 focus:border-primary focus:ring-primary/20 transition-all h-12" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 text-base font-medium shadow-[0_0_15px_hsl(var(--primary)_/_0.2)] hover:shadow-[0_0_25px_hsl(var(--primary)_/_0.4)] transition-all duration-300"
                disabled={login.isPending}
              >
                {login.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Sign In"}
              </Button>
            </form>
          </Form>

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/register" className="text-primary font-medium hover:text-primary/80 transition-colors inline-flex items-center gap-1 group">
              Create an account <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}