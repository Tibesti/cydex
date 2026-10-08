
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AuthLayout from "@/components/auth/AuthLayout";
import LoginForm from "@/components/auth/LoginForm";
import SignupForm from "@/components/auth/SignupForm";
import LoadingDisplay from "@/components/ui/LoadingDisplay";

// Login / sign up. Also the installed app's start page: anyone already signed
// in goes straight to their own home (/customer, /vendor, /rider or /admin).
const Auth = () => {
  const { isAuthenticated, user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') === 'register' ? 'signup' : 'login';
  const navigate = useNavigate();
  // True once the saved session has been checked. `loading` alone also turns on
  // during a login attempt, which mustn't hide (and reset) the form.
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    if (!loading) setSessionChecked(true);
  }, [loading]);

  useEffect(() => {
    if (isAuthenticated && user) {
      // replace: so Back doesn't return to the login page
      navigate(`/${user.role.toLowerCase()}`, { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // No login form flash while checking the session, loading the profile (which
  // holds the role) or on the way to the dashboard
  if (!sessionChecked || isAuthenticated) {
    return <LoadingDisplay fullScreen message="Opening Cydex..." size="md" />;
  }

  return (
    <AuthLayout>
      <Tabs defaultValue={defaultTab}>
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="login">Login</TabsTrigger>
          <TabsTrigger value="signup">Sign Up</TabsTrigger>
        </TabsList>
        
        <TabsContent value="login">
          <LoginForm />
        </TabsContent>
        
        <TabsContent value="signup">
          <SignupForm />
        </TabsContent>
      </Tabs>
    </AuthLayout>
  );
};

export default Auth;
