"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function DiscardChanges({ onConfirm, disabled = false }: { onConfirm: () => void; disabled?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (disabled) setConfirming(false);
  }, [disabled]);
  if (!confirming || disabled) return <Button type="button" variant="outline" disabled={disabled} onClick={() => setConfirming(true)}>Descartar alterações</Button>;
  return <div role="group" aria-label="Confirmar descarte" className="space-y-2">
    <p role="status" className="text-sm text-muted-foreground">Descartar as alterações não salvas?</p>
    <div className="flex flex-wrap gap-3">
      <Button type="button" variant="outline" onClick={() => setConfirming(false)}>Continuar editando</Button>
      <Button type="button" variant="destructive" onClick={() => { setConfirming(false); onConfirm(); }}>Descartar</Button>
    </div>
  </div>;
}
