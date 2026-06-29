/**
 * Story 34: na página da loja (`app/store/[id].tsx`), o FollowButton deixa de ser
 * no-op — passa a refletir `following` (do hook `useStoreFollow`, semeado pelo
 * sections) e a chamar `toggle()` no `onPress`.
 *
 * Checagem no nível de fonte (espelho de `storeScreen.follow.test.tsx`): mais
 * barata que montar a tela cheia (exigiria mockar marketplace/useAuth/expo-router/
 * useCart/...).
 */

describe("tela store — wiring do follow (story 34)", () => {
  const nodeRequire = (eval("require") as (id: string) => unknown) as (
    id: string,
  ) => { readFileSync: (p: string, enc: string) => string };
  const cwd = (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? ".";
  const fsMod = nodeRequire("fs");
  const screen = fsMod.readFileSync(`${cwd}/app/store/[id].tsx`, "utf8");

  it("usa o hook useStoreFollow com o estado inicial do sections", () => {
    expect(screen).toMatch(/import \{ useStoreFollow \} from "@\/api\/hooks\/useStoreFollow"/);
    expect(screen).toMatch(/useStoreFollow\(id \?\? "", store\?\.following\)/);
  });

  it("o FollowButton reflete `following` e aciona `toggle` (sem TODO/no-op)", () => {
    expect(screen).toMatch(/following=\{follow\.following\}/);
    expect(screen).toMatch(/follow\.toggle\(\)/);
    expect(screen).not.toMatch(/TODO story 34/);
  });
});
