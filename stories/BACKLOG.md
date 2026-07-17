# BACKLOG — itens crus para refinar

## Cupons

- No carrinho de compras, deve mostrar os cupons disponiveis para o usuario selecionar qual ele quer aplicar

## Endereço do customer

- ao salvar um endereço, no app customer, deve-se carregar a lat & lng exata para salvar no banco de dados. o sistema usa estes valores como referencia
- ao tentar setar o endereço com "usar minha localização", estou recebendo esta mensagem no console: The Geocoding API has been removed in SDK 49, use Place Autocomplete service instead(https://developers.google.com/maps/documentation/places/web-service/autocomplete)

## Gorjeta

A gorjeta é individual. O usuario pode dar gorjeta para a plataforma, entregador e mercado.
O checkbox deve vir marcado por padrao e ao lado de cada um dos itens(plataforma, entregador e mercado), deve ter um input para informar o valor para cada um deles. o valor inicial para todos é de R$2.
no final soma tudo e faz um unico pagamento

## Perfil

Criar itens no menu para "Meus dados" e "Segurança"

## Ganhos

No app do driver, na pagina "/earnings", o "Historico de entregas" está mostrando todo o historico de entregas, nao esta respeitando o filtro "hoje", "7 dias" e "30 dias"

## Busca

Ao digitar um valor no campo de busca e pressionar enter, no app customer, está redirecionando para a aba "explore". O q deveria acontecer é aparecer sugestoes conforme o usuario digita e ao selecionar um termo ou submeter o form, direcionar para o resultado da busca
