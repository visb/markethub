import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { MeController } from "./me.controller";
import { ChangePasswordDto, UpdateMeDto } from "./dto/me.dto";
import type { MeService } from "./me.service";

/**
 * Story 70: controller fino de users/me (delegação) + validação/normalização dos
 * DTOs (phone normalizado só-dígitos no DTO; inválido nega; senha nova min 8).
 */

describe("MeController (delegação)", () => {
  const me = {
    updateProfile: jest.fn().mockResolvedValue({ id: "u1" }),
    changePassword: jest.fn().mockResolvedValue({ ok: true, revokedSessions: 1 }),
  };
  const ctrl = new MeController(me as unknown as MeService);
  const user = { id: "u1", email: "a@b.com", roles: ["customer" as const], sessionId: "sess-1" };

  it("PATCH delega com name/phone do DTO", async () => {
    const dto = new UpdateMeDto();
    dto.name = "Ana";
    dto.phone = "41999991234";
    await ctrl.update(user, dto);
    expect(me.updateProfile).toHaveBeenCalledWith("u1", { name: "Ana", phone: "41999991234" });
  });

  it("POST password delega com a sessão corrente (claim sid)", async () => {
    const dto = new ChangePasswordDto();
    dto.currentPassword = "atual";
    dto.newPassword = "nova-senha-1";
    await ctrl.changePassword(user, dto);
    expect(me.changePassword).toHaveBeenCalledWith("u1", "sess-1", dto);
  });
});

describe("UpdateMeDto (validação/normalização)", () => {
  async function check(body: Record<string, unknown>) {
    const dto = plainToInstance(UpdateMeDto, body);
    const errors = await validate(dto, { whitelist: true });
    return { dto, errors };
  }

  it("body vazio é válido (PATCH parcial)", async () => {
    const { errors } = await check({});
    expect(errors).toHaveLength(0);
  });

  it("phone formatado é normalizado só-dígitos no DTO", async () => {
    const { dto, errors } = await check({ phone: "(41) 99999-1234" });
    expect(errors).toHaveLength(0);
    expect(dto.phone).toBe("41999991234");
  });

  it("phone com 10 dígitos (fixo) é válido", async () => {
    const { errors } = await check({ phone: "4133334444" });
    expect(errors).toHaveLength(0);
  });

  it("phone inválido nega: curto, longo ou sem dígitos", async () => {
    expect((await check({ phone: "419999" })).errors.length).toBeGreaterThan(0);
    expect((await check({ phone: "419999912345" })).errors.length).toBeGreaterThan(0);
    expect((await check({ phone: "abc" })).errors.length).toBeGreaterThan(0);
  });

  it("phone null é aceito (limpa o telefone)", async () => {
    const { dto, errors } = await check({ phone: null });
    expect(errors).toHaveLength(0);
    expect(dto.phone).toBeNull();
  });

  it("name vazio nega; name válido passa", async () => {
    expect((await check({ name: "" })).errors.length).toBeGreaterThan(0);
    expect((await check({ name: "Ana Maria" })).errors).toHaveLength(0);
  });
});

describe("ChangePasswordDto (validação)", () => {
  async function check(body: Record<string, unknown>) {
    return validate(plainToInstance(ChangePasswordDto, body));
  }

  it("senha nova min 8 (mesma política do registro)", async () => {
    expect(await check({ currentPassword: "x", newPassword: "curta" })).not.toHaveLength(0);
    expect(await check({ currentPassword: "x", newPassword: "nova-senha-1" })).toHaveLength(0);
  });

  it("senha atual obrigatória", async () => {
    expect(await check({ currentPassword: "", newPassword: "nova-senha-1" })).not.toHaveLength(0);
  });
});
