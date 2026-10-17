"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { Splash } from "@/components/shell/splash";

export default function Index() {
  const { me, ready } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (ready) router.replace(me ? "/dashboard" : "/login");
  }, [ready, me, router]);
  return <Splash />;
}
