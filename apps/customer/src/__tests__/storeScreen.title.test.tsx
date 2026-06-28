/**
 * Story 32: na página da loja (`app/store/[id].tsx`) o nome do mercado aparecia
 * duas vezes — no AppBar (`Header`) e no `storeHead` ao lado da logo. O AppBar
 * passa a ter o título vazio; o nome fica só no `storeHead`.
 *
 * Checagem no nível de fonte (espelho do bloco "tela explore" em
 * `exploreMap.screen.test.tsx`): mais barata que montar a tela cheia, que exigiria
 * mockar marketplace/useAuth/expo-router/useCart/CategoryMenu/CartFab.
 */

describe("tela store — título do AppBar vazio (story 32)", () => {
  const nodeRequire = (eval("require") as (id: string) => unknown) as (
    id: string,
  ) => { readFileSync: (p: string, enc: string) => string };
  const cwd = (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? ".";
  const fsMod = nodeRequire("fs");
  const screen = fsMod.readFileSync(`${cwd}/app/store/[id].tsx`, "utf8");

  it("renderiza o Header com title vazio (não duplica o nome do mercado)", () => {
    expect(screen).toMatch(/<Header\s+title=""\s*\/>/);
    expect(screen).not.toMatch(/<Header\s+title=\{name/);
  });

  it("mantém o nome do mercado uma única vez, no storeHead ao lado da logo", () => {
    // o param `name` segue como fallback do storeName (não foi removido)
    expect(screen).toMatch(/storeName.*store\?\.merchantName \?\? name \?\? "Loja"/);
    expect(screen).toMatch(/<MerchantLogo name=\{store\?\.merchantName \?\? name \?\? "Loja"\}/);
  });
});
