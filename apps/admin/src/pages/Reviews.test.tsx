import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminReviewDTO, AdminReviewsFilter } from "@markethub/api-client";

let reviewsResult: { data?: AdminReviewDTO[]; isLoading: boolean };
let lastFilter: AdminReviewsFilter | undefined;
const hideMutate = vi.fn();
const unhideMutate = vi.fn();

vi.mock("@/api/hooks/useAdminReviews", () => ({
  useAdminReviews: (filter?: AdminReviewsFilter) => {
    lastFilter = filter;
    return reviewsResult;
  },
  useHideReview: () => ({ mutate: hideMutate, isPending: false }),
  useUnhideReview: () => ({ mutate: unhideMutate, isPending: false }),
}));

vi.mock("@/api/hooks/useMerchantOptions", () => ({
  useMerchantOptions: () => ({
    data: [
      { id: "m1", name: "Rede A" },
      { id: "m2", name: "Rede B" },
    ],
  }),
}));

// debounce vira identidade no teste — o filtro de busca propaga na hora
vi.mock("@/lib/useDebounce", () => ({
  useDebouncedValue: <T,>(v: T) => v,
}));

import { Reviews } from "./Reviews";

const row = (over: Partial<AdminReviewDTO> = {}): AdminReviewDTO => ({
  id: "r1",
  orderId: "o1",
  axis: "merchant",
  rating: 2,
  comment: "atendimento péssimo",
  authorName: "Ana Maria",
  createdAt: "2026-07-10T12:00:00.000Z",
  replyText: null,
  repliedAt: null,
  merchantId: "m1",
  merchantName: "Rede A",
  hidden: false,
  hiddenAt: null,
  hiddenReason: null,
  hiddenByName: null,
  ...over,
});

