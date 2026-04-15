"use client";

import { Search } from "lucide-react";

export function SherlockHeader() {
  return (
    <header className="border-b border-border/50 px-4 py-3 flex items-center gap-3 shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
          <Search className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">Sherlock</h1>
          <p className="text-[10px] text-muted-foreground -mt-0.5">Debtor Intelligence</p>
        </div>
      </div>
    </header>
  );
}
