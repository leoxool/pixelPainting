import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A] p-8">
      <main className="flex w-full max-w-[512px] flex-col items-center gap-10">
        {/* Logo Area */}
        <div className="flex flex-col items-center gap-4">
          {/* Logo Image */}
          <div className="relative h-[249px] w-[250px] overflow-hidden rounded border-2 border-white/10">
            <Image
              src="/s.png"
              alt="Pixel Mosaic Logo"
              fill
              className="object-cover"
            />
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-[#fafafa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
            摄影技术和绘画
          </h1>
        </div>

        {/* Buttons */}
        <div className="flex w-full max-w-[320px] flex-col gap-3">
          <Link
            href="/login?redirect=/student"
            className="flex h-12 items-center justify-center rounded-full bg-[#cb1b1b] text-[#fafafa] font-medium transition-colors hover:opacity-90"
            style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}
          >
            作为学生加入课堂
          </Link>
          <Link
            href="/login?redirect=/teacher"
            className="flex h-12 items-center justify-center rounded-full border border-[#3f3f46] bg-transparent text-[#a1a1aa] font-medium transition-colors hover:border-zinc-500"
            style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}
          >
            打开教师工作台
          </Link>
        </div>
      </main>
    </div>
  );
}
