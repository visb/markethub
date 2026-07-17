import React from "react";
import renderer, { act } from "react-test-renderer";
import { TextInput } from "react-native";
import { Button } from "@markethub/ui";
import { ChangePasswordForm } from "../components/ChangePasswordForm";

/**
 * Story 70: seção "Segurança" — troca de senha com atual + nova + confirmação
 * (react-hook-form + zod com Controller). Cobre validação (min 8, confirmação),
 * submit feliz limpando o form e rejeição mantendo os campos.
 */

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

const submitButton = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Button).find((b) => b.props.title === "Alterar senha")!;

function fill(tree: renderer.ReactTestRenderer, current: string, next: string, confirm: string) {
  act(() => input(tree, "Senha atual").props.onChangeText(current));
  act(() => input(tree, "Nova senha").props.onChangeText(next));
  act(() => input(tree, "Confirmar nova senha").props.onChangeText(confirm));
}

describe("ChangePasswordForm (story 70)", () => {
  it("campos são secureTextEntry (senha oculta)", () => {
    const tree = render(<ChangePasswordForm onSubmit={jest.fn()} />);
    const secure = tree.root.findAllByType(TextInput).map((i) => i.props.secureTextEntry);
    expect(secure).toEqual([true, true, true]);
  });

  it("nova senha < 8 nega com mensagem e não submete", async () => {
    const onSubmit = jest.fn();
    const tree = render(<ChangePasswordForm onSubmit={onSubmit} />);
    fill(tree, "atual123", "curta", "curta");
    await act(async () => {
      submitButton(tree).props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain("pelo menos 8 caracteres");
  });

  it("confirmação divergente nega com 'As senhas não conferem'", async () => {
    const onSubmit = jest.fn();
    const tree = render(<ChangePasswordForm onSubmit={onSubmit} />);
    fill(tree, "atual123", "nova-senha-1", "outra-coisa-2");
    await act(async () => {
      submitButton(tree).props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain("As senhas não conferem");
  });

  it("submit feliz envia atual + nova (sem a confirmação) e limpa o form", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const tree = render(<ChangePasswordForm onSubmit={onSubmit} />);
    fill(tree, "atual123", "nova-senha-1", "nova-senha-1");
    await act(async () => {
      submitButton(tree).props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSubmit).toHaveBeenCalledWith({
      currentPassword: "atual123",
      newPassword: "nova-senha-1",
    });
    expect(input(tree, "Senha atual").props.value).toBe("");
    expect(input(tree, "Nova senha").props.value).toBe("");
    expect(input(tree, "Confirmar nova senha").props.value).toBe("");
  });

  it("rejeição NÃO limpa os campos (usuário corrige e reenvia)", async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error("INVALID_CURRENT_PASSWORD"));
    const tree = render(<ChangePasswordForm onSubmit={onSubmit} />);
    fill(tree, "errada999", "nova-senha-1", "nova-senha-1");
    await act(async () => {
      submitButton(tree).props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(input(tree, "Nova senha").props.value).toBe("nova-senha-1");
  });

  it("exibe o erro vindo da tela (mutation)", () => {
    const tree = render(<ChangePasswordForm error="Senha atual incorreta" onSubmit={jest.fn()} />);
    expect(JSON.stringify(tree.toJSON())).toContain("Senha atual incorreta");
  });
});
