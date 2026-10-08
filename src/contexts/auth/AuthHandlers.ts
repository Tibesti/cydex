
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { UserRole } from '@/types/auth.types';
import { cleanupAuthState, forceRedirectToAuth, forceReload } from './AuthCleanup';

export const handleLogin = async (email: string, password: string) => {
  try {
    console.log('Attempting login for:', email);
    
    // Clean up any existing auth state first
    cleanupAuthState();
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    console.log('Login successful for:', email);
    toast.success('Login successful!');
    
    // Force reload to ensure clean state
    forceReload();
  } catch (error: any) {
    console.error('Login error:', error);
    toast.error(error.message || 'Login failed');
    throw error;
  }
};

export const handleRegister = async (name: string, email: string, password: string, role: UserRole) => {
  try {
    console.log('Attempting registration for:', email, 'with role:', role);
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role: role.toLowerCase(), // Store as lowercase to match database
        },
        emailRedirectTo: `${window.location.origin}/auth`
      }
    });

    if (error) {
      console.error('Registration error:', error);
      throw error;
    }

    console.log('Registration successful for:', email);
    
    // Check if email confirmation is required
    if (data.user && !data.session) {
      toast.success('Registration successful! Please check your email to verify your account.');
    } else if (data.session) {
      toast.success('Registration and login successful!');
    }
  } catch (error: any) {
    console.error('Registration error:', error);
    toast.error(error.message || 'Registration failed');
    throw error;
  }
};

export const handleLogout = async () => {
  try {
    console.log('Attempting logout');
    
    // Clean up auth state first
    cleanupAuthState();
    
    // Try to sign out, but don't fail if session is missing
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error && error.message !== 'Auth session missing!') {
        console.error('Logout error:', error);
      }
    } catch (error: any) {
      // Ignore session missing errors as the user is already logged out
      if (!error.message?.includes('Auth session missing')) {
        console.error('Logout error:', error);
      }
    }
    
    toast.info('Logged out successfully');
    
    // Force redirect to auth page
    forceRedirectToAuth();
    return { success: true };
  } catch (error: any) {
    console.error('Logout error:', error);
    
    // Even if logout fails, clear local state and redirect
    cleanupAuthState();
    toast.info('Logged out successfully');
    forceRedirectToAuth();
    return { success: true };
  }
};

export const handleResetPassword = async (email: string) => {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/set-password`,
    });
    if (error) throw error;
    toast.success('Password reset email sent!');
  } catch (error: any) {
    console.error('Reset password error:', error);
    toast.error(error.message || 'Failed to send reset email');
    throw error;
  }
};

export const handleVerifyEmail = async (token: string) => {
  try {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: 'email'
    });
    if (error) throw error;
    toast.success('Email verified successfully!');
  } catch (error: any) {
    console.error('Verify email error:', error);
    toast.error(error.message || 'Failed to verify email');
    throw error;
  }
};
