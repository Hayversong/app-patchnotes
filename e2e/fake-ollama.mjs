// Ollama falso para os testes ponta a ponta (CI sem GPU). Implementa só o POST /api/chat com streaming NDJSON,
// no mesmo formato do Ollama: um objeto por trecho e um final com done=true e as contagens de tokens.
// Uso: node e2e/fake-ollama.mjs  (porta em FAKE_OLLAMA_PORT, padrão 11434)
import { createServer } from "node:http";

const port = Number(process.env.FAKE_OLLAMA_PORT ?? 11434);
const reply = ["Que", " tal", " um", " pulo", " duplo", " que", " gasta", " energia", " e", " recarrega", " ao", " tocar", " o", " chão?"];

createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/api/chat") {
    response.writeHead(404).end();
    return;
  }
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", async () => {
    const { model } = JSON.parse(body || "{}");
    response.writeHead(200, { "Content-Type": "application/x-ndjson" });
    for (const content of reply) {
      response.write(JSON.stringify({ model, message: { role: "assistant", content }, done: false }) + "\n");
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    response.end(JSON.stringify({ model, message: { role: "assistant", content: "" }, done: true, prompt_eval_count: 42, eval_count: reply.length }) + "\n");
  });
}).listen(port, "127.0.0.1", () => console.log(`fake-ollama ouvindo em 127.0.0.1:${port}`));
