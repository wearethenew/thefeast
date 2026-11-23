"use client";

import { MerchPanel } from "./MerchPanel";
import { PageFrame } from "./PageFrame";

/** thefeast.wearethenew.org/merch: pre-order Feast merch without going into the game. */
export default function MerchPage() {
  return (
    <PageFrame>
      <MerchPanel standalone onClose={() => (window.location.href = "/")} />
    </PageFrame>
  );
}
