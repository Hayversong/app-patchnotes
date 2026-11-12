import { create } from "zustand";

import { parseScenarioParam, type MockScenarioMap } from "./scenarios";

function readInitialScenarios(): MockScenarioMap {
  if (typeof window === "undefined") return {};
  return parseScenarioParam(new URLSearchParams(window.location.search).get("mock"));
}

type MockScenarioState = {
  scenarios: MockScenarioMap;
  clear: () => void;
};

/** Estado de desenvolvimento: cenário MSW ativo por domínio. Vive só na memória da página. */
export const useMockScenarioStore = create<MockScenarioState>((set) => ({
  scenarios: readInitialScenarios(),
  clear: () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("mock");
    window.history.replaceState(window.history.state, "", url);
    set({ scenarios: {} });
  },
}));
