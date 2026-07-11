# BACKLOG — finalização dos apps

Itens crus para refinar via `/planning` (que os transforma em stories `NN-slug.md` e remove daqui).
Levantados por análise do estado atual (2026-07-11): os cinco apps têm shell/rotas reais e o backend
está maduro (providers reais + mock, event-driven/outbox, fila de push, `DeviceToken`/`Coupon`/
`StoreHours`/`Tip`/`DeliverySlot` já modelados). O que falta é fechar fluxos ponta-a-ponta e expor
no front capacidades que o backend já tem.

Prioridade sugerida: 1–2 (destravam push e rastreio, valor em todas as pontas) → bloco merchant
(operação diária do lojista) → driver/picker (experiência de campo) → admin (curadoria/suporte) →
customer (polish).

---

---

## App merchant

---

## App driver

---

## App picker

---

## App admin

### 19. Moderação de avaliações
Review abusiva/spam: listar, ocultar/remover com motivo. Hoje nenhuma superfície de moderação.

### 20. Ciclo de vida do merchant
Onboarding/ativação: aprovar merchant novo, suspender/reativar (loja suspensa some da vitrine).
Conferir o que `MerchantsList/MerchantDetail` já cobre e completar status + efeitos na vitrine.

---

## App customer (complementos)

### 21. Tela de conta / perfil (build-out)
`account.tsx` só tem logout. Editar perfil (nome, telefone), trocar senha, preferências de
notificação.

### 22. Gerenciamento de endereços (tela dedicada)
Endereço tratado inline em checkout/delivery. Livro de endereços: listar, adicionar, editar,
remover, padrão — reaproveitável no checkout.

---

## Qualidade / housekeeping

### 23. Remover `Placeholder.tsx` morto (merchant)
`apps/merchant/src/pages/Placeholder.tsx` — resquício das stories 09–13, não roteado. Deletar.

### 24. Confirmar baseline verde
`pnpm typecheck` + `pnpm build` + `pnpm test` + cobertura (gate 80% / diff 90%) antes de abrir a
rodada de finalização.
