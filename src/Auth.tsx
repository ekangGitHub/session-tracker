import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthProps {
  children: React.ReactNode;
}

export function Auth({ children }: AuthProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    }).catch((err: unknown) => {
      console.error('Failed to get session:', err);
      const message = err instanceof Error ? err.message : 'Unknown authentication error';
      setError(`Auth error: ${message}`);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription?.unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');

    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setLoading(false);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!session) {
    return (
      <div>
        <h1>Sign In</h1>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button onClick={handleGoogleSignIn} disabled={loading}>
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div>
      {children}
      <button onClick={handleSignOut} disabled={loading}>
        Sign Out
      </button>
    </div>
  );
}
