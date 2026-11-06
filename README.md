# WeatherDashboard

Painel de previsão do tempo que busca cidades pela API de geocodificação do Open-Meteo e mostra as condições atuais e os próximos 7 dias. Não precisa de chave de API, de build nem de dependências.

O foco do projeto é a forma de consumir uma API externa: estados de carregamento, erro e vazio tratados explicitamente, requisições canceláveis e uma camada de parsing isolada, que pode ser testada com respostas gravadas, sem rede.

## Por que este projeto

Quase todo produto web consome APIs de terceiros, e a diferença entre um exemplo de tutorial e código de produção está no que acontece quando algo dá errado. Aqui você encontra o que costuma ser avaliado em entrevistas de front-end:

- separar o cliente HTTP, o parsing e a interface;
- não confiar no formato da resposta (a API omite o campo `results` quando não há cidades);
- lidar com condições de corrida: buscar de novo cancela a requisição anterior via `AbortController`;
- injeção de dependência (`fetchFn`) para testar sem rede;
- mensagens de erro úteis, com botão de tentar de novo.

## Recursos

- Busca de cidades com lista de resultados desambiguada (cidade, região, país).
- Condições atuais: temperatura, sensação térmica, umidade, vento e descrição.
- Previsão de 7 dias com máxima, mínima e probabilidade de chuva.
- Alternância entre °C e °F (a API converte as unidades, não o cliente).
- Últimas 5 cidades consultadas, salvas em `localStorage`.
- Estados de carregamento, erro (rede, HTTP, dados inválidos) e "nenhum resultado".
- Layout responsivo, tema escuro, foco visível e região `aria-live` para os estados.

## Como executar

Abra o `index.html` no navegador (é preciso internet para chamar a API) ou use um servidor local:

```bash
python3 -m http.server 8000
# acesse http://localhost:8000
```

Se o navegador bloquear ES modules em `file://`, use o servidor local.

## Como testar

Dentro desta pasta, com Node 18 ou superior:

```bash
node --test
```

Os testes não usam rede. Eles leem JSONs de exemplo em `tests/fixtures/` (geocodificação com resultados, sem resultados e previsão) e usam um `fetch` falso para simular sucesso, status HTTP de erro, falha de rede, JSON inválido e requisição abortada.

## Decisões de projeto

- **API sem chave.** O Open-Meteo dispensa cadastro, então o projeto roda em qualquer máquina e não há segredo para vazar.
- **Parsing em módulo próprio (`src/api.js`).** A interface recebe objetos já normalizados (`current`, `days`, `units`). Se a API mudar, o ajuste fica em um único lugar e os testes de fixture avisam.
- **Erros tipados.** `ApiError` carrega um `kind` (`network`, `http`, `data`, `validation`), de modo que a interface pode reagir de forma diferente sem comparar strings de mensagem.
- **Cancelamento.** Cada busca ou previsão nova aborta a anterior, evitando que uma resposta lenta sobrescreva uma mais recente. `AbortError` é propagado sem ser convertido em erro de rede.
- **Datas sem fuso do navegador.** O dia da semana é calculado em UTC a partir da string `YYYY-MM-DD` já no fuso local da cidade (`timezone=auto`), evitando o erro clássico de mostrar o dia errado.
- **Ícones em emoji.** Evitam assets externos e funcionam offline, ao custo de variar entre sistemas operacionais.
- **Complexidade.** Todas as operações são lineares no tamanho da resposta (no máximo 7 dias e 6 cidades); o custo dominante é a rede.

## Estrutura de pastas

```
WeatherDashboard/
├── index.html
├── style.css
├── src/
│   ├── api.js        # URLs, parsers, cliente fetch e ApiError
│   └── app.js        # interface, estados e cancelamento
├── tests/
│   ├── api.test.js
│   └── fixtures/     # respostas gravadas da API
├── package.json
├── LICENSE
└── README.md
```

## Limitações conhecidas

- Depende de conexão e da disponibilidade do Open-Meteo; não há cache offline da previsão.
- A língua da interface é fixa em inglês (a busca de cidades aceita outros idiomas pela API).
- Não há previsão por hora nem gráficos.
- Não usa geolocalização do navegador.
- `app.js` não tem testes automatizados; a lógica testável está em `api.js`.

## Licença

MIT. Veja o arquivo [LICENSE](LICENSE).
