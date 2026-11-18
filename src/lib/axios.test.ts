import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { beforeEach, describe, expect, it } from "vitest";

import { api, getApiErrorMessage, refreshAccessToken } from "@/lib/axios";
import { useAuthStore } from "@/store/authStore";

type Handler = (config: InternalAxiosRequestConfig) => { status: number; data?: unknown };
const calls: Array<{ url?: string; auth?: string }> = [];

/** Troca o transporte do Axios: cada requisição passa por `handler` em vez da rede. */
function serve(handler: Handler) {
  api.defaults.adapter = async (config) => {
    calls.push({ url: config.url, auth: String(config.headers.Authorization ?? "") || undefined });
    const { status, data } = handler(config);
    const response = { data, status, statusText: String(status), headers: {}, config } as AxiosResponse;
    if (status >= 400) throw new AxiosError("falhou", String(status), config, undefined, response);
    return response;
  };
}

const user = { id: "u1", name: "Dev", email: "dev@patchnotes.dev" };

beforeEach(() => {
  calls.length = 0;
  useAuthStore.setState({ token: "velho", user, sessionExpired: false });
});

describe("renovação de sessão", () => {
  it("401 renova o token pelo /auth/refresh e refaz a requisição", async () => {
    serve((config) => {
      if (config.url === "/auth/refresh") return { status: 200, data: { user, token: "novo" } };
      return config.headers.Authorization === "Bearer novo" ? { status: 200, data: { ok: true } } : { status: 401 };
    });
    const { data } = await api.get("/dashboard/metrics");
    expect(data).toEqual({ ok: true });
    expect(calls.map((call) => call.url)).toEqual(["/dashboard/metrics", "/auth/refresh", "/dashboard/metrics"]);
    expect(useAuthStore.getState().token).toBe("novo");
  });

  it("vários 401 ao mesmo tempo compartilham uma única renovação", async () => {
    serve((config) => {
      if (config.url === "/auth/refresh") return { status: 200, data: { user, token: "novo" } };
      return config.headers.Authorization === "Bearer novo" ? { status: 200, data: config.url } : { status: 401 };
    });
    const results = await Promise.all(["/a", "/b", "/c"].map((url) => api.get(url)));
    expect(results.map((result) => result.data)).toEqual(["/a", "/b", "/c"]);
    expect(calls.filter((call) => call.url === "/auth/refresh")).toHaveLength(1);
  });

  it("refresh recusado encerra a sessão marcando como expirada", async () => {
    serve(() => ({ status: 401 }));
    await expect(api.get("/profile")).rejects.toBeInstanceOf(AxiosError);
    expect(useAuthStore.getState()).toMatchObject({ token: null, user: null, sessionExpired: true });
  });

  it("401 de rota de autenticação (senha errada) não tenta renovar", async () => {
    useAuthStore.setState({ token: null });
    serve(() => ({ status: 401, data: { message: "E-mail ou senha incorretos." } }));
    const error = await api.post("/auth/login", {}, { skipAuthRefresh: true }).catch((caught: unknown) => caught);
    expect(getApiErrorMessage(error)).toBe("E-mail ou senha incorretos.");
    expect(calls).toHaveLength(1);
  });

  it("não entra em laço se a requisição refeita também tomar 401", async () => {
    serve((config) => (config.url === "/auth/refresh" ? { status: 200, data: { user, token: "novo" } } : { status: 401 }));
    await expect(api.get("/chat/history")).rejects.toBeInstanceOf(AxiosError);
    expect(calls.map((call) => call.url)).toEqual(["/chat/history", "/auth/refresh", "/chat/history"]);
    expect(useAuthStore.getState().sessionExpired).toBe(true);
  });

  it("refreshAccessToken devolve null sem derrubar quem chamou", async () => {
    serve(() => ({ status: 500 }));
    await expect(refreshAccessToken()).resolves.toBeNull();
  });
});

describe("mensagens de erro", () => {
  it("500 sem corpo usa a mensagem padrão; com corpo usa a do servidor", () => {
    const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
    const plain = new AxiosError("x", "500", config, undefined, { status: 500, data: undefined } as AxiosResponse);
    const withBody = new AxiosError("x", "500", config, undefined, { status: 500, data: { message: "Erro no servidor." } } as AxiosResponse);
    expect(getApiErrorMessage(plain)).toBe("Não foi possível concluir a solicitação. Tente novamente.");
    expect(getApiErrorMessage(withBody)).toBe("Erro no servidor.");
    expect(getApiErrorMessage(new Error("rede"), "Sem conexão.")).toBe("Sem conexão.");
  });
});
