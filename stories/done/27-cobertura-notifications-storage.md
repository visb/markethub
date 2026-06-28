# 27 Cobertura de testes — notifications e storage

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura
- **Status:** todo
- **Depende de:** 19

## Objetivo

Cobrir push de notificação (cliente é avisado do status do pedido) e upload de imagem de produto.

## User story

Como time, quero notificação e storage cobertos, para que o cliente não deixe de ser avisado e
upload de imagem não falhe sem aviso.

## Critérios de aceite

- `notifications/push.service.ts` (hoje **27%**) ≥ 80%: envio, multi-device, falha de token,
  payload por tipo de evento.
- `notifications/providers/fcm.push-provider.ts` (**0%**) ≥ 80% com SDK/HTTP mockado.
- `storage/storage.service.ts` (hoje **10.5%**) ≥ 80%: upload, URL assinada, tipo/tamanho
  inválido, erro do MinIO/S3 (mockado).

## Escopo / Fora de escopo

**Dentro:** specs de push.service, fcm provider, storage.service. **Fora:** —

## Notas técnicas

Provider atrás de interface — mockar o cliente FCM e o SDK de storage. Sem rede real.
