import { Injectable, Logger } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ErpConnector } from "../connector.interface";
import type {
  ConnectorContext,
  PushOrderInput,
  RawPrice,
  RawProduct,
  RawStock,
} from "../erp.types";
import { parseCsv, toBool, toInt, toIntOrNull } from "./csv.util";

interface CsvConfig {
  baseDir: string;
}

/**
 * Conector de referência baseado em CSV. Lê arquivos em:
 *   <baseDir>/<store.externalId>/{products,prices,stock}.csv
 * Serve de contrato/exemplo para conectores de ERPs reais.
 */
@Injectable()
export class CsvErpConnector implements ErpConnector {
  readonly type = "csv";
  private readonly logger = new Logger(CsvErpConnector.name);

  async fetchProducts(ctx: ConnectorContext): Promise<RawProduct[]> {
    const rows = await this.read(ctx, "products.csv");
    return rows.map((r) => ({
      externalId: r.externalId!,
      gtin: r.gtin || null,
      name: r.name!,
      brand: r.brand || null,
      unit: r.unit || null,
      categoryName: r.categoryName || null,
      imageUrl: r.imageUrl || null,
      priceCents: toInt(r.priceCents),
      promoPriceCents: toIntOrNull(r.promoPriceCents),
      available: toBool(r.available),
      stockQuantity: toIntOrNull(r.stockQuantity),
    }));
  }

  async fetchPrices(ctx: ConnectorContext): Promise<RawPrice[]> {
    const rows = await this.read(ctx, "prices.csv");
    return rows.map((r) => ({
      externalId: r.externalId!,
      priceCents: toInt(r.priceCents),
      promoPriceCents: toIntOrNull(r.promoPriceCents),
      available: toBool(r.available),
    }));
  }

  async fetchStock(ctx: ConnectorContext): Promise<RawStock[]> {
    const rows = await this.read(ctx, "stock.csv");
    return rows.map((r) => ({
      externalId: r.externalId!,
      quantity: toIntOrNull(r.quantity),
      available: toBool(r.available),
    }));
  }

  pushOrder(_ctx: ConnectorContext, order: PushOrderInput): Promise<{ externalOrderId: string }> {
    // Stub: ERP real receberia o pedido. CSV apenas ecoa.
    return Promise.resolve({ externalOrderId: `csv-${order.orderId}` });
  }

  acknowledge(_ctx: ConnectorContext, _externalOrderId: string): Promise<void> {
    return Promise.resolve();
  }

  private async read(ctx: ConnectorContext, file: string): Promise<Record<string, string>[]> {
    const config = (ctx.config ?? {}) as Partial<CsvConfig>;
    if (!config.baseDir || !ctx.store.externalId) {
      this.logger.warn(`csv connector missing baseDir or store.externalId`);
      return [];
    }
    const filePath = path.resolve(process.cwd(), config.baseDir, ctx.store.externalId, file);
    try {
      const content = await readFile(filePath, "utf8");
      return parseCsv(content);
    } catch {
      this.logger.warn(`csv file not found: ${filePath}`);
      return [];
    }
  }
}
