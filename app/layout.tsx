import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { vi } from "@/lib/i18n/vi";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-be-vietnam-pro",
});

export const metadata: Metadata = {
  title: `${vi.app.name} — ${vi.app.tagline}`,
  description: vi.app.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" data-palette="a" className={beVietnamPro.variable}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem("memoquiz_palette");if(p==="b"||p==="a"){document.documentElement.setAttribute("data-palette",p);}var rm=localStorage.getItem("memoquiz_reduce_motion");if(rm==="true"){document.documentElement.setAttribute("data-reduce-motion","true");}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen bg-[var(--background)] font-sans text-[var(--foreground)] antialiased transition-colors duration-200">
        {children}
      </body>
    </html>
  );
}

