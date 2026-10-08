// Monta WHERE dinâmico com placeholders $1, $2… para usar com sql.unsafe(text, params).
// Valores sempre vão como parâmetro; só nomes de coluna fixos entram no texto.
export class Conditions {
  private parts: string[] = [];
  readonly params: unknown[] = [];

  add(fragment: (placeholder: () => string) => string, ...values: unknown[]): this {
    let i = 0;
    this.parts.push(
      fragment(() => {
        this.params.push(values[i++]);
        return `$${this.params.length}`;
      }),
    );
    return this;
  }

  raw(fragment: string): this {
    this.parts.push(fragment);
    return this;
  }

  param(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  where(): string {
    return this.parts.length ? `where ${this.parts.join(" and ")}` : "";
  }
}

// Literal de array do Postgres ("{1,2,3}") para usar com `$n::int[]`.
export function pgIntArray(values: number[]): string {
  if (!values.every(Number.isInteger)) throw new Error("pgIntArray aceita só inteiros");
  return `{${values.join(",")}}`;
}
