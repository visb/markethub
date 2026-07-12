import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantReviewDTO } from "@markethub/api-client";

let reviewsResult: { data?: MerchantReviewDTO[]; isLoading: boolean };
const replyMutate = vi.fn();
let lastFilter: unknown;

vi.mock("@/api/hooks/useReviews", () => ({
  useReviews: (filter: unknown) => {
    lastFilter = filter;
    return reviewsResult;
  },
  useReplyReview: () => ({ mutate: replyMutate, isPending: false }),
}));

import { Reviews } from "./Reviews";

const row = (over: Partial<MerchantReviewDTO> = {}): MerchantReviewDTO => ({
  id: "r1",
  rating: 4,
  comment: "Entrega rápida",
  authorName: "Ana",
  createdAt: "2026-07-10T00:00:00.000Z",
  replyText: null,
  repliedAt: null,
  merchantId: "m1",
  ...over,
});

describe("Reviews (story 56)", () => {
  beforeEach(() => {
    replyMutate.mockClear();
    lastFilter = undefined;
    reviewsResult = { data: [row()], isLoading: false };
  });

  it("mostra loading", () => {
    reviewsResult = { data: undefined, isLoading: true };
    render(<Reviews />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("estado vazio", () => {
    reviewsResult = { data: [], isLoading: false };
    render(<Reviews />);
    expect(screen.getByText("Nenhuma avaliação encontrada.")).toBeInTheDocument();
  });

  it("lista avaliações com comentário e autor", () => {
    render(<Reviews />);
    expect(screen.getByText("Entrega rápida")).toBeInTheDocument();
    expect(screen.getByText(/Ana ·/)).toBeInTheDocument();
  });

  it("filtro 'somente sem resposta' repassa unanswered=true ao hook", () => {
    render(<Reviews />);
    fireEvent.click(screen.getByLabelText("Somente sem resposta"));
    expect(lastFilter).toMatchObject({ unanswered: true });
  });

  it("filtro de nota repassa rating numérico ao hook", () => {
    render(<Reviews />);
    fireEvent.change(screen.getByLabelText("Nota"), { target: { value: "5" } });
    expect(lastFilter).toMatchObject({ rating: 5 });
  });

  it("responder abre o form e submete a resposta (texto trim)", async () => {
    render(<Reviews />);
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    fireEvent.change(screen.getByPlaceholderText(/Escreva uma resposta/), {
      target: { value: "  Obrigado pela avaliação  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    await vi.waitFor(() => expect(replyMutate).toHaveBeenCalledTimes(1));
    expect(replyMutate.mock.calls[0][0]).toMatchObject({ id: "r1", text: "Obrigado pela avaliação" });
  });

  it("resposta vazia bloqueia o submit (validação zod)", async () => {
    render(<Reviews />);
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    await screen.findByText("Escreva uma resposta");
    expect(replyMutate).not.toHaveBeenCalled();
  });

  it("review já respondido mostra a resposta e permite editar", () => {
    reviewsResult = { data: [row({ replyText: "Valeu!" })], isLoading: false };
    render(<Reviews />);
    expect(screen.getByText("Sua resposta")).toBeInTheDocument();
    expect(screen.getByText("Valeu!")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar resposta" }));
    // o form pré-preenche a resposta atual
    expect((screen.getByPlaceholderText(/Escreva uma resposta/) as HTMLTextAreaElement).value).toBe(
      "Valeu!",
    );
  });

  it("erro na resposta mostra a mensagem (via onError)", async () => {
    const { ApiClientError } = await import("@markethub/api-client");
    replyMutate.mockImplementation(
      (_v: unknown, opts?: { onError?: (e: unknown) => void }) => {
        opts?.onError?.(new ApiClientError(404, { code: "REVIEW_NOT_FOUND", message: "Avaliação não encontrada" }));
      },
    );
    render(<Reviews />);
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    fireEvent.change(screen.getByPlaceholderText(/Escreva uma resposta/), {
      target: { value: "oi" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    await screen.findByText("Avaliação não encontrada");
  });
});
