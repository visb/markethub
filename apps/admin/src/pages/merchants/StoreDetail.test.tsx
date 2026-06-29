import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoreDetail } from "./StoreDetail";

/**
 * Detalhe da loja (admin): abas Produtos / Pedidos / Funcionários / Dados.
 * Cobre edição de ofertas/estoque com lock, paginação, drawer de pedido,
 * CRUD de funcionários, edição de dados (phone/allowsPickup), horário de
 * funcionamento (story 29: render + save por dia) e slots. ApiClient mockado.
 */
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useParams: () => ({ storeId: "s1" }) };
});

let request: ReturnType<typeof vi.fn>;
const apiStub = {
  request: (...args: unknown[]) => (request as unknown as (...a: unknown[]) => unknown)(...args),
};
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: apiStub }),
}));

const STORE = {
  id: "s1",
  name: "Loja Centro",
  externalId: "ERP-1",
  street: "Rua A",
  number: "10",
  district: "Centro",
  city: "São Paulo",
  state: "SP",
  zipCode: "01000-000",
  latitude: -23.5,
  longitude: -46.6,
  phone: "11999990000",
  allowsPickup: true,
  avgPrepMinutes: 30,
  active: true,
  merchant: { id: "m1", name: "Rede Boa Compra" },
  hours: [{ id: "h1", dayOfWeek: 1, opensAt: 480, closesAt: 1320 }],
  counts: { offers: 10, staff: 3, slots: 2, ordersByStatus: { paid: 4, delivered: 6 } },
};

