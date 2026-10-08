import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { badRequest, conflict, notFound, unauthorized } from "../lib/errors";
import { randomToken } from "../lib/text";
import type { AppEnv } from "../lib/types";
import { removeUpload, storeUpload } from "../lib/uploads";
import { validate } from "../lib/validate";

const MAX_ATTACHMENTS = 10;

// Opções dos selects do formulário "Sua proposta em 3 etapas".
export const PROPOSAL_OPTIONS = {
  mainProductType: ["Queijo fresco", "Queijo maturado", "Manteiga", "Requeijão", "Doce de leite", "Iogurte", "Outro"],
  milkUsed: ["Vaca • leite cru", "Vaca • pasteurizado", "Cabra", "Búfala", "Misto"],
  averageCure: ["Sem cura", "Até 15 dias", "15 a 22 dias", "22 a 30 dias", "30 a 60 dias", "Mais de 60 dias"],
  monthlyVolume: [
    { label: "até 100 kg / mês", kg: 100 },
    { label: "100 a 250 kg / mês", kg: 250 },
    { label: "480 kg / mês", kg: 480 },
    { label: "500 kg a 1 t / mês", kg: 1000 },
    { label: "mais de 1 t / mês", kg: 2000 },
  ],
  saleFormat: ["Peças até 300 g", "Peças de 600 a 700 g", "Peças de 1 kg ou mais", "Potes", "Vidros", "Granel"],
  pickupFrequency: ["Semanal", "Quinzenal", "Mensal"],
  certifications: ["SIM", "SIE", "SIF", "Artesanal", "Selo Arte", "Boas práticas"],
} as const;

const step1 = z.object({
  responsibleName: z.string().trim().min(2),
  propertyName: z.string().trim().min(2),
  city: z.string().trim().min(2),
  state: z.string().trim().length(2).transform((s) => s.toUpperCase()),
  email: z.email().optional(),
  phone: z.string().trim().min(8).optional(),
});

const step2 = z.object({
  mainProductType: z.enum(PROPOSAL_OPTIONS.mainProductType),
  milkUsed: z.enum(PROPOSAL_OPTIONS.milkUsed),
  averageCure: z.enum(PROPOSAL_OPTIONS.averageCure),
  monthlyVolumeKg: z.number().int().positive().max(100_000),
  saleFormat: z.enum(PROPOSAL_OPTIONS.saleFormat),
  pickupFrequency: z.enum(PROPOSAL_OPTIONS.pickupFrequency),
});

const step3 = z.object({ certifications: z.array(z.enum(PROPOSAL_OPTIONS.certifications)).max(10) });

// Rascunho aceita qualquer subconjunto; a validação completa acontece no envio.
const draftSchema = step1.partial().extend(step2.partial().shape).extend(step3.partial().shape).extend({
  currentStep: z.number().int().min(1).max(3).optional(),
});

const COLUMNS: Record<string, string> = {
  responsibleName: "responsible_name",
  propertyName: "property_name",
  city: "city",
  state: "state",
  email: "email",
  phone: "phone",
  mainProductType: "main_product_type",
  milkUsed: "milk_used",
  averageCure: "average_cure",
  monthlyVolumeKg: "monthly_volume_kg",
  saleFormat: "sale_format",
  pickupFrequency: "pickup_frequency",
  certifications: "certifications",
  currentStep: "current_step",
};

const SELECT = `
  p.id, p.protocol, p.status, p.current_step as "currentStep",
  p.responsible_name as "responsibleName", p.property_name as "propertyName", p.city, p.state, p.email, p.phone,
  p.main_product_type as "mainProductType", p.milk_used as "milkUsed", p.average_cure as "averageCure",
  p.monthly_volume_kg as "monthlyVolumeKg", p.sale_format as "saleFormat", p.pickup_frequency as "pickupFrequency",
  p.certifications, p.submitted_at as "submittedAt", p.updated_at as "updatedAt",
  coalesce((select json_agg(json_build_object('id', a.id, 'name', a.original_name, 'mimeType', a.mime_type,
                                              'sizeBytes', a.size_bytes) order by a.id)
            from proposal_attachments a where a.proposal_id = p.id), '[]'::json) as attachments`;

async function loadProposal(protocol: string, editToken: string | undefined) {
  if (!editToken) throw unauthorized("Envie o cabeçalho X-Edit-Token recebido ao criar a proposta");
  const rows = await db().unsafe(`select ${SELECT} from supplier_proposals p where protocol = $1 and edit_token = $2`, [
    protocol,
    editToken,
  ]);
  if (!rows[0]) throw notFound("Proposta");
  return rows[0];
}