describe("Reviews admin (story 68)", () => {
  beforeEach(() => {
    hideMutate.mockReset();
    unhideMutate.mockReset();
    lastFilter = undefined;
    reviewsResult = { data: [row()], isLoading: false };
  });

  it("lista avaliações com autor, pedido, alvo e estado visível", () => {
    render(<Reviews />);
    expect(screen.getByText("atendimento péssimo")).toBeInTheDocument();
    expect(screen.getByText("Ana Maria")).toBeInTheDocument();
    expect(screen.getByText("o1")).toBeInTheDocument();
    // "Rede A" aparece na opção do filtro e na célula da linha
    expect(screen.getAllByText("Rede A").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("visível")).toBeInTheDocument();
    // sem filtro: tudo undefined (todas)
    expect(lastFilter).toEqual({ rating: undefined, hidden: undefined, merchantId: undefined, q: undefined });
  });

  it("estado vazio", () => {
    reviewsResult = { data: [], isLoading: false };
    render(<Reviews />);
    expect(screen.getByText("Nenhuma avaliação.")).toBeInTheDocument();
  });

  it("filtro por nota repassa rating numérico ao hook", () => {
    render(<Reviews />);
    fireEvent.change(screen.getByLabelText("Filtrar por nota"), { target: { value: "4" } });
    expect(lastFilter).toMatchObject({ rating: 4 });
  });

  it("filtro de visibilidade: ocultas → hidden true; visíveis → hidden false", () => {
    render(<Reviews />);
    fireEvent.change(screen.getByLabelText("Filtrar por visibilidade"), {
      target: { value: "hidden" },
    });
    expect(lastFilter).toMatchObject({ hidden: true });
    fireEvent.change(screen.getByLabelText("Filtrar por visibilidade"), {
      target: { value: "visible" },
    });
    expect(lastFilter).toMatchObject({ hidden: false });
  });

  it("filtro por rede e busca no texto repassam merchantId e q", () => {
    render(<Reviews />);
    fireEvent.change(screen.getByLabelText("Filtrar por rede"), { target: { value: "m2" } });
    expect(lastFilter).toMatchObject({ merchantId: "m2" });
    fireEvent.change(screen.getByLabelText("Buscar no texto"), { target: { value: "ruim" } });
    expect(lastFilter).toMatchObject({ q: "ruim" });
  });

  it("oculta aparece riscada/escurecida com motivo e quem ocultou; Reexibir dispara unhide", () => {
    reviewsResult = {
      data: [
        row({
          hidden: true,
          hiddenAt: "2026-07-15T00:00:00.000Z",
          hiddenReason: "linguagem ofensiva",
          hiddenByName: "Alice Admin",
        }),
      ],
      isLoading: false,
    };
    render(<Reviews />);
    expect(screen.getByText("oculta")).toBeInTheDocument();
    expect(screen.getByText(/linguagem ofensiva — por Alice Admin/)).toBeInTheDocument();
    expect(screen.getByText("atendimento péssimo").className).toContain("review-comment-hidden");
    expect(screen.queryByRole("button", { name: "Ocultar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reexibir" }));
    expect(unhideMutate.mock.calls[0][0]).toBe("r1");
  });

  it("linha expandível mostra comentário completo e resposta do lojista", () => {
    reviewsResult = {
      data: [row({ replyText: "obrigado pelo retorno", repliedAt: "2026-07-11T00:00:00.000Z" })],
      isLoading: false,
    };
    render(<Reviews />);
    expect(screen.queryByText(/Resposta do lojista/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Detalhes" }));
    expect(screen.getByText(/Resposta do lojista/)).toBeInTheDocument();
    expect(screen.getByText(/obrigado pelo retorno/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByText(/Resposta do lojista/)).not.toBeInTheDocument();
  });

  it("modal de ocultar exige motivo: vazio bloqueia, preenchido dispara hide", async () => {
    render(<Reviews />);
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    const dialog = screen.getByRole("dialog", { name: "Ocultar avaliação" });
    // sem motivo → erro de validação, mutation não dispara
    fireEvent.click(within(dialog).getByRole("button", { name: "Ocultar" }));
    await screen.findByText("Motivo é obrigatório");
    expect(hideMutate).not.toHaveBeenCalled();
    // com motivo → dispara com id + reason
    fireEvent.change(within(dialog).getByLabelText(/Motivo/), { target: { value: "spam" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ocultar" }));
    await vi.waitFor(() => expect(hideMutate).toHaveBeenCalledTimes(1));
    expect(hideMutate.mock.calls[0][0]).toEqual({ id: "r1", reason: "spam" });
  });

  it("sucesso ao ocultar fecha o modal", async () => {
    hideMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
    render(<Reviews />);
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    const dialog = screen.getByRole("dialog", { name: "Ocultar avaliação" });
    fireEvent.change(within(dialog).getByLabelText(/Motivo/), { target: { value: "spam" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ocultar" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("falha ao ocultar mantém o modal aberto e mostra o erro", async () => {
    hideMutate.mockImplementation((_vars, opts) => opts?.onError?.(new Error("boom")));
    render(<Reviews />);
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    const dialog = screen.getByRole("dialog", { name: "Ocultar avaliação" });
    fireEvent.change(within(dialog).getByLabelText(/Motivo/), { target: { value: "spam" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ocultar" }));
    await screen.findByText("Falha ao ocultar a avaliação.");
    expect(screen.getByRole("dialog", { name: "Ocultar avaliação" })).toBeInTheDocument();
  });

  it("falha ao reexibir mostra o erro na linha", async () => {
    unhideMutate.mockImplementation((_id, opts) => opts?.onError?.(new Error("boom")));
    reviewsResult = {
      data: [row({ hidden: true, hiddenAt: "2026-07-15T00:00:00.000Z", hiddenReason: "spam" })],
      isLoading: false,
    };
    render(<Reviews />);
    fireEvent.click(screen.getByRole("button", { name: "Reexibir" }));
    await screen.findByText("Falha ao reexibir.");
  });

  it("Cancelar fecha o modal sem ocultar", () => {
    render(<Reviews />);
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(hideMutate).not.toHaveBeenCalled();
  });
});
