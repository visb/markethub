import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { ConnectorRegistry } from "../erp/connector-registry";
import {
  apiKeyPrefix,
  generateApiKey,
  generateWebhookSecret,
  hashApiKey,
  maskSecret,
  signWebhookBody,
} from "./integration.crypto";
import {
  WEBHOOK_SENDER,
  type WebhookSender,
} from "./webhook-sender.interface";
import {
  WEBHOOK_EVENTS,
  WebhookQueueService,
  type WebhookEvent,
  type WebhookJobData,
} from "./webhook.queue";

/** Chaves do connectorConfig consideradas segredos (mascaradas na leitura). */
const SECRET_CONFIG_KEYS = ["apiKey", "secret", "token", "password", "clientSecret"];

/** Schema do config de ERP por tipo de conector (story 09). MVP: csv. */
const erpConfigSchemas: Record<string, z.ZodTypeAny> = {
  csv: z.object({ dir: z.string().min(1, "Informe o diretório dos CSVs") }),
};
/** Schema genérico (conectores sem schema dedicado): endpoint + credenciais livres. */
const genericErpConfigSchema = z
  .object({
    baseUrl: z.string().url().optional(),
    apiKey: z.string().optional(),
    token: z.string().optional(),
  })
  .passthrough();

export interface User {
  id: string;
  roles: string[];
}

export interface ErpConfigInput {
  connectorType: string;
  connectorConfig: Record<string, unknown>;
}

export interface CreateWebhookInput {
  url: string;
  events?: string[];
}

export interface UpdateWebhookInput {
  url?: string;
  events?: string[];
  active?: boolean;
}

/**
 * Configuração de integração do merchant (story 09): ERP (saída), api-keys de
 * entrada e webhooks de saída assinados. Toda rota é OWNER-ONLY (gerente não
 * acessa) — reforçado aqui no service, além do gate de UI.
 */
