import { useState } from "react";
import { ErpConfigPanel } from "@/components/integration/ErpConfigPanel";
import { ApiKeysPanel } from "@/components/integration/ApiKeysPanel";
import { WebhooksPanel } from "@/components/integration/WebhooksPanel";

type Tab = "erp" | "api-keys" | "webhooks";

const TABS: { id: Tab; label: string }[] = [
  { id: "erp", label: "ERP" },
  { id: "api-keys", label: "API keys" },
  { id: "webhooks", label: "Webhooks" },
];

/**
 * Tela de integração (story 09) — owner-only (gate na rota via RequireCapability).
 * Orquestra as 3 abas; cada painel consome seus próprios hooks. Sem fetch inline.
 */
export function Integration() {
  const [tab, setTab] = useState<Tab>("erp");

  return (
    <section>
      <div className="page-head">
        <h1>Integração</h1>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-panel">
        {tab === "erp" && <ErpConfigPanel />}
        {tab === "api-keys" && <ApiKeysPanel />}
        {tab === "webhooks" && <WebhooksPanel />}
      </div>
    </section>
  );
}
