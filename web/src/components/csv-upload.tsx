"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CaseFormInput } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type UploadState = "idle" | "parsing" | "preview" | "running" | "complete";

interface ParsedRow {
  row: number;
  data?: CaseFormInput;
  error?: string;
}

interface BatchResult {
  total: number;
  valid: number;
  errors: ParsedRow[];
  results: ParsedRow[];
}

type CaseStatus = "pending" | "running" | "complete" | "error";

interface CaseProgress {
  name: string;
  status: CaseStatus;
}

interface CsvUploadProps {
  onBatchComplete: () => void;
}

export function CsvUpload({ onBatchComplete }: CsvUploadProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [cases, setCases] = useState<CaseProgress[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    setState("parsing");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/api/batch/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data: BatchResult = await res.json();
      setBatch(data);
      setCases(
        data.results
          .filter((r) => r.data)
          .map((r) => ({ name: r.data!.full_name, status: "pending" as const })),
      );
      setState("preview");
    } catch {
      setState("idle");
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".csv")) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const runBatch = useCallback(async () => {
    if (!batch) return;
    setState("running");

    const validRows = batch.results.filter((r) => r.data);

    for (let i = 0; i < validRows.length; i++) {
      setCurrentIndex(i);
      setCases((prev) => prev.map((c, j) => (j === i ? { ...c, status: "running" } : c)));

      try {
        const res = await fetch(`${API_BASE}/api/investigate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validRows[i].data),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        // Consume the SSE stream to completion
        const reader = res.body?.getReader();
        if (reader) {
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        }

        setCases((prev) => prev.map((c, j) => (j === i ? { ...c, status: "complete" } : c)));
      } catch {
        setCases((prev) => prev.map((c, j) => (j === i ? { ...c, status: "error" } : c)));
      }
    }

    setState("complete");
    onBatchComplete();
  }, [batch, onBatchComplete]);

  const reset = useCallback(() => {
    setState("idle");
    setBatch(null);
    setCases([]);
    setCurrentIndex(0);
    setShowErrors(false);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  // Idle: upload zone
  if (state === "idle") {
    return (
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-border/50 rounded-lg p-6 text-center cursor-pointer hover:border-primary/40 hover:bg-secondary/20 transition-colors"
      >
        <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">Upload CSV</p>
        <p className="text-xs text-muted-foreground mt-1">Drop a .csv file or click to browse</p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleInputChange}
          className="hidden"
        />
      </div>
    );
  }

  // Parsing: spinner
  if (state === "parsing") {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Validating CSV...</span>
      </div>
    );
  }

  // Preview: show counts + start button
  if (state === "preview" && batch) {
    const errorRows = batch.errors;
    return (
      <div className="space-y-3">
        <div className="p-3 rounded-lg bg-secondary/40 border border-border/30">
          <p className="text-sm font-medium text-foreground">
            {batch.valid} row{batch.valid !== 1 ? "s" : ""} ready
            {errorRows.length > 0 && (
              <span className="text-amber-400 ml-1">
                ({errorRows.length} error{errorRows.length !== 1 ? "s" : ""})
              </span>
            )}
          </p>
        </div>

        {errorRows.length > 0 && (
          <div>
            <button
              onClick={() => setShowErrors(!showErrors)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showErrors ? "Hide" : "Show"} errors
            </button>
            {showErrors && (
              <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                {errorRows.map((e) => (
                  <p key={e.row} className="text-xs text-red-400">
                    Row {e.row}: {e.error}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={runBatch} disabled={batch.valid === 0} className="flex-1 gap-2">
            <Play className="h-4 w-4" />
            Start Batch
          </Button>
          <Button variant="outline" onClick={reset}>Cancel</Button>
        </div>
      </div>
    );
  }

  // Running + Complete: progress list
  const completedCount = cases.filter((c) => c.status === "complete").length;
  const errorCount = cases.filter((c) => c.status === "error").length;

  return (
    <div className="space-y-3">
      {state === "running" ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            Investigating {currentIndex + 1} of {cases.length}
          </p>
          <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/60 transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / cases.length) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-emerald-400">
            Batch complete: {completedCount} done{errorCount > 0 ? `, ${errorCount} failed` : ""}
          </p>
        </div>
      )}

      <ScrollArea className="max-h-48">
        <div className="space-y-1">
          {cases.map((c, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm">
              {c.status === "pending" && <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />}
              {c.status === "running" && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
              {c.status === "complete" && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
              {c.status === "error" && <AlertCircle className="w-3 h-3 text-red-400" />}
              <span className="text-foreground/80 truncate">{c.name}</span>
            </div>
          ))}
        </div>
      </ScrollArea>

      {state === "complete" && (
        <Button variant="outline" onClick={reset} className="w-full gap-2">
          <RotateCcw className="h-4 w-4" />
          Upload Another
        </Button>
      )}
    </div>
  );
}
