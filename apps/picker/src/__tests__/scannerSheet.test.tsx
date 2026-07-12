import React from "react";
import { Pressable, Vibration } from "react-native";
import renderer, { act } from "react-test-renderer";
import { Button, Text } from "@markethub/ui";
import type { PickItemDTO } from "@markethub/api-client";
import { ScannerSheet, type MatchFeedback } from "@/components/ScannerSheet";
import type { ScanMatch } from "@/lib/scanMatcher";

/**
 * Story 63: comportamento do sheet do scanner com CameraView mockado (sem device
 * no CI). Cobre permissão pedida no 1º uso / negada não quebra, o disparo do
 * matcher por bip, o debounce, a vibração de sucesso vs erro, o contador e o
 * desfazer do banner.
 */

const mockCamera: { onScan: ((e: { data: string }) => void) | null } = { onScan: null };
let mockPermission: { granted: boolean; canAskAgain: boolean } | null = {
  granted: true,
  canAskAgain: true,
};
const mockRequestPermission = jest.fn();

jest.mock("expo-camera", () => ({
  useCameraPermissions: () => [mockPermission, mockRequestPermission],
  CameraView: (props: { onBarcodeScanned?: (e: { data: string }) => void }) => {
    mockCamera.onScan = props.onBarcodeScanned ?? null;
    return null;
  },
}));

function mkItem(over: Partial<PickItemDTO> = {}): PickItemDTO {
  return {
    id: "i1",
    orderItemId: "oi1",
    nameSnapshot: "Arroz 5kg",
    gtin: "7891234567890",
    saleType: "unit",
    status: "pending",
    quantity: 2,
    ...over,
  } as PickItemDTO;
}

function textOf(inst: renderer.ReactTestInstance): string {
  return inst.children.map((c) => (typeof c === "string" ? c : textOf(c))).join("");
}

const trees: renderer.ReactTestRenderer[] = [];

function renderSheet(props: Partial<React.ComponentProps<typeof ScannerSheet>> = {}) {
  const onMatch = jest.fn<MatchFeedback, [ScanMatch]>(() => ({
    message: "ok",
    tone: "success",
  }));
  const onClose = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <ScannerSheet
        visible
        onClose={onClose}
        items={[mkItem()]}
        onMatch={onMatch}
        {...props}
      />,
    );
  });
  trees.push(tree);
  return { tree, onMatch, onClose };
}

let vibrateSpy: jest.SpyInstance;

beforeEach(() => {
  mockCamera.onScan = null;
  mockPermission = { granted: true, canAskAgain: true };
  mockRequestPermission.mockReset();
  vibrateSpy = jest.spyOn(Vibration, "vibrate").mockImplementation(() => undefined);
});

afterEach(() => {
  // Desmonta as árvores p/ os efeitos de cleanup zerarem os timers do banner.
  act(() => {
    while (trees.length) trees.pop()!.unmount();
  });
  vibrateSpy.mockRestore();
});

describe("ScannerSheet — permissão", () => {
  it("pede permissão no 1º uso quando ainda não concedida", () => {
    mockPermission = { granted: false, canAskAgain: true };
    renderSheet();
    expect(mockRequestPermission).toHaveBeenCalled();
  });

  it("permissão negada não quebra e mostra o fallback manual", () => {
    mockPermission = { granted: false, canAskAgain: false };
    const { tree } = renderSheet();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain("separar manualmente");
  });

  it("permissão concedida renderiza a câmera (onBarcodeScanned ligado)", () => {
    renderSheet();
    expect(typeof mockCamera.onScan).toBe("function");
  });
});

describe("ScannerSheet — leitura", () => {
  it("bip casa o item e chama onMatch com o resultado do matcher", () => {
    const { onMatch } = renderSheet();
    act(() => mockCamera.onScan!({ data: "7891234567890" }));
    expect(onMatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "pick-unit", item: expect.objectContaining({ id: "i1" }) }),
    );
  });

  it("sucesso vibra curto (40ms)", () => {
    renderSheet();
    act(() => mockCamera.onScan!({ data: "7891234567890" }));
    expect(vibrateSpy).toHaveBeenCalledWith(40);
  });

  it("desconhecido vibra em padrão de erro e chama onMatch unknown", () => {
    const { onMatch } = renderSheet();
    act(() => mockCamera.onScan!({ data: "0000000000000" }));
    expect(onMatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "unknown" }));
    expect(vibrateSpy).toHaveBeenCalledWith([0, 60, 40, 60]);
  });

  it("debounce: mesmo código em sequência dispara onMatch só uma vez", () => {
    const { onMatch } = renderSheet();
    act(() => mockCamera.onScan!({ data: "7891234567890" }));
    act(() => mockCamera.onScan!({ data: "7891234567890" }));
    expect(onMatch).toHaveBeenCalledTimes(1);
  });

  it("exibe o aviso devolvido por onMatch", () => {
    const { tree } = renderSheet({
      onMatch: () => ({ message: "Arroz 5kg: separado", tone: "success" }),
    });
    act(() => mockCamera.onScan!({ data: "7891234567890" }));
    expect(JSON.stringify(tree.toJSON())).toContain("Arroz 5kg: separado");
  });

  it("banner com undo mostra Desfazer e o aciona", () => {
    const undo = jest.fn();
    const { tree } = renderSheet({
      onMatch: () => ({ message: "separado", tone: "success", undo }),
    });
    act(() => mockCamera.onScan!({ data: "7891234567890" }));
    const desfazer = tree.root.findAllByType(Pressable).find((p) => textOf(p).includes("Desfazer"));
    expect(desfazer).toBeTruthy();
    act(() => desfazer!.props.onPress());
    expect(undo).toHaveBeenCalled();
  });
});

describe("ScannerSheet — contador e fechar", () => {
  it("conta itens resolvidos (status + otimistas) sobre o total", () => {
    const items = [
      mkItem({ id: "a", status: "picked" }),
      mkItem({ id: "b", status: "pending" }),
      mkItem({ id: "c", status: "pending" }),
    ];
    const { tree } = renderSheet({ items, resolvedIds: new Set(["b"]) });
    // a (picked) + b (otimista) = 2 de 3
    const hasCounter = tree.root
      .findAllByType(Text)
      .some((t) => textOf(t) === "2 de 3 separados");
    expect(hasCounter).toBe(true);
  });

  it("Fechar dispara onClose", () => {
    const { tree, onClose } = renderSheet();
    const fechar = tree.root.findAllByType(Button).find((b) => b.props.title === "Fechar");
    act(() => fechar!.props.onPress());
    expect(onClose).toHaveBeenCalled();
  });
});
