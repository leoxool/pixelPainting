'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // 从 URL 获取 redirect 参数
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    setRedirectTo(redirect);
  }, []);

  const isTeacherRoute = redirectTo === '/teacher';

  const handleLogin = async () => {
    const currentUsername = username;
    const currentPassword = password;

    if (!currentUsername.trim() || !currentPassword.trim()) {
      setError('请输入用户名和密码');
      return;
    }

    console.log('Login attempt:', { username, redirectTo, isTeacherRoute });

    // 登出任何现有会话
    const supabase = createClient();
    await supabase.auth.signOut();

    setIsLoading(true);
    setError('');

    // 1. 通过用户名查找用户信息
    console.log('1. Looking up username:', username.trim());
    const { data: loginData, error: lookupError } = await supabase.rpc('login_with_username', {
      p_username: currentUsername.trim(),
    });

    console.log('2. Lookup result:', { loginData, lookupError });

    if (lookupError) {
      setError(`查询错误: ${lookupError.message}`);
      setIsLoading(false);
      return;
    }

    if (!loginData?.success) {
      setError(loginData?.error || '用户名或密码错误');
      setIsLoading(false);
      return;
    }

    const { user_id, email, username: dbUsername, display_name, role, stored_token } = loginData;

    console.log('3. User data:', { user_id, email, dbUsername, display_name, role, stored_token });

    // 保存用户信息到 localStorage
    localStorage.setItem('pixel_user_id', user_id);
    localStorage.setItem('pixel_username', dbUsername || display_name || '');
    localStorage.setItem('pixel_display_name', display_name || dbUsername || '');

    // 2. 如果是教师通道登录，但账户是学生，拒绝登录
    if (isTeacherRoute && role !== 'teacher') {
      setError('用户名或密码错误');
      setIsLoading(false);
      return;
    }

    // 3. 检查是否有其他设备登录（会话令牌验证）
    const newToken = crypto.randomUUID();
    if (stored_token !== null) {
      // 已有会话，检查是否相同浏览器（通过 localStorage sessionId 判断）
      const browserSessionId = localStorage.getItem('pixel_session_id');
      if (browserSessionId && browserSessionId !== stored_token) {
        setError('该账户已在其他设备登录，请先退出后再试');
        setIsLoading(false);
        return;
      }
    }

    // 4. 使用邮箱登录
    console.log('4. Signing in with email:', email);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email,
      password: currentPassword,
    });

    console.log('5. Sign in result:', { signInError });

    if (signInError) {
      setError(`登录失败: ${signInError.message}`);
      setIsLoading(false);
      return;
    }

    // 6. 保存会话 ID 到 localStorage
    localStorage.setItem('pixel_session_id', newToken);

    // 7. 更新数据库中的会话令牌
    await supabase.rpc('set_session_token', {
      p_user_id: user_id,
      p_token: newToken,
    });

    // 8. 跳转到目标页面（middleware 会从 profiles 表获取角色）
    console.log('9. Redirecting to:', redirectTo || (role === 'teacher' ? '/teacher' : '/student'));
    if (redirectTo) {
      router.push(redirectTo);
    } else {
      router.push(role === 'teacher' ? '/teacher' : '/student');
    }

    setIsLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A] p-8">
      <Link href="/" className="absolute top-6 left-6 text-sm text-[#71717a] hover:text-[#fafafa]">
        ← 返回首页
      </Link>
      <main className="flex w-full max-w-[400px] flex-col items-center gap-6">
        {/* Header */}
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-[28px] font-bold text-[#fafafa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
            {isTeacherRoute ? '教师' : '学生'}登录
          </h1>
          {redirectTo && (
            <p className="text-xs text-[#71717a]">
              即将进入 {redirectTo === '/teacher' ? '教师工作台' : '学生课堂'}
            </p>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="w-full rounded-lg bg-[#3a5a78] p-3 text-sm text-[#fafafa]">
            {error}
          </div>
        )}

        {/* Form */}
        <form className="flex w-full flex-col gap-4" onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
          {/* Username Field */}
          <div className="flex flex-col gap-1">
            <label htmlFor="username" className="text-sm font-medium text-[#a1a1aa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
              用户名
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="输入用户名"
              required
              className="h-11 w-full rounded-lg bg-[#1A1A1A] px-4 text-[#fafafa] placeholder-[#52525b]"
            />
          </div>

          {/* Password Field */}
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-[#a1a1aa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="h-11 w-full rounded-lg bg-[#1A1A1A] px-4 text-[#fafafa] placeholder-[#52525b]"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="h-11 rounded-lg bg-[#cb1b1b] text-sm font-medium text-[#fafafa] hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}
          >
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>

        {/* Hint */}
        <p className="text-xs text-[#52525b]">
          注册功能暂未开放，请联系教师获取账号
        </p>
      </main>
    </div>
  );
}
