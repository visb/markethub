import React from "react";
import { ActivityIndicator, Alert, Platform, Pressable, TextInput } from "react-native";
import renderer, { act } from "react-test-renderer";
import { Button } from "@markethub/ui";
import type { PickItemDTO, PickTaskDTO } from "@markethub/api-client";
import TaskScreen from "../../app/task/[id]";

/**
 * Story 42: comportamento da tela de separação (app/task/[id].tsx). A tela vive em
 * app/ — fora do collectCoverageFrom (só src/ conta no agregado), logo estas specs
 * são de regressão de comportamento por render. Mocka expo-router e os hooks de
 * dados (React Query): fila/itens, separar/recusar, autocomplete + aplicar
 * substituto, concluir separação, liberar p/ coleta e confirmar retirada.
 */

const mockBack = jest.fn();
const mockStartMutate = jest.fn();
const mockUpdateItemMutate = jest.fn();
const mockSubstituteMutate = jest.fn();
const mockCompleteMutate = jest.fn();
const mockReadyMutate = jest.fn();
const mockHandoverMutate = jest.fn();
const mockSetSubQuery = jest.fn();

const mockState = {
  task: { data: null as PickTaskDTO | null, isLoading: false, isError: false },
  search: { data: [] as { offerId: string; name: string; priceCents: number; promoPriceCents: number | null }[], isFetching: false },
  pending: false,
  error: null as Error | null,
};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "t1" }),
  useRouter: () => ({ back: mockBack }),
  Stack: { Screen: () => null },
}));

// Câmera mockada (story 63): sem device no CI. Captura o onBarcodeScanned p/
// simular bipagens e assume a permissão concedida.
const mockTaskCamera: { onScan: ((e: { data: string }) => void) | null } = { onScan: null };
jest.mock("expo-camera", () => ({
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  CameraView: (props: { onBarcodeScanned?: (e: { data: string }) => void }) => {
    mockTaskCamera.onScan = props.onBarcodeScanned ?? null;
    return null;
  },
}));

jest.mock("@/hooks/useDebouncedValue", () => ({
  useDebouncedValue: (v: string) => v,
}));

jest.mock("@/api/hooks/usePickTask", () => ({
  SUBSTITUTE_MIN_QUERY: 2,
  usePickTask: () => mockState.task,
  usePickTaskRealtime: jest.fn(),
  usePickStart: () => ({ mutate: mockStartMutate, isPending: mockState.pending, error: mockState.error }),
  usePickUpdateItem: () => ({ mutate: mockUpdateItemMutate, isPending: false, error: null }),
  usePickSubstitute: () => ({ mutate: mockSubstituteMutate, isPending: false, error: null }),
  usePickCompletePicking: () => ({ mutate: mockCompleteMutate, isPending: false, error: null }),
  usePickReady: () => ({ mutate: mockReadyMutate, isPending: false, error: null }),
  useStoreHandover: () => ({ mutate: mockHandoverMutate, isPending: false, error: null }),
  useSubstituteSearch: () => mockState.search,
}));

function mkItem(over: Partial<PickItemDTO> = {}): PickItemDTO {
  return {
    id: "i1",
    nameSnapshot: "Arroz 5kg",
    saleType: "unit",
    quantity: 2,
    weightGrams: null,
    status: "pending",
    ...over,
  } as PickItemDTO;
}

function mkTask(over: Partial<PickTaskDTO> = {}): PickTaskDTO {
  return {
    id: "t1",
    orderGroupId: "grp_000123",
    storeId: "s1",
    status: "picking",
    pickerId: "u1",
    fulfillment: "delivery",
    pickupCode: null,
    items: [mkItem()],
    ...over,
  } as PickTaskDTO;
}

const trees: renderer.ReactTestRenderer[] = [];

function render() {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<TaskScreen />);
  });
  trees.push(tree!);
  return tree!;
}

const btnByTitle = (tree: renderer.ReactTestRenderer, title: string) =>
  tree.root.findAllByType(Button).find((b) => b.props.title === title);

/** Texto renderizado de um nó (concatena os filhos string) — sem JSON.stringify
 * (que estoura em circular FiberNode quando os filhos são elementos React). */
