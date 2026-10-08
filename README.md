# Sistema de Alerta Visual — versão 2.0 (frontend + backend)

Um projeto acadêmico que transforma **sinais sonoros captados por sensores em avisos visuais e táteis**. O painel foi implementado em **HTML, CSS e JavaScript**, seguindo os quatro protótipos fornecidos, com uma interface escura, responsiva e acessível, estados vivos, microinterações, controles funcionais e um gêmeo visual do Arduino. O **Node.js** mantém a API REST, o WebSocket e a comunicação serial; as configurações agora sobrevivem ao reinício do processo.

> **Segurança:** sensores de amplitude sonora não reconhecem automaticamente um choro, uma campainha ou fumaça. Cada sensor recebe o nome da sua *posição/finalidade*. O canal “alarme de fumaça” escuta o apito de um detector independente: **não detecta fumaça**. O projeto é experimental e **não substitui alarmes de incêndio certificados, alarmes de segurança, cuidados com crianças ou recursos essenciais de acessibilidade**. Não use o circuito sem validação de profissionais e testes em ambiente real.

## Organização

```text
alerta-visual/
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/api.js, js/app.js
├── backend/
│   ├── package.json
│   └── server.js
├── arduino/alerta_visual/alerta_visual.ino  # Firmware dos sensores ANALÓGICOS reais
├── wokwi/
│   ├── diagram.json                        # Circuito demonstrativo
│   ├── wokwi.toml                          # Encaminhamento serial no VS Code
│   ├── alerta_demo/alerta_demo.ino          # Firmware com botões virtuais, diferente do real
│   └── bridge.py                           # Ponte serial virtual -> backend
├── tests/backend-smoke.js               # Teste das rotas e regras sem dependências npm
└── UX_NOTAS.md
```

## Opção 1: Demonstração sem Arduino (a mais simples)

1. Instale o **Node.js** (LTS) no computador.
2. Abra um terminal na pasta `backend` e execute:

   ```bash
   npm install
   npm start
   ```

