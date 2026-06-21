import React from "react";
import renderer, { act } from "react-test-renderer";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

/**
 * Story 03: util de debounce do autocomplete de substituto. Fake timers — só
 * emite após o atraso; digitação rápida cancela o valor intermediário.
 */

function renderDebounced(initial: string, delay: number) {
  const result: { current: string | null } = { current: null };
  const setRef: { current: ((v: string) => void) | null } = { current: null };
  function Probe() {
    const [value, setValue] = React.useState(initial);
    setRef.current = setValue;
    result.current = useDebouncedValue(value, delay);
    return null;
  }
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe />);
  });
  return {
    result,
    setValue: (v: string) => act(() => setRef.current!(v)),
    unmount: () => act(() => tree!.unmount()),
  };
}

describe("useDebouncedValue", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("retorna o valor inicial imediatamente", () => {
    const { result, unmount } = renderDebounced("ab", 300);
    expect(result.current).toBe("ab");
    unmount();
  });

  it("só emite o novo valor após o atraso", () => {
    const { result, setValue, unmount } = renderDebounced("a", 300);
    setValue("arroz");
    // ainda não passou o atraso
    expect(result.current).toBe("a");
    act(() => jest.advanceTimersByTime(299));
    expect(result.current).toBe("a");
    act(() => jest.advanceTimersByTime(1));
    expect(result.current).toBe("arroz");
    unmount();
  });

  it("digitação rápida cancela o valor intermediário", () => {
    const { result, setValue, unmount } = renderDebounced("a", 300);
    setValue("ar");
    act(() => jest.advanceTimersByTime(100));
    setValue("arr");
    act(() => jest.advanceTimersByTime(100));
    setValue("arroz");
    // só passou 200ms desde a última tecla; nenhum valor intermediário emitido
    act(() => jest.advanceTimersByTime(200));
    expect(result.current).toBe("a");
    // completa o atraso a partir da última tecla
    act(() => jest.advanceTimersByTime(100));
    expect(result.current).toBe("arroz");
    unmount();
  });
});
