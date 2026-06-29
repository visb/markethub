import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * Autenticação OPCIONAL: roda a estratégia JWT como o guard padrão, mas nunca
 * bloqueia — token ausente/inválido apenas deixa `req.user` indefinido em vez de
 * lançar 401. Usado em rotas públicas que personalizam a resposta para o usuário
 * logado (ex.: `following` nas sections da loja — story 34).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
  override handleRequest<TUser>(_err: unknown, user: TUser): TUser {
    return (user || undefined) as TUser;
  }
}
