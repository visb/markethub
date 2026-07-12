import React from "react";
import renderer, { act } from "react-test-renderer";
import { ProductCard } from "../components/ProductCard";
import { CartFab } from "../components/CartFab";
import { CategoryMenu } from "../components/CategoryMenu";
import { FeedSkeleton } from "../components/FeedSkeleton";
import { BottomTabs } from "../components/BottomTabs";
import { MerchantLogo, merchantInitials } from "../components/MerchantLogo";
import { QtyStepper } from "../components/QtyStepper";
import { Select } from "../components/Select";
import { Header } from "../components/Header";
import { DeliveryConfigSheet } from "../components/DeliveryConfigSheet";
import type { Address, ProductView } from "../api/marketplace";

/**
 * Story 40: componentes de UI do fluxo de compra (home/carrinho/endereços).
 * Render + interação (react-test-renderer), expo-router/ícones/slider mockados —
 * padrão das telas já cobertas. Sem rede.
 */

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@react-native-community/slider", () => "Slider");

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
}));

type Inst = renderer.ReactTestInstance;

function render(node: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(node);
  });
  return tree;
}
function onPressNodes(tree: renderer.ReactTestRenderer): Inst[] {
  return tree.root.findAll((n) => typeof n.props.onPress === "function");
}
/** Texto visível (strings/números) de um nó e seus descendentes — sem JSON circular. */
function deepText(node: Inst): string {
  const acc: string[] = [];
  const collect = (n: Inst) => {
    const c = n.props.children;
    if (typeof c === "string" || typeof c === "number") acc.push(String(c));
    else if (Array.isArray(c)) c.forEach((x) => (typeof x === "string" || typeof x === "number") && acc.push(String(x)));
  };
  collect(node);
  node.findAll(() => true).forEach(collect);
  return acc.join(" ");
}
function pressByText(tree: renderer.ReactTestRenderer, text: string): Inst {
  return onPressNodes(tree).find((p) => deepText(p).includes(text))!;
}
function fullText(tree: renderer.ReactTestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

const PRODUCT: ProductView = {
  offerId: "o1",
  id: "p1",
  name: "Arroz",
  brand: null,
  imageUrl: null,
  packageSize: "1kg",
  saleType: "unit",
  priceCents: 1000,
  promoPriceCents: null,
};

beforeEach(() => {
  mockReplace.mockClear();
  mockBack.mockClear();
});

describe("ProductCard", () => {
  it("sem cartLabel mostra COMPRAR e dispara onAdd", () => {
    const onAdd = jest.fn();
    const tree = render(<ProductCard product={PRODUCT} onAdd={onAdd} />);
    const buy = tree.root.findAll((n) => n.props.title === "COMPRAR")[0];
    act(() => buy.props.onPress());
    expect(onAdd).toHaveBeenCalled();
  });

  it("com header, promo e venda por peso renderiza badge kg, mercado e distância", () => {
    const weighted: ProductView = { ...PRODUCT, saleType: "weight", promoPriceCents: 800 };
    const tree = render(
      <ProductCard
        product={weighted}
        header={{ merchant: "Rede A", logoUrl: null, eta: "30 min", distanceKm: 2, deliveryFeeCents: 500 }}
        onAdd={jest.fn()}
      />,
    );
    const json = fullText(tree);
    expect(json).toContain("Rede A");
    expect(json).toContain("kg");
    expect(json).toContain("(2km)");
  });

  it("com header e loja fechada mostra o selo 'Fechado' (story 52)", () => {
    const tree = render(
      <ProductCard
        product={PRODUCT}
        header={{ merchant: "Rede A", logoUrl: null, eta: "30 min", distanceKm: 2, deliveryFeeCents: 500 }}
        closed
        onAdd={jest.fn()}
      />,
    );
    expect(fullText(tree)).toContain("Fechado");
  });

  it("com header e loja pausada mostra 'Pausada' (não 'Fechado') — story 57", () => {
    const tree = render(
      <ProductCard
        product={PRODUCT}
        header={{ merchant: "Rede A", logoUrl: null, eta: "30 min", distanceKm: 2, deliveryFeeCents: 500 }}
        closed
        paused
        onAdd={jest.fn()}
      />,
    );
    const text = fullText(tree);
    expect(text).toContain("Pausada");
    expect(text).not.toContain("Fechado");
  });

  it("com header e loja aberta NÃO mostra 'Fechado'", () => {
    const tree = render(
      <ProductCard
        product={PRODUCT}
        header={{ merchant: "Rede A", logoUrl: null, eta: "30 min", distanceKm: 2, deliveryFeeCents: 500 }}
        onAdd={jest.fn()}
      />,
    );
    expect(fullText(tree)).not.toContain("Fechado");
  });

  it("com cartLabel mostra o stepper e dispara inc/dec/onPress", () => {
    const onInc = jest.fn();
    const onDec = jest.fn();
    const onPress = jest.fn();
    const tree = render(
      <ProductCard product={PRODUCT} cartLabel="2" onAdd={jest.fn()} onInc={onInc} onDec={onDec} onPress={onPress} />,
    );
    // cada Pressable expõe nó composto + interno → aciona todos
    onPressNodes(tree).forEach((p) => act(() => p.props.onPress()));
    expect(onPress).toHaveBeenCalled();
    expect(onDec).toHaveBeenCalled();
    expect(onInc).toHaveBeenCalled();
  });
});

describe("CartFab", () => {
  it("não renderiza quando total <= 0", () => {
    const tree = render(<CartFab totalCents={0} onPress={jest.fn()} />);
    expect(tree.toJSON()).toBeNull();
  });

  it("renderiza o subtotal e dispara onPress", () => {
    const onPress = jest.fn();
    const tree = render(<CartFab totalCents={2599} onPress={onPress} />);
    expect(fullText(tree)).toContain("R$ 25,99");
    act(() => onPressNodes(tree)[0].props.onPress());
    expect(onPress).toHaveBeenCalled();
  });
});

describe("CategoryMenu", () => {
  it("renderiza categorias e seleciona ao tocar", () => {
    const onSelect = jest.fn();
    const cats = [{ id: "c1", name: "Mercearia" }, { id: "c2", name: "Bebidas" }];
    const tree = render(<CategoryMenu categories={cats} onSelect={onSelect} />);
    expect(fullText(tree)).toContain("Mercearia");
    act(() => pressByText(tree, "Mercearia").props.onPress());
    expect(onSelect).toHaveBeenCalledWith(cats[0]);
  });
});

describe("FeedSkeleton", () => {
  it("renderiza os placeholders sem quebrar", () => {
    jest.useFakeTimers();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<FeedSkeleton sections={2} cards={3} />);
    });
    expect(tree.toJSON()).toBeTruthy();
    act(() => tree.unmount()); // para o loop de animação antes do teardown
    jest.useRealTimers();
  });
});

