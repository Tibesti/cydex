import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';

// Full-page shell for onboarding and verification status (no dashboard menu)
const OnboardingLayout = ({ children }: { children: React.ReactNode }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <img src="/lovable-uploads/525fd30a-476a-4e14-ae55-ec2b11d54013.png" alt="Cydex" className="h-7 dark:invert" />
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await logout();
            navigate('/auth');
          }}
        >
          <LogOut className="mr-1 h-4 w-4" />
          Log out
        </Button>
      </header>
      <main className="mx-auto max-w-2xl p-4 sm:p-6">{children}</main>
    </div>
  );
};

export default OnboardingLayout;
