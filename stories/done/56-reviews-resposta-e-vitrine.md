# Plan: reviews — resposta do lojista + vitrine pública na loja

## Context

`Review` existe com eixos (`platform`/`merchant`/`delivery`), rating 1–5, comentário e alvo
`targetMerchantId` (rede — review é da rede, não da loja física). Cliente cria review pós-pedido
(`POST orders/:orderId/reviews`); merchant vê **só agregados** em Reports. Faltam as duas pontas:

- **Nenhuma tela exibe reviews de loja** — página da loja no customer não tem nota média nem
  lista de comentários.
- **Lojista não responde** — model não tem campo de resposta.

Decisões travadas (planning 2026-07-11):

- **Loop completo** (escolhido pelo usuário): vitrine pública no customer + resposta do merchant.
- Resposta como colunas no próprio `Review` (`replyText`, `repliedAt`) — 1 resposta por review,
  **editável** (update sobrescreve; sem histórico).
- Capability nova `reviews.manage` (owner/administrador) p/ listar-com-comentários e responder;
  agregados de Reports continuam em `reports.view`.
- Nota exibida na página da loja é **da rede** (alvo do review) — deixar explícito na UI
  ("avaliações da rede X"). Nota nos cards da vitrine fica fora (só página da loja).

## Desenho

### Schema

1. Migration: `Review.replyText String?`, `Review.repliedAt DateTime?`.

### Backend

2. Módulo `reviews` (dono do model) — endpoint público de vitrine:
   `GET merchants/:merchantId/reviews?axis=merchant&page=` → `{ average, count, items[] }`
   paginado (rating, comentário, primeiro nome do autor via `order.user`, `createdAt`,
   `replyText`/`repliedAt`). Visibilidade pública alinhada aos endpoints de vitrine do catálogo.
3. Resposta do lojista: `POST merchant/reviews/:id/reply { text }` (módulo merchant delegando
   ao reviews via barrel) — valida alvo = rede do ator, eixo `merchant`, texto 1–1000 chars;
   capability `reviews.manage` (nova na matriz: owner/administrador).
4. Listagem de gestão: `GET merchant/reviews?rating=&unanswered=` com comentários (a atual de
   Reports só agrega).

### `packages/types`

5. DTOs da vitrine (`StoreReviewsPageDTO`) e da gestão, re-exportados pelo api-client.

### Customer app

6. Página da loja (`store/[id]`): badge nota média + contagem no header; seção "Avaliações"
   (lista paginada — rating em estrelas, comentário, autor, data, resposta da loja destacada).
   Hooks React Query com query keys centralizadas; estado vazio ("seja o primeiro a avaliar").

### Merchant app

7. Página `Reviews` (rota `/reviews`, `RequireCapability reviews.manage`, entrada no menu):
   lista com filtros (nota, sem resposta), responder/editar resposta inline
   (react-hook-form + zod).

## Validação

- Backend: specs do endpoint público (paginação, média, só eixo merchant, review sem comentário
  aparece com rating), do reply (alvo alheio → 404, capability, editar sobrescreve, validação de
  tamanho) e da listagem de gestão (filtros). Migration aplica limpa.
  `pnpm --filter @markethub/api test`.
- Customer: seção de reviews renderiza lista/nota/resposta, paginação, estado vazio.
- Merchant: página lista, filtro sem-resposta, submit de resposta atualiza item.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` api +
  customer + merchant ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm --filter @markethub/api prisma:generate` antes do typecheck; `pnpm typecheck` + build.

## Fora de escopo

- Moderação de reviews (admin — item 19 do backlog, story própria).
- Nota média nos cards da vitrine/home (só página da loja).
- Review de produto (só rede/plataforma/entrega, como hoje).
- Notificar cliente quando a loja responde (encaixa na infra da story 50 depois).
