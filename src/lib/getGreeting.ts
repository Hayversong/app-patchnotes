const greetings = [
  ["Ainda acordado, {name}?", "Criando na madrugada, {name}?"],
  ["Bom dia, {name}", "Pronto para criar, {name}?"],
  ["Boa tarde, {name}", "Como vai o projeto, {name}?"],
  ["Boa noite, {name}", "De volta ao projeto, {name}?", "Hora de criar, {name}?"],
] as const;

/** Uses the user's local time. Date and random are injectable for deterministic tests. */
export function getGreeting(name?: string | null, date = new Date(), random = Math.random): string {
  const firstName = name?.trim().split(/\s+/)[0];
  if (!firstName) return "Bem-vindo de volta";
  const hour = date.getHours();
  const choices = greetings[Math.floor(hour / 6)];
  const index = Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)));
  return choices[index].replace("{name}", firstName);
}