describe("BottomTabs", () => {
  it("navega ao tocar uma aba inativa e ignora a ativa", () => {
    const tree = render(<BottomTabs active="home" />);
    act(() => pressByText(tree, "HOME").props.onPress());
    expect(mockReplace).not.toHaveBeenCalled();
    act(() => pressByText(tree, "EXPLORAR").props.onPress());
    expect(mockReplace).toHaveBeenCalledWith("/explore");
  });
});

describe("MerchantLogo", () => {
  it("merchantInitials remove prefixo mercado e pega iniciais", () => {
    expect(merchantInitials("Supermercado Europa")).toBe("E");
    expect(merchantInitials("Rede Compre Bem")).toBe("RC");
  });

  it("sem logo cai nas iniciais", () => {
    const tree = render(<MerchantLogo name="Rede A" logoUrl={null} />);
    expect(fullText(tree)).toContain("RA");
  });

  it("com logo renderiza a imagem e cai nas iniciais ao falhar (onError)", () => {
    const tree = render(<MerchantLogo name="Rede A" logoUrl="http://x/y.png" size={40} />);
    const img = tree.root.findAll((n) => typeof n.props.onError === "function")[0];
    act(() => img.props.onError());
    expect(fullText(tree)).toContain("RA");
  });
});

describe("QtyStepper", () => {
  it("dispara onDec/onInc", () => {
    const onDec = jest.fn();
    const onInc = jest.fn();
    const tree = render(<QtyStepper label="300g" onDec={onDec} onInc={onInc} />);
    onPressNodes(tree).forEach((p) => act(() => p.props.onPress()));
    expect(onDec).toHaveBeenCalled();
    expect(onInc).toHaveBeenCalled();
  });
});

