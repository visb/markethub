# PROGRESS — ledger da rodada AUTORUN ativa

**Nenhuma rodada ativa.** Rodadas encerradas ficam arquivadas em `stories/done/PROGRESS-NN-MM.md`:

- `done/PROGRESS-01-13.md` — picker (01–03) + explore mapa (04–06) + app merchant (07–13)
- `done/PROGRESS-14-18.md` — veículos (14–15) + RBAC merchant (16–18)
- `done/PROGRESS-19-34.md` — gate de cobertura (19) + backfill backend (20–28) + refino customer/seguir loja (29–34)
- `done/PROGRESS-35-44.md` — backfill cobertura frontend/libs (35–43) + piso global 80 (44)
- `done/PROGRESS-45-49.md` — event-driven backend: outbox + relay (45), order.created/picking.done (46), fronteiras de contexto (47), order.canceled/estorno (48), push assíncrono (49)

Ao abrir uma rodada nova, substituir este stub pelo cabeçalho de Config da rodada
(schema em `AUTORUN.md` → "Config da rodada") + tabela de unidades. Ao encerrar,
mover a rodada para `stories/done/PROGRESS-NN-MM.md` e restaurar este stub.
