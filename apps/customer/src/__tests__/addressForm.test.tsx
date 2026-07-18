import React from "react";
import renderer, { act } from "react-test-renderer";
import * as Location from "expo-location";
import { AddressForm } from "../components/AddressForm";

/**
 * Story 40: formulário de endereço (`src/components/AddressForm.tsx`) do fluxo de
 * endereços (/delivery). Cobre CEP→ViaCEP, "usar minha localização" (GPS + reverse
 * geocode), validação de cobertura e o gate do submit. useAuth/expo-location/fetch
 * mockados; sem rede real.
 */

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

// Reverse geocode via backend (story 76): `mkt.reverseGeocode` bate em
// `/geocoding/reverse` — retorno controlado por teste (default: null).
let reverseResult: unknown = null;
const mockRequest = jest.fn((url: string) => {
  if (url === "/coverage/cities") return Promise.resolve([{ city: "Curitiba", state: "PR" }]);
  if (url.startsWith("/geocoding/reverse")) return Promise.resolve(reverseResult);
  return Promise.resolve({});
});
jest.mock("../auth-context", () => ({ useAuth: () => ({ api: { request: mockRequest } }) }));

const reqPerm = Location.requestForegroundPermissionsAsync as jest.Mock;
const getPos = Location.getCurrentPositionAsync as jest.Mock;

async function mountForm(props: Partial<React.ComponentProps<typeof AddressForm>> = {}) {
  const onSubmit = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<AddressForm onSubmit={onSubmit} {...props} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return { tree, onSubmit };
}

function input(tree: renderer.ReactTestRenderer, placeholder: string) {
  return tree.root.findAll(
    (n) => n.props.placeholder === placeholder && typeof n.props.onChangeText === "function",
  )[0];
}
function submitBtn(tree: renderer.ReactTestRenderer, label = "Salvar endereço") {
  return tree.root.findAll((n) => n.props.title === label && typeof n.props.onPress === "function")[0];
}
function json(tree: renderer.ReactTestRenderer) {
  return JSON.stringify(tree.toJSON());
}
const flush = () => act(async () => {
  await new Promise<void>((r) => setTimeout(r, 0));
});

beforeEach(() => {
  mockRequest.mockClear();
  reqPerm.mockReset();
  getPos.mockReset();
  reverseResult = null;
  (globalThis as { fetch?: unknown }).fetch = jest.fn();
});

describe("AddressForm — carga e cobertura", () => {
  it("busca as cidades cobertas ao montar e começa com submit desabilitado", async () => {
    const { tree } = await mountForm();
    expect(mockRequest).toHaveBeenCalledWith("/coverage/cities");
    expect(submitBtn(tree).props.disabled).toBe(true);
  });

  it("cidade fora da cobertura mostra aviso e bloqueia o submit", async () => {
    const { tree } = await mountForm({
      initial: { city: "São Paulo", state: "SP", street: "Av X", number: "1", zipCode: "01000-000" },
    });
    const j = json(tree);
    expect(j).toContain("Ainda não atendemos");
    expect(j).toContain("São Paulo");
    expect(submitBtn(tree).props.disabled).toBe(true);
  });
});

describe("AddressForm — CEP via ViaCEP", () => {
  it("CEP completo preenche rua/cidade/UF e habilita o submit", async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({ logradouro: "Rua das Flores", bairro: "Centro", localidade: "Curitiba", uf: "PR" }),
    });
    const { tree, onSubmit } = await mountForm();
    await act(async () => {
      input(tree, "CEP").props.onChangeText("80000000");
    });
    await flush();
    expect(globalThis.fetch).toHaveBeenCalledWith("https://viacep.com.br/ws/80000000/json/");
    expect(json(tree)).toContain("Rua das Flores");
    // falta o número → preenche e submete
    act(() => input(tree, "Número").props.onChangeText("123"));
    const btn = submitBtn(tree);
    expect(btn.props.disabled).toBeFalsy(); // habilitado: !canSubmit || busy → undefined
    await act(async () => {
      await btn.props.onPress();
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ street: "Rua das Flores", city: "Curitiba", state: "PR", number: "123" }),
    );
  });

  it("CEP inexistente (erro) mostra aviso de não encontrado", async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({ json: async () => ({ erro: true }) });
    const { tree } = await mountForm();
    await act(async () => {
      input(tree, "CEP").props.onChangeText("99999999");
    });
    await flush();
    expect(json(tree)).toContain("CEP não encontrado");
  });

  it("falha de rede no ViaCEP também marca não encontrado", async () => {
    (globalThis.fetch as jest.Mock).mockRejectedValue(new Error("offline"));
    const { tree } = await mountForm();
    await act(async () => {
      input(tree, "CEP").props.onChangeText("88888888");
    });
    await flush();
    expect(json(tree)).toContain("CEP não encontrado");
  });
});

describe("AddressForm — usar minha localização (GPS)", () => {
  function gps(tree: renderer.ReactTestRenderer) {
    // o primeiro Pressable é o "Usar minha localização"
    return tree.root.findAll((n) => typeof n.props.onPress === "function")[0];
  }

  it("permissão negada mostra erro orientando o CEP", async () => {
    reqPerm.mockResolvedValue({ granted: false });
    const { tree } = await mountForm();
    await act(async () => {
      await gps(tree).props.onPress();
    });
    expect(json(tree)).toContain("Permissão de localização negada");
  });

  it("sucesso chama o backend com as coords do GPS e preenche o form (story 76)", async () => {
    reqPerm.mockResolvedValue({ granted: true });
    getPos.mockResolvedValue({ coords: { latitude: -25.4, longitude: -49.2 } });
    reverseResult = {
      street: "Rua B",
      number: "10",
      district: "Centro",
      city: "Curitiba",
      state: "PR",
      zipCode: "80010-000",
    };
    const { tree } = await mountForm();
    await act(async () => {
      await gps(tree).props.onPress();
    });
    expect(mockRequest).toHaveBeenCalledWith(
      "/geocoding/reverse?lat=-25.4&lng=-49.2",
      { auth: true },
    );
    const j = json(tree);
    expect(j).toContain("Rua B");
    expect(j).toContain("Curitiba");
  });

  it("backend retorna null → erro amigável + coords do GPS preservadas no form", async () => {
    reqPerm.mockResolvedValue({ granted: true });
    getPos.mockResolvedValue({ coords: { latitude: -25.4, longitude: -49.2 } });
    reverseResult = null;
    const onSubmit = jest.fn();
    const { tree } = await mountForm({
      initial: { street: "Rua Preenchida", number: "5", city: "Curitiba", state: "PR", zipCode: "80000-000" },
      onSubmit,
    });
    await act(async () => {
      await gps(tree).props.onPress();
    });
    expect(json(tree)).toContain("Não foi possível identificar o endereço");
    // coords do GPS entram no form mesmo sem endereço resolvido
    await act(async () => {
      await submitBtn(tree).props.onPress();
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: -25.4, longitude: -49.2 }),
    );
  });

  it("exceção no GPS mostra erro de falha", async () => {
    reqPerm.mockRejectedValue(new Error("gps off"));
    const { tree } = await mountForm();
    await act(async () => {
      await gps(tree).props.onPress();
    });
    expect(json(tree)).toContain("Falha ao obter a localização");
  });
});
