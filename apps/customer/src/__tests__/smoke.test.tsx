import React from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";

describe("infra jest-expo (customer)", () => {
  it("renderiza componente React Native", () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Text>MarketHub</Text>);
    });
    expect(tree!.toJSON()).toBeTruthy();
    act(() => tree!.unmount());
  });
});
