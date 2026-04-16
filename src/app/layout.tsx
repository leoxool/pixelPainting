import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "摄影技术和绘画",
  description: "Multi-user real-time generative art platform for education",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full font-sans antialiased bg-[#0A0A0A] text-[#fafafa]">
        {children}
      </body>
    </html>
  );
}
