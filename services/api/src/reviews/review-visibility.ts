/**
 * Ponto ÚNICO do filtro de moderação (story 68): review ocultada pelo admin
 * (soft-hide) sai de TODAS as superfícies de leitura pública/agregada — vitrine
 * pública da loja (story 56), agregações de Reports do merchant e agregados do
 * admin. Espalhar `hiddenAt: null` manualmente é bug: compor este where.
 */
export const VISIBLE_REVIEWS = { hiddenAt: null } as const;
