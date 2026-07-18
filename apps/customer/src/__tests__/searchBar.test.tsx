import React from "react";
import renderer, { act } from "react-test-renderer";
import { SearchBar } from "../components/SearchBar";

/**
 * Story 80: campo de busca da home com dropdown de sugestões. Mocka o hook de
 * dados (useSearchSuggestions) e valida: sugestões só ao digitar ≥ 2 chars; tap
 * num termo e submit disparam onSubmit(q); tap num departamento dispara
 * onSelectCategory.
 */

const mockSuggestions = {
  current: {
    terms: ["Arroz Branco", "Arroz Integral"],
    categories: [{ id: "mc1", name: "Mercearia" }],
  },
};

jest.mock("../api/hooks/useProductSearch", () => ({
  useSearchSuggestions: () => mockSuggestions.current,
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

function findInput(tree: renderer.ReactTestRenderer) {
  return tree.root.findAll((n) => typeof n.props.onChangeText === "function")[0];
}

function render(onSubmit = jest.fn(), onSelectCategory = jest.fn()) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SearchBar onSubmit={onSubmit} onSelectCategory={onSelectCategory} />,
    );
  });
  return { tree, onSubmit, onSelectCategory };
}

function type(tree: renderer.ReactTestRenderer, value: string) {
  act(() => {
    findInput(tree).props.onChangeText(value);
  });
}

beforeEach(() => {
  mockSuggestions.current = {
    terms: ["Arroz Branco", "Arroz Integral"],
    categories: [{ id: "mc1", name: "Mercearia" }],
  };
});

describe("SearchBar — sugestões (story 80)", () => {
  it("com menos de 2 caracteres não mostra o dropdown", () => {
    const { tree } = render();
    type(tree, "a");
    expect(tree.root.findAll((n) => n.props.testID === "search-suggestions")).toHaveLength(0);
  });

  it("ao digitar ≥ 2 caracteres mostra termos e departamentos", () => {
    const { tree } = render();
    type(tree, "arr");
    expect(
      tree.root.findAll((n) => n.props.testID === "suggestion-term-Arroz Branco").length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAll((n) => n.props.testID === "suggestion-term-Arroz Integral").length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAll((n) => n.props.testID === "suggestion-category-mc1").length,
    ).toBeGreaterThan(0);
  });

  it("sem sugestões o dropdown não aparece mesmo com termo válido", () => {
    mockSuggestions.current = { terms: [], categories: [] };
    const { tree } = render();
    type(tree, "xyz");
    expect(tree.root.findAll((n) => n.props.testID === "search-suggestions")).toHaveLength(0);
  });

  it("tap num termo dispara onSubmit com o termo", () => {
    const { tree, onSubmit } = render();
    type(tree, "arr");
    act(() => {
      tree.root
        .findAll((n) => n.props.testID === "suggestion-term-Arroz Integral")[0]
        .props.onPress();
    });
    expect(onSubmit).toHaveBeenCalledWith("Arroz Integral");
  });

  it("submit do input dispara onSubmit com o texto digitado", () => {
    const { tree, onSubmit } = render();
    type(tree, "arroz");
    act(() => {
      findInput(tree).props.onSubmitEditing();
    });
    expect(onSubmit).toHaveBeenCalledWith("arroz");
  });

  it("tap num departamento dispara onSelectCategory (e não onSubmit)", () => {
    const { tree, onSubmit, onSelectCategory } = render();
    type(tree, "mer");
    act(() => {
      tree.root.findAll((n) => n.props.testID === "suggestion-category-mc1")[0].props.onPress();
    });
    expect(onSelectCategory).toHaveBeenCalledWith({ id: "mc1", name: "Mercearia" });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
