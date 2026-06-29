/**
 * Story 33: na página da loja (`app/store/[id].tsx`), o "?" do AppBar dá lugar
 * a um botão "Seguir" (rightAction no Header) e o botão "Seguir" inline,
 * duplicado, do storeHead é removido.
 *
 * Checagem no nível de fonte (espelho de `storeScreen.title.test.tsx` e do bloco
 * "tela explore" em `exploreMap.screen.test.tsx`): mais barata que montar a tela
 * cheia, que exigiria mockar marketplace/useAuth/expo-router/useCart/...
 */

describe("tela store — botão Seguir no AppBar (story 33)", () => {
  const nodeRequire = (eval("require") as (id: string) => unknown) as (
    id: string,
  ) => { readFileSync: (p: string, enc: string) => string };
  const cwd = (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? ".";
  const fsMod = nodeRequire("fs");
  const screen = fsMod.readFileSync(`${cwd}/app/store/[id].tsx`, "utf8");

  it("passa o FollowButton como rightAction do Header (no lugar do '?')", () => {
    expect(screen).toMatch(/rightAction=\{<FollowButton/);
    expect(screen).toMatch(/import \{ FollowButton \} from "@\/components\/FollowButton"/);
  });

  it("remove o botão 'Seguir' inline duplicado do storeHead", () => {
    expect(screen).not.toMatch(/<Button title="♡ Seguir"/);
    // o import do Button do storeHead também sai (não há mais uso na tela)
    expect(screen).not.toMatch(/import \{ Button,/);
  });
});
