# Fronteiras de contexto no monolito (story 47)

O backend (`services/api/src`) é um **monolito modular**: os módulos Nest agrupam-se em bounded
contexts e a comunicação entre contextos é restrita e **lintada** (regra local
`markethub/context-boundaries` — `services/api/eslint.boundaries.mjs`, configurada em
`services/api/eslint.config.mjs`). Não é microservices: tudo roda num processo; a fronteira existe
para os contextos evoluírem isolados e para uma extração futura ser barata.

## Mapa de contextos

| Contexto | Pastas de `src/` |
|---|---|
| `catalog` | `catalog`, `enrichment`, `erp` |
| `fulfillment` | `marketplace`, `picking`, `driver`, `scheduling` |
| `payment` | `payment` |
| `identity` | `auth`, `users` |
| `merchant` | `merchant` |
| `admin` | `admin` |
| `engagement` | `reviews`, `favorites`, `store-follows` |
| `support` | `events`, `integration`, `notifications`, `geocoding`, `storage`, `queue`, `health` |
| `shared` (kernel) | `shared`, `common`, `config`, `prisma` |

Pasta nova em `src/` **tem** que entrar no mapa (`CONTEXTS`) — a regra reprova pasta não mapeada.

## Regras

1. **Intra-contexto: livre.** Módulos do mesmo contexto se importam à vontade.
2. **Kernel compartilhado: livre.** `shared/` (helpers puros: `pricing`, `catalog-normalize`),
   `common/`, `config/`, `prisma/` podem ser importados fundo por qualquer contexto. Kernel não
   importa contexto de domínio.
3. **Cross-context: só pela superfície pública** e só entre pares permitidos na matriz
   `ALLOWED_DEPENDENCIES`:
   - o **barrel** `src/<módulo>/index.ts` — lista o que o contexto expõe (fachadas de service,
     tokens, contratos). Exportar algo no barrel = assumir contrato público;
   - um arquivo **`*.module.ts`** direto, apenas para wiring de DI (módulos Nest não são
     re-exportados no barrel de propósito: re-exportar módulo em barrel cria ciclo de require
     entre contextos e quebra decorators em runtime);
   - fora da matriz (efeito colateral em outro contexto), a comunicação é por **evento de
     domínio** via outbox (`events/outbox.publisher`, stories 45/46) — handler em
     `events/handlers/`.
4. **Deep import de internals de outro contexto = erro de lint.** Idem dependência entre contextos
   fora da matriz.
5. **Allow-list herdada** (`INHERITED_ALLOW` no config): violações pré-existentes que exigem
   cirurgia grande — hoje, só o ciclo `payment ↔ fulfillment` (pagamento avança pedido síncrono;
   cancelamento/substituição reembolsa síncrono). Cada entrada tem motivo; **código novo não
   adiciona entrada** sem justificativa explícita no PR. Drenar em story de follow-up (fachada de
   order-status + reembolso por evento).

Fora de escopo (por ora): ownership de dados por contexto (schema Prisma é único — não consultar
tabela "de outro contexto" é convenção, não lint) e qualquer extração de serviço.
