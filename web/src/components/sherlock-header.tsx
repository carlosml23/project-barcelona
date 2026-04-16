"use client";

import Image from "next/image";

export function SherlockHeader() {
  return (
    <header className="border-b border-border/50 px-6 py-4 flex items-center justify-center gap-3 shrink-0">
      <Image src="/sherlock-logo.svg" alt="Sherlock" width={26} height={26} className="opacity-80" />
      <h1 className="text-lg font-semibold tracking-[0.25em] uppercase text-foreground">
        Sherlock
      </h1>
    </header>
  );
}
