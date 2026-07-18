import React from "react";
import renderer, { act } from "react-test-renderer";
import { TextInput } from "react-native";
import { Button } from "@markethub/ui";
import { TipForm, parseAmountCents } from "../components/TipForm";
import type { TipTargets } from "../api/marketplace";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

/**
 * Story 77 — gorjeta individual por alvo (react-hook-form + zod + Controller).
 * Cobre: linhas marcadas por padrão com R$ 2,00; total dinâmico reagindo a
 * checkbox/valor; retirada esconde a linha do entregador; submit envia só as
 * linhas marcadas com os alvos normalizados.
 */

const TARGETS: TipTargets = {
  orderId: "o1",
  hasDelivery: true,
  driverName: "Carlos",
  merchants: [{ merchantId: "m1", merchantName: "Mercado 1" }],
};
const PICKUP: TipTargets = { orderId: "o1", hasDelivery: false, driverName: null, merchants: [{ merchantId: "m1", merchantName: "Mercado 1" }] };

function render(node: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(node);
  });
  return tree;
}

const findByTestID = (tree: renderer.ReactTestRenderer, id: string) =>
  tree.root.find((n) => n.props?.testID === id && n.type === TextInput);
const pressableByTestID = (tree: renderer.ReactTestRenderer, id: string) =>
  tree.root.findAll((n) => n.props?.testID === id && typeof n.props?.onPress === "function")[0];
const totalText = (tree: renderer.ReactTestRenderer) =>
  JSON.stringify(tree.root.findAll((n) => n.props?.testID === "tip-total")[0].props.children);
const submitBtn = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Button).find((b) => b.props.title === "Dar gorjeta")!;

describe("parseAmountCents", () => {
  it.each([
    ["2,00", 200],
    ["5", 500],
    ["1.234,50", 123450],
    ["", 0],
    ["abc", 0],
  ])("%s → %d centavos", (input, cents) => {
    expect(parseAmountCents(input)).toBe(cents);
  });
});

describe("TipForm (story 77)", () => {
  it("linhas vêm marcadas por padrão com R$ 2,00", () => {
    const tree = render(<TipForm targets={TARGETS} onSubmit={jest.fn()} />);
    expect(findByTestID(tree, "tip-amount-platform").props.value).toBe("2,00");
    expect(findByTestID(tree, "tip-amount-driver").props.value).toBe("2,00");
    expect(findByTestID(tree, "tip-amount-merchant:m1").props.value).toBe("2,00");
    // 3 linhas marcadas × R$ 2,00 = R$ 6,00
    expect(totalText(tree)).toContain("R$ 6,00");
  });

  it("total reage ao desmarcar uma linha", () => {
    const tree = render(<TipForm targets={TARGETS} onSubmit={jest.fn()} />);
    act(() => pressableByTestID(tree, "tip-check-platform").props.onPress());
    // 2 linhas × R$ 2,00 = R$ 4,00
    expect(totalText(tree)).toContain("R$ 4,00");
  });

  it("total reage ao editar um valor", () => {
    const tree = render(<TipForm targets={TARGETS} onSubmit={jest.fn()} />);
    act(() => findByTestID(tree, "tip-amount-driver").props.onChangeText("10,00"));
    // 2,00 + 10,00 + 2,00 = 14,00
    expect(totalText(tree)).toContain("R$ 14,00");
  });

  it("retirada (sem entrega) esconde a linha do entregador", () => {
    const tree = render(<TipForm targets={PICKUP} onSubmit={jest.fn()} />);
    expect(tree.root.findAll((n) => n.props?.testID === "tip-row-driver")).toHaveLength(0);
    // só plataforma + mercado = R$ 4,00
    expect(totalText(tree)).toContain("R$ 4,00");
  });

  it("submit envia só as linhas marcadas, com alvos normalizados", async () => {
    const onSubmit = jest.fn();
    const tree = render(<TipForm targets={TARGETS} onSubmit={onSubmit} />);
    act(() => findByTestID(tree, "tip-amount-driver").props.onChangeText("3,00"));
    act(() => pressableByTestID(tree, "tip-check-merchant:m1").props.onPress()); // desmarca mercado
    await act(async () => {
      submitBtn(tree).props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith([
      { target: "platform", targetId: undefined, amountCents: 200 },
      { target: "driver", targetId: undefined, amountCents: 300 },
    ]);
  });

  it("merchant marcado envia targetId com o merchantId", async () => {
    const onSubmit = jest.fn();
    const tree = render(<TipForm targets={TARGETS} onSubmit={onSubmit} />);
    act(() => pressableByTestID(tree, "tip-check-platform").props.onPress());
    act(() => pressableByTestID(tree, "tip-check-driver").props.onPress());
    await act(async () => {
      submitBtn(tree).props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSubmit).toHaveBeenCalledWith([
      { target: "merchant", targetId: "m1", amountCents: 200 },
    ]);
  });

  it("botão desabilita quando o total zera (todas desmarcadas)", () => {
    const tree = render(<TipForm targets={PICKUP} onSubmit={jest.fn()} />);
    act(() => pressableByTestID(tree, "tip-check-platform").props.onPress());
    act(() => pressableByTestID(tree, "tip-check-merchant:m1").props.onPress());
    expect(totalText(tree)).toContain("R$ 0,00");
    expect(submitBtn(tree).props.disabled).toBe(true);
  });
});
