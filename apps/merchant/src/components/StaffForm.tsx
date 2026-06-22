import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { MerchantStoreDTO, StaffRoleName } from "@markethub/api-client";

/**
 * Formulário de novo colaborador (story 10) — react-hook-form + zod (CLAUDE.md).
 * As opções de papel são limitadas pelo chamador (`allowManager`): o gerente não
 * cadastra outro gerente. A loja vem do escopo do usuário (seletor).
 */
const ROLE_LABEL: Record<StaffRoleName, string> = {
  manager: "Gerente",
  picker: "Separador",
  driver: "Entregador",
};

const staffSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome"),
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(6, "Mínimo de 6 caracteres"),
  staffRole: z.enum(["manager", "picker", "driver"]),
  storeId: z.string().min(1, "Selecione a loja"),
});
export type StaffFormValues = z.infer<typeof staffSchema>;

export function StaffForm({
  stores,
  allowManager,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  stores: MerchantStoreDTO[];
  allowManager: boolean;
  onSubmit: (values: StaffFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
  error?: string | null;
}) {
  const roleOptions: StaffRoleName[] = allowManager
    ? ["manager", "picker", "driver"]
    : ["picker", "driver"];

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StaffFormValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      staffRole: roleOptions[0],
      storeId: stores[0]?.id ?? "",
    },
  });

  return (
    <form className="store-form" onSubmit={handleSubmit(onSubmit)}>
      <h2>Novo colaborador</h2>

      <label className="field">
        <span>Nome</span>
        <input className="input" {...register("name")} />
        {errors.name && <p className="error">{errors.name.message}</p>}
      </label>

      <label className="field">
        <span>E-mail</span>
        <input className="input" type="email" {...register("email")} />
        {errors.email && <p className="error">{errors.email.message}</p>}
      </label>

      <label className="field">
        <span>Senha provisória</span>
        <input className="input" type="password" {...register("password")} />
        {errors.password && <p className="error">{errors.password.message}</p>}
      </label>

      <div className="field-row">
        <label className="field">
          <span>Papel</span>
          <select className="input" {...register("staffRole")}>
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Loja</span>
          <select className="input" {...register("storeId")}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {errors.storeId && <p className="error">{errors.storeId.message}</p>}
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : "Cadastrar"}
        </button>
        <button className="btn-ghost" type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export { ROLE_LABEL };
