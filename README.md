# Alerta Visual — aplicação integrada e apresentação acadêmica

Aplicação em **HTML/CSS/JavaScript puro**, backend **Node.js/Express + WebSocket**, integração serial com **Arduino Uno**, e opção de usar uma placa **Wokwi** por ponte serial. O frontend mantém a estética escura dos protótipos e remove as telas independentes de Diagnóstico, Família e Acessibilidade, que não faziam parte do fluxo principal.

> **Protótipo experimental.** Não é um sistema certificado de incêndio, segurança residencial ou acessibilidade assistiva. Os quatro canais físicos recebem **amplitudes de sensores sonoros**; não reconhecem automaticamente campainha, bebê nem fumaça. Para o alerta da cozinha, o sensor pode ouvir **o apito de um detector independente**, mas não detecta fumaça. A planta e a bancada são esquemas ilustrativos; não confirmam localização física, rota livre, circuitos elétricos ou segurança de moradores.

## Executar

Requisitos: **Node.js 20+**, npm e navegador moderno.

```bash
cd a3_acessibilidade/backend
npm install
npm start
```

Abra **http://localhost:3000** no computador. Sem `SERIAL_PORT` ou `SIM_TCP_PORT` configurados, o aplicativo abre em **Demonstração**, sem placa física. Não use `index.html` por clique duplo, porque as telas consomem a API do backend.

## Navegação — oito telas

| Tela | Funcionalidade |
|---|---|
| Painel | Eventos recentes, situação atual, estatísticas e atalhos |
| Dispositivos | Liga/desliga canais, muda sensibilidade e seleciona cor do LED; salva em `backend/data/config.json` |
| Alertas | Avisos grandes, texto e ícone; silenciar e testar atuadores |
| Relatórios | Eventos reais/simulados persistidos, período, gráfico, filtro e exportação CSV |
| Mapa da casa | Planta vetorial arquitetônica com quatro pontos clicáveis; seleciona cômodo, mostra origem e último sinal e permite simular |
| Como funciona | Documentação visual integrada: fluxo, canais da casa, arquitetura e limites da demonstração |
| Demonstração | Apresentação guiada, com eventos **identificados como simulação** |
| Protótipo ao vivo | Bancada visual estilo simulador: Arduino Uno, protoboard, componentes e fios ilustrativos; botões para gerar testes, estado de LED/motor, monitor de mensagens e teste de saídas quando houver conexão |

### Mapa x localização real

A planta é **uma casa modelo** inspirada em uma planta baixa: mostra cozinha, quarto, sala, entrada e espaços ilustrativos. Os quatro canais são mapeados logicamente a cômodos, e não por coordenadas/GPS. Clique no ícone do sensor para ver o estado, a sensibilidade, a origem do último evento e usar **Simular neste cômodo**. Um canal desativado não pode ser simulado: ative-o na tela **Dispositivos**. “Canal habilitado” indica configuração, não comprovação de leitura física. Os destaques se atualizam pelo WebSocket.

### Bancada Arduino: o que funciona de verdade

A bancada foi desenhada em SVG local (não é imagem de fundo): mostra placa e componentes, além de estados dinâmicos. Os botões do painel de componentes enviam `POST /api/simular` à API. O LED e o motor na bancada **só refletem a lógica de demonstração** sem placa; com serial física ou Wokwi, o frontend privilegia a telemetria `STATUS` e não presume que o dispositivo físico ligou. Os valores de leitura, quando presentes, vêm da telemetria `READINGS`.

A bancada **não é um simulador eletrônico nem compila o .ino**. Para rodar firmware simulado use Wokwi; para ver um efeito físico, conecte componentes reais de forma segura. O botão **Testar saídas físicas** somente fica ativo quando a comunicação serial está conectada; ele envia um comando de teste e não equivale à comprovação elétrica.

## Arduino físico

Grave `arduino/alerta_visual/alerta_visual.ino` com a Arduino IDE.

| Componente | Conexão (Arduino Uno) |
|---|---|
| Sensor de som próximo à campainha | A0 |
| Sensor de som no quarto | A1 |
| Sensor de som próximo ao apito de detector de fumaça independente | A2 |
| Som personalizado | A3 |
| Saídas do LED RGB vermelho, verde, azul | D9, D10, D11 (via resistores/drivers apropriados) |
| Motor vibratório | D5 (**via transistor/driver + proteção**, nunca direto no pino) |

**Atenção elétrica:** fita de LED de 12 V exige fonte e driver dedicados. Motor precisa de alimentação e proteção apropriadas. Verifique correntes/tensões com um profissional. Use terra de referência comum apenas quando eletricamente apropriado. O firmware limita a frequência da sinalização, mas isso não elimina riscos de fotossensibilidade.

Feche o Monitor Serial da IDE. Inicie o backend a partir de `backend/` com a porta serial:

**Windows PowerShell:**

