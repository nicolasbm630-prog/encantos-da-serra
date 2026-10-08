import { expect, test } from "bun:test";
import { isValidCnpj } from "../src/lib/cnpj";
import { normalize, slugify } from "../src/lib/text";
import { detectFileType } from "../src/lib/uploads";

test("normalize remove acentos e caixa", () => {
  expect(normalize("  Queijo  Maturado São Roque ")).toBe("queijo maturado sao roque");
});

test("slugify", () => {
  expect(slugify("Doce de Leite — Zero Açúcar!")).toBe("doce-de-leite-zero-acucar");
});

test("CNPJ: dígitos verificadores", () => {
  expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
  expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
  expect(isValidCnpj("11111111111111")).toBe(false);
  expect(isValidCnpj("123")).toBe(false);
});

test("uploads: reconhece PDF, PNG e JPG pela assinatura", () => {
  expect(detectFileType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))?.ext).toBe("pdf");
  expect(detectFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))?.ext).toBe("png");
  expect(detectFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
  expect(detectFileType(new Uint8Array([0x4d, 0x5a]))).toBeUndefined();
});
