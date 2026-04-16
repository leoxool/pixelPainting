'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { Room } from '@/lib/supabase/types';

export default function StudentPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [nickname, setNickname] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      fetchRooms();
    };
    checkUser();
  }, [supabase, router]);

  const fetchRooms = useCallback(async () => {
    const { data } = await supabase
      .from('rooms')
      .select('*')
      .in('status', ['waiting', 'active'])
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) setRooms(data);
  }, [supabase]);

  const handleSelectRoom = (room: Room) => {
    setSelectedRoom(room);
    setJoinCode('');
    setError('');
  };

  const handleCancelSelect = () => {
    setSelectedRoom(null);
    setJoinCode('');
    setError('');
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom || !nickname.trim()) return;

    setIsLoading(true);
    setError('');

    if (joinCode !== selectedRoom.join_code) {
      setError('房间码不正确');
      setIsLoading(false);
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setError('请先登录');
      setIsLoading(false);
      return;
    }

    const user = userData.user;

    const { data: existingMember } = await supabase
      .from('room_members')
      .select('*')
      .eq('room_id', selectedRoom.id)
      .eq('user_id', user.id)
      .single();

    if (existingMember) {
      router.push(`/student/${selectedRoom.id}`);
      return;
    }

    const { error: joinError } = await supabase.from('room_members').insert({
      room_id: selectedRoom.id,
      user_id: user.id,
      role: 'student',
      nickname: nickname.trim(),
    } as any);

    if (joinError) {
      if (joinError.code === '23505') {
        setError('你已经是该房间的成员');
      } else {
        setError(`加入失败: ${joinError.message || '未知错误'}`);
      }
      setIsLoading(false);
      return;
    }

    router.push(`/student/${selectedRoom.id}`);
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#0A0A0A] p-8">
      <main className="w-full max-w-[500px]">
        {/* Header */}
        <div className="pb-8 text-center" style={{ paddingTop: '120px' }}>
          <h1 className="text-[28px] font-bold text-[#fafafa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
            欢迎加入课堂
          </h1>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-[#3a5a78] text-sm text-[#fafafa]">
            {error}
          </div>
        )}

        {/* Nickname Input */}
        <div className="mb-6 flex flex-col gap-1">
          <label htmlFor="nickname" className="text-sm font-medium text-[#a1a1aa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
            你的昵称
          </label>
          <input
            id="nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="给自己起个名字"
            maxLength={20}
            disabled={!!selectedRoom}
            className="h-12 w-full rounded-lg bg-[#1A1A1A] px-4 text-[#fafafa] placeholder-[#52525b] disabled:opacity-50"
          />
        </div>

        {selectedRoom ? (
          /* Join Code Input */
          <div className="rounded-xl bg-[#0A0A0A] p-6">
            <div className="mb-6 text-center">
              <h2 className="text-xl font-semibold text-[#fafafa] mb-2" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
                {selectedRoom.name || 'Untitled Room'}
              </h2>
              <p className="text-sm text-[#71717a]">
                向老师获取4位房间码
              </p>
            </div>

            <form onSubmit={handleJoinRoom}>
              <div className="mb-4">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="房间码"
                  maxLength={4}
                  required
                  className="h-16 w-full rounded-lg bg-[#1A1A1A] px-4 text-center text-2xl font-mono tracking-widest text-[#fafafa] placeholder-[#52525b]"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancelSelect}
                  className="flex-1 h-12 rounded-lg border border-[#3f3f46] text-sm font-medium text-[#a1a1aa] hover:bg-[#27272a] transition-colors"
                  style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}
                >
                  返回
                </button>
                <button
                  type="submit"
                  disabled={isLoading || joinCode.length !== 4 || !nickname.trim()}
                  className="flex-1 h-12 rounded-lg bg-[#cb1b1b] text-sm font-medium text-[#fafafa] hover:opacity-90 disabled:opacity-50 transition-opacity"
                  style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}
                >
                  {isLoading ? '加入中...' : '进入房间'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Room List */
          <div className="rounded-xl bg-[#0A0A0A] p-6">
            <h2 className="mb-4 text-lg font-semibold text-[#fafafa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
              可用房间
            </h2>
            {!nickname.trim() ? (
              <p className="py-4 text-center text-sm text-[#71717a]">
                请先输入昵称
              </p>
            ) : rooms.length > 0 ? (
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {rooms.map((room) => (
                  <button
                    key={room.id}
                    onClick={() => handleSelectRoom(room)}
                    disabled={isLoading}
                    className="flex h-16 w-full items-center justify-between rounded-lg bg-[#1A1A1A] p-4 text-left transition-colors hover:bg-[#27272a] disabled:opacity-50"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-[#fafafa]">
                        {room.name || 'Untitled Room'}
                      </span>
                      <span className="text-xs text-[#71717a]">
                        {new Date(room.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                      room.status === 'active'
                        ? 'bg-green-900/50 text-green-400'
                        : 'bg-yellow-900/50 text-yellow-400'
                    }`}>
                      {room.status === 'active' ? '进行中' : '等待中'}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-[#71717a]">
                暂无可用房间
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