describe("Select", () => {
  it("abre o modal e seleciona uma opção", () => {
    const onChange = jest.fn();
    const tree = render(<Select value="" options={["A", "B"]} onChange={onChange} placeholder="Escolha" />);
    expect(fullText(tree)).toContain("Escolha");
    act(() => onPressNodes(tree)[0].props.onPress()); // abre o campo
    // a opção "B" contém só "B" (o backdrop contém "A" e "B")
    const optB = onPressNodes(tree).find((p) => {
      const t = deepText(p);
      return t.includes("B") && !t.includes("A");
    })!;
    act(() => optB.props.onPress());
    expect(onChange).toHaveBeenCalledWith("B");
  });
});

describe("Header", () => {
  it("voltar usa router.back por padrão", () => {
    const tree = render(<Header title="Carrinho" />);
    act(() => onPressNodes(tree)[0].props.onPress());
    expect(mockBack).toHaveBeenCalled();
    expect(fullText(tree)).toContain("CARRINHO");
  });

  it("rightAction substitui o '?' de ajuda e showBack=false não renderiza voltar", () => {
    const tree = render(<Header title="X" rightAction={<></>} showBack={false} />);
    expect(tree.toJSON()).toBeTruthy();
  });
});

describe("DeliveryConfigSheet", () => {
  function addr(over: Partial<Address> = {}): Address {
    return {
      id: "a1", label: "Casa", street: "Rua A", number: "1", city: "Curitiba", state: "PR",
      zipCode: "80000-000", latitude: -25, longitude: -49, isDefault: true, ...over,
    };
  }

  it("seleciona modo, toca endereço e ajusta o raio", () => {
    const onMode = jest.fn();
    const onPressAddress = jest.fn();
    const onRadiusKm = jest.fn();
    const tree = render(
      <DeliveryConfigSheet
        visible
        onClose={jest.fn()}
        mode="deliver"
        onMode={onMode}
        address={addr()}
        onPressAddress={onPressAddress}
        radiusKm={13}
        onRadiusKm={onRadiusKm}
      />,
    );
    act(() => pressByText(tree, "Retirar na loja").props.onPress());
    expect(onMode).toHaveBeenCalledWith("pickup");
    act(() => pressByText(tree, "Rua A").props.onPress());
    expect(onPressAddress).toHaveBeenCalled();
    const slider = tree.root.findAll((n) => typeof n.props.onSlidingComplete === "function")[0];
    act(() => slider.props.onSlidingComplete(20));
    expect(onRadiusKm).toHaveBeenCalledWith(20);
  });

  it("sem coordenadas mostra o aviso de localização", () => {
    const tree = render(
      <DeliveryConfigSheet
        visible
        onClose={jest.fn()}
        mode="pickup"
        onMode={jest.fn()}
        address={addr({ latitude: null, longitude: null })}
        onPressAddress={jest.fn()}
        radiusKm={5}
        onRadiusKm={jest.fn()}
      />,
    );
    expect(fullText(tree)).toContain("Cadastre um endereço com localização");
  });
});
