"use client";

import dynamic from "next/dynamic";

// on this browser only (your torch is kept on this phone once you register)
export default dynamic(() => import("@/game/ui/RegisterPage"), { ssr: false, loading: () => <main className="min-h-dvh bg-royal-deep" /> });
