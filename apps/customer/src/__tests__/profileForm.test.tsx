import React from "react";
import renderer, { act } from "react-test-renderer";
import { TextInput } from "react-native";
import { Button } from "@markethub/ui";
import { ProfileForm } from "../components/ProfileForm";

/**
 * Story 70: seção "Meus dados" — react-hook-form + zod com Controller.
 * Cobre: máscara de telefone no input, validação zod, submit com diff parcial
 * (só o alterado; phone vazio → null), e-mail read-only (sem input) e botão
 * desabilitado sem alteração.
 */

const ME = { name: "Ana", email: "a@b.com", phone: "41999991234" };

function render(node: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(node);
  });
  return tree;
}

function input(tree: renderer.ReactTestRenderer, label: string) {
  return tree.root
    .findAllByType(TextInput)
    .find((i) => i.props.accessibilityLabel === label)!;
}

const saveButton = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Button).find((b) => b.props.title === "Salvar alterações")!;

describe("ProfileForm (story 70)", () => {
  it("preenche defaults do perfil: nome e telefone mascarado", () => {
    const tree = render(<ProfileForm me={ME} onSubmit={jest.fn()} />);
    expect(input(tree, "Nome").props.value).toBe("Ana");
    expect(input(tree, "Telefone").props.value).toBe("(41) 99999-1234");
  });

  it("e-mail é read-only: exibido como texto, sem TextInput", () => {
    const tree = render(<ProfileForm me={ME} onSubmit={jest.fn()} />);
    expect(JSON.stringify(tree.toJSON())).toContain("a@b.com");
    const inputs = tree.root.findAllByType(TextInput);
    expect(inputs).toHaveLength(2); // só nome e telefone
    expect(inputs.some((i) => i.props.value === "a@b.com")).toBe(false);
  });

  it("aplica a máscara conforme digita no telefone", () => {
    const tree = render(<ProfileForm me={{ ...ME, phone: null }} onSubmit={jest.fn()} />);
    act(() => input(tree, "Telefone").props.onChangeText("4133334444"));
    expect(input(tree, "Telefone").props.value).toBe("(41) 3333-4444");
  });

  it("botão desabilitado sem alteração; habilita ao editar", () => {
    const tree = render(<ProfileForm me={ME} onSubmit={jest.fn()} />);
    expect(saveButton(tree).props.disabled).toBe(true);
    act(() => input(tree, "Nome").props.onChangeText("Ana Maria"));
    expect(saveButton(tree).props.disabled).toBe(false);
  });

  it("submit envia SÓ o alterado: nome mudou → patch sem phone", async () => {
    const onSubmit = jest.fn();
    const tree = render(<ProfileForm me={ME} onSubmit={onSubmit} />);
    act(() => input(tree, "Nome").props.onChangeText("Ana Maria"));
    await act(async () => {
      saveButton(tree).props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSubmit).toHaveBeenCalledWith({ name: "Ana Maria" });
  });

  it("telefone alterado vai só-dígitos no patch", async () => {
    const onSubmit = jest.fn();
    const tree = render(<ProfileForm me={ME} onSubmit={onSubmit} />);
    act(() => input(tree, "Telefone").props.onChangeText("(41) 3333-4444"));
    await act(async () => {
      saveButton(tree).props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSubmit).toHaveBeenCalledWith({ phone: "4133334444" });
  });

  it("telefone apagado → phone: null (limpa no backend)", async () => {
    const onSubmit = jest.fn();
    const tree = render(<ProfileForm me={ME} onSubmit={onSubmit} />);
    act(() => input(tree, "Telefone").props.onChangeText(""));
    await act(async () => {
      saveButton(tree).props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSubmit).toHaveBeenCalledWith({ phone: null });
  });

  it("telefone incompleto nega com mensagem zod e não submete", async () => {
    const onSubmit = jest.fn();
    const tree = render(<ProfileForm me={ME} onSubmit={onSubmit} />);
    act(() => input(tree, "Telefone").props.onChangeText("4199"));
    await act(async () => {
      saveButton(tree).props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain("Telefone inválido");
  });

  it("nome vazio nega com mensagem zod", async () => {
    const onSubmit = jest.fn();
    const tree = render(<ProfileForm me={ME} onSubmit={onSubmit} />);
    act(() => input(tree, "Nome").props.onChangeText(""));
    await act(async () => {
      saveButton(tree).props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain("Informe seu nome");
  });

  it("exibe o erro vindo da tela (mutation)", () => {
    const tree = render(<ProfileForm me={ME} error="Telefone inválido" onSubmit={jest.fn()} />);
    expect(JSON.stringify(tree.toJSON())).toContain("Telefone inválido");
  });
});
