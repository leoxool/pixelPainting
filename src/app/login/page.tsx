'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSignUp = useCallback(async () => {
    setIsLoading(true);
    setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
    } else {
      setError('请查收邮件中的确认链接。');
    }
    setIsLoading(false);
  }, [email, password]);

  const handleSignIn = useCallback(async () => {
    setIsLoading(true);
    setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      router.push('/teacher');
    }
    setIsLoading(false);
  }, [email, password, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A] p-8">
      <main className="flex w-full max-w-[400px] flex-col items-center gap-6">
        {/* Header */}
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-[28px] font-bold text-[#fafafa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
            登陆
          </h1>
        </div>

        {/* Error Message */}
        {error && (
          <div className="w-full rounded-lg bg-[#3a5a78] p-3 text-sm text-[#fafafa]">
            {error}
          </div>
        )}

        {/* Form */}
        <div className="flex w-full flex-col gap-4">
          {/* Email Field */}
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium text-[#a1a1aa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-11 w-full rounded-lg bg-[#1A1A1A] px-3 text-[#fafafa] placeholder-[#52525b]"
            />
          </div>

          {/* Password Field */}
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-[#a1a1aa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-11 w-full rounded-lg bg-[#1A1A1A] px-3 text-[#fafafa] placeholder-[#52525b]"
            />
          </div>

          {/* Buttons Row */}
          <div className="flex h-10 gap-3">
            <button
              onClick={handleSignIn}
              disabled={isLoading}
              className="flex h-10 flex-1 items-center justify-center rounded-lg bg-[#cb1b1b] text-sm font-medium text-[#fafafa] hover:opacity-90 disabled:opacity-50 transition-opacity"
              style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}
            >
              登陆
            </button>
            <button
              onClick={handleSignUp}
              disabled={isLoading}
              className="flex h-10 flex-1 items-center justify-center rounded-lg border border-[#3f3f46] text-sm font-medium text-[#a1a1aa] hover:bg-[#27272a] disabled:opacity-50 transition-colors"
              style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}
            >
              注册
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
