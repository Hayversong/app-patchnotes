import { api } from "@/lib/axios";

import { useMockScenarioStore } from "./scenario-store";
import { MOCK_SCENARIO_HEADER, scenarioFor } from "./scenarios";

let installed = false;

/** Anexa `X-Mock-Scenario` às requisições do Axios. Usado apenas em desenvolvimento. */
export function installScenarioInterceptor() {
  if (installed) return;
  installed = true;
  api.interceptors.request.use((config) => {
    const scenario = scenarioFor(useMockScenarioStore.getState().scenarios, config.url ?? "");
    if (scenario !== "success") config.headers.set(MOCK_SCENARIO_HEADER, scenario);
    return config;
  });
}
