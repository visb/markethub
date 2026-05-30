import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ERP_CONNECTORS, type ErpConnector } from "./connector.interface";

/** Resolve o conector pelo tipo configurado no merchant. */
@Injectable()
export class ConnectorRegistry {
  private readonly byType = new Map<string, ErpConnector>();

  constructor(@Inject(ERP_CONNECTORS) connectors: ErpConnector[]) {
    for (const c of connectors) this.byType.set(c.type, c);
  }

  resolve(type: string | null | undefined): ErpConnector {
    if (!type) {
      throw new NotFoundException({
        code: "NO_CONNECTOR",
        message: "Merchant has no connectorType configured",
      });
    }
    const connector = this.byType.get(type);
    if (!connector) {
      throw new NotFoundException({
        code: "UNKNOWN_CONNECTOR",
        message: `No ERP connector registered for type "${type}"`,
      });
    }
    return connector;
  }

  list(): string[] {
    return [...this.byType.keys()];
  }
}
