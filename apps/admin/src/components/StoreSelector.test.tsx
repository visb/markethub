import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StoreSelector } from "./StoreSelector";

/** Seletor de loja: oculto com ≤1 loja; emite onChange com a loja selecionada. */
const STORES = [
  { id: "s1", name: "Centro" },
  { id: "s2", name: "Sul" },
] as Parameters<typeof StoreSelector>[0]["stores"];

describe("StoreSelector", () => {
  it("não renderiza nada quando há 0 ou 1 loja", () => {
    const { container } = render(
      <StoreSelector stores={STORES.slice(0, 1)} value={undefined} onChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renderiza as opções e emite onChange ao selecionar", () => {
    const onChange = vi.fn();
    render(<StoreSelector stores={STORES} value="s1" onChange={onChange} />);
    expect(screen.getByText("Centro")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "s2" } });
    expect(onChange).toHaveBeenCalledWith("s2");
  });
});
