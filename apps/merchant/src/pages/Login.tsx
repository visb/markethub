import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiClientError } from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";

const loginSchema = z.object({
  email: z.string().min(1, "Informe o e-mail").email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});
type LoginForm = z.infer<typeof loginSchema>;

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values.email.trim(), values.password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Falha ao entrar.");
    }
  });

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <h1 className="login-brand">MarketHub</h1>
        <p className="muted">Painel do mercado</p>
        <input
          className="input"
          type="email"
          placeholder="E-mail"
          autoComplete="username"
          {...register("email")}
        />
        {errors.email && <p className="error">{errors.email.message}</p>}
        <input
          className="input"
          type="password"
          placeholder="Senha"
          autoComplete="current-password"
          {...register("password")}
        />
        {errors.password && <p className="error">{errors.password.message}</p>}
        {error && <p className="error">{error}</p>}
        <button className="btn-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
