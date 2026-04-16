'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Room } from '@/lib/supabase/types';

export default function TeacherPage() {
  const [user, setUser] = useState<{ email: string; id: string } | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomName, setRoomName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser({ email: user.email || '', id: user.id });
      fetchRooms();
    };
    getUser();
  }, [supabase, router]);

  const fetchRooms = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('rooms')
      .select('*')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });
    setRooms(data || []);
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim() || !user) return;

    setIsCreating(true);
    setError('');

    const { data: room, error: createError } = await supabase
      .from('rooms')
      .insert({
        teacher_id: user.id,
        name: roomName.trim(),
        config: {
          gridWidth: 150,
          gridHeight: 100,
          sourceType: 'webcam',
        },
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating room:', createError);
      setError(`创建失败: ${createError.message}`);
      setIsCreating(false);
      return;
    }

    await supabase.from('room_members').insert({
      room_id: room.id,
      user_id: user.id,
      role: 'teacher',
    } as any);

    router.push(`/teacher/${room.id}`);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <header className="flex h-[60px] items-center justify-between px-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-bold leading-none text-[#fafafa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
            教师工作台
          </h1>
          <p className="text-[13px] text-[#71717a]" style={{ fontFamily: 'Inter, sans-serif' }}>
            {user ? user.email : 'Loading...'}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="h-9 w-[100px] rounded-lg border border-[#3f3f46] text-[13px] font-medium text-[#fafafa] hover:opacity-80 transition-opacity"
          style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}
        >
          登出
        </button>
      </header>

      {/* Body */}
      <div className="px-8 pb-8">
        {error && (
          <div className="mb-4 rounded-lg bg-red-900/30 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Cards Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Create Room Card */}
          <div className="flex h-[280px] flex-col gap-4 rounded-xl bg-[#0A0A0A] p-6">
            <h2 className="text-[18px] font-semibold text-[#fafafa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
              新建教室
            </h2>
            <form onSubmit={handleCreateRoom} className="flex flex-col gap-3">
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="教室名称"
                maxLength={30}
                required
                className="h-11 rounded-lg bg-[#1A1A1A] px-4 text-[#fafafa] placeholder-[#52525b]"
              />
              <button
                type="submit"
                disabled={isCreating || !roomName.trim()}
                className="h-11 rounded-lg bg-[#cb1b1b] text-sm font-medium text-[#fafafa] hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}
              >
                {isCreating ? '创建中...' : '确定'}
              </button>
            </form>
          </div>

          {/* Rooms Card */}
          <div className="flex h-[280px] flex-col gap-4 rounded-xl bg-[#0A0A0A] p-6">
            <h2 className="text-[18px] font-semibold text-[#fafafa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
              已建教室
            </h2>
            {rooms.length > 0 ? (
              <div className="flex-1 space-y-2 overflow-y-auto">
                {rooms.map((room) => (
                  <Link
                    key={room.id}
                    href={`/teacher/${room.id}`}
                    className="flex h-14 items-center justify-between rounded-lg bg-[#1A1A1A] p-3 transition-colors hover:bg-[#27272a]"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-[#fafafa] text-sm">
                        {room.name || 'Untitled Room'}
                      </span>
                      <span className="text-xs text-[#71717a]">
                        Code: {room.join_code}
                      </span>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                      room.status === 'active'
                        ? 'bg-green-900/50 text-green-400'
                        : room.status === 'completed'
                        ? 'bg-zinc-700 text-zinc-400'
                        : 'bg-yellow-900/50 text-yellow-400'
                    }`}>
                      {room.status === 'active' ? '进行中' : room.status === 'completed' ? '已完成' : '等待中'}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-[#71717a]">
                暂无教室
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