3. Acesse [http://localhost:3000](http://localhost:3000).
4. No menu **Dispositivos**, escolha um canal e clique em **Simular evento de teste**; você também pode usar **Protótipo ao vivo** para acompanhar a representação do circuito.
5. Observe os sensores, a placa e os atuadores no painel. A tela de aviso também abre e pode ser silenciada.

Esta opção é uma **demonstração do software**. Não existe leitura física nem envio para o Arduino. O cabeçalho identifica explicitamente o modo demonstração. Os registros de teste ficam no histórico.

## Opção 2: Arduino Uno físico em tempo real

1. Monte os componentes, seguindo a tabela abaixo e as exigências elétricas de cada módulo.
2. Grave o sketch `arduino/alerta_visual/alerta_visual.ino` pela Arduino IDE.
3. Descubra a porta USB na IDE ou no Gerenciador de Dispositivos (ex.: `COM3`). Feche o Monitor Serial: apenas um programa deve usar a porta.
4. Em um terminal na pasta `backend`, execute:

   **PowerShell (Windows):**

   ```powershell
   npm install
   $env:SERIAL_PORT="COM3"
   npm start
   ```

   **Linux/macOS:**

   ```bash
   npm install
   SERIAL_PORT=/dev/ttyUSB0 npm start
   ```

5. Acesse `http://localhost:3000` e abra **Protótipo ao vivo**. Veja o estado da serial, os eventos e, se o firmware enviado for o atualizado, as mensagens `STATUS` indicando a lógica de acionamento do LED e do motor.

A página exibe **o estado informado pelo firmware**, não confirma eletricamente que um componente funcionou. Teste fisicamente LEDs, driver do motor e sensores para validar o hardware.

### Pinos do circuito físico

| Componente | Pino Arduino Uno |
|---|---|
| Sensor de amplitude do som perto da porta | A0 |
| Sensor de amplitude do som no quarto | A1 |
| Sensor de amplitude do som perto do detector de fumaça | A2 |
| Sensor de amplitude do som personalizável | A3 |
| LED RGB: vermelho / verde / azul | D9 / D10 / D11 (PWM) |
| Driver de vibração | D5 |

**Atenção:** uma fita LED 12 V exige fonte própria e estágio de potência para **cada canal**; motores exigem driver/transistor, fonte adequada e proteção contra retorno indutivo conforme o componente. LEDs discretos precisam de resistores. Faça terra comum (GND) quando apropriado. Não ligue cargas diretamente aos pinos do Uno. Antes de comprar, confirme as especificações dos módulos.

## Opção 3: Circuito Wokwi ligado ao painel em tempo real (avançada)

O **Tinkercad Circuits** é excelente para visualizar uma montagem e testar o Arduino no próprio navegador, mas seu monitor serial não oferece uma ponte direta convencional para o servidor Node local. Para uma simulação com comunicação serial conectada ao **mesmo painel**, há um exemplo Wokwi preparado nesta pasta.

Pré-requisitos:
- VS Code com extensão **Wokwi for VS Code** e licença/trial conforme a política do Wokwi.
- Arduino CLI e placa `arduino:avr` instalada (`arduino-cli core install arduino:avr`).
- Python 3 com **pyserial** (`python -m pip install pyserial`).
- Node.js com dependências do backend (`npm install`).

**Como executar**, usando terminais separados a partir da raiz `alerta-visual/`:

1. Compile o firmware demonstrativo (botões digitais substituem sensores analógicos para simplificar a simulação):
   ```bash
   arduino-cli compile --fqbn arduino:avr:uno --output-dir wokwi/build wokwi/alerta_demo
   ```
2. No VS Code, abra a pasta `wokwi`, ative a extensão e escolha **Wokwi: Start Simulator**. Verifique que a porta serial RFC2217 está disponível na `4000` pelo `wokwi.toml`. Mantenha a aba do simulador visível.
3. Inicie o backend no modo ponte:
   ```bash
   # PowerShell
   cd backend
   $env:SIM_TCP_PORT="4001"
   npm start
   ```
   No Linux/macOS: `SIM_TCP_PORT=4001 npm start` dentro da pasta `backend`.
4. Abra outro terminal, na **raiz** do projeto, e inicie a ponte:
   ```bash
   python wokwi/bridge.py
   ```
5. No painel `http://localhost:3000` → **Protótipo ao vivo**, pressione os botões no circuito Wokwi. Também pode usar as teclas `1`, `2`, `3`, `4` quando o simulador estiver em foco. Você verá os eventos no painel por meio do mesmo protocolo de texto serial.

**Limitações:** os botões são substitutos didáticos dos quatro sensores de som, e o LED verde substitui visualmente o motor. O simulador representa a lógica, mas não prova o funcionamento dos componentes reais. A extensão Wokwi para VS Code pode exigir licença após período de avaliação. Não é necessário configurar Wokwi para usar a demonstração no navegador nem o Arduino físico.

## Dados em tempo real

```text
Arduino físico -> USB serial --------------------\
                                                 -> backend Node -> WebSocket /ws -> navegador
Wokwi -> RFC2217:4000 -> bridge.py -> TCP:4001 --/
Modo demonstração --------> POST /api/simular ---/
```

Mensagens do Arduino para o backend:
- `HELLO,alerta_visual` — identificação da inicialização.
- `EVT,<canal>,<pico>` — canal de evento e amplitude aproximada (sem classificação inteligente).
- `STATUS,<alerta>,<led>,<motor>` — estados **calculados pelo firmware** periodicamente (não medidas elétricas reais).

Comandos do backend para o Arduino: `CFG`, `ATIVO`, `ALERTA`, `PARAR`, `TESTE`.

## Acessibilidade e linguagem

- Eventos usam **texto, ícone, cor e indicação de origem**. Cores nunca são a única informação.
- O alerta ocupa a tela, mantém foco de teclado e oferece ações de silenciar/voltar ao painel.
- O novo layout mantém a paleta azul-marinho das referências, com azul para navegação, cores específicas de evento e vermelho concentrado nas emergências.
- O visual do protótipo possui estados textuais (“habilitado”, “sinal ativo”, “aguardando”).
- Não há animação obrigatória para perceber eventos; a preferência por movimento reduzido é respeitada.
- **Avisar familiar:** botão apenas **registra pedido de demonstração**. Nenhum SMS, WhatsApp, Telegram ou push é enviado. Para isso, é preciso implementar e testar uma integração real e política de permissões.

## Limites conhecidos

- O histórico é salvo em `backend/data/eventos.json` (máximo de 1.000 eventos; arquivo criado no primeiro evento). É uma solução de protótipo, não banco de dados de produção.
- Os valores em “dB” são **estimativas artificiais não calibradas**; não usar para avaliação técnica de ruído.
- O sistema não detecta invasões, incêndios nem identifica bebês automaticamente.
- O teste de interface e backend simulado **não garante** o comportamento de circuitos reais, que dependem de alimentação, drivers, posicionamento, calibração e interferências.
- A API local não possui autenticação. **Não exponha a porta 3000 à internet** sem autenticação, TLS, controles de autorização e avaliação de segurança.


## Refinamento UX/UI implementado

- **Painel:** navegação lateral, destaque do último evento e último alerta crítico, estado inicial calmo, métricas reais, histórico e quadro de equipamentos.
- **Dispositivos:** 4 cards, interruptores operacionais, sliders, cores de LED por canal e prévia sem acionar o equipamento; controles salvam no servidor.
- **Alertas:** banner de prioridade, indicação da origem, estado do LED e do motor quando o firmware enviar telemetria, silenciar e teste de hardware.
- **Relatórios:** filtros *Hoje / 7 dias / 30 dias / Todo histórico*, gráfico temporal, divisão por categorias, filtro por tipo e exportação CSV.
- **Protótipo ao vivo:** sensores, Arduino e saídas representados com dados recebidos pela serial/Wokwi/WebSocket; distingue sinal virtual de estado de firmware.
- **Acessibilidade:** navegação com teclado, contraste, etiquetas, aviso em tela cheia e preferência do sistema por reduzir animações.

### API acrescentada

- `GET /api/relatorio?periodo=7d` — retorna eventos persistidos no período (aceita `hoje`, `7d`, `30d` e `todos`). Os números dos gráficos são calculados a partir desses registros.
- `PUT /api/dispositivos/:id` — além da atualização da porta serial, grava as configurações no arquivo `backend/data/config.json`.
- `PUT /api/exibicao` — também persiste o estado geral das saídas.
- `POST /api/hardware/testar` — informa `enviado: true` somente se houve conexão serial ou ponte Wokwi capaz de receber o comando. Isto não garante atuação física.

**Dica:** para uma demonstração limpa, remova os JSON de teste de `backend/data/` enquanto o servidor estiver fechado. Eles são criados automaticamente. Faça cópia antes se quiser preservar dados.

### Verificação

Execute `npm test` na pasta `backend` para rodar os testes das regras/rotas com mocks (não exige placa nem navegador). Para testar a aplicação completa, rode `npm install` seguido de `npm start`, entre nas telas e faça os testes em um navegador real. As imagens de referência são apenas direção visual; a interface entregue é composta de elementos HTML/CSS/JS manipuláveis e conectados aos dados, **não imagens estáticas**.

**Limite da entrega:** não foram confirmadas medições físicas, detecção acústica por algoritmo ou entrega de mensagens a contatos externos. O circuito e qualquer uso em situação crítica exigem validação adicional.
