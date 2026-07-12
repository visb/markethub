import React from "react";
import renderer, { act } from "react-test-renderer";
import { Pressable, TextInput } from "react-native";
import { Button } from "@markethub/ui";
import { ProblemDeliverySheet } from "@/components/ProblemDeliverySheet";

/**
 * Story 61: sheet de "Problema na entrega". Form com react-hook-form + zod
 * (Controller). Cobre: confirmar desabilitado sem motivo, seleção de motivo +
 * observação chegando ao onSubmit, e o Voltar fechando.
 */

function render(node: React.ReactElement) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(node);
  });
  return tree!;
}

function findButton(tree: renderer.ReactTestRenderer, title: string) {
  return tree.root.findAllByType(Button).find((b) => b.props.title === title)!;
}

describe("ProblemDeliverySheet", () => {
  it("confirmar fica desabilitado até escolher um motivo", () => {
    const tree = render(
      <ProblemDeliverySheet visible onClose={jest.fn()} onSubmit={jest.fn()} />,
    );
    expect(findButton(tree, "Confirmar problema").props.disabled).toBe(true);
  });

  it("seleciona motivo + observação e envia no onSubmit", async () => {
    const onSubmit = jest.fn();
    const tree = render(
      <ProblemDeliverySheet visible onClose={jest.fn()} onSubmit={onSubmit} />,
    );
    // escolhe o motivo "Cliente ausente"
    const reasonRow = tree.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Cliente ausente")!;
    act(() => reasonRow.props.onPress());
    // digita observação
    const note = tree.root.findByType(TextInput);
    act(() => note.props.onChangeText("portão fechado"));

    const confirm = findButton(tree, "Confirmar problema");
    expect(confirm.props.disabled).toBe(false);
    await act(async () => {
      await confirm.props.onPress();
    });
    expect(onSubmit).toHaveBeenCalledWith({ reason: "customer_absent", note: "portão fechado" });
  });

  it("sem observação envia note undefined", async () => {
    const onSubmit = jest.fn();
    const tree = render(
      <ProblemDeliverySheet visible onClose={jest.fn()} onSubmit={onSubmit} />,
    );
    const reasonRow = tree.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Outro motivo")!;
    act(() => reasonRow.props.onPress());
    await act(async () => {
      await findButton(tree, "Confirmar problema").props.onPress();
    });
    expect(onSubmit).toHaveBeenCalledWith({ reason: "other", note: undefined });
  });

  it("Voltar chama onClose", () => {
    const onClose = jest.fn();
    const tree = render(
      <ProblemDeliverySheet visible onClose={onClose} onSubmit={jest.fn()} />,
    );
    act(() => findButton(tree, "Voltar").props.onPress());
    expect(onClose).toHaveBeenCalled();
  });

  it("mostra a mensagem de erro quando presente", () => {
    const tree = render(
      <ProblemDeliverySheet visible error="Não foi possível reportar o problema." onClose={jest.fn()} onSubmit={jest.fn()} />,
    );
    expect(JSON.stringify(tree.toJSON())).toContain("Não foi possível reportar o problema.");
  });
});
