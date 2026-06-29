import React from "react";
import renderer, { act } from "react-test-renderer";
import { AddressBar, addressLine } from "../components/AddressBar";
import type { Address } from "../api/marketplace";

/**
 * Story 30: barra de endereço da aba Explorar. Valida o texto com endereço ativo
 * ("Minha localização atual" + rua/número), o CTA "Definir endereço" sem endereço
 * e que tocar a pill dispara o `onPress` (navegação para /delivery fica na tela).
 */

// Ícones: stub leve (evita carregar fontes nativas no jest).
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

function addr(over: Partial<Address> = {}): Address {
  return {
    id: "a1",
    label: "Casa",
    street: "Rua das Flores",
    number: "123",
    district: "Centro",
    city: "Curitiba",
    state: "PR",
    zipCode: "80000-000",
    latitude: -25.5,
    longitude: -49.3,
    isDefault: true,
    ...over,
  };
}

function texts(tree: renderer.ReactTestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

function render(props: React.ComponentProps<typeof AddressBar>) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<AddressBar {...props} />);
  });
  return tree;
}

describe("addressLine", () => {
  it("usa rua + número quando presentes", () => {
    expect(addressLine(addr())).toBe("Rua das Flores, 123");
  });
  it("cai no label quando não há rua/número", () => {
    expect(addressLine(addr({ street: "", number: "" }))).toBe("Casa");
  });
});

describe("AddressBar", () => {
  it("com endereço ativo mostra rótulo e rua/número", () => {
    const t = texts(render({ address: addr(), onPress: jest.fn() }));
    expect(t).toContain("Minha localização atual");
    expect(t).toContain("Rua das Flores, 123");
    expect(t).not.toContain("Definir endereço");
  });

  it("sem endereço mostra o CTA 'Definir endereço'", () => {
    const t = texts(render({ address: null, onPress: jest.fn() }));
    expect(t).toContain("Definir endereço");
    expect(t).not.toContain("Minha localização atual");
  });

  it("tocar a pill dispara onPress", () => {
    const onPress = jest.fn();
    const tree = render({ address: addr(), onPress });
    const btn = tree.root.findAll((n) => n.props.accessibilityRole === "button")[0];
    act(() => {
      btn.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("tocar o CTA sem endereço também dispara onPress", () => {
    const onPress = jest.fn();
    const tree = render({ address: null, onPress });
    const btn = tree.root.findAll((n) => n.props.accessibilityRole === "button")[0];
    act(() => {
      btn.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
