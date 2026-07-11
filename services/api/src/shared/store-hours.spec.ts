import {
  closureDateISO,
  isOpenAt,
  isStoreOpen,
  nextOpening,
  saoPauloNow,
  todayHours,
} from "./store-hours";

// Horário semanal de referência: seg 8h–22h (480–1320) e dom 8h–20h (480–1200).
const HOURS = [
  { dayOfWeek: 1, opensAt: 480, closesAt: 1320 },
  { dayOfWeek: 0, opensAt: 480, closesAt: 1200 },
];

// 2026-06-28 é domingo; 12:00Z → 09:00 em São Paulo (dentro de 8h–20h).
const SUN_0900 = new Date("2026-06-28T12:00:00Z");
// 2026-06-28 23:00Z → 20:00 São Paulo (== closesAt, exclusivo) → fechado.
const SUN_2000 = new Date("2026-06-28T23:00:00Z");

describe("saoPauloNow", () => {
  it("converte UTC → dia/minuto/data em America/Sao_Paulo", () => {
    const r = saoPauloNow(SUN_0900);
    expect(r.dayOfWeek).toBe(0);
    expect(r.minuteOfDay).toBe(9 * 60);
    expect(r.dateISO).toBe("2026-06-28");
  });
});

describe("closureDateISO", () => {
  it("normaliza Date @db.Date → YYYY-MM-DD", () => {
    expect(closureDateISO(new Date("2026-06-28T00:00:00Z"))).toBe("2026-06-28");
  });
  it("normaliza string ISO → YYYY-MM-DD", () => {
    expect(closureDateISO("2026-06-28")).toBe("2026-06-28");
  });
});

describe("isOpenAt (horário semanal)", () => {
  it("dentro da janela → aberto; abertura inclusiva, fechamento exclusivo", () => {
    expect(isOpenAt(HOURS, 0, 480)).toBe(true);
    expect(isOpenAt(HOURS, 0, 1200)).toBe(false);
  });
  it("dia sem linha → fechado", () => {
    expect(isOpenAt(HOURS, 3, 600)).toBe(false);
  });
});

describe("isStoreOpen (horário + fechamento excepcional)", () => {
  it("dentro do horário e sem fechamento → aberto", () => {
    expect(isStoreOpen(HOURS, [], SUN_0900)).toBe(true);
  });
  it("fora do horário → fechado", () => {
    expect(isStoreOpen(HOURS, [], SUN_2000)).toBe(false);
  });
  it("fechamento excepcional no dia fecha o dia inteiro (mesmo dentro do horário)", () => {
    expect(isStoreOpen(HOURS, ["2026-06-28"], SUN_0900)).toBe(false);
  });
  it("fechamento em outro dia não afeta hoje", () => {
    expect(isStoreOpen(HOURS, ["2026-06-27"], SUN_0900)).toBe(true);
  });
  it("aceita Date @db.Date como fechamento", () => {
    expect(isStoreOpen(HOURS, [new Date("2026-06-28T00:00:00Z")], SUN_0900)).toBe(false);
  });
});

describe("todayHours", () => {
  it("devolve a faixa de hoje quando aberto no dia", () => {
    expect(todayHours(HOURS, [], SUN_0900)).toEqual({ opensAt: 480, closesAt: 1200 });
  });
  it("null quando há fechamento excepcional hoje", () => {
    expect(todayHours(HOURS, ["2026-06-28"], SUN_0900)).toBeNull();
  });
  it("null quando hoje é folga (sem linha)", () => {
    const onlyMonday = [{ dayOfWeek: 1, opensAt: 480, closesAt: 1320 }];
    expect(todayHours(onlyMonday, [], SUN_0900)).toBeNull();
  });
});

describe("nextOpening", () => {
  it("hoje ainda vai abrir → devolve a abertura de hoje (daysAhead 0)", () => {
    // sábado 2026-06-27 06:00 São Paulo (antes de abrir domingo? use domingo pré-abertura)
    const sunEarly = new Date("2026-06-28T09:00:00Z"); // 06:00 São Paulo, antes de 8h
    expect(nextOpening(HOURS, [], sunEarly)).toEqual({ dayOfWeek: 0, opensAt: 480, daysAhead: 0 });
  });
  it("já abriu hoje → pula p/ o próximo dia com horário", () => {
    // domingo 09:00 já abriu; próximo é segunda (dayOfWeek 1)
    expect(nextOpening(HOURS, [], SUN_0900)).toEqual({ dayOfWeek: 1, opensAt: 480, daysAhead: 1 });
  });
  it("pula datas com fechamento excepcional", () => {
    // domingo 06-28 já abriu; segunda 06-29 tem fechamento → pulada; próximo dia
    // com horário e sem fechamento é o domingo seguinte (07-05, daysAhead 7).
    const next = nextOpening(HOURS, ["2026-06-29"], SUN_0900);
    expect(next).toEqual({ dayOfWeek: 0, opensAt: 480, daysAhead: 7 });
  });
  it("null quando fechamentos cobrem toda a janela de 7 dias", () => {
    const closures = Array.from({ length: 8 }, (_, i) => {
      const d = new Date("2026-06-28T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
    expect(nextOpening(HOURS, closures, SUN_0900)).toBeNull();
  });
  it("sem nenhum horário → null", () => {
    expect(nextOpening([], [], SUN_0900)).toBeNull();
  });
});
