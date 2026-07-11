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

### 11. Ganhos e histórico do entregador
`Tip` existe e admin Finance já mostra "gorjetas por entregador" — **driver não vê as próprias**.
- Tela de ganhos: gorjetas por período, entregas concluídas, histórico com detalhe.

### 12. Fluxo de problema na entrega
Hoje só caminho feliz (código de coleta → código de entrega). Falta:
- Cliente ausente / endereço errado / recusa → registrar ocorrência, notificar loja/cliente,
  status de retorno à loja. Definir invariantes em `BUSINESS_RULES.md`.

### 13. Disponibilidade (turno on/off)
Driver sinaliza disponível/indisponível; loja só atribui/oferece entrega a driver disponível
(hoje lista todos os `StoreStaff` driver).

---

## App picker

### 14. Scanner de código de barras na separação
Picking real é bipar produto. `expo-barcode-scanner`/`expo-camera` na tela de tarefa:
- Bipar GTIN confirma item (evita erro de separação); divergência → fluxo de substituição.
- Fallback manual permanece.

### 15. Aprovação de substituição pelo cliente
Substituição hoje é decisão unilateral do picker (autocomplete, story 03). Completar o loop:
- Push/realtime pro cliente propondo substituto → aprovar/recusar com timeout (auto-aprova ou
  remove item + reembolso parcial). Regras em `BUSINESS_RULES.md`.

### 16. Métricas / histórico do picker
Tarefas concluídas, itens/hora, taxa de substituição — motivação e gestão (espelho no merchant
Reports por colaborador).

---

## App admin

### 17. Dashboard real
`Dashboard.tsx` tem 29 linhas ("Olá, {user}"). Home do admin com KPIs: pedidos hoje, GMV,
lojas ativas, filas de picking/entrega atrasadas (reusa endpoints de Operations/Finance),
alertas (ex.: fila ERP parada, outbox acumulando).

### 18. Timeline do pedido + ferramentas de suporte
Admin Orders lista pedidos; suporte precisa de detalhe profundo: timeline completa (eventos de
domínio do outbox: pago → picking → entrega → cancelado/estornado), busca por id/cliente/telefone,
ação de reembolso manual (total/parcial) com trilha de quem fez.

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
