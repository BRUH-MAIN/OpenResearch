import type { Metadata } from "next";
import { AuthProvider, ThemeProvider, QueryProvider } from "@/components/providers";
import { ToastContainer } from "@/components/ui";
import ErrorBoundary from "@/components/ErrorBoundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenResearch - AI-Native Collaborative Research Platform",
  description: "Unify research communication, project coordination, and knowledge discovery into a single collaborative workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Dark is the default; ThemeProvider swaps both of these on the client.
    <html lang="en" className="dark" data-theme="dark" suppressHydrationWarning>
      <body className="antialiased">
        <ErrorBoundary>
          <ThemeProvider>
            <QueryProvider>
              <AuthProvider>
                {children}
                <ToastContainer />
              </AuthProvider>
            </QueryProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