async function saveDraft(id: number, data: z.infer<typeof draftSchema>) {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const params: unknown[] = [];
  const sets = entries.map(([key, value]) => {
    params.push(key === "certifications" ? `{${(value as string[]).join(",")}}` : value);
    return `${COLUMNS[key]} = $${params.length}${key === "certifications" ? "::text[]" : ""}`;
  });
  params.push(id);
  await db().unsafe(
    `update supplier_proposals set ${sets.join(", ")}, updated_at = now() where id = $${params.length}`,
    params,
  );
}

function ensureEditable(proposal: { status: string }) {
  if (proposal.status !== "draft") throw conflict("Proposta já enviada — não pode mais ser alterada");
}

export const proposalRoutes = new Hono<AppEnv>()
  .get("/options", (c) => c.json(PROPOSAL_OPTIONS))

  // Inicia a proposta. Guarde protocol + editToken para continuar depois (sem login).
  .post("/", validate("json", draftSchema), async (c) => {
    const editToken = randomToken();
    const [created] = await db()`insert into supplier_proposals (edit_token) values (${editToken}) returning id, protocol`;
    await saveDraft(created.id, c.req.valid("json"));
    const proposal = await loadProposal(created.protocol, editToken);
    return c.json({ editToken, proposal }, 201);
  })

  .get("/:protocol", async (c) => {
    return c.json({ proposal: await loadProposal(c.req.param("protocol"), c.req.header("X-Edit-Token")) });
  })

  // Autosave ("Salvo agora").
  .patch("/:protocol", validate("json", draftSchema), async (c) => {
    const token = c.req.header("X-Edit-Token");
    const proposal = await loadProposal(c.req.param("protocol"), token);
    ensureEditable(proposal);
    await saveDraft(proposal.id, c.req.valid("json"));
    return c.json({ proposal: await loadProposal(proposal.protocol, token) });
  })

  // "Arraste laudos, fotos de selos ou certificados" — PDF, JPG ou PNG até 10 MB.
  .post("/:protocol/attachments", async (c) => {
    const proposal = await loadProposal(c.req.param("protocol"), c.req.header("X-Edit-Token"));
    ensureEditable(proposal);
    const body = await c.req.parseBody({ all: true });
    const files = ([] as unknown[]).concat(body.file ?? body["files"] ?? []).filter((f): f is File => f instanceof File);
    if (files.length === 0) throw badRequest("Envie o arquivo no campo 'file' (multipart/form-data)");
    if (proposal.attachments.length + files.length > MAX_ATTACHMENTS) {
      throw badRequest(`Limite de ${MAX_ATTACHMENTS} anexos por proposta`);
    }

    const created = [];
    for (const file of files) {
      const stored = await storeUpload(`proposals/${proposal.protocol}`, file);
      const [row] = await db()`
        insert into proposal_attachments (proposal_id, original_name, stored_name, mime_type, size_bytes)
        values (${proposal.id}, ${file.name.slice(0, 200)}, ${stored.storedName}, ${stored.mimeType}, ${stored.sizeBytes})
        returning id, original_name as name, mime_type as "mimeType", size_bytes as "sizeBytes"`;
      created.push(row);
    }
    return c.json({ attachments: created }, 201);
  })

  .delete("/:protocol/attachments/:id", async (c) => {
    const proposal = await loadProposal(c.req.param("protocol"), c.req.header("X-Edit-Token"));
    ensureEditable(proposal);
    const [removed] = await db()`
      delete from proposal_attachments where id = ${Number(c.req.param("id"))} and proposal_id = ${proposal.id}
      returning stored_name`;
    if (!removed) throw notFound("Anexo");
    await removeUpload(`proposals/${proposal.protocol}`, removed.stored_name);
    return c.body(null, 204);
  })

  // Envia para análise. Aqui todas as etapas precisam estar completas.
  .post("/:protocol/submit", async (c) => {
    const token = c.req.header("X-Edit-Token");
    const proposal = await loadProposal(c.req.param("protocol"), token);
    ensureEditable(proposal);

    const full = step1
      .extend(step2.shape)
      .extend(step3.shape)
      .refine((d) => d.email || d.phone, { message: "Informe e-mail ou telefone", path: ["email"] })
      .safeParse(Object.fromEntries(Object.entries(proposal).map(([k, v]) => [k, v ?? undefined])));
    if (!full.success) {
      throw badRequest(
        "Proposta incompleta",
        full.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      );
    }

    await db()`
      update supplier_proposals set status = 'submitted', submitted_at = now(), current_step = 3, updated_at = now()
      where id = ${proposal.id}`;
    return c.json({
      proposal: await loadProposal(proposal.protocol, token),
      message: `Proposta ${proposal.protocol} recebida. Avisaremos por WhatsApp ou e-mail.`,
    });
  });
