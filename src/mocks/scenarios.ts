/**
 * Cenários simulados do MSW.
 *
 * O cliente (somente em desenvolvimento) envia o cabeçalho `X-Mock-Scenario`
 * e os handlers respondem conforme o cenário pedido. Um backend real pode
 * ignorar esse cabeçalho: ele não faz parte do contrato da API.
 */
export const MOCK_SCENARIO_HEADER = "X-Mock-Scenario";

export const mockScenarios = ["success", "empty", "invalid-payload", "unauthorized", "server-error"] as const;
export type MockScenario = (typeof mockScenarios)[number];

export const mockDomains = ["auth", "dashboard", "devlog", "chat", "profile"] as const;
export type MockDomain = (typeof mockDomains)[number];

export type MockScenarioMap = Partial<Record<MockDomain | "all", MockScenario>>;

function isScenario(value: string): value is MockScenario {
  return (mockScenarios as readonly string[]).includes(value);
}

function isDomain(value: string): value is MockDomain | "all" {
  return value === "all" || (mockDomains as readonly string[]).includes(value);
}

/**
 * Lê o parâmetro `?mock=` da URL.
 * Formatos aceitos: `server-error` (todos os domínios) ou
 * `dashboard:empty,chat:server-error` (por domínio). Valores inválidos são ignorados.
 */
export function parseScenarioParam(param: string | null): MockScenarioMap {
  const result: MockScenarioMap = {};
  if (!param) return result;
  for (const part of param.split(",")) {
    const [first, second] = part.trim().split(":");
    const domain = second === undefined ? "all" : first;
    const scenario = second === undefined ? first : second;
    if (domain && scenario && isDomain(domain) && isScenario(scenario)) result[domain] = scenario;
  }
  return result;
}

/** Domínio de uma URL de API (`/api/<domínio>/...`). */
export function domainFromUrl(url: string): MockDomain | undefined {
  const segment = url.replace(/^.*?\/api\//, "").replace(/^\//, "").split(/[/?]/)[0];
  return mockDomains.find((domain) => domain === segment);
}

export function scenarioFor(map: MockScenarioMap, url: string): MockScenario {
  const domain = domainFromUrl(url);
  return (domain && map[domain]) ?? map.all ?? "success";
}

export function readScenarioHeader(request: Request): MockScenario {
  const value = request.headers.get(MOCK_SCENARIO_HEADER);
  return value && isScenario(value) ? value : "success";
}
