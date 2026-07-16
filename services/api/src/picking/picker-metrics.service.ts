import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Janelas fixas das métricas do separador — mesma convenção da story 60 (ganhos do driver). */
export type PickerMetricsPeriod = "today" | "7d" | "30d";

/**
 * Início da janela do período. `today` = 00:00 do dia corrente (hora do servidor);
 * `7d`/`30d` = agora menos N dias. Exportado para teste direto do recorte.
 */
export function metricsPeriodStart(period: PickerMetricsPeriod, now: Date = new Date()): Date {
  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  const days = period === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** Forma mínima de uma task CONCLUÍDA (readyAt no período) para computar métricas. */
export interface CompletedPickTaskShape {
  startedAt: Date | null;
  packedAt: Date | null;
  items: { status: string }[];
}

export interface PickerMetrics {
  /** Tarefas concluídas (readyAt no período). */
  tasksCompleted: number;
  /** Itens efetivamente separados (status picked). */
  itemsPicked: number;
  /** Itens separados ÷ horas ativas (packedAt − startedAt); null sem tempo ativo. */
  itemsPerHour: number | null;
  /** substituted ÷ total de itens (fração 0..1); null com zero itens. */
  substitutionRate: number | null;
  /** refused ÷ total de itens (fração 0..1); null com zero itens. */
  refusalRate: number | null;
}

const MS_PER_HOUR = 60 * 60 * 1000;

/** Arredonda mantendo `null` (nunca NaN no contrato). */
function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Agregação pura das métricas de separação (story 65) — compartilhada entre o
 * endpoint do picker (`picking/metrics/me`) e o relatório por colaborador do
 * merchant (via barrel público do contexto fulfillment).
 *
 * Regras travadas no plano:
 * - itens/hora = itens separados ÷ soma(packedAt − startedAt) das tasks concluídas;
 *   task sem `startedAt`/`packedAt` fica FORA do cálculo (numerador e divisor).
 *   Divisor zero → `null` (nunca NaN/Infinity).
 * - taxas = substituted|refused ÷ total de itens das tasks concluídas; zero
 *   itens → `null` (sem divisão por zero).
 */
export function computePickerMetrics(tasks: CompletedPickTaskShape[]): PickerMetrics {
  let itemsTotal = 0;
  let itemsPicked = 0;
  let substituted = 0;
  let refused = 0;
  let activeMs = 0;
  let itemsPickedTimed = 0;

  for (const task of tasks) {
    const statuses = task.items.map((i) => i.status);
    const pickedHere = statuses.filter((s) => s === "picked").length;
    itemsTotal += statuses.length;
    itemsPicked += pickedHere;
    substituted += statuses.filter((s) => s === "substituted").length;
    refused += statuses.filter((s) => s === "refused").length;

    if (task.startedAt && task.packedAt && task.packedAt.getTime() > task.startedAt.getTime()) {
      activeMs += task.packedAt.getTime() - task.startedAt.getTime();
      itemsPickedTimed += pickedHere;
    }
  }

  return {
    tasksCompleted: tasks.length,
    itemsPicked,
    itemsPerHour: activeMs > 0 ? round(itemsPickedTimed / (activeMs / MS_PER_HOUR), 1) : null,
    substitutionRate: itemsTotal > 0 ? round(substituted / itemsTotal, 4) : null,
    refusalRate: itemsTotal > 0 ? round(refused / itemsTotal, 4) : null,
  };
}

/**
 * Métricas próprias do separador (story 65). Só leitura, escopo SEMPRE pelo
 * `pickerId` do usuário autenticado — um picker nunca vê números de outro.
 * Período filtra por `readyAt` (tarefa concluída dentro da janela).
 */
@Injectable()
export class PickerMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async myMetrics(userId: string, period: PickerMetricsPeriod) {
    const start = metricsPeriodStart(period);
    const tasks = await this.prisma.pickTask.findMany({
      where: { pickerId: userId, readyAt: { gte: start } },
      select: {
        startedAt: true,
        packedAt: true,
        items: { select: { status: true } },
      },
    });
    return { period, ...computePickerMetrics(tasks) };
  }
}
