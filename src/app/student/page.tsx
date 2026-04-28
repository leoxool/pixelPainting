'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Room } from '@/lib/supabase/types';

const NICKNAME_LIST = [
  '顾恺之', '吴道子', '王羲之', '张择端', '赵孟頫', '唐寅', '齐白石', '徐悲鸿', '张大千',
  '达·芬奇', '米开朗基罗', '拉斐尔', '梵高', '莫奈', '毕加索', '伦勃朗',
  '贝多芬', '肖邦', '卓别林', '黑泽明',
  '孔子', '孟子', '老子', '庄子', '墨子', '荀子', '朱熹', '王阳明',
  '苏格拉底', '柏拉图', '亚里士多德', '笛卡尔', '康德', '黑格尔', '尼采', '马克思', '叔本华', '萨特', '罗素', '伏尔泰',
  '黄公望', '文徵明', '仇英', '石涛', '八大山人', '任伯年', '李可染', '傅抱石', '吴冠中', '林风眠', '刘海粟', '蒋兆和', '叶浅予', '潘天寿', '黄宾虹', '常玉', '陈逸飞', '罗中立', '梁启超', '冯友兰', '康有为', '章太炎', '王国维', '蔡元培',
  '提香', '卡拉瓦乔', '鲁本斯', '委拉斯开兹', '戈雅', '透纳', '德拉克洛瓦', '库尔贝', '马奈', '德加', '雷诺阿', '塞尚', '高更', '修拉', '克里姆特', '蒙克', '马蒂斯', '布拉克', '莫迪利亚尼', '杜尚', '米罗', '夏加尔', '康定斯基', '保罗·克利', '蒙德里安', '达利', '马格里特', '埃舍尔', '培根', '安迪·沃霍尔', '波洛克', '罗斯科', '大卫·霍克尼', '弗里达·卡罗', '席勒'
];

export default function StudentPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [nickname, setNickname] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    setIsCheckingAuth(true);
    // Try getUser() first, fall back to getSession() if network fails
    let userObj = null;
    const { data: userData, error } = await supabase.auth.getUser();
    if (userData?.user) {
      userObj = userData.user;
    } else {
      // getUser() failed (network error), try getSession() as fallback
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user) {
        userObj = sessionData.session?.user;
      }
    }
    if (userObj) {
      setIsSignedIn(true);
      fetchRooms();
    } else {
      router.push('/login?redirect=/student');
    }
    setIsCheckingAuth(false);
  };

  useEffect(() => {
    if (isSignedIn) {
      fetchRooms();
      const interval = setInterval(fetchRooms, 5000);
      return () => clearInterval(interval);
    }
  }, [isSignedIn]);

  const fetchRooms = useCallback(async () => {
    const { data } = await supabase
      .from('rooms')
      .select('*')
      .in('status', ['waiting', 'active'])
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) setRooms(data);
  }, [supabase]);

  const handleSignOut = async () => {
    // 清除会话令牌
    let userObj = null;
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      userObj = userData.user;
    } else {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user) {
        userObj = sessionData.session?.user;
      }
    }
    if (userObj) {
      await supabase.rpc('clear_session_token', { p_user_id: userObj.id });
    }
    localStorage.removeItem('pixel_session_id');
    await supabase.auth.signOut();
    setIsSignedIn(false);
    router.push('/login?redirect=/student');
  };

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

    // 检查用户状态
    let userObj = null;
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      userObj = userData.user;
    } else {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user) {
        userObj = sessionData.session?.user;
      }
    }
    if (!userObj) {
      setError('请先登录');
      setIsLoading(false);
      return;
    }

    // 检查是否已是该房间成员
    const { data: existingMember } = await supabase
      .from('room_members')
      .select('*')
      .eq('room_id', selectedRoom.id)
      .eq('user_id', userObj.id)
      .single();

    if (existingMember) {
      localStorage.setItem(`pixel_nickname_${selectedRoom.id}`, nickname.trim());
      router.push(`/student/${selectedRoom.id}`);
      return;
    }

    // 加入房间
    const { error: joinError } = await supabase.from('room_members').insert({
      room_id: selectedRoom.id,
      user_id: userObj.id,
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

    localStorage.setItem(`pixel_nickname_${selectedRoom.id}`, nickname.trim());
    router.push(`/student/${selectedRoom.id}`);
  };

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A]">
        <p className="text-[#71717a]">检查登录状态...</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return null; // 会在 useEffect 中重定向
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#0A0A0A] p-8">
      <main className="w-full max-w-[500px]">
        {/* Header */}
        <div className="pb-4 text-center" style={{ paddingTop: '80px' }}>
          <div className="flex items-center justify-between">
            <h1 className="text-[24px] font-bold text-[#fafafa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
              欢迎加入课堂
            </h1>
            <button
              onClick={handleSignOut}
              className="px-3 py-1.5 text-xs text-[#71717a] hover:text-[#fafafa]"
            >
              退出登录
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-[#3a5a78] text-sm text-[#fafafa]">
            {error}
          </div>
        )}

        {/* Nickname Select */}
        <div className="mb-6 flex flex-col gap-1">
          <label htmlFor="nickname" className="text-sm font-medium text-[#a1a1aa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
            你的昵称
          </label>
          <select
            id="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            disabled={!!selectedRoom}
            className="h-12 w-full rounded-lg bg-[#1A1A1A] px-4 text-[#fafafa] disabled:opacity-50"
          >
            <option value="">选择你的名字</option>
            {NICKNAME_LIST.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
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
                请先选择昵称
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
