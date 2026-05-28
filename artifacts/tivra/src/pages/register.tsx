import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRegister } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Loader2, ArrowLeft } from "lucide-react";

const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const register = useRegister();

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  function onSubmit(values: z.infer<typeof registerSchema>) {
    register.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          localStorage.setItem("tivra_token", data.token);
          setLocation("/dashboard");
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Registration failed",
            description: error.error || "An unexpected error occurred",
          });
        },
      }
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row-reverse bg-background">
      {/* Visual side */}
      <div className="hidden md:flex flex-1 relative overflow-hidden bg-card border-l border-border">
        {/* Glow effects */}
        <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] pointer-events-none -translate-x-1/4 translate-y-1/4" />
        
        <div className="relative z-10 flex flex-col justify-between p-12 h-full">
          <div className="flex items-center justify-end gap-2 text-primary font-bold text-2xl tracking-tighter">
            Tivra
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)_/_0.3)]">T</div>
          </div>
          
          <div className="max-w-md ml-auto text-right">
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-foreground mb-4">
              Join the <span className="text-primary">elite.</span>
            </h1>
            <p className="text-lg text-muted-foreground">
              Register now to start operating at your highest potential with the definitive platform for extreme productivity.
            </p>
          </div>
        </div>
      </div>

      {/* Form side */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 relative">
        <Link href="/" className="absolute top-8 left-8 text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2 text-sm font-medium group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to login
        </Link>

        <div className="w-full max-w-md space-y-8 mt-12 md:mt-0">
          <div className="md:hidden flex items-center gap-2 text-primary font-bold text-2xl tracking-tighter mb-8">
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center text-primary-foreground">T</div>
            Tivra
          </div>

          <div>
            <h2 className="text-3xl font-bold tracking-tight">Create your account</h2>
            <p className="text-muted-foreground mt-2">Initialize your command center profile.</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <Label className="text-foreground">Full name</Label>
                      <FormControl>
                        <Input 
                          placeholder="John Doe" 
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
                      <Label className="text-foreground">Password</Label>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="At least 8 characters" 
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
                disabled={register.isPending}
              >
                {register.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Create Account"}
              </Button>
            </form>
          </Form>

          <p className="text-center text-sm text-muted-foreground">
            By creating an account, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}