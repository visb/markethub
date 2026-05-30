# Fixtures ERP (conector CSV)

Dados de exemplo consumidos pelo `CsvErpConnector` (S1.3) para popular o catálogo sem ERP real.

## Layout

```
fixtures/erp/<merchant-slug>/<store-externalId>/
  products.csv   # catálogo completo (sync "full")
  prices.csv     # delta de preços (sync "prices")
  stock.csv      # delta de estoque (sync "stock")
```

- `<merchant-slug>` = slug do merchant (ex.: `supermercado-europa`). Configurado em
  `Merchant.connectorConfig.baseDir` (`fixtures/erp/<slug>`) pelo seed.
- `<store-externalId>` = `Store.externalId` (ex.: `loja-1`).

## Colunas

**products.csv**

`externalId,gtin,name,brand,unit,categoryName,imageUrl,priceCents,promoPriceCents,available,stockQuantity`

- `externalId` (obrigatório): id do produto no ERP daquela loja; chave de reconciliação.
- `gtin`: EAN/GTIN. Mesmo GTIN em lojas/merchants diferentes converge para **um produto canônico**
  (dedup). Vazio = produto sem GTIN (fica local à loja).
- `priceCents`/`promoPriceCents`: inteiros em centavos.
- `available`: `1`/`0` (ou `true`/`false`, `sim`/`nao`).

**prices.csv**: `externalId,priceCents,promoPriceCents,available`
**stock.csv**: `externalId,quantity,available`

## Como editar/adicionar

1. Crie a pasta `fixtures/erp/<slug>/<storeExternalId>/`.
2. Adicione `products.csv` (e opcionalmente `prices.csv`/`stock.csv`).
3. Garanta que o merchant existe com `connectorType="csv"` e `connectorConfig.baseDir` apontando
   para `fixtures/erp/<slug>` (ver `prisma/seed.ts`).
4. Dispare o sync: `POST /api/v1/erp/sync { "storeId": "...", "type": "full", "inline": true }`
   (admin), ou via fila.

Re-sync é idempotente: alterar preço/estoque no arquivo e rodar de novo atualiza sem duplicar.
