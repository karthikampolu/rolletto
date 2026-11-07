"use client";

import { useMutation } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api, ApiError, downloadBlob } from "@/lib/api";
import type { ValuationRequest } from "@/lib/schemas";

export function ExportButtons({ request, disabled }: { request: ValuationRequest; disabled?: boolean }) {
  const exportMutation = useMutation({
    mutationFn: (kind: "excel" | "memo") => api.exportFile(kind, request),
    onSuccess: ({ blob, filename }) => {
      downloadBlob(blob, filename);
      toast.success(`Downloaded ${filename}`);
    },
    onError: (e) => toast.error("Export failed", { description: e instanceof ApiError ? e.message : "Please try again." }),
  });
  const busy = exportMutation.isPending ? exportMutation.variables : null;

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied", { description: "The URL encodes every assumption and setting." });
    } catch {
      toast.error("Couldn’t access the clipboard", { description: window.location.href });
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={share} aria-label="Copy shareable link">
        <Link2 aria-hidden="true" /> Share
      </Button>
      <Button variant="secondary" size="sm" disabled={disabled || !!busy} onClick={() => exportMutation.mutate("excel")}>
        {busy === "excel" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet aria-hidden="true" />} Excel
      </Button>
      <Button size="sm" disabled={disabled || !!busy} onClick={() => exportMutation.mutate("memo")}>
        {busy === "memo" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileText aria-hidden="true" />} Memo PDF
      </Button>
    </>
  );
}
