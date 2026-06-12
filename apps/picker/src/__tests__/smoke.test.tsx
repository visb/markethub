import React from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { APP_ROLE } from "@/config";

describe("infra jest-expo (picker)", () => {
  it("renderiza componente React Native", () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Text>MarketHub Separador</Text>);
    });
    expect(tree!.toJSON()).toBeTruthy();
    act(() => tree!.unmount());
  });

  it("resolve alias @/ do app", () => {
    expect(APP_ROLE).toBe("picker");
  });
});
