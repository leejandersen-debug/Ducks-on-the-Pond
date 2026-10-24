import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = { title: "Card App" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", padding: 24 }}>
        {children}
        {/* Vercel Web Analytics: page views and visitors. Sends nothing until enabled in the dashboard. */}
        <Analytics />
      </body>
    </html>
  );
}
