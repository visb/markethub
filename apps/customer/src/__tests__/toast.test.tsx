import React from "react";
import renderer, { act } from "react-test-renderer";
import { ToastProvider, useToast } from "../components/Toast";

/**
 * Story 31: toast leve do app cliente. Valida que `show` exibe a mensagem e que
 * ela some sozinha após o auto-dismiss (timer falso). `useToast` fora do provider
 * lança.
 */

jest.useFakeTimers();

let showFn: ((msg: string, ms?: number) => void) | null = null;

function Probe() {
  const toast = useToast();
  showFn = toast.show;
  return null;
}

function render() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
  });
  return tree;
}

afterEach(() => {
  showFn = null;
  jest.clearAllTimers();
});

describe("Toast (story 31)", () => {
  it("show exibe a mensagem", () => {
    const tree = render();
    act(() => { showFn!("Adicionado ✓"); });
    expect(JSON.stringify(tree.toJSON())).toContain("Adicionado ✓");
  });

  it("auto-dismiss remove a mensagem depois do timer", () => {
    const tree = render();
    act(() => { showFn!("Adicionado ✓"); });
    expect(JSON.stringify(tree.toJSON())).toContain("Adicionado ✓");
    // auto-dismiss (2000ms) + fade-out (150ms) limpa a mensagem.
    act(() => { jest.advanceTimersByTime(2000 + 150); });
    expect(JSON.stringify(tree.toJSON() ?? {})).not.toContain("Adicionado ✓");
  });

  it("useToast fora do provider lança", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    function Orphan() {
      useToast();
      return null;
    }
    expect(() => renderer.create(<Orphan />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
