# Plan: Explore — barra de endereço + marker da localização do usuário

## Context

App customer, aba **Explorar** (`apps/customer/app/explore.tsx`). Bloco do BACKLOG
"App customer" (segundo item; o primeiro virou a story 29). Depende da story 29
apenas por compartilhar a tela `explore` — sem dependência funcional.

Hoje a aba é só o mapa. Falta a **barra de endereço** no topo (como no
`briefing/screenshots/marketplace/Explorar.jpg`: pill "Minha localização atual" com
o endereço e um lápis de editar) e um **marker visualmente distinto** para a
localização do usuário no mapa.

Estado atual relevante:
- `useExploreMap` já expõe `destination` (coords do endereço de entrega ativo, via
  `useAddresses` → `selectActiveAddress`: default → primeiro).
- `MapView` (web `MapView.web.tsx` / nativo `MapView.tsx`) já renderiza um pin verde
  (`DEST_PIN`) nas coords do `destination`, popup "Endereço de entrega" — distinto
  dos pins vermelhos de loja, mas é um pino genérico.
- A tela `/delivery` (`apps/customer/app/delivery.tsx`) já é o picker/CRUD de
  endereços (lista, `AddressForm` CEP-first + GPS, definir default, excluir).

### Decisões travadas (refino interativo)

- **Barra mostra o endereço de entrega ativo** (default → primeiro). Tocar na pill
  **ou** no ícone de editar → navega para `/delivery` (picker/CRUD existente). Não
  há seleção inline nesta story.
- **Sem endereço ativo:** a pill vira um CTA **"Definir endereço"** que também leva
  a `/delivery`.
- **Marker da localização do usuário:** reaproveita o pin `destination` existente,
  mas com **visual distinto de "você está aqui"** (dot azul com halo), diferente
  tanto dos pins vermelhos de loja quanto do verde genérico atual. Aplicar nas duas
  engines (web divIcon + nativo).

## Desenho

Frontend-only (`apps/customer`) — sem backend, sem schema, sem novo endpoint.
Reusa `useAddresses` (já existe) e a tela `/delivery` (já existe).

### Barra de endereço

- Novo componente **`AddressBar`** (`src/components/AddressBar.tsx`): pill flutuante
  no topo da aba (sobre o mapa, dentro do `SafeAreaView` `top`). Recebe o endereço
  ativo e um `onPress`. Mostra rótulo "Minha localização atual" + `street, number`
  (ou label do endereço) + ícone de lápis. Sem endereço → texto "Definir endereço"
  com ícone de "+".
- **`explore.tsx`** renderiza `<AddressBar address={activeAddress} onPress={() => router.push('/delivery')} />`
  por cima do `StoreMap`. A tela só orquestra (sem fetch inline; o endereço vem do
  ViewModel).
- **`useExploreMap`** passa a expor `activeAddress` (já tem via `useAddresses`
  internamente) para a tela montar a barra — nenxuto, sem novo hook.

### Marker "você está aqui"

- **`MapView.web.tsx`**: novo `divIcon` para o usuário (dot azul `#2563EB` com halo
  translúcido + borda branca), substituindo o `DEST_PIN` verde no marker de
  `destination`. Popup "Você está aqui".
- **`MapView.tsx`** (nativo): marker de `destination` com o mesmo visual distinto
  (cor/ícone próprio via `pinColor`/`image` conforme o que o `react-native-maps`
  expõe no componente atual).
- Interface `StoreMapProps` **não muda** — `destination` continua sendo a fonte; só
  muda a renderização do marker.

## Validação

Gate de cobertura obrigatório (story **frontend-only**): **código novo sem teste
não fecha a story.** `pnpm --filter @markethub/customer test:coverage`. Sem
`skip`/`only`/`xfail` injustificado.

**Frontend (`apps/customer`):**
- `AddressBar`:
  - com endereço ativo → mostra "Minha localização atual" + `street/number`;
  - sem endereço ativo → mostra CTA "Definir endereço";
  - tocar a pill / o ícone de editar dispara `onPress`.
- `explore` screen:
  - renderiza a `AddressBar` sobre o mapa;
  - `onPress` da barra navega para `/delivery` (mock do `router.push`);
  - com/sem endereço ativo, a barra reflete o estado vindo do ViewModel.
- `MapView` (web): o marker de `destination` usa o ícone "você está aqui" (distinto
  do pino de loja); ausência de `destination` → sem marker do usuário.

Encerrar com `pnpm typecheck` + `pnpm build`.

## Fora de escopo

- Seleção/troca de endereço **inline** (bottom sheet) — a edição acontece em
  `/delivery`. Pode virar refino posterior.
- Mudar a fonte do `destination` (continua sendo o endereço de entrega ativo; não é
  a posição de GPS ao vivo).
- Recentralizar o mapa ao trocar de endereço além do comportamento já existente do
  `useExploreMap`.
- Qualquer mudança de backend/schema.
