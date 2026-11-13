<div align="center">

<img src="docs/banner.svg" width="100%" alt="Alerta Visual: sons importantes da casa, vistos e sentidos" />

<br />

**Um painel web + Arduino que transforma avisos sonoros (campainha, choro de bebê, alarme) em sinais visuais e táteis, para que pessoas surdas ou com deficiência auditiva percebam o que acontece em casa.**

<p>
  <img src="https://img.shields.io/badge/Status-Protótipo%20acadêmico-3b82f6?style=for-the-badge" alt="Status: protótipo acadêmico" />
  <img src="https://img.shields.io/badge/Frontend-HTML%20·%20CSS%20·%20JS-0f766e?style=for-the-badge" alt="Frontend em HTML, CSS e JavaScript" />
  <img src="https://img.shields.io/badge/Backend-Node.js%20·%20WebSocket-1e40af?style=for-the-badge" alt="Backend em Node.js com WebSocket" />
  <img src="https://img.shields.io/badge/Hardware-Arduino%20Uno-ea580c?style=for-the-badge" alt="Arduino Uno" />
</p>

[Problema](#-o-problema-e-a-solução) ·
[Telas](#-conheça-as-telas) ·
[Como funciona](#-como-funciona) ·
[Acessibilidade](#-acessibilidade-o-foco-do-projeto) ·
[Executar](#-como-executar) ·
[Arduino](#-arduino-e-wokwi) ·
[Testes](#-testes) ·
[Equipe](#-equipe)

</div>

---

## 💡 O problema e a solução

Campainha, interfone, alarme de fumaça e choro de bebê têm algo em comum: **avisam só por som**. Quem não ouve (ou está com fone, ou em um ambiente barulhento) pode perder um aviso importante.

O **Alerta Visual** capta esses sons e responde por outros sentidos:

|  | Sentido | Como o sistema avisa |
| :---: | :--- | :--- |
| 👁️ | **Visão** | Alerta em tela cheia, ícone, cor e texto; fita de LED colorida no Arduino. |
| ✋ | **Tato** | Motor de vibração no Arduino e vibração do celular, quando o aparelho permite. |
| 🗂️ | **Memória** | Histórico de cada ocorrência, com relatório e exportação em CSV. |

> [!IMPORTANT]
> **Protótipo experimental, não é um sistema de segurança certificado.** Os sensores medem a **amplitude do som**; eles não reconhecem sozinhos uma campainha, um choro ou fumaça. O canal "alarme de fumaça" escuta o **apito de um detector independente**, não detecta fumaça. Não use este protótipo como único aviso para situações de risco.

## 🖥️ Conheça as telas

<div align="center">
  <img src="tests/screenshots/dashboard-v7-1366.png" width="100%" alt="Painel principal com um evento de demonstração em destaque" />
  <br /><sub><b>Painel</b> · visão geral, último evento, canais e estado do hardware</sub>
</div>

<br />

<table>
  <tr>
    <td width="50%" align="center">
      <img src="tests/screenshots/alertas.png" alt="Central de alertas com sinalização de luz e vibração" />
      <br /><b>Alertas</b><br /><sub>aviso principal, saídas de luz e vibração, orientações</sub>
    </td>
    <td width="50%" align="center">
      <img src="tests/screenshots/dispositivos.png" alt="Gestão de canais, sensibilidade e cores" />
      <br /><b>Dispositivos</b><br /><sub>ativar canais, ajustar sensibilidade e cor do aviso</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="tests/screenshots/mapa-v62.png" alt="Planta baixa interativa com os cômodos monitorados" />
      <br /><b>Mapa da casa</b><br /><sub>cômodos, canais e simulação por ambiente</sub>
    </td>
    <td width="50%" align="center">
      <img src="tests/screenshots/prototipo-v7.png" alt="Bancada virtual com Arduino, entradas, LED e vibração" />
      <br /><b>Protótipo ao vivo</b><br /><sub>bancada do Arduino e monitor das mensagens</sub>
    </td>
  </tr>
</table>

<details>
<summary><b>📱 Ver no celular</b></summary>

<br />
<div align="center">
  <img src="tests/screenshots/dashboard-v7-390.png" width="320" alt="Painel adaptado para tela de 390 pixels" />
</div>

</details>

| Tela | Para que serve |
| :--- | :--- |
| **Painel** | Resumo do sistema: último evento, canais ativos, histórico recente e estado do Arduino. |
| **Dispositivos** | Liga/desliga cada canal, ajusta a sensibilidade e escolhe a cor do aviso. |
| **Alertas** | Mostra o alerta em andamento, as saídas de luz/vibração e permite silenciar. |
| **Relatórios** | Gráfico por horário, tipos de evento, tabela filtrável (período, tipo, origem), CSV. |
| **Mapa da casa** | Planta interativa: escolha um cômodo e simule um evento nele. |
| **Como funciona** | Explicação visual do caminho do sinal, do sensor à tela. |
| **Demonstração** | Roteiro guiado de apresentação, com eventos marcados como simulação. |
| **Protótipo ao vivo** | Bancada ilustrada do Arduino com leituras e mensagens em tempo real. |

## 🧩 Como funciona

```mermaid
flowchart LR
    S["🎤 Sensores de som<br/>A0 a A3"] --> A["Arduino Uno<br/>firmware .ino"]
    A -->|"Serial 9600<br/>EVT · READINGS · STATUS"| B["Servidor<br/>Node.js + Express"]
    B -->|"WebSocket<br/>tempo real"| F["Painel web<br/>HTML + CSS + JS"]
    F -->|"API REST"| B
    B --> H[("Histórico<br/>JSON")]
    B -->|"ALERTA · PARAR · CFG"| A
    A --> L["💡 LED RGB<br/>📳 Vibração"]
    D["▶ Demonstração"] -->|"POST /api/simular"| B
```

**Do som ao aviso, em quatro passos:**

1. **Entrada:** um sensor de som detecta um pico de amplitude (ou o usuário aciona uma simulação).
2. **Processamento:** o servidor valida o evento, ignora repetições em menos de 3 s e grava no histórico.
3. **Aviso:** o painel recebe o evento por WebSocket e abre o alerta em tela cheia, sem recarregar a página. Se houver Arduino conectado, o servidor também manda acender o LED e acionar a vibração.
4. **Registro:** o evento fica no histórico até alguém silenciar, com horário, origem e duração.

| Canal | Ambiente | Entrada | Aviso no LED | Vibração |
| :--- | :--- | :---: | :--- | :--- |
| Campainha | Entrada | `A0` | pisca lento | pulso curto |
| Bebê | Quarto | `A1` | pulsante suave | pulso médio |
| Alarme de fumaça | Cozinha | `A2` | pisca intermitente (2 por segundo) | pulso rápido |
| Personalizável | Sala | `A3` | pisca lento | pulso curto |

Alertas comuns terminam sozinhos em 15 s. O de fumaça é **crítico**: continua até alguém silenciar (ou 10 minutos).

### 🛠️ Tecnologias

| Camada | Tecnologia | Papel |
| :--- | :--- | :--- |
| Interface | HTML5, CSS3, JavaScript (sem frameworks) | Telas, mapa SVG, relatórios, acessibilidade |
| Servidor | Node.js, Express | API REST, regras de negócio, histórico |
| Tempo real | WebSocket (`ws`) | Eventos e estados sem recarregar a página |
| Hardware | Arduino Uno (C++), `serialport` | Leitura dos sensores e controle de LED/vibração |
| Simulação | Wokwi + ponte Python (opcional) | Circuito virtual ligado ao painel |

## ♿ Acessibilidade: o foco do projeto

O sistema foi pensado para quem **não pode depender do áudio**:

- **Nunca só cor:** todo evento aparece com **cor + ícone + texto**.
- **Alerta em tela cheia** com botão grande de silenciar; o resto da página fica inativo enquanto ele está aberto, para o foco do teclado e do leitor de tela não escaparem.
- **Vibração do celular** quando o navegador permite.
- **Aba em segundo plano:** o título da aba muda para "⚠ Alerta ativo".
- **Teclado e leitor de tela:** link "Pular para o conteúdo", interruptores com `role="switch"`, avisos em regiões `aria-live` e selo de alerta com texto.
- **Menos movimento:** respeita a preferência do sistema por animações reduzidas.
- **Transparência:** testes simulados são sempre marcados como "simulação" e nunca aparecem como dado real do Arduino.

## 🚀 Como executar

**Precisa de:** [Node.js 18 ou superior](https://nodejs.org) (recomendado o 20 LTS) e um navegador atual. Arduino **não é necessário** para apresentar.

```bash
cd backend
npm install
npm start
```

Abra **http://localhost:3000**. Pronto.

> [!TIP]
> **Sem Arduino?** O sistema inicia em **modo demonstração**. Use a tela **Demonstração** (roteiro guiado) ou o **Mapa da casa** para gerar eventos de teste.

Para encerrar, use `Ctrl+C`: o servidor desliga o LED, grava o alerta em andamento como "Interrompido" e fecha as conexões.

<details>
<summary><b>⚙️ Variáveis de ambiente (opcional)</b></summary>

<br />

| Variável | Padrão | Função |
| :--- | :---: | :--- |
| `PORT` | `3000` | Porta do painel. |
| `HOST` | `127.0.0.1` | Endereço de escuta. Fora de `127.0.0.1` o acesso remoto é ligado e passa a exigir o token. |
| `SERIAL_PORT` | vazio | Porta do Arduino (`COM9`, `/dev/ttyACM0`) ou `auto` para procurar a placa sozinho (prefere o `COM9`). Vazio = modo demonstração. Também vale `--serial=COM9`. |
| `SIM_TCP_PORT` | vazio | Ativa a ponte local do Wokwi. |
| `DATA_DIR` | `backend/data` | Pasta do histórico e das configurações. |
| `ALLOWED_ORIGINS` | vazio | Páginas autorizadas a falar com este servidor (ex.: `https://meu-app.vercel.app`, aceita `https://*.vercel.app`). Liga o acesso remoto. Também vale `--origens=...`. |
| `ACCESS_TOKEN` | gerado | Senha do acesso remoto (mín. 8 caracteres). Se vazio, o servidor gera uma e guarda em `backend/data/token.txt`. |
| `REMOTE` | vazio | `1` liga o acesso remoto sem definir origens (o mesmo que `--remoto`). |

</details>

## 🔌 Arduino e Wokwi

### Montagem (placa real usada nos testes)

| Peça | Pino | Observação |
| :--- | :---: | :--- |
| LED vermelho 1 | `D6` | Com resistor |
| LED vermelho 2 | `D7` | Com resistor |
| Buzzer | `D8` | Bipes para quem está por perto; o aviso principal continua visual |
| Sensor de temperatura (NTC 10k) | `A0` | NTC entre `A0` e `GND`, resistor de 10k entre `A0` e `5V` |
| Matriz de LEDs 8×8 (MAX7219) | `D12` DIN · `D11` CLK · `D10` CS | Biblioteca **LedControl** (instale pelo Gerenciador de Bibliotecas) |

Tudo em 5 V, com `GND` comum.

**Como a placa reage sozinha** (mesmo sem o computador): compara a temperatura atual com a de 30 s atrás.

| Estado | Quando | Matriz | LEDs | Buzzer |
| :--- | :--- | :--- | :--- | :--- |
| Normal | sem variação relevante | ✓ (OK) | apagados | mudo |
| Atenção | subiu ≥ 2 °C em 30 s ou ≥ 40 °C | `!` | LED 1 pisca | bipe a cada 2 s |
| Alarme | subiu ≥ 4 °C em 30 s ou ≥ 55 °C | `X` piscando | alternados | bipe rápido |

O limiar de 2 °C é ajustado pela **sensibilidade** do canal *Sensor de Temperatura* na tela Dispositivos (o alarme é sempre o dobro). Só o **Alarme** vira evento crítico no painel; **Silenciar** no painel também silencia a placa.

Na tela **Protótipo ao vivo**, os dois LEDs, o buzzer, a matriz 8×8 e a temperatura são desenhados **em tempo real conforme a placa informa**. A opção *Reproduzir os testes na placa* faz um teste do painel (campainha, bebê etc.) acender os LEDs, bipar e mostrar o ícone do evento na matriz; o evento continua marcado como simulação. Os canais de som não têm microfone nesta montagem e funcionam só por simulação.

**Testar o sensor de temperatura:** o botão *Testar sensor de temperatura (60 °C)* do Protótipo ao vivo (ou `TESTE_TEMP` no Monitor Serial) faz a placa trocar a leitura do NTC por 60 °C durante 20 s, acima do limite de alarme (55 °C). O alarme dispara na placa e no painel de ponta a ponta; o evento fica marcado como **simulação** e, ao terminar (ou ao silenciar), a placa volta a ler o NTC e recalibra.

### Usando a placa real

1. Instale a biblioteca **LedControl**, abra `arduino/alerta_visual/alerta_visual.ino` na Arduino IDE e grave na placa (Arduino Uno).
2. Descubra a porta serial (aparece na IDE) e **feche o Monitor Serial**, para liberar a porta.
3. Inicie o servidor informando a porta:

```powershell
# Windows (PowerShell)
cd backend
$env:SERIAL_PORT="COM3"   # troque pela sua porta
npm start
```

```bash
# Linux / macOS
cd backend
SERIAL_PORT=/dev/ttyACM0 npm start
```

Atalho para a placa no **COM9** (funciona em qualquer terminal, inclusive no Windows):

```bash
cd backend
npm run start:arduino        # equivale a: node server.js --serial=COM9
```

O indicador na lateral do painel passa a mostrar que o Arduino está conectado. Velocidade serial: 9600 baud.

### 📱 Celular: app no Vercel + Arduino no notebook

O Arduino fica ligado ao **notebook**. O Vercel só entrega a tela (arquivos estáticos, sem servidor), então o celular precisa alcançar o servidor do notebook por um endereço `https` público (um túnel). O alerta é difundido por WebSocket para **todos** os aparelhos conectados: notebook e celular recebem o mesmo aviso, e silenciar em um silencia em todos.

```mermaid
flowchart LR
    A["Arduino<br/>COM9"] -->|USB| N["Notebook<br/>servidor Node.js"]
    N -->|"túnel https + token"| C["Celular<br/>app no Vercel"]
    N --> P["Painel no notebook"]
```

1. **Publicar a tela:** no Vercel, importe este repositório. O `vercel.json` já aponta para a pasta `frontend`, sem build.
2. **Servidor no notebook** (placa no COM9, acesso remoto ligado):
   ```bash
   cd backend
   npm run start:celular
   ```
   Ele imprime o **token de acesso**. Por padrão libera qualquer `*.vercel.app`; para liberar só o seu app: `node server.js --serial=COM9 --remoto --origens=https://SEU-APP.vercel.app`.
3. **Túnel** (em outro terminal; instale uma vez com `winget install Cloudflare.cloudflared`):
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
   Ele mostra um endereço `https://….trycloudflare.com`. **Esse endereço muda a cada vez que o túnel é iniciado.**
4. **Parear o celular:** abra no celular
   `https://SEU-APP.vercel.app/?servidor=https://….trycloudflare.com&token=SEU_TOKEN`.
   O app guarda o endereço e o token e limpa o link. Também dá para digitar em **Conexão → Servidor** (botão no topo da tela).
5. Toque em **Ativar avisos neste aparelho**: a tela do celular fica ligada e, com outra aba na frente, o alerta chega como notificação.

> [!WARNING]
> O token é a senha do seu servidor: com ele qualquer pessoa pode silenciar alertas e mudar configurações. Não publique o link de pareamento. Fora do notebook, toda chamada sem token recebe `401`; o notebook (acesso direto por `localhost`) não precisa de token.

**Limites conhecidos:** o celular precisa estar com o app aberto (sem notificação push com a tela bloqueada ou o navegador fechado); no iPhone não há vibração pelo navegador; o túnel gratuito é temporário. Na **mesma rede Wi-Fi** dá para dispensar Vercel e túnel: no PowerShell `$env:HOST="0.0.0.0"; npm run start:celular` e abrir `http://IP-DO-NOTEBOOK:3000/?token=SEU_TOKEN` (o Windows pode pedir permissão no firewall).

### 🔎 Reconhecimento das peças

Ao conectar, o painel (e o celular) recebe pelo WebSocket o **inventário de peças** que a placa informou: sensor de temperatura (A0), LED 1 (D6), LED 2 (D7), buzzer (D8) e matriz 8×8 (D10–D12), cada uma com o estado em texto (*Lendo*, *Ligado*, *Desligado*, *Falha*, *Sem dados*). Aparece em **Protótipo ao vivo → Peças reconhecidas** e no Painel. Se a placa responder mas não com este firmware (um sketch antigo gravado), o painel avisa. O estado vem do que o **firmware declara**: não prova que o componente está ligado corretamente.

<details>
<summary><b>🧪 Circuito virtual no Wokwi (opcional)</b></summary>

<br />

Permite demonstrar o firmware sem a placa física. Precisa de VS Code com a extensão Wokwi, Arduino CLI e Python.

```bash
# 1) na raiz do projeto: compilar o firmware de demonstração
arduino-cli compile --fqbn arduino:avr:uno --output-dir wokwi/build wokwi/alerta_demo

# 2) iniciar o circuito pela extensão Wokwi no VS Code (usa wokwi/wokwi.toml)

# 3) em outro terminal: servidor com a ponte habilitada
cd backend
SIM_TCP_PORT=4001 npm start          # PowerShell: $env:SIM_TCP_PORT="4001"; npm start

# 4) em outro terminal, na raiz: ponte Wokwi para o servidor
python -m pip install pyserial
python wokwi/bridge.py
```

A bancada desenhada no navegador é **ilustrativa**: ela não emula o firmware. Para isso, use o Wokwi.

</details>

<details>
<summary><b>📡 API e protocolo serial (para quem quiser entender por dentro)</b></summary>

<br />

**API REST** (`http://localhost:3000`)

| Método | Rota | Função |
| :---: | :--- | :--- |
| `GET` | `/api/estado` | Canais, saídas, hardware e alerta em andamento |
| `PUT` | `/api/dispositivos/:id` | Liga/desliga canal, sensibilidade, cor |
| `PUT` | `/api/exibicao` | Habilita ou não as saídas físicas (LED e vibração) |
| `GET` | `/api/eventos` | Eventos recentes |
| `GET` | `/api/estatisticas` | Contagens do painel |
| `GET` | `/api/relatorio?periodo=7d&fonte=todas` | Histórico filtrado (`periodo`: `hoje`, `7d`, `30d`, `todos`; `fonte`: `todas`, `reais`, `simulacao`) |
| `GET` | `/api/diagnostico` | Leituras e status enviados pelo Arduino |
| `POST` | `/api/simular` | Gera um evento de demonstração (`{"dispositivo":"porta"}`) |
| `DELETE` | `/api/eventos/simulacoes` | Apaga só os testes simulados |
| `POST` | `/api/alerta/silenciar` | Encerra o alerta em andamento |
| `POST` | `/api/hardware/testar` | Pede um sinal de teste ao Arduino |
| `WS` | `/ws` | Eventos em tempo real |

**Serial (9600 baud, uma linha por mensagem)**: firmware `arduino/alerta_visual` (montagem real)

| Sentido | Mensagem | Significado |
| :--- | :--- | :--- |
| Arduino → servidor | `HELLO,alerta_visual_temp` | Placa iniciou (após ~3 s de autoteste e calibração) |
| Arduino → servidor | `TEMP,<°C>,<variação 30 s>,<estado>,<silenciado>,<teste>` | A cada 1 s; estado 0 normal, 1 atenção, 2 alarme |
| Arduino → servidor | `HW,<led1>,<led2>,<buzzer>,<matriz>` | Espelho das saídas; matriz = 8 bytes em hexa (linha 0 primeiro, bit 7 = esquerda) |
| Arduino → servidor | `ERRO,sensor` | Leitura do NTC fora da faixa (fio solto) |
| Servidor → Arduino | `CFGT,<décimos de °C>` · `ATIVO,4,<0 ou 1>` | Limiar de atenção e liga/desliga o alarme térmico |
| Servidor → Arduino | `ALERTA,<r>,<g>,<b>,<padrão>,<segundos>,<ícone>` | Alerta do painel nos LEDs, buzzer e matriz (ícone: 0 ! · 1 sino · 2 rosto · 3 chama · 4 losango · 5 termômetro) |
| Servidor → Arduino | `TESTE_TEMP,<décimos de °C>,<segundos>` | Injeta a temperatura no lugar do NTC (padrão 600 e 20 s) |
| Servidor → Arduino | `PARAR` · `TESTE` | Para o alerta e silencia o alarme atual / tudo aceso por 3 s |

O servidor continua aceitando o protocolo antigo (`EVT`, `READINGS`, `STATUS`, `SILENCIAR`), usado pelo circuito de som do Wokwi.

</details>

## 🧪 Testes

```bash
cd backend
npm install        # já instala as ferramentas de teste
npm test           # regras do servidor (isolado, sem placa)
npm run test:ui    # sobe o servidor e percorre o painel sem navegador (jsdom)
```

| O que é verificado | Onde |
| :--- | :--- |
| Canais, persistência, simulação, relatórios, silenciamento, diagnóstico serial, proteção contra requisições de outros sites, erros em JSON, histórico corrompido | `npm test` |
| Painel completo: roteiro guiado, alerta em tela cheia, fundo inativo durante o alerta, relatórios e filtros, ausência de erros de JavaScript | `npm run test:ui` |
| Navegação e layout em vários tamanhos de tela (Playwright + Chromium) | `python tests/ui-playwright.py` e `python tests/ui-polimento.py` |

> Os testes de navegador usam uma API simulada. O **Arduino físico** e o **Wokwi** dependem de equipamento e devem ser conferidos no ambiente da apresentação.

<details>
<summary><b>🔧 O que foi refinado na versão 7.1</b></summary>

<br />

- **Correções:** texto explicativo em branco na demonstração guiada; reconexões serial duplicadas; eventos repetidos causados por ruído do próprio atuador; duração de alertas interrompidos.
- **Segurança:** recusa de requisições e WebSocket vindos de outros sites, cabeçalhos de segurança, erros sem detalhes internos, limite de simulações.
- **Robustez:** encerramento limpo com `Ctrl+C`, cópia de segurança de histórico corrompido, reconexão progressiva do WebSocket, prazo nas requisições.
- **Funcionalidades:** botão físico de silenciar, filtro de origem dos dados no relatório, CSV legível.
- **Acessibilidade:** fundo inativo durante o alerta, anúncio refeito a cada alerta, título da aba sinalizando alerta.

</details>

## 📂 Estrutura do projeto

```text
a3_acessibilidade/
├── frontend/                 # Painel web
│   ├── index.html            #   telas
│   ├── css/                  #   estilos e responsividade
│   └── js/                   #   api.js (comunicação) e app.js (telas)
├── backend/                  # Servidor Node.js
│   ├── server.js             #   API REST, WebSocket e serial
│   └── data/                 #   histórico e configurações (criado ao rodar)
├── vercel.json               # Publica a pasta frontend no Vercel
├── arduino/alerta_visual/    # Firmware do Arduino Uno
├── wokwi/                    # Circuito virtual e ponte com o servidor
├── tests/                    # Testes automatizados e capturas de tela
└── docs/banner.svg           # Imagem do topo deste README
```

## 🎤 Roteiro sugerido para a apresentação (cerca de 8 minutos)

| Tempo | O que mostrar | O que falar |
| :---: | :--- | :--- |
| 1 min | Banner e problema | Avisos sonoros não alcançam quem não ouve. |
| 1 min | **Painel** | Tudo em um só lugar: canais, último evento e estado do hardware. |
| 2 min | **Demonstração** | Siga o roteiro guiado: um evento aparece em tela cheia, com cor, ícone e texto. Deixe claro que é simulado. |
| 1 min | **Mapa da casa** | Escolha um cômodo e simule um evento nele. |
| 2 min | **Arduino / Protótipo ao vivo** | Sensor → firmware → servidor → tela. Se houver a placa, acione um som real e mostre o LED. |
| 1 min | **Relatórios** | Histórico, filtro por origem (real × simulação) e exportação em CSV. Fale dos limites do protótipo. |

<details>
<summary><b>❓ Perguntas que podem surgir</b></summary>

<br />

**O sensor reconhece que o som é uma campainha?**
Não. Cada sensor mede a amplitude do som e o sistema atribui o significado pela **posição**: o sensor da porta representa a campainha, o do quarto, o bebê. É uma limitação assumida do protótipo.

**Detecta fumaça?**
Não diretamente. O canal da cozinha escuta o **apito de um detector de fumaça comum**; o detector é quem identifica a fumaça.

**Funciona sem o Arduino?**
Sim. Sem placa, o painel roda em modo demonstração e todo evento simulado fica marcado como tal.

**O que acontece se a internet cair?**
O sistema roda localmente (servidor e painel na mesma máquina), então não depende de internet.

**Qualquer pessoa na rede pode mexer?**
Por padrão o servidor só aceita acessos da própria máquina. Não há login; por isso a documentação recomenda não expô-lo à rede.

**Como evoluir o projeto?**
Aviso por notificação no celular ou SMS, reconhecimento do tipo de som (classificação de áudio), sensores sem fio e login para acesso remoto.

</details>

## 👥 Equipe

<div align="center">

**Vinicius Iandoli · Lais Toyama · Vinicius Centurion · Cesar Melo**

<sub>Projeto acadêmico · a3_acessibilidade · Alerta Visual</sub>

<br />

*A tecnologia deve ampliar o acesso à informação.*

</div>
