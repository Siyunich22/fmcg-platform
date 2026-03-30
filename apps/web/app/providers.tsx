"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { SessionProvider, useSession } from "next-auth/react";
import { useState, useEffect } from "react";

// Sync NextAuth session token → sessionStorage so lib/api.ts can read it
function TokenSync() {
  const { data: session } = useSession();
  useEffect(() => {
    const token = (session as any)?.accessToken;
    if (token) {
      sessionStorage.setItem("access_token", token);
    } else if (session === null) {
      sessionStorage.removeItem("access_token");
    }
  }, [session]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <TokenSync />
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </SessionProvider>
  );
}
