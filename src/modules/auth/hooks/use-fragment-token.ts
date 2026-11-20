import { useEffect, useRef, useState } from "react";

/**
 * Lê o token de um link de e-mail (#token=...) e o tira da barra de endereço em seguida.
 * O fragmento não é enviado a servidores nem aparece em logs de acesso.
 * undefined = ainda lendo; null = link incompleto ou já aberto.
 */
export function useFragmentToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  // O ref guarda o token lido: o efeito pode rodar de novo (StrictMode) depois que o fragmento já foi apagado.
  const captured = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (captured.current === undefined) {
      const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
      captured.current = value && value.length >= 20 ? value : null;
      if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname);
    }
    setToken(captured.current);
  }, []);
  return token;
}
