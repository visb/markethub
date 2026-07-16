import { describe, expect, it } from "vitest";
import {
  createVehicleInputSchema,
  merchantRoleSchema,
  pickersReportSchema,
  staffRoleSchema,
  vehicleSchema,
  vehicleTypeSchema,
} from "./merchant";

/**
 * Contratos zod do app merchant (stories 10/14/16). Garante que os enums/objetos
 * compartilhados aceitam o payload válido e rejeitam o inválido — os mesmos
 * schemas são usados pelos apps e espelham os DTOs da API.
 */
describe("merchantRoleSchema (hierarquia owner > admin > manager)", () => {
  it("aceita os três níveis e rejeita desconhecido", () => {
    for (const r of ["owner", "admin", "manager"]) {
      expect(merchantRoleSchema.safeParse(r).success).toBe(true);
    }
    expect(merchantRoleSchema.safeParse("picker").success).toBe(false);
  });
});

describe("staffRoleSchema (StoreStaff)", () => {
  it("aceita admin|manager|picker|driver e rejeita o resto", () => {
    for (const r of ["admin", "manager", "picker", "driver"]) {
      expect(staffRoleSchema.safeParse(r).success).toBe(true);
    }
    expect(staffRoleSchema.safeParse("owner").success).toBe(false);
  });
});

describe("vehicleTypeSchema", () => {
  it("aceita motorcycle|car|van", () => {
    for (const t of ["motorcycle", "car", "van"]) {
      expect(vehicleTypeSchema.safeParse(t).success).toBe(true);
    }
    expect(vehicleTypeSchema.safeParse("truck").success).toBe(false);
  });
});

describe("vehicleSchema", () => {
  it("valida o veículo completo da frota", () => {
    const ok = vehicleSchema.safeParse({
      id: "v1",
      merchantId: "m1",
      plate: "ABC1D23",
      type: "car",
      description: null,
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(ok.success).toBe(true);
  });

  it("rejeita tipo fora do enum", () => {
    expect(
      vehicleSchema.safeParse({
        id: "v1",
        merchantId: "m1",
        plate: "ABC1D23",
        type: "truck",
        description: null,
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});

describe("createVehicleInputSchema", () => {
  it("exige plate + type; merchantId/description/active opcionais", () => {
    expect(createVehicleInputSchema.safeParse({ plate: "ABC1D23", type: "van" }).success).toBe(true);
    expect(
      createVehicleInputSchema.safeParse({
        plate: "ABC1D23",
        type: "van",
        description: "Fiorino",
        active: false,
        merchantId: "m1",
      }).success,
    ).toBe(true);
    expect(createVehicleInputSchema.safeParse({ type: "van" }).success).toBe(false);
  });
});

describe("pickersReportSchema (story 65)", () => {
  it("aceita linhas com métricas numéricas ou null (sem dado)", () => {
    const ok = pickersReportSchema.safeParse({
      period: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-16T00:00:00.000Z" },
      rows: [
        {
          pickerId: "u1",
          name: "Ana",
          tasksCompleted: 3,
          itemsPicked: 27,
          itemsPerHour: 18.5,
          substitutionRate: 0.1,
          refusalRate: 0,
        },
        {
          pickerId: "u2",
          name: "Beto",
          tasksCompleted: 0,
          itemsPicked: 0,
          itemsPerHour: null,
          substitutionRate: null,
          refusalRate: null,
        },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("rejeita taxa não numérica (NaN serializado como string)", () => {
    const bad = pickersReportSchema.safeParse({
      period: { from: "a", to: "b" },
      rows: [
        {
          pickerId: "u1",
          name: "Ana",
          tasksCompleted: 1,
          itemsPicked: 1,
          itemsPerHour: 1,
          substitutionRate: "NaN",
          refusalRate: 0,
        },
      ],
    });
    expect(bad.success).toBe(false);
  });
});
