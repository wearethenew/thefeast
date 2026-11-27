"use client";

import { PageFrame } from "./PageFrame";
import { RegisterPanel } from "./RegisterPanel";

/** thefeast.wearethenew.org/register: the registration form on its own, without going into the game. */
export default function RegisterPage() {
  return (
    <PageFrame footer={false}>
      <RegisterPanel standalone onClose={() => (window.location.href = "/")} />
    </PageFrame>
  );
}
