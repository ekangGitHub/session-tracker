import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthProps {
  children: React.ReactNode;
}

export function Auth({ children }: AuthProps) {
  const [email, setEmail] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    }).catch((err) => {
      console.error('Failed to get session:', err);
      setError(`Auth error: ${err.message}`);
    });

    // Subscribe to auth state changes
    try {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });

      return () => subscription.unsubscribe();
    } catch (err) {
      console.error('Failed to subscribe to auth changes:', err);
      return () => {};
    }
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    const { error: signInError } = await supabase.auth.signInWithOtp({ email });

    if (signInError) {
      setError(signInError.message);
    } else {
      setMessage('Check your email for the magic link!');
      setEmail('');
    }

    setLoading(false);
  };

  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
  };

  if (!session) {
    return (
      <div>
        <h1>Sign In</h1>
        <form onSubmit={handleSignIn}>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Send Magic Link'}
          </button>
        </form>
        {message && <p>{message}</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
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
