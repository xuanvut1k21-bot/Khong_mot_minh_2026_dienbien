import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Không Một Mình 2026 | Điện Biên",
    template: "%s | Không Một Mình 2026"
  },
  description: "Website chiến dịch Không Một Mình 2026 – Kết nối không tổn thương tại Điện Biên."
};

export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="vi"><body><SiteHeader />{children}<SiteFooter /></body></html>;
}
