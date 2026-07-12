import React from "react";
import renderer, { act } from "react-test-renderer";
import { StoreReviews, Stars } from "../components/StoreReviews";
import type { StoreReviewDTO } from "@/api/marketplace";

/**
 * Story 56 — seção "Avaliações" da página da loja. Valida: rótulo "da rede X",
 * lista com estrelas/comentário/resposta destacada, estado vazio e o "ver mais".
 */

// Ionicons: stub com o `name` como testID (para contar estrelas de forma exata).
jest.mock("@expo/vector-icons", () => {
  const ReactMock = require("react");
  const { View } = require("react-native");
  return { Ionicons: ({ name }: { name: string }) => ReactMock.createElement(View, { testID: name }) };
});

function json(tree: renderer.ReactTestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

const review = (over: Partial<StoreReviewDTO> = {}): StoreReviewDTO => ({
  id: "r1",
  rating: 4,
  comment: "Entrega rápida",
  authorName: "Ana",
  createdAt: "2026-07-10T12:00:00Z",
  replyText: null,
  repliedAt: null,
  ...over,
});

function render(props: Partial<React.ComponentProps<typeof StoreReviews>> = {}) {
  const full: React.ComponentProps<typeof StoreReviews> = {
    merchantName: "SuperRede",
    items: [review()],
    count: 1,
    isLoading: false,
    hasMore: false,
    isLoadingMore: false,
    onLoadMore: jest.fn(),
    ...props,
  };
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<StoreReviews {...full} />);
  });
  return tree;
}

describe("StoreReviews (story 56)", () => {
  it("deixa explícito que as avaliações são da rede", () => {
    const t = json(render());
    expect(t).toContain("Avaliações da rede ");
    expect(t).toContain("SuperRede");
  });

  it("renderiza a lista com comentário", () => {
    expect(json(render())).toContain("Entrega rápida");
  });

  it("destaca a resposta da loja quando existe", () => {
    const t = json(render({ items: [review({ replyText: "Obrigado!" })] }));
    expect(t).toContain("Resposta da loja");
    expect(t).toContain("Obrigado!");
  });

  it("estado vazio convida a ser o primeiro (count 0)", () => {
    const t = json(render({ items: [], count: 0 }));
    expect(t).toContain("Seja o primeiro a avaliar");
  });

  it("mostra 'ver mais' e dispara onLoadMore ao tocar", () => {
    const onLoadMore = jest.fn();
    const tree = render({ hasMore: true, onLoadMore });
    const more = tree.root.findAll((n) => n.props.testID === "store-reviews-more")[0];
    act(() => {
      more.props.onPress();
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("Stars pinta 'rating' estrelas cheias (arredondado) e expõe a nota", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Stars rating={3} />);
    });
    // 5 ícones renderizados; 3 cheios (name "star"), 2 vazios ("star-outline")
    const names = tree.root
      .findAll((n) => typeof n.props.name === "string")
      .map((n) => n.props.name);
    expect(names.filter((n) => n === "star")).toHaveLength(3);
    expect(names.filter((n) => n === "star-outline")).toHaveLength(2);
  });
});
