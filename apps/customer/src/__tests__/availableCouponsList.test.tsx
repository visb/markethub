import React from "react";
import renderer, { act } from "react-test-renderer";
import { AvailableCouponsList } from "../components/AvailableCouponsList";
import type { AvailableCoupon } from "../api/marketplace";

/**
 * Story 74: lista inline de cupons disponíveis no carrinho. Renderiza aplicável
 * (toque aplica) vs desabilitado (quanto falta), destaca o aplicado com remover
 * e usa `title ?? code` como fallback. O hook de dados é mockado (sem rede).
 */

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

let mockCoupons: AvailableCoupon[] = [];
let mockLoading = false;
jest.mock("../api/hooks/useAvailableCoupons", () => ({
  useAvailableCoupons: () => ({ coupons: mockCoupons, loading: mockLoading }),
}));

function coupon(over: Partial<AvailableCoupon> = {}): AvailableCoupon {
  return {
    code: "OFF10",
    title: "Dez off",
    description: "10% de desconto",
    type: "percent",
    value: 10,
    merchantId: null,
    minOrderCents: null,
    discountCents: 200,
    applicable: true,
    reason: null,
    ...over,
  };
}

type Inst = renderer.ReactTestInstance;
function deepText(node: Inst): string {
  const acc: string[] = [];
  node.findAll(() => true).forEach((n) => {
    const c = n.props.children;
    if (typeof c === "string" || typeof c === "number") acc.push(String(c));
    else if (Array.isArray(c)) c.forEach((x) => (typeof x === "string" || typeof x === "number") && acc.push(String(x)));
  });
  return acc.join(" ");
}

function render(props: Partial<React.ComponentProps<typeof AvailableCouponsList>> = {}) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <AvailableCouponsList
        appliedCode={props.appliedCode ?? null}
        onApply={props.onApply ?? jest.fn()}
        onRemove={props.onRemove ?? jest.fn()}
      />,
    );
  });
  return tree;
}

beforeEach(() => {
  mockCoupons = [];
  mockLoading = false;
});

describe("AvailableCouponsList", () => {
  it("carregando ou sem cupons → não renderiza nada", () => {
    mockLoading = true;
    expect(render().toJSON()).toBeNull();
    mockLoading = false;
    mockCoupons = [];
    expect(render().toJSON()).toBeNull();
  });

  it("renderiza cupom aplicável com valor e ação de aplicar", () => {
    mockCoupons = [coupon()];
    const tree = render();
    const card = tree.root.findByProps({ testID: "coupon-OFF10" });
    const txt = deepText(card);
    expect(txt).toContain("Dez off");
    expect(txt).toContain("10% de desconto");
    expect(txt).toContain("Aplicar");
    expect(card.props.disabled).toBe(false);
  });

  it("cupom não aplicável fica desabilitado com quanto falta", () => {
    mockCoupons = [coupon({ applicable: false, reason: { code: "MIN_ORDER_NOT_MET", missingCents: 3000 } })];
    const tree = render();
    const card = tree.root.findByProps({ testID: "coupon-OFF10" });
    expect(card.props.disabled).toBe(true);
    expect(deepText(tree.root.findByProps({ testID: "coupon-OFF10-missing" }))).toContain("R$ 30,00");
  });

  it("toque no cupom aplicável chama onApply com o código", () => {
    mockCoupons = [coupon()];
    const onApply = jest.fn();
    const tree = render({ onApply });
    act(() => tree.root.findByProps({ testID: "coupon-OFF10" }).props.onPress());
    expect(onApply).toHaveBeenCalledWith("OFF10");
  });

  it("cupom aplicado é destacado com remover; toque chama onRemove", () => {
    mockCoupons = [coupon()];
    const onRemove = jest.fn();
    const tree = render({ appliedCode: "OFF10", onRemove });
    const remove = tree.root.findByProps({ testID: "coupon-OFF10-remove" });
    expect(deepText(remove)).toContain("Remover");
    act(() => remove.props.onPress());
    expect(onRemove).toHaveBeenCalled();
    // aplicado não re-aplica ao tocar o card
    expect(tree.root.findByProps({ testID: "coupon-OFF10" }).props.disabled).toBe(true);
  });

  it("fallback: title null exibe o code", () => {
    mockCoupons = [coupon({ title: null, description: null, code: "SEMTITULO" })];
    const tree = render();
    expect(deepText(tree.root.findByProps({ testID: "coupon-SEMTITULO" }))).toContain("SEMTITULO");
  });

  it("free_shipping mostra rótulo 'Frete grátis'", () => {
    mockCoupons = [coupon({ code: "FRETE", type: "free_shipping", value: 0 })];
    const tree = render();
    expect(deepText(tree.root.findByProps({ testID: "coupon-FRETE" }))).toContain("Frete grátis");
  });

  it("fixed mostra o valor em reais", () => {
    mockCoupons = [coupon({ code: "FIX", type: "fixed", value: 500 })];
    const tree = render();
    expect(deepText(tree.root.findByProps({ testID: "coupon-FIX" }))).toContain("R$ 5,00 de desconto");
  });
});
