import React from "react";
import renderer, { act } from "react-test-renderer";
import { MapLoadingBadge } from "../components/MapLoadingBadge";

/**
 * Story 06 (faceta 4): card flutuante de loading sobre o mapa. Valida que renderiza
 * a mensagem ("Procurando mercados nesta área…") e um indicador de atividade, e que
 * não captura toques (pointerEvents="none" — não bloqueia o mapa).
 */
describe("MapLoadingBadge", () => {
  it("renderiza a mensagem de busca e um ActivityIndicator", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<MapLoadingBadge />);
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("Procurando mercados nesta área");
    // ActivityIndicator presente
    const indicators = tree.root.findAllByType(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("react-native").ActivityIndicator,
    );
    expect(indicators.length).toBe(1);
  });

  it("não bloqueia toques no mapa (pointerEvents none)", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<MapLoadingBadge />);
    });
    const root = tree.toJSON();
    const node = Array.isArray(root) ? root[0] : root;
    expect(node?.props.pointerEvents).toBe("none");
  });
});
