import React from "react";
import renderer, { act } from "react-test-renderer";
import { TextInput } from "react-native";
import AccountScreen from "../../app/account";

/**
 * Story 70 → 78: tela de conta (app/account.tsx) virou hub de navegação. "Meus
 * dados" e "Segurança" saíram de inline e viraram itens de menu com tela própria
 * (app/account/profile e app/account/security). Este teste valida o hub: header
 * com nome/e-mail (useMe), as 6 linhas na ordem e a navegação de cada uma.
 */

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("../components/BottomTabs", () => ({ BottomTabs: () => null }));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

const mockLogout = jest.fn();
jest.mock("../auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", name: "Ana", email: "a@b.com", phone: null, roles: ["customer"] },
    logout: mockLogout,
  }),
}));

const ME = { id: "u1", name: "Ana", email: "a@b.com", phone: "41999991234", roles: ["customer"] };
let mockMeData: typeof ME | undefined = ME;

jest.mock("../api/hooks/useAccount", () => ({
  useMe: () => ({ data: mockMeData }),
}));

function render() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<AccountScreen />);
  });
  return tree;
}

function pressable(tree: renderer.ReactTestRenderer, label: string) {
  return tree.root
    .findAll((n) => typeof n.props.onPress === "function")
    .find((n) => contains(n, label))!;
}

function contains(node: renderer.ReactTestInstance, text: string): boolean {
  try {
    return node.findAll((n) => n.props.children === text).length > 0;
  } catch {
    return false;
  }
}

beforeEach(() => {
  mockMeData = ME;
  mockPush.mockClear();
  mockLogout.mockClear();
});

describe("AccountScreen (story 78)", () => {
  it("renderiza o header com nome/e-mail do perfil", () => {
    const tree = render();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("Ana");
    expect(json).toContain("a@b.com");
  });

  it("renderiza as 6 linhas na ordem definida", () => {
    const tree = render();
    const labels = [
      "Meus dados",
      "Segurança",
      "Minhas compras",
      "Favoritos",
      "Endereços",
      "Sair",
    ];
    // Texto de cada linha, na ordem de render. O Text de @markethub/ui aninha
    // o mesmo `children` em várias camadas host — dedupe preservando a ordem.
    const seen = tree.root
      .findAll((n) => labels.includes(n.props.children as string))
      .map((n) => n.props.children as string);
    const rendered = seen.filter((l, i) => seen.indexOf(l) === i);
    expect(rendered).toEqual(labels);
  });

  it("não renderiza mais os forms inline (sem inputs de dados/senha na conta)", () => {
    const tree = render();
    expect(tree.root.findAllByType(TextInput).length).toBe(0);
    const json = JSON.stringify(tree.toJSON());
    expect(json).not.toContain("Salvar alterações");
    expect(json).not.toContain("Alterar senha");
  });

  it("Meus dados navega para /account/profile", () => {
    const tree = render();
    act(() => pressable(tree, "Meus dados").props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/account/profile");
  });

  it("Segurança navega para /account/security", () => {
    const tree = render();
    act(() => pressable(tree, "Segurança").props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/account/security");
  });

  it("linhas de navegação disparam a rota certa e Sair desloga", () => {
    const tree = render();
    act(() => pressable(tree, "Minhas compras").props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/orders");
    act(() => pressable(tree, "Favoritos").props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/favorites");
    act(() => pressable(tree, "Endereços").props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/addresses");
    act(() => pressable(tree, "Sair").props.onPress());
    expect(mockLogout).toHaveBeenCalled();
  });

  it("sem perfil carregado cai no fallback do header (user do auth-context)", () => {
    mockMeData = undefined;
    const tree = render();
    // header mostra o user do auth-context enquanto o perfil não chega
    expect(JSON.stringify(tree.toJSON())).toContain("Ana");
  });
});