function textOf(inst: renderer.ReactTestInstance): string {
  return inst.children
    .map((c) => (typeof c === "string" ? c : textOf(c)))
    .join("");
}

const pressableWith = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAllByType(Pressable).find((p) => textOf(p).includes(label));

beforeEach(() => {
  mockBack.mockReset();
  mockStartMutate.mockReset();
  mockUpdateItemMutate.mockReset();
  mockSubstituteMutate.mockReset();
  mockCompleteMutate.mockReset();
  mockReadyMutate.mockReset();
  mockHandoverMutate.mockReset();
  mockSetSubQuery.mockReset();
  mockState.task = { data: null, isLoading: false, isError: false };
  mockState.search = { data: [], isFetching: false };
  mockState.pending = false;
  mockState.error = null;
  mockTaskCamera.onScan = null;
});

afterEach(() => {
  // Desmonta as árvores p/ o cleanup zerar os timers do scanner (banner/commit).
  act(() => {
    while (trees.length) trees.pop()!.unmount();
  });
});

describe("TaskScreen — estados de carga", () => {
  it("mostra spinner enquanto carrega", () => {
    mockState.task = { data: null, isLoading: true, isError: false };
    const tree = render();
    expect(tree.root.findAllByType(ActivityIndicator).length).toBe(1);
  });

  it("sem tarefa mostra mensagem de não encontrada", () => {
    mockState.task = { data: null, isLoading: false, isError: false };
    const tree = render();
    expect(JSON.stringify(tree.toJSON())).toContain("Tarefa não encontrada");
  });

  it("erro de carga mostra a falha", () => {
    mockState.task = { data: null, isLoading: false, isError: true };
    const tree = render();
    expect(JSON.stringify(tree.toJSON())).toContain("Falha ao carregar a tarefa");
  });
});

describe("TaskScreen — fila de itens e ações", () => {
  it("status assigned: botão inicia a separação", () => {
    mockState.task = { data: mkTask({ status: "assigned" }), isLoading: false, isError: false };
    const tree = render();
    const btn = btnByTitle(tree, "Iniciar separação");
    act(() => btn!.props.onPress());
    expect(mockStartMutate).toHaveBeenCalled();
  });

  it("renderiza o item da fila com a quantidade pedida (un)", () => {
    mockState.task = { data: mkTask(), isLoading: false, isError: false };
    const tree = render();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("Arroz 5kg");
    expect(json).toContain("2 un");
  });

  it("item por peso mostra o peso em gramas", () => {
    mockState.task = {
      data: mkTask({ items: [mkItem({ saleType: "weight", weightGrams: 500 })] }),
      isLoading: false,
      isError: false,
    };
    const tree = render();
    expect(JSON.stringify(tree.toJSON())).toContain("500 g");
  });

  it("Separar (un) envia action pick com quantityPicked", () => {
    mockState.task = { data: mkTask(), isLoading: false, isError: false };
    const tree = render();
    const sep = pressableWith(tree, "Separar");
    act(() => sep!.props.onPress());
    expect(mockUpdateItemMutate).toHaveBeenCalledWith({
      itemId: "i1",
      input: { action: "pick", quantityPicked: 2 },
    });
  });

  it("Separar (peso) envia action pick com weightGramsPicked", () => {
    mockState.task = {
      data: mkTask({ items: [mkItem({ saleType: "weight", weightGrams: 750 })] }),
      isLoading: false,
      isError: false,
    };
    const tree = render();
    const sep = pressableWith(tree, "Separar");
    act(() => sep!.props.onPress());
    expect(mockUpdateItemMutate).toHaveBeenCalledWith({
      itemId: "i1",
      input: { action: "pick", weightGramsPicked: 750 },
    });
  });

  it("Recusar abre o Alert de motivo e dispara refuse com o motivo escolhido", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    mockState.task = { data: mkTask(), isLoading: false, isError: false };
    const tree = render();
    const rec = pressableWith(tree, "Recusar");
    act(() => rec!.props.onPress());
    expect(alertSpy).toHaveBeenCalled();
    // dispara o primeiro botão do alert ("Sem estoque")
    const buttons = alertSpy.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    act(() => buttons.find((b) => b.text === "Sem estoque")!.onPress!());
    expect(mockUpdateItemMutate).toHaveBeenCalledWith({
      itemId: "i1",
      input: { action: "refuse", refusalReason: "Sem estoque" },
    });
    alertSpy.mockRestore();
  });

  it("itens não resolvidos desabilitam a conclusão", () => {
    mockState.task = { data: mkTask(), isLoading: false, isError: false };
    const tree = render();
    const btn = btnByTitle(tree, "Resolva todos os itens");
    expect(btn!.props.disabled).toBe(true);
  });

  it("todos os itens resolvidos: conclui a separação", () => {
    mockState.task = {
      data: mkTask({ items: [mkItem({ status: "picked" })] }),
      isLoading: false,
      isError: false,
    };
    const tree = render();
    const btn = btnByTitle(tree, "Concluir separação");
    expect(btn!.props.disabled).toBe(false);
    act(() => btn!.props.onPress());
    expect(mockCompleteMutate).toHaveBeenCalled();
  });
});