```powershell
$env:SERIAL_PORT="COM3"    # ajuste a porta correta
npm start
```

**Linux:**

```bash
SERIAL_PORT=/dev/ttyUSB0 npm start
```

**Protocolo serial a 9600 baud:**

```text
Arduino → Node: HELLO,versao | EVT,canal,pico | STATUS,alerta,led,motor | READINGS,a0,a1,a2,a3
Node → Arduino: CFG,canal,limiar | ATIVO,canal,0|1 | ALERTA,r,g,b,padrao,segundos | PARAR | TESTE
```

`STATUS` descreve os estados definidos pelo firmware (1 vez/s); `READINGS` informa amplitudes analógicas (a cada 2 segundos, -1 indica sem leitura). Não são leituras em decibéis calibrados. **Eventos simulados criados no navegador não disparam as saídas físicas da placa e não interrompem alertas reais em andamento.** `TESTE` é uma ação separada e explícita.

## Wokwi (opcional)

O projeto de demonstração está na pasta `wokwi/` e utiliza uma ponte TCP local. Requer Arduino CLI, VS Code/extensão Wokwi, Python e `pyserial`.

1. Na raiz do projeto, compile: `arduino-cli compile --fqbn arduino:avr:uno --output-dir wokwi/build wokwi/alerta_demo`.
2. Inicie Wokwi pelo VS Code conforme `wokwi/wokwi.toml`.
3. Inicie backend: `SIM_TCP_PORT=4001 npm start` (PowerShell: `$env:SIM_TCP_PORT="4001"; npm start`).
4. Na raiz execute `python wokwi/bridge.py` e acione os botões do circuito virtual.

Essa simulação **não usa microfones físicos**, nem comprova um circuito montado de verdade. A bancada visual recebe os eventos do backend, não controla o editor Wokwi diretamente.

## APIs utilizadas

- `GET /api/estado`, `GET /api/eventos`, `GET /api/estatisticas` e `GET /api/relatorio?periodo=7d`
- `PUT /api/dispositivos/:id`, `PUT /api/exibicao`
- `POST /api/simular`, `POST /api/alerta/silenciar`, `POST /api/hardware/testar`
- `GET /api/diagnostico` — **telemetria interna da bancada**, não uma tela separada
- `/ws` — atualizações `estado`, `evento`, `hardware`, `telemetria` e `alerta_fim`

Não há endpoints de contatos/Telegram, nem notificações automáticas externas. O servidor usa `HOST=127.0.0.1` por padrão. **A API não tem autenticação: não a exponha à Internet.** Para acessar pela rede, será necessário desenvolver autenticação, autorização e TLS.

## Arquivos e testes

```text
frontend/index.html            estrutura das telas e SVGs arquitetônico/Arduino
frontend/css/style.css         estilo original refinado
frontend/css/v4.css            planta e bancada base
frontend/css/v6.css            responsividade fina, hierarquia visual, status e créditos
frontend/js/api.js             REST / WebSocket
frontend/js/app.js             lógica e estados da UI
backend/server.js              API, configurações, telemetria e histórico
arduino/alerta_visual/         firmware Arduino
wokwi/                         projeto virtual e bridge

tests/backend-smoke.js         testes de regras com mocks (sem npm/hardware)
tests/ui-playwright.py         Chromium com API e WebSocket simulados
tests/screenshots/            capturas geradas pela suíte UI
TESTES_V6.md                  resultados e limites de validação
```

**Testes locais de regra (sem npm):** `node tests/backend-smoke.js`.

**Testes visuais (Python + Playwright + Chromium):** `python tests/ui-playwright.py`.

A interface foi testada no Chromium com APIs **simuladas em memória**. As regras do backend foram verificadas isoladamente com stubs de Express/WS, mas a instalação npm, o circuito físico, o Wokwi em execução e o fluxo integrado com Node **precisam ser validados no computador onde o projeto será apresentado**.

## Autoria

**Projeto acadêmico desenvolvido em equipe por:**

- Vinicius Iandoli
- Lais Toyama
- Vinicius Centurion
- Cesar Melo

A aplicação exibe a equipe no menu lateral e na tela **Como funciona**. A apresentação e o código incluem os nomes acima como autoria do grupo.

## Refinamentos da versão 6.0

- Interface revisada em múltiplas larguras; sidebar com navegação adaptativa e sem link duplicado no rodapé.
- Bancada com instruções rápidas; etapas técnicas ficam em um painel recolhível.
- Estados do mapa com explicação humana: canal desativado, pronto para simulação, teste em andamento e evento real.
- Bloqueio de simulação para canais desativados (HTTP 409), com orientação para habilitar.
- Um evento simulado não pode substituir nem silenciar um alerta proveniente do firmware.
- LEDs e vibração indicados como **prévia** em simulação ou **informação do firmware** quando a placa está conectada, sem confundir com teste físico concluído.
