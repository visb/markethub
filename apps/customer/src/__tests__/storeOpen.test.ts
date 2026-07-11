import { minutesToHHMM, storeOpenLabel } from "../lib/storeOpen";

describe("storeOpen (story 52)", () => {
  it("minutesToHHMM formata com zero à esquerda", () => {
    expect(minutesToHHMM(480)).toBe("08:00");
    expect(minutesToHHMM(1290)).toBe("21:30");
    expect(minutesToHHMM(0)).toBe("00:00");
  });

  it("aberta com horário de hoje → 'Aberto · fecha às HH:MM'", () => {
    const label = storeOpenLabel({
      openNow: true,
      todayHours: { opensAt: 480, closesAt: 1290 },
      nextOpen: null,
    });
    expect(label).toBe("Aberto · fecha às 21:30");
  });

  it("aberta sem horário de hoje → 'Aberto'", () => {
    expect(storeOpenLabel({ openNow: true, todayHours: null, nextOpen: null })).toBe("Aberto");
  });

  it("fechada com abertura hoje → 'Fechado · abre às HH:MM'", () => {
    const label = storeOpenLabel(
      { openNow: false, todayHours: null, nextOpen: { dayOfWeek: 3, opensAt: 480 } },
      3,
    );
    expect(label).toBe("Fechado · abre às 08:00");
  });

  it("fechada com abertura em outro dia → 'Fechado · abre seg às HH:MM'", () => {
    const label = storeOpenLabel(
      { openNow: false, todayHours: null, nextOpen: { dayOfWeek: 1, opensAt: 540 } },
      0,
    );
    expect(label).toBe("Fechado · abre seg às 09:00");
  });

  it("fechada sem próxima abertura → 'Fechado'", () => {
    expect(storeOpenLabel({ openNow: false, todayHours: null, nextOpen: null })).toBe("Fechado");
  });
});