describe("TaskScreen — substituição na UI", () => {
  it("abre o campo de busca, lista ofertas e aplica o substituto escolhido", () => {
    mockState.task = { data: mkTask(), isLoading: false, isError: false };
    mockState.search = {
      data: [{ offerId: "o9", name: "Arroz Tio João 5kg", priceCents: 2599, promoPriceCents: null }],
      isFetching: false,
    };
    const tree = render();
    // abre o "Substituir"
    const subBtn = pressableWith(tree, "Substituir");
    act(() => subBtn!.props.onPress());
    // o input de busca aparece
    expect(tree.root.findAllByType(TextInput).length).toBeGreaterThan(0);
    // a oferta aparece e ao tocar aplica
    const offer = pressableWith(tree, "Arroz Tio João 5kg");
    act(() => offer!.props.onPress());
    expect(mockSubstituteMutate).toHaveBeenCalledWith(
      { itemId: "i1", substituteOfferId: "o9" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("busca curta mostra a dica do mínimo de caracteres", () => {
    mockState.task = { data: mkTask(), isLoading: false, isError: false };
    mockState.search = { data: [], isFetching: false };
    const tree = render();
    const subBtn = pressableWith(tree, "Substituir");
    act(() => subBtn!.props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain("letras para buscar");
  });
});

describe("TaskScreen — badge de status da substituição (story 64)", () => {
  const sub = (approvalStatus: "pending" | "approved" | "rejected") => ({
    id: "sub1",
    nameSnapshot: "Arroz Premium 5kg",
    unitPriceCents: 1200,
    priceDiffCents: 200,
    approvalStatus,
  });

  it("pendente: mostra 'aguardando cliente' + nome do substituto", () => {
    mockState.task = {
      data: mkTask({ items: [mkItem({ substitution: sub("pending") })] }),
      isLoading: false,
      isError: false,
    };
    const json = JSON.stringify(render().toJSON());
    expect(json).toContain("aguardando cliente");
    expect(json).toContain("Arroz Premium 5kg");
  });

  it("aprovada: mostra o badge de substituição aprovada", () => {
    mockState.task = {
      data: mkTask({ items: [mkItem({ status: "substituted", substitution: sub("approved") })] }),
      isLoading: false,
      isError: false,
    };
    expect(JSON.stringify(render().toJSON())).toContain("Substituição aprovada");
  });

  it("recusada: mostra o badge de substituição recusada/removida", () => {
    mockState.task = {
      data: mkTask({ items: [mkItem({ status: "refused", substitution: sub("rejected") })] }),
      isLoading: false,
      isError: false,
    };
    expect(JSON.stringify(render().toJSON())).toContain("recusada/removida");
  });

  it("sem substituição: não renderiza badge de substituição", () => {
    mockState.task = { data: mkTask(), isLoading: false, isError: false };
    expect(JSON.stringify(render().toJSON())).not.toContain("Substituição:");
  });
});

describe("TaskScreen — pós-separação", () => {
  it("packed: libera para coleta", () => {
    mockState.task = { data: mkTask({ status: "packed" }), isLoading: false, isError: false };
    const tree = render();
    const btn = btnByTitle(tree, "Pronto para coleta");
    act(() => btn!.props.onPress());
    expect(mockReadyMutate).toHaveBeenCalled();
  });

  it("ready_for_pickup + delivery: mostra o código de coleta ao entregador", () => {
    mockState.task = {
      data: mkTask({ status: "ready_for_pickup", fulfillment: "delivery", pickupCode: "ABCD" }),
      isLoading: false,
      isError: false,
    };
    const tree = render();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("Coleta pelo entregador");
    expect(json).toContain("ABCD");
  });

  it("ready_for_pickup + pickup: confirma a retirada com o código digitado", () => {
    mockHandoverMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    mockState.task = {
      data: mkTask({ status: "ready_for_pickup", fulfillment: "pickup" }),
      isLoading: false,
      isError: false,
    };
    const tree = render();
    const input = tree.root.findByType(TextInput);
    act(() => input.props.onChangeText("9999"));
    const btn = btnByTitle(tree, "Confirmar retirada");
    expect(btn!.props.disabled).toBe(false);
    act(() => btn!.props.onPress());
    expect(mockHandoverMutate).toHaveBeenCalledWith(
      { orderGroupId: "grp_000123", code: "9999" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(mockBack).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("retirada com código vazio mantém a confirmação desabilitada", () => {
    mockState.task = {
      data: mkTask({ status: "ready_for_pickup", fulfillment: "pickup" }),
      isLoading: false,
      isError: false,
    };
    const tree = render();
    const btn = btnByTitle(tree, "Confirmar retirada");
    expect(btn!.props.disabled).toBe(true);
  });

  it("erro de mutation exibe a mensagem no topo", () => {
    mockState.task = { data: mkTask({ status: "assigned" }), isLoading: false, isError: false };
    mockState.error = new Error("Tarefa já assumida");
    const tree = render();
    expect(JSON.stringify(tree.toJSON())).toContain("Tarefa já assumida");
  });
});

describe("TaskScreen — scanner de código de barras (story 63)", () => {
  const GTIN = "7891234567890";

  it("picking (nativo): mostra o botão Escanear código", () => {
    mockState.task = { data: mkTask(), isLoading: false, isError: false };
    const tree = render();
    expect(btnByTitle(tree, "Escanear código")).toBeTruthy();
  });

  it("web: não renderiza o botão de escanear", () => {
    const original = Platform.OS;
    (Platform as { OS: string }).OS = "web";
    mockState.task = { data: mkTask(), isLoading: false, isError: false };
    const tree = render();
    expect(btnByTitle(tree, "Escanear código")).toBeFalsy();
    (Platform as { OS: string }).OS = original;
  });

  it("assigned: sem botão de escanear (só em picking)", () => {
    mockState.task = { data: mkTask({ status: "assigned" }), isLoading: false, isError: false };
    const tree = render();
    expect(btnByTitle(tree, "Escanear código")).toBeFalsy();
  });

  it("bip de item unit agenda o pick após a janela do desfazer", () => {
    jest.useFakeTimers();
    mockState.task = {
      data: mkTask({ items: [mkItem({ gtin: GTIN, quantity: 3 })] }),
      isLoading: false,
      isError: false,
    };
    const tree = render();
    act(() => btnByTitle(tree, "Escanear código")!.props.onPress());
    act(() => mockTaskCamera.onScan!({ data: GTIN }));
    // commit adiado: nada disparado ainda
    expect(mockUpdateItemMutate).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(3500);
    });
    expect(mockUpdateItemMutate).toHaveBeenCalledWith({
      itemId: "i1",
      input: { action: "pick", quantityPicked: 3 },
    });
    jest.useRealTimers();
  });

  it("bip de item por peso revela o input de gramas p/ confirmar", () => {
    mockState.task = {
      data: mkTask({ items: [mkItem({ gtin: GTIN, saleType: "weight", weightGrams: 500 })] }),
      isLoading: false,
      isError: false,
    };
    const tree = render();
    act(() => btnByTitle(tree, "Escanear código")!.props.onPress());
    act(() => mockTaskCamera.onScan!({ data: GTIN }));
    const confirm = btnByTitle(tree, "Confirmar peso");
    expect(confirm).toBeTruthy();
    act(() => confirm!.props.onPress());
    expect(mockUpdateItemMutate).toHaveBeenCalledWith(
      { itemId: "i1", input: { action: "pick", weightGramsPicked: 500 } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
