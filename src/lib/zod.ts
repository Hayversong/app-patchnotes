import { z } from "zod";

// Sob a CSP estrita (sem 'unsafe-eval', ver src/lib/security-headers.ts), o Zod testaria `new Function("")` para
// decidir se usa o compilador JIT. O teste é bloqueado e o Zod segue sem JIT, mas cada página geraria um
// relatório de violação de CSP. `jitless` pula o teste; a validação continua igual.
// O Zod decide isso quando cada schema é CRIADO: por isso os schemas importam `z` daqui, e não de "zod".
z.config({ jitless: true });

export { z };
