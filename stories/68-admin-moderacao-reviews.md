# Plan: admin — moderação de avaliações

## Context

Review abusiva/spam não tem tratamento: nenhuma superfície de moderação existe (admin só vê
agregados em `GET admin/reviews`). Com a vitrine pública da story 56, comentário ofensivo
passa a ficar exposto ao cliente — moderação vira necessidade, não polish.

Decisões travadas (planning 2026-07-11, defaults do facilitador):

- **Soft-hide reversível** (nunca deletar): `hiddenAt`/`hiddenById`/`hiddenReason` no
  `Review`. Oculta sai da vitrine pública **e das médias/agregados** (vitrine da 56, Reports
  do merchant, admin dashboard).
- Autor não é notificado (silencioso; evita briga com troll).
- Motivo obrigatório ao ocultar (texto curto — trilha de por quê).

Dependência: story 56 (vitrine + endpoint público que precisa filtrar `hiddenAt`).

## Desenho

### Schema

1. Migration: `Review.hiddenAt DateTime?`, `hiddenById String?`, `hiddenReason String?`.

### Backend

2. Módulo `reviews`: filtrar `hiddenAt: null` na vitrine pública (56), nas agregações de
   Reports do merchant e nos agregados do admin — ponto único (where compartilhado no
   service).
3. Módulo `admin`: `GET admin/reviews/list?rating=&hidden=&merchantId=&q=` (listagem plana com
   comentário, autor, pedido, merchant alvo, estado) +
   `POST admin/reviews/:id/hide { reason }` / `POST admin/reviews/:id/unhide`.
   Delegação ao módulo reviews via barrel (fronteiras de contexto).

### Admin app

4. Página `Reviews` (rota `/reviews`, `AdminOnly`, entrada no menu): tabela com filtros
   (nota, ocultas/visíveis, merchant, busca no texto), linha expandível com comentário
   completo + resposta do lojista (56); ação ocultar (modal com motivo obrigatório) /
   reexibir. Oculta aparece riscada/escurecida com motivo e quem ocultou.

## Validação

- Backend: specs do hide/unhide (motivo obrigatório, idempotência, `hiddenById` gravado),
  filtro nas três superfícies (vitrine, reports, agregados) — média recalcula sem a oculta;
  listagem com cada filtro. Migration limpa. `pnpm --filter @markethub/api test`.
- Admin: tabela + filtros, modal exige motivo, estado visual de oculta.
  `pnpm --filter @markethub/admin test`.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` api +
  admin ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm --filter @markethub/api prisma:generate` antes do typecheck; `pnpm typecheck` + build.

## Fora de escopo

- Denúncia de review pelo lojista/cliente (fila de denúncias).
- Moderação automática (filtro de palavrões/IA).
- Notificar autor da ocultação.
- Banir usuário reincidente (gestão de usuários já tem `active`).
