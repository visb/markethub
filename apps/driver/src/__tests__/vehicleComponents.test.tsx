import React from "react";
import renderer, { act } from "react-test-renderer";
import { ActivityIndicator, Pressable } from "react-native";
import type { DriverVehicleDTO } from "@markethub/api-client";
import { VehiclePicker } from "../components/VehiclePicker";
import { VehicleIndicator } from "../components/VehicleIndicator";

/**
 * Story 41: componentes de UI da seleção de veículo. A story 15 cobriu o hook e a
 * rota; aqui fechamos os branches restantes de UI (loading/erro/vazio/selecionado/
 * pendente no picker; com/sem veículo no indicador).
 */

const v1: DriverVehicleDTO = { id: "v1", plate: "ABC1D23", type: "car", description: "Gol" };
const v2: DriverVehicleDTO = { id: "v2", plate: "XYZ4E56", type: "motorcycle", description: null };

function render(node: React.ReactElement) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(node);
  });
  return tree!;
}

describe("VehiclePicker", () => {
  it("estado de carregando mostra o spinner", () => {
    const tree = render(<VehiclePicker vehicles={[]} loading onSelect={jest.fn()} />);
    expect(tree.root.findAllByType(ActivityIndicator).length).toBe(1);
  });

  it("estado de erro mostra a mensagem", () => {
    const tree = render(<VehiclePicker vehicles={[]} error="boom" onSelect={jest.fn()} />);
    expect(JSON.stringify(tree.toJSON())).toContain("boom");
  });

  it("lista vazia mostra aviso", () => {
    const tree = render(<VehiclePicker vehicles={[]} onSelect={jest.fn()} />);
    expect(JSON.stringify(tree.toJSON())).toContain("Nenhum veículo disponível");
  });

  it("renderiza veículos e marca o selecionado com ✓", () => {
    const tree = render(<VehiclePicker vehicles={[v1, v2]} selectedId="v1" onSelect={jest.fn()} />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("ABC1D23");
    expect(json).toContain("XYZ4E56");
    expect(json).toContain("✓");
    // description nula não acrescenta sufixo " · "
    expect(json).toContain("Gol");
  });

  it("toque numa linha dispara onSelect com o id", () => {
    const onSelect = jest.fn();
    const tree = render(<VehiclePicker vehicles={[v1, v2]} onSelect={onSelect} />);
    const rows = tree.root.findAllByType(Pressable);
    act(() => rows[0].props.onPress());
    expect(onSelect).toHaveBeenCalledWith("v1");
  });

  it("linha em seleção (pendingId) mostra spinner e desabilita as linhas", () => {
    const tree = render(<VehiclePicker vehicles={[v1, v2]} pendingId="v1" onSelect={jest.fn()} />);
    expect(tree.root.findAllByType(ActivityIndicator).length).toBe(1);
    const rows = tree.root.findAllByType(Pressable);
    expect(rows[0].props.disabled).toBe(true);
  });
});

describe("VehicleIndicator", () => {
  it("com veículo mostra placa e rótulo e o toque abre o seletor", () => {
    const onPress = jest.fn();
    const tree = render(<VehicleIndicator vehicle={v1} onPress={onPress} />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("ABC1D23");
    expect(json).toContain("Carro");
    act(() => tree.root.findByType(Pressable).props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("sem veículo convida a selecionar", () => {
    const tree = render(<VehicleIndicator vehicle={null} onPress={jest.fn()} />);
    expect(JSON.stringify(tree.toJSON())).toContain("Selecionar veículo");
  });
});
