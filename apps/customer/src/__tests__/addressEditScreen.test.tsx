import React from "react";
import renderer, { act } from "react-test-renderer";
import { ActivityIndicator } from "react-native";
import { ApiClientError } from "@markethub/api-client";
import AddressEditScreen from "../../app/address/[id]";
import type { Address } from "../api/marketplace";
import type { AddressFormValue } from "../components/AddressForm";

/**
 * Story 71: rota /address/[id] (criar em "new", editar por id) — orquestração.
 * AddressForm stubado (CEP/GPS testados em addressForm.test.tsx) e hooks de
 * useAddresses mockados; valida o mapeamento do payload, a volta pra lista no
 * sucesso, erro inline da API e os estados loading/não-encontrado.
 */

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

const mockBack = jest.fn();
let mockId = "new";
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: mockId }),
}));

interface FormProps {
  initial?: Partial<Address> | null;
  submitLabel?: string;
  busy?: boolean;
  onSubmit: (value: AddressFormValue) => void | Promise<void>;
}
let formProps: FormProps | null = null;
jest.mock("../components/AddressForm", () => ({
  AddressForm: (props: FormProps) => {
    formProps = props;
    return null;
  },
}));

const mockShow = jest.fn();
jest.mock("../components/Toast", () => ({
  useToast: () => ({ show: mockShow }),
}));

let mockList: Address[] = [];
let mockLoading = false;
const mockAdd = jest.fn();
const mockUpdate = jest.fn();
const mockUseUpdateAddress = jest.fn();
let mockAddError: unknown = null;
let mockUpdateError: unknown = null;
jest.mock("../api/hooks/useAddresses", () => ({
  useAddresses: () => ({ addresses: mockList, activeAddress: mockList[0] ?? null, loading: mockLoading }),
  useAddAddress: () => ({ mutateAsync: mockAdd, isPending: false, error: mockAddError }),
  useUpdateAddress: (id: string) => {
    mockUseUpdateAddress(id);
    return { mutateAsync: mockUpdate, isPending: false, error: mockUpdateError };
  },
}));

const ADDR: Address = {
  id: "a2", label: "Trabalho", street: "Rua B", number: "22", city: "Curitiba", state: "PR",
  zipCode: "80000-000", latitude: -25, longitude: -49, isDefault: false,
};

const VALUE: AddressFormValue = {
  label: "Trabalho", zipCode: "80000-000", street: "Rua B", number: "22",
  district: "", city: "Curitiba", state: "PR", complement: "",
  latitude: -25, longitude: -49,
};

/** Payload esperado: district/complement vazios viram null. */
const BODY = {
  label: "Trabalho", zipCode: "80000-000", street: "Rua B", number: "22",
  district: null, city: "Curitiba", state: "PR", complement: null,
  latitude: -25, longitude: -49,
};

function render() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<AddressEditScreen />);
  });
  return tree;
}

async function submit(value: AddressFormValue) {
  await act(async () => {
    await formProps!.onSubmit(value);
  });
}

beforeEach(() => {
  mockId = "new";
  mockList = [ADDR];
  mockLoading = false;
  mockAddError = null;
  mockUpdateError = null;
  formProps = null;
  mockBack.mockClear();
  mockShow.mockClear();
  mockUseUpdateAddress.mockClear();
  mockAdd.mockReset().mockResolvedValue(ADDR);
  mockUpdate.mockReset().mockResolvedValue(ADDR);
});

describe("AddressEditScreen (story 71)", () => {
  it("modo novo: form sem initial, submit cria e volta pra lista", async () => {
    const tree = render();
    expect(JSON.stringify(tree.toJSON())).toContain("NOVO ENDEREÇO");
    expect(formProps!.initial).toBeNull();
    expect(formProps!.submitLabel).toBe("Adicionar endereço");
    await submit(VALUE);
    expect(mockAdd).toHaveBeenCalledWith(BODY);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
    // coords presentes na resposta → sem aviso (story 75)
    expect(mockShow).not.toHaveBeenCalled();
  });

  it("resposta sem coords → mostra aviso não bloqueante e ainda volta pra lista (story 75)", async () => {
    mockAdd.mockResolvedValue({ ...ADDR, latitude: null, longitude: null });
    render();
    await submit(VALUE);
    expect(mockShow).toHaveBeenCalledWith("Não encontramos a localização exata deste endereço");
    expect(mockBack).toHaveBeenCalled();
  });

  it("resposta com coords → não mostra aviso (story 75)", async () => {
    render();
    await submit(VALUE);
    expect(mockShow).not.toHaveBeenCalled();
  });

  it("modo edição: initial do endereço da lista, submit edita e volta", async () => {
    mockId = "a2";
    const tree = render();
    expect(JSON.stringify(tree.toJSON())).toContain("EDITAR ENDEREÇO");
    expect(mockUseUpdateAddress).toHaveBeenCalledWith("a2");
    expect(formProps!.initial).toEqual(ADDR);
    expect(formProps!.submitLabel).toBe("Salvar alterações");
    await submit({ ...VALUE, district: "Centro", complement: "sala 3" });
    expect(mockUpdate).toHaveBeenCalledWith({ ...BODY, district: "Centro", complement: "sala 3" });
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });

  it("erro da API aparece inline e não volta pra lista", async () => {
    mockAdd.mockRejectedValue(
      new ApiClientError(400, { code: "CITY_NOT_COVERED", message: "Ainda não atendemos Maringá." }),
    );
    mockAddError = new ApiClientError(400, {
      code: "CITY_NOT_COVERED",
      message: "Ainda não atendemos Maringá.",
    });
    const tree = render();
    await submit(VALUE);
    expect(mockBack).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain("Ainda não atendemos Maringá.");
  });

  it("erro genérico mostra mensagem padrão", () => {
    mockAddError = new Error("boom");
    const tree = render();
    expect(JSON.stringify(tree.toJSON())).toContain(
      "Não foi possível salvar o endereço. Tente novamente.",
    );
  });

  it("modo edição carregando mostra spinner e não renderiza o form", () => {
    mockId = "a2";
    mockLoading = true;
    mockList = [];
    const tree = render();
    expect(tree.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    expect(formProps).toBeNull();
  });

  it("id inexistente após carregar mostra 'não encontrado'", () => {
    mockId = "zz";
    const tree = render();
    expect(JSON.stringify(tree.toJSON())).toContain("Endereço não encontrado.");
    expect(formProps).toBeNull();
  });
});
