/**
 * API pública do contexto fulfillment / marketplace. Expõe o serviço do pedido
 * (dono do agregado Order/OrderGroup) para consumidores cross-context via DI do
 * MarketplaceModule — ex.: o app merchant delega o cancelamento de sub-pedido
 * (story 54) ao marketplace, que é quem pode mutar o agregado e emitir o evento
 * `order.group_canceled` no outbox. Internals (cart, checkout, addresses) ficam
 * fora.
 */
export { OrdersService } from "./orders.service";
export { MarketplaceModule } from "./marketplace.module";