const OFFERS = {
  items: [
    {
      id: "o1",
      product: { id: "p1", name: "Leite", brand: "Boa Vaca" },
      priceCents: 599,
      promoPriceCents: 499,
      available: true,
      lockedFields: ["priceCents"],
      stock: { id: "k1", quantity: 12, available: true },
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
};

const ORDERS = {
  items: [
    {
      id: "order123456789",
      status: "paid",
      totalCents: 5000,
      createdAt: "2026-06-01T10:00:00Z",
      customer: "Cliente Um",
      paymentStatus: "paid",
      refundCents: 0,
      fulfillments: ["delivery"],
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
  statusCounts: { paid: 1 },
};

const ORDER_DETAIL = {
  id: "order123456789",
  status: "paid",
  totalCents: 5000,
  createdAt: "2026-06-01T10:00:00Z",
  user: { name: "Cliente Um", email: "cliente@x.com" },
  payment: { status: "paid", method: "pix" },
  refund: { amountCents: 1000, status: "done" },
  groups: [
    {
      id: "g1",
      fulfillment: "delivery",
      status: "preparing",
      store: { name: "Loja Centro" },
      merchant: { name: "Rede Boa Compra" },
      items: [{ id: "i1", nameSnapshot: "Leite", quantity: 2 }],
      delivery: { status: "assigned", driver: { name: "Zé" } },
      pickTask: { status: "queued" },
    },
  ],
};

const STAFF = [
  {
    id: "st1",
    staffRole: "picker",
    active: true,
    user: { id: "u1", name: "Maria", email: "maria@x.com", active: true },
  },
];

const OPERATIONS = {
  picking: { queued: 2, picking: 1 },
  deliveries: { unassigned: 1 },
  pendingPickups: 3,
  sla: { oldestQueuedPickMin: 12, oldestUnassignedDeliveryMin: null },
};

const SLOTS = [
  { id: "sl1", start: "2026-06-10T10:00:00Z", end: "2026-06-10T12:00:00Z", capacity: 5, reserved: 0 },
  { id: "sl2", start: "2026-06-11T10:00:00Z", end: "2026-06-11T12:00:00Z", capacity: 5, reserved: 2 },
];

function routeFor(path: string): unknown {
  if (path.startsWith("/admin/stores/s1/offers")) return OFFERS;
  if (path.startsWith("/admin/stores/s1/staff")) return STAFF;
  if (path.startsWith("/admin/dashboard/orders/")) return ORDER_DETAIL;
  if (path.startsWith("/admin/dashboard/orders")) return ORDERS;
  if (path.startsWith("/admin/dashboard/operations")) return OPERATIONS;
  if (path.startsWith("/store/slots")) return SLOTS;
  if (path.startsWith("/admin/stores/s1")) return STORE;
  return {};
}

function renderStore() {
  return render(
    <MemoryRouter>
      <StoreDetail />
    </MemoryRouter>,
  );
}

describe("StoreDetail", () => {
  beforeEach(() => {
    request = vi.fn((path: string) => Promise.resolve(routeFor(path)));
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("renderiza cabeçalho, endereço e abre na aba Produtos", async () => {
    renderStore();
    await screen.findByRole("heading", { name: "Loja Centro" });
    expect(screen.getByText("ativa")).toBeInTheDocument();
    expect(screen.getByText("Rua A, 10, Centro, São Paulo, SP")).toBeInTheDocument();
    await screen.findByText("Leite");
  });

  it("aba Produtos: salva preço (PATCH) e destrava campo travado (DELETE lock)", async () => {
    renderStore();
    const priceInput = await screen.findByDisplayValue("5.99");
    fireEvent.change(priceInput, { target: { value: "6.50" } });
    fireEvent.blur(priceInput);
    await waitFor(() => {
      const patch = request.mock.calls.find(
        (c) => c[1]?.method === "PATCH" && String(c[0]).includes("/admin/stores/offers/o1"),
      );
      expect(patch![1].body).toEqual({ priceCents: 650 });
    });
    // priceCents está travado → botão de cadeado dispara DELETE
    fireEvent.click(screen.getAllByTitle(/destravar/i)[0]);
    await waitFor(() => {
      const del = request.mock.calls.find(
        (c) => c[1]?.method === "DELETE" && String(c[0]).includes("/locks/priceCents"),
      );
      expect(del).toBeTruthy();
    });
  });

  it("aba Produtos: alterna disponibilidade e edita estoque", async () => {
    renderStore();
    await screen.findByText("Leite");
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => {
      const patch = request.mock.calls.find(
        (c) => c[1]?.method === "PATCH" && c[1]?.body && "available" in c[1].body,
      );
      expect(patch![1].body).toEqual({ available: false });
    });
    const qty = screen.getByDisplayValue("12");
    fireEvent.change(qty, { target: { value: "20" } });
    fireEvent.blur(qty);
    await waitFor(() => {
      const patch = request.mock.calls.find(
        (c) => c[1]?.method === "PATCH" && String(c[0]).includes("/stocks/k1"),
      );
      expect(patch![1].body).toEqual({ quantity: 20 });
    });
  });

  it("aba Produtos: busca dispara nova carga com search", async () => {
    renderStore();
    await screen.findByText("Leite");
    fireEvent.change(screen.getByPlaceholderText("Buscar produto…"), {
      target: { value: "leite" },
    });
    await waitFor(() => {
      const hit = request.mock.calls.find((c) => String(c[0]).includes("search=leite"));
      expect(hit).toBeTruthy();
    });
  });

  it("aba Pedidos: lista pedidos e abre o drawer de detalhe", async () => {
    renderStore();
    await screen.findByRole("heading", { name: "Loja Centro" });
    fireEvent.click(screen.getByRole("button", { name: "Pedidos" }));
    const row = await screen.findByText("Cliente Um");
    fireEvent.click(row);
    // drawer carrega detalhe
    await screen.findByText(/cliente@x\.com/);
    expect(screen.getByText(/Reembolso:/)).toBeInTheDocument();
    expect(screen.getByText(/Leite/, { selector: "li" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByText(/cliente@x\.com/)).not.toBeInTheDocument());
  });

  it("aba Funcionários: alterna vínculo, remove e cria funcionário", async () => {
    renderStore();
    await screen.findByRole("heading", { name: "Loja Centro" });
    fireEvent.click(screen.getByRole("button", { name: "Funcionários" }));
    await screen.findByText("Maria");

    // alternar ativo
    fireEvent.click(screen.getByRole("button", { name: "ativo" }));
    await waitFor(() => {
      const patch = request.mock.calls.find(
        (c) => c[1]?.method === "PATCH" && String(c[0]).includes("/staff/st1/active"),
      );
      expect(patch![1].body).toEqual({ active: false });
    });

    // remover
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    await waitFor(() => {
      const del = request.mock.calls.find(
        (c) => c[1]?.method === "DELETE" && String(c[0]).endsWith("/staff/st1"),
      );
      expect(del).toBeTruthy();
    });

    // novo funcionário
    fireEvent.click(screen.getByRole("button", { name: "+ Novo funcionário" }));
    fireEvent.change(screen.getByPlaceholderText("Nome"), { target: { value: "João" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "joao@x.com" } });
    fireEvent.change(screen.getByPlaceholderText("Senha (mín. 8)"), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() => {
      const post = request.mock.calls.find(
        (c) => c[1]?.method === "POST" && String(c[0]) === "/admin/users",
      );
      expect(post![1].body).toMatchObject({ name: "João", staffRole: "picker", storeId: "s1" });
    });
  });

  it("aba Funcionários: filtra por busca", async () => {
    renderStore();
    await screen.findByRole("heading", { name: "Loja Centro" });
    fireEvent.click(screen.getByRole("button", { name: "Funcionários" }));
    await screen.findByText("Maria");
    fireEvent.change(screen.getByPlaceholderText("Buscar nome/email…"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("Nenhum funcionário.")).toBeInTheDocument();
  });

  it("aba Dados: mostra telefone/retirada, operação e pedidos por status", async () => {
    renderStore();
    await screen.findByRole("heading", { name: "Loja Centro" });
    fireEvent.click(screen.getByRole("button", { name: "Dados" }));
    await screen.findByText("Telefone: 11999990000");
    expect(screen.getByText("Retirada na loja: permitida")).toBeInTheDocument();
    expect(screen.getByText(/queued: 2/)).toBeInTheDocument();
    expect(screen.getByText(/paid: 4/)).toBeInTheDocument();
  });

  it("aba Dados: edita a loja (phone/allowsPickup) e salva via PATCH", async () => {
    renderStore();
    await screen.findByRole("heading", { name: "Loja Centro" });
    fireEvent.click(screen.getByRole("button", { name: "Dados" }));
    await screen.findByText("Telefone: 11999990000");

    const lojaCard = screen.getByRole("heading", { name: "Loja" }).closest("section")!;
    fireEvent.click(within(lojaCard).getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByPlaceholderText("Telefone/WhatsApp"), {
      target: { value: "1188887777" },
    });
    fireEvent.click(screen.getByLabelText("Permite retirada na loja"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => {
      const patch = request.mock.calls.find(
        (c) =>
          c[1]?.method === "PATCH" &&
          String(c[0]) === "/admin/stores/s1" &&
          c[1]?.body?.phone === "1188887777",
      );
      expect(patch![1].body).toMatchObject({
        phone: "1188887777",
        allowsPickup: false,
        latitude: -23.5,
        avgPrepMinutes: 30,
      });
    });
  });

  it("aba Dados: ativar/desativar loja chama PATCH /active", async () => {
    renderStore();
    await screen.findByRole("heading", { name: "Loja Centro" });
    fireEvent.click(screen.getByRole("button", { name: "Dados" }));
    await screen.findByText("Telefone: 11999990000");
    fireEvent.click(screen.getByRole("button", { name: "Desativar loja" }));
    await waitFor(() => {
      const patch = request.mock.calls.find(
        (c) => c[1]?.method === "PATCH" && String(c[0]) === "/admin/stores/s1/active",
      );
      expect(patch![1].body).toEqual({ active: false });
    });
  });

  it("HoursSection (story 29): pré-popula a segunda e salva PUT por dia da semana", async () => {
    renderStore();
    await screen.findByRole("heading", { name: "Loja Centro" });
    fireEvent.click(screen.getByRole("button", { name: "Dados" }));
    await screen.findByRole("heading", { name: "Horário de funcionamento" });

    const hoursTable = screen
      .getByRole("heading", { name: "Horário de funcionamento" })
      .closest("section")!;

    // segunda (dia 1) veio do store.hours → aberto, 08:00 / 22:00
    const segundaRow = within(hoursTable).getByText("Segunda").closest("tr")!;
    expect(within(segundaRow).getByRole("checkbox")).toBeChecked();
    expect(within(segundaRow).getByDisplayValue("08:00")).toBeInTheDocument();
    expect(within(segundaRow).getByDisplayValue("22:00")).toBeInTheDocument();

    // abre o domingo (dia 0) e mantém o padrão 08:00 / 22:00
    const checkboxes = within(hoursTable).getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]); // marca domingo como aberto

    fireEvent.click(screen.getByRole("button", { name: "Salvar horário" }));
    await waitFor(() => {
      const put = request.mock.calls.find(
        (c) => c[1]?.method === "PUT" && String(c[0]).includes("/hours"),
      );
      const hours = put![1].body.hours as { dayOfWeek: number; opensAt: number; closesAt: number }[];
      // segunda preservada + domingo recém-aberto
      expect(hours.find((h) => h.dayOfWeek === 1)).toMatchObject({ opensAt: 480, closesAt: 1320 });
      expect(hours.find((h) => h.dayOfWeek === 0)).toMatchObject({ opensAt: 480, closesAt: 1320 });
    });
    await screen.findByText("Horário salvo.");
  });

  it("SlotsSection: lista slots, cria e remove", async () => {
    renderStore();
    await screen.findByRole("heading", { name: "Loja Centro" });
    fireEvent.click(screen.getByRole("button", { name: "Dados" }));
    await screen.findByRole("heading", { name: "Slots de entrega" });

    const slotsCard = screen
      .getByRole("heading", { name: "Slots de entrega" })
      .closest("section")!;
    const dtInputs = slotsCard.querySelectorAll('input[type="datetime-local"]');
    fireEvent.change(dtInputs[0], { target: { value: "2026-06-20T10:00" } });
    fireEvent.change(dtInputs[1], { target: { value: "2026-06-20T12:00" } });
    fireEvent.click(within(slotsCard).getByRole("button", { name: "+ Slot" }));
    await waitFor(() => {
      const post = request.mock.calls.find(
        (c) => c[1]?.method === "POST" && String(c[0]) === "/store/slots",
      );
      expect(post![1].body).toMatchObject({ storeId: "s1", capacity: 5 });
    });

    // remover: o primeiro slot (reserved 0) tem botão habilitado
    const removeBtns = within(slotsCard).getAllByRole("button", { name: "Remover" });
    expect(removeBtns[1]).toBeDisabled(); // reserved > 0
    fireEvent.click(removeBtns[0]);
    await waitFor(() => {
      const del = request.mock.calls.find(
        (c) => c[1]?.method === "DELETE" && String(c[0]).includes("/store/slots/sl1"),
      );
      expect(del).toBeTruthy();
    });
  });
});
