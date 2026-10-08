// Normaliza para busca sem acento e sem diferenciar maiúsculas ("Queijo Maturado" ≈ "queijo maturado").
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(text: string): string {
  return normalize(text).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function onlyDigits(text: string): string {
  return text.replace(/\D/g, "");
}

export function randomToken(bytes = 24): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
}
