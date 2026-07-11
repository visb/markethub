/**
 * Rateio do estorno ao cancelar um sub-pedido (OrderGroup) — story 54. Cálculo
 * puro, testável sem DB.
 *
 * O cupom é Order-level (desconto único sobre o pedido inteiro). Ao cancelar UM
 * grupo, o estorno é o total do grupo MENOS a fatia proporcional do desconto:
 *
 *     estornoGrupo = totalGrupo − (desconto × totalGrupo / totalPedido)
 *
 * onde `totalGrupo` = subtotal + entrega + preparo + taxa da plataforma do grupo
 * e `totalPedido` = soma dos totais (pré-desconto) de todos os grupos.
 *
 * Arredondamento com SOMA EXATA: como grupos são cancelados um a um e cada
 * estorno vira um RefundComponent acumulado no Refund do pedido, a soma das
 * fatias de desconto de TODOS os grupos precisa fechar exatamente com o desconto
 * (senão o cliente receberia 1 centavo a mais/menos no agregado). Usa-se o método
 * do prefixo: a fatia do grupo é a diferença do desconto acumulado arredondado
 * até ele e até o anterior, numa ordenação determinística (por id). Assim
 * Σ fatias = round(desconto × totalPedido / totalPedido) = desconto (exato).
 */
export interface GroupRefundInput {
  /** Desconto (cupom) do pedido, em centavos. Sem cupom = 0. */
  discountCents: number;
  /** Todos os grupos do pedido com o total (pré-desconto) de cada um. */
  groups: { id: string; totalCents: number }[];
  /** Grupo sendo cancelado. */
  groupId: string;
}

/**
 * Estorno (centavos) do grupo cancelado: total do grupo menos a fatia
 * proporcional do desconto do pedido. Grupo inexistente ou pedido de total zero
 * → 0.
 */
export function groupCancelRefundCents(input: GroupRefundInput): number {
  const orderTotal = input.groups.reduce((sum, g) => sum + g.totalCents, 0);
  const target = input.groups.find((g) => g.id === input.groupId);
  if (!target || orderTotal <= 0) return 0;

  // Ordenação determinística p/ o rateio por prefixo somar exatamente o desconto.
  const ordered = [...input.groups].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  let prefix = 0;
  let prevAlloc = 0;
  for (const g of ordered) {
    prefix += g.totalCents;
    const alloc = Math.round((input.discountCents * prefix) / orderTotal);
    if (g.id === input.groupId) {
      const discountShare = alloc - prevAlloc;
      return target.totalCents - discountShare;
    }
    prevAlloc = alloc;
  }
  return 0;
}
