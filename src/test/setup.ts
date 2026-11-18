// Ambiente mínimo de navegador para os testes unitários (sem jsdom): window, document.cookie e location.
const globals = globalThis as Record<string, unknown>;
globals.window ??= globalThis;
globals.document ??= { cookie: "" };
globals.location ??= { protocol: "http:", host: "localhost:3000" };
