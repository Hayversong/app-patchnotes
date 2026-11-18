import { test as setup } from "@playwright/test";

import { register, uniqueEmail } from "./helpers";

// Uma conta por navegador: o refresh token é rotacionado a cada uso, então duas sessões não podem dividi-lo.
for (const browser of ["chromium", "firefox"]) {
  setup(`cria a conta de teste do ${browser}`, async ({ page }) => {
    await register(page, `E2E ${browser}`, uniqueEmail(`e2e-${browser}`));
    await page.context().storageState({ path: `e2e/.auth/${browser}.json` });
  });
}
