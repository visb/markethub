import type { DriverVehicleTypeDTO } from "@markethub/api-client";

/** Rótulo e ícone (emoji) por tipo de veículo, para exibição no app. */
const VEHICLE_META: Record<DriverVehicleTypeDTO, { label: string; icon: string }> = {
  motorcycle: { label: "Moto", icon: "🏍️" },
  car: { label: "Carro", icon: "🚗" },
  van: { label: "Van", icon: "🚐" },
};

export function vehicleLabel(type: DriverVehicleTypeDTO): string {
  return VEHICLE_META[type]?.label ?? type;
}

export function vehicleIcon(type: DriverVehicleTypeDTO): string {
  return VEHICLE_META[type]?.icon ?? "🚙";
}
