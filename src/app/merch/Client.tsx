"use client";

import dynamic from "next/dynamic";

// on this browser only (your torch, if you have one here, fills in your details)
export default dynamic(() => import("@/game/ui/MerchPage"), { ssr: false, loading: () => <main className="min-h-dvh bg-royal-deep" /> });