@Injectable()
export class IntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectors: ConnectorRegistry,
    private readonly queue: WebhookQueueService,
    @Inject(WEBHOOK_SENDER) private readonly sender: WebhookSender,
  ) {}

  // ── owner scope ──

  /**
   * Resolve a rede (merchantId) do dono. Integração é owner-only: exige RoleName
   * `merchant`. Sem rede única → erro (informa ambiguidade). Gerente → FORBIDDEN.
   */
  async resolveOwnerMerchantId(user: User): Promise<string> {
    if (!user.roles.includes("merchant")) {
      throw new ForbiddenException({
        code: "NOT_AN_OWNER",
        message: "Apenas o dono da rede pode gerenciar a integração",
      });
    }
    const staff = await this.prisma.storeStaff.findMany({
      where: { userId: user.id, staffRole: "manager", active: true },
      include: { store: { select: { merchantId: true } } },
    });
    const owned = new Set(staff.map((s) => s.store.merchantId));
    if (owned.size === 0) {
      throw new BadRequestException({
        code: "MERCHANT_NOT_RESOLVED",
        message: "Não foi possível determinar a rede do usuário",
      });
    }
    if (owned.size > 1) {
      throw new BadRequestException({
        code: "MERCHANT_AMBIGUOUS",
        message: "Usuário possui múltiplas redes",
      });
    }
    return [...owned][0];
  }

  // ── ERP config (saída) ──

  /** Tipos de conector ERP registrados (csv, …) — para o seletor do form. */
  connectorTypes(): string[] {
    return this.connectors.list();
  }

  /** Lê a config de ERP com segredos MASCARADOS (nunca devolve valor em claro). */
  async getErpConfig(user: User) {
    const merchantId = await this.resolveOwnerMerchantId(user);
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      select: { connectorType: true, connectorConfig: true },
    });
    const config = (merchant.connectorConfig ?? {}) as Record<string, unknown>;
    return {
      connectorType: merchant.connectorType,
      connectorConfig: this.maskConfig(config),
      availableTypes: this.connectorTypes(),
    };
  }

  /**
   * Grava connectorType + connectorConfig. Valida o config conforme o tipo (zod).
   * PATCH parcial de segredo: valor mascarado recebido de volta NÃO sobrescreve o
   * armazenado (mantém o atual); valor novo em claro substitui.
   */
  async putErpConfig(user: User, input: ErpConfigInput) {
    const merchantId = await this.resolveOwnerMerchantId(user);
    const known = this.connectorTypes();
    if (!known.includes(input.connectorType)) {
      throw new BadRequestException({
        code: "UNKNOWN_CONNECTOR",
        message: `Conector desconhecido: ${input.connectorType}`,
      });
    }

    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      select: { connectorConfig: true },
    });
    const current = (merchant.connectorConfig ?? {}) as Record<string, unknown>;
    const merged = this.mergePreservingSecrets(current, input.connectorConfig);

    const schema = erpConfigSchemas[input.connectorType] ?? genericErpConfigSchema;
    const parsed = schema.safeParse(merged);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_ERP_CONFIG",
        message: parsed.error.issues[0]?.message ?? "Config de ERP inválido",
      });
    }

    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: {
        connectorType: input.connectorType,
        connectorConfig: merged as Prisma.InputJsonValue,
      },
    });
    return this.getErpConfig(user);
  }

  /** Mascara valores de chaves sensíveis do config para leitura. */
  private maskConfig(config: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config)) {
      out[k] = SECRET_CONFIG_KEYS.includes(k) && typeof v === "string" ? maskSecret(v) : v;
    }
    return out;
  }

  /**
   * Funde config novo sobre o atual preservando segredos: se o valor recebido p/
   * uma chave secreta for o mascarado (começa com `****`), mantém o atual.
   */
  private mergePreservingSecrets(
    current: Record<string, unknown>,
    incoming: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { ...current };
    for (const [k, v] of Object.entries(incoming)) {
      if (
        SECRET_CONFIG_KEYS.includes(k) &&
        typeof v === "string" &&
        v.startsWith("****")
      ) {
        continue; // mantém o segredo atual
      }
      out[k] = v;
    }
    return out;
  }

  // ── Api-keys (entrada) ──

  /** Lista api-keys com metadados (prefixo, datas) — NUNCA o valor/hash. */
  async listApiKeys(user: User) {
    const merchantId = await this.resolveOwnerMerchantId(user);
    const keys = await this.prisma.apiKey.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    });
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt,
    }));
  }

  /**
   * Cria uma api-key. Devolve a chave em claro UMA única vez; persiste só o hash.
   * Listagens posteriores nunca expõem o valor.
   */
  async createApiKey(user: User, name: string) {
    const merchantId = await this.resolveOwnerMerchantId(user);
    const cleanName = name?.trim();
    if (!cleanName) {
      throw new BadRequestException({ code: "INVALID_NAME", message: "Informe um nome" });
    }
    const key = generateApiKey();
    const created = await this.prisma.apiKey.create({
      data: {
        merchantId,
        name: cleanName,
        keyHash: hashApiKey(key),
        prefix: apiKeyPrefix(key),
      },
    });
    return {
      id: created.id,
      name: created.name,
      prefix: created.prefix,
      createdAt: created.createdAt,
      // revelado uma única vez — não volta em nenhuma leitura futura
      key,
    };
  }

  /** Revoga (invalida) uma api-key sem deletar — mantém o histórico/prefixo. */
  async revokeApiKey(user: User, id: string) {
    const merchantId = await this.resolveOwnerMerchantId(user);
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key || key.merchantId !== merchantId) {
      throw new NotFoundException({ code: "API_KEY_NOT_FOUND", message: "Api-key não encontrada" });
    }
    if (key.revokedAt) {
      return { id: key.id, revokedAt: key.revokedAt };
    }
    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return { id: updated.id, revokedAt: updated.revokedAt };
  }

  // ── Webhooks (saída, assinados) ──

  private maskWebhook(w: {
    id: string;
    url: string;
    secret: string;
    events: string[];
    active: boolean;
    lastDeliveryStatus: string | null;
    lastDeliveryAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: w.id,
      url: w.url,
      events: w.events,
      active: w.active,
      secretMasked: maskSecret(w.secret),
      lastDeliveryStatus: w.lastDeliveryStatus,
      lastDeliveryAt: w.lastDeliveryAt,
      createdAt: w.createdAt,
    };
  }

  async listWebhooks(user: User) {
    const merchantId = await this.resolveOwnerMerchantId(user);
    const hooks = await this.prisma.webhook.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    });
    return hooks.map((w) => this.maskWebhook(w));
  }

  private validateEvents(events: string[] | undefined): WebhookEvent[] {
    const list = events && events.length > 0 ? events : [...WEBHOOK_EVENTS];
    const invalid = list.filter((e) => !WEBHOOK_EVENTS.includes(e as WebhookEvent));
    if (invalid.length > 0) {
      throw new BadRequestException({
        code: "INVALID_EVENT",
        message: `Evento(s) não suportado(s): ${invalid.join(", ")}`,
      });
    }
    return list as WebhookEvent[];
  }

  private validateUrl(url: string) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException({ code: "INVALID_URL", message: "URL inválida" });
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new BadRequestException({ code: "INVALID_URL", message: "URL deve ser http(s)" });
    }
  }

  /** Cria um webhook e devolve o secret de assinatura UMA única vez. */
  async createWebhook(user: User, input: CreateWebhookInput) {
    const merchantId = await this.resolveOwnerMerchantId(user);
    this.validateUrl(input.url);
    const events = this.validateEvents(input.events);
    const secret = generateWebhookSecret();
    const created = await this.prisma.webhook.create({
      data: { merchantId, url: input.url, secret, events },
    });
    return { ...this.maskWebhook(created), secret };
  }

  async updateWebhook(user: User, id: string, patch: UpdateWebhookInput) {
    const merchantId = await this.resolveOwnerMerchantId(user);
    const hook = await this.prisma.webhook.findUnique({ where: { id } });
    if (!hook || hook.merchantId !== merchantId) {
      throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook não encontrado" });
    }
    const data: Prisma.WebhookUpdateInput = {};
    if (patch.url !== undefined) {
      this.validateUrl(patch.url);
      data.url = patch.url;
    }
    if (patch.events !== undefined) data.events = this.validateEvents(patch.events);
    if (patch.active !== undefined) data.active = patch.active;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException({ code: "NO_FIELDS", message: "Nenhum campo para atualizar" });
    }
    const updated = await this.prisma.webhook.update({ where: { id }, data });
    return this.maskWebhook(updated);
  }

  async deleteWebhook(user: User, id: string) {
    const merchantId = await this.resolveOwnerMerchantId(user);
    const hook = await this.prisma.webhook.findUnique({ where: { id } });
    if (!hook || hook.merchantId !== merchantId) {
      throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook não encontrado" });
    }
    await this.prisma.webhook.delete({ where: { id } });
    return { id };
  }

  /** Enfileira um ping assinado p/ o webhook (botão "testar" no front). */
  async testWebhook(user: User, id: string) {
    const merchantId = await this.resolveOwnerMerchantId(user);
    const hook = await this.prisma.webhook.findUnique({ where: { id } });
    if (!hook || hook.merchantId !== merchantId) {
      throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook não encontrado" });
    }
    await this.queue.enqueue({
      webhookId: hook.id,
      event: "ping",
      data: { message: "ping de teste do MarketHub" },
    });
    return { enqueued: true };
  }

  // ── Disparo (produtor) ──

  /**
   * Emite um evento de pedido para todos os webhooks ativos do merchant inscritos
   * nele. Chamado dos pontos de domínio (order.created / status_changed).
   * Best-effort: nunca lança (não pode quebrar o fluxo de pedido).
   */
  async emit(merchantId: string, event: WebhookEvent, data: Record<string, unknown>) {
    try {
      const hooks = await this.prisma.webhook.findMany({
        where: { merchantId, active: true, events: { has: event } },
        select: { id: true },
      });
      await Promise.all(
        hooks.map((h) => this.queue.enqueue({ webhookId: h.id, event, data })),
      );
    } catch {
      // disparo de webhook não pode quebrar o pedido; falha é tolerada
    }
  }

  // ── Entrega (consumido pelo processor) ──

  /** Monta o envelope assinado e devolve corpo + headers prontos para o POST. */
  buildSignedRequest(secret: string, job: WebhookJobData) {
    const payload = {
      event: job.event,
      timestamp: new Date().toISOString(), // mitiga replay no destino
      data: job.data,
    };
    const body = JSON.stringify(payload);
    const signature = signWebhookBody(secret, body);
    return {
      body,
      headers: {
        "X-MarketHub-Signature": signature,
        "X-MarketHub-Event": job.event,
      },
    };
  }

  /**
   * Executa a entrega de um job: assina, envia (via WebhookSender), grava o
   * status da última entrega. Lança em falha p/ o BullMQ aplicar retry/backoff.
   */
  async deliver(job: WebhookJobData): Promise<void> {
    const hook = await this.prisma.webhook.findUnique({ where: { id: job.webhookId } });
    if (!hook || !hook.active) return; // webhook removido/desativado → descarta

    const { body, headers } = this.buildSignedRequest(hook.secret, job);
    const result = await this.sender.send({ url: hook.url, body, headers });

    await this.prisma.webhook.update({
      where: { id: hook.id },
      data: {
        lastDeliveryStatus: result.ok ? "ok" : "failed",
        lastDeliveryAt: new Date(),
      },
    });

    if (!result.ok) {
      throw new Error(`Webhook ${hook.id} respondeu ${result.status}`);
    }
  }
}
