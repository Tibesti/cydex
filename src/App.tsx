
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { SupabaseProvider } from '@/contexts/SupabaseContext';
import { AuthProvider } from "@/contexts/SupabaseAuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import AppRoutes from "@/routes/AppRoutes";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Toaster as ShadcnToaster } from "@/components/ui/toaster";
import InstallBanner from "@/components/pwa/InstallBanner";

const queryClient = new QueryClient();

function App() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SupabaseProvider supabaseUrl={supabaseUrl} supabaseKey={supabaseAnonKey}>
          <AuthProvider>
            <CartProvider>
              <TooltipProvider>
                <Toaster />
                <ShadcnToaster />
                <BrowserRouter>
                  <div className="min-h-screen bg-background font-sans antialiased ">
                    <AppRoutes />
                  </div>
                  <InstallBanner />
                </BrowserRouter>
              </TooltipProvider>
            </CartProvider>
          </AuthProvider>
                </SupabaseProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
