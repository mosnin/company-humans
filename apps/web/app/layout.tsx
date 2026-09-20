import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Company Human", template: "%s · Company Human" },
  description: "A shared workspace for human work, relationships, access, and earnings.",
  openGraph: {
    type: "website",
    title: "Company Human",
    description: "A shared workspace for human work, relationships, access, and earnings.",
    siteName: "Company Human",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f1f1" },
    { media: "(prefers-color-scheme: dark)", color: "#212121" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans`}>
        {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
          ? <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>{children}</ClerkProvider>
          : children}
      </body>
    </html>
  );
}
