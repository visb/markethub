/**
 * Mock leve de `leaflet` para vitest: `divIcon` ecoa o HTML do ícone p/ o teste
 * inspecionar a cor/estilo sem o engine real.
 */
export default {
  divIcon: (opts: { html: string }) => ({ __html: opts.html }),
};
