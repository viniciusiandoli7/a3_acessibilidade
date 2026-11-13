/*
  Alerta Visual - firmware da montagem real (Arduino Uno)

  PEÇAS E LIGAÇÕES
    LED vermelho 1 ............ D6  (com resistor)
    LED vermelho 2 ............ D7  (com resistor)
    Buzzer .................... D8
    Sensor de temperatura ..... A0  (NTC 10k entre A0 e GND + resistor fixo de 10k entre A0 e 5V)
    Matriz 8x8 (MAX7219) ...... DIN D12 | CLK D11 | CS D10   (biblioteca LedControl)

  COMPORTAMENTO LOCAL (funciona mesmo sem o computador)
    O NTC é lido continuamente. Compara a temperatura atual com a de 30 s atrás:
      NORMAL  -> matriz mostra "OK", LEDs apagados
      ATENCAO -> subida >= limiar (padrão 2 °C/30 s) ou >= 40 °C: matriz "!", LED1 pisca, bipe a cada 2 s
      ALARME  -> subida >= 2x limiar (padrão 4 °C/30 s) ou >= 55 °C: matriz "X" piscando, LEDs alternados, bipe rápido

  PROTOCOLO SERIAL (9600 baud, uma linha por mensagem)
    Arduino -> PC:
      HELLO,alerta_visual_temp
      TEMP,<temperatura C>,<variação em 30 s>,<estado 0|1|2>,<silenciado 0|1>,<teste 0|1>   (a cada 1 s)
      HW,<led1>,<led2>,<buzzer>,<matriz: 8 bytes em hexa, linha 0 primeiro>     (a cada mudança e a cada 1 s)
      ERRO,sensor                                                              (leitura do NTC fora da faixa)
    PC -> Arduino:
      ALERTA,<r>,<g>,<b>,<padrao 1-3>,<segundos>[,<icone>]   alerta vindo do painel (r,g,b ignorados: LEDs são vermelhos)
                       icones: 0 "!" | 1 sino | 2 rosto (bebê) | 3 chama | 4 losango | 5 termômetro
      PARAR            encerra o alerta do painel, silencia o alarme térmico atual e encerra o teste de temperatura
      TESTE            3 s com tudo aceso + bipe, para conferir a montagem
      TESTE_TEMP[,<decimos C>,<segundos>]
                       teste do sensor: durante <segundos> a leitura do NTC é substituída por <decimos>/10 °C
                       (padrão 600 = 60,0 °C por 20 s, acima do limite de alarme de 55 °C). Também funciona
                       digitando no Monitor Serial. Ao terminar, volta a ler o NTC e recalibra o histórico.
      ATIVO,4,<0|1>    liga/desliga o alarme térmico local
      CFGT,<decimos>   limiar de ATENCAO em décimos de grau (ex.: 20 = 2,0 °C); ALARME = 2x
      (CFG/ATIVO dos canais de som 0-3 são aceitos e ignorados: esta montagem não tem microfones)
*/
#include <LedControl.h>

// ---------- Pinos ----------
const uint8_t PIN_LED1 = 6;
const uint8_t PIN_LED2 = 7;
const uint8_t PIN_BUZZER = 8;
const uint8_t PIN_NTC = A0;
LedControl lc(12, 11, 10, 1);  // DIN, CLK, CS, 1 matriz

// ---------- NTC 10K com resistor fixo de 10K ----------
const float R_FIXO = 10000.0;
const float R_NTC_25C = 10000.0;
const float BETA = 3950.0;

// ---------- Limites ----------
float deltaAtencao = 2.0;              // ajustável pelo painel (CFGT); alarme = 2x
const float TEMP_ATENCAO_ABS = 40.0;   // segurança: temperatura absoluta
const float TEMP_ALARME_ABS  = 55.0;
bool tempAtivo = true;                 // ATIVO,4,<0|1>

// ---------- Desenhos da matriz (bit 7 = coluna da esquerda) ----------
const byte IMG_OK[8]      = {0x00, 0x01, 0x02, 0x04, 0x88, 0x50, 0x20, 0x00};
const byte IMG_ALERTA[8]  = {0x18, 0x18, 0x18, 0x18, 0x18, 0x00, 0x18, 0x18};
const byte IMG_X[8]       = {0x81, 0x42, 0x24, 0x18, 0x18, 0x24, 0x42, 0x81};
const byte IMG_SINO[8]    = {0x18, 0x3C, 0x7E, 0x7E, 0x7E, 0xFF, 0x00, 0x18};
const byte IMG_ROSTO[8]   = {0x3C, 0x42, 0xA5, 0x81, 0xA5, 0x99, 0x42, 0x3C};
const byte IMG_CHAMA[8]   = {0x08, 0x18, 0x1C, 0x3C, 0x7E, 0x7E, 0x7E, 0x3C};
const byte IMG_LOSANGO[8] = {0x18, 0x3C, 0x7E, 0xFF, 0xFF, 0x7E, 0x3C, 0x18};
const byte IMG_TERMO[8]   = {0x18, 0x24, 0x24, 0x3C, 0x3C, 0x7E, 0x7E, 0x3C};
const byte IMG_CHEIO[8]   = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
const byte IMG_VAZIO[8]   = {0, 0, 0, 0, 0, 0, 0, 0};
const byte* const ICONES[6] = {IMG_ALERTA, IMG_SINO, IMG_ROSTO, IMG_CHAMA, IMG_LOSANGO, IMG_TERMO};

// ---------- Histórico de 30 s (1 amostra por segundo) ----------
const int N = 30;
float historico[N];
int idx = 0;
float tF = 25.0;          // temperatura filtrada
float referencia = 25.0;  // temperatura de 30 s atrás
int estado = 0;           // 0 NORMAL | 1 ATENCAO | 2 ALARME
bool tempSilenciado = false;
bool sensorOk = true;     // false quando o NTC está solto/em curto: então nenhuma temperatura é enviada

// ---------- Teste do sensor (temperatura injetada) ----------
bool testeTemp = false;
float testeTempValor = 60.0;
unsigned long testeTempAte = 0;

// ---------- Alerta vindo do painel ----------
bool remoto = false;
unsigned long remotoInicio = 0, remotoDuracao = 0;
uint8_t remotoPadrao = 1, remotoIcone = 0;
unsigned long testeAte = 0;

// ---------- Espelho das saídas (o que o painel desenha) ----------
byte tela[8];
bool led1 = false, led2 = false;
unsigned long buzzerAte = 0;
bool buzzerReportado = false;
bool hwMudou = true;
unsigned long ultimoHW = 0, ultimoTemp = 0, ultimaAmostra = 0, ultimoBip = 0, ultimoErro = 0;

// ---------- Entrada serial ----------
char buffer[48];
uint8_t tamanhoBuffer = 0;
bool linhaGrande = false;  // linha maior que o buffer: descartada, nunca executada pela metade

/* ===== Saídas ===== */
void definirLed(uint8_t n, bool ligado) {
  bool &atual = (n == 1) ? led1 : led2;
  if (atual == ligado) return;
  atual = ligado;
  digitalWrite(n == 1 ? PIN_LED1 : PIN_LED2, ligado ? HIGH : LOW);
  hwMudou = true;
}

void desenhar(const byte img[8]) {
  for (uint8_t r = 0; r < 8; r++) {
    if (tela[r] != img[r]) {
      tela[r] = img[r];
      lc.setRow(0, r, img[r]);
      hwMudou = true;
    }
  }
}

void bip(unsigned int freq, unsigned long ms) {
  tone(PIN_BUZZER, freq, ms);
  buzzerAte = millis() + ms;
  hwMudou = true;
}

void calarBuzzer() {
  noTone(PIN_BUZZER);
  buzzerAte = 0;
  hwMudou = true;
}

bool buzzerLigado() {
  return buzzerAte != 0 && (long)(millis() - buzzerAte) < 0;
}

// Bipe periódico: dispara no máximo um bipe a cada "intervalo" ms.
void bipPeriodico(unsigned long agora, unsigned long intervalo, unsigned int freq, unsigned long dur) {
  if (agora - ultimoBip >= intervalo) {
    ultimoBip = agora;
    bip(freq, dur);
  }
}

/* ===== Temperatura ===== */
float lerTemperatura() {
  long soma = 0;
  for (int i = 0; i < 10; i++) {
    soma += analogRead(PIN_NTC);
    delay(2);
  }
  float adc = soma / 10.0;
  if (adc < 1 || adc > 1022) return NAN;
  float r = R_FIXO * adc / (1023.0 - adc);  // NTC entre A0 e GND
  float k = 1.0 / (1.0 / 298.15 + log(r / R_NTC_25C) / BETA);
  return k - 273.15;
}

void iniciarHistorico() {
  float soma = 0;
  int n = 0;
  for (int i = 0; i < 20; i++) {
    float t = lerTemperatura();
    if (!isnan(t)) { soma += t; n++; }
    delay(100);
  }
  float t0 = (n > 0) ? soma / n : 25.0;
  tF = t0;
  referencia = t0;
  for (int i = 0; i < N; i++) historico[i] = t0;
}

void iniciarTesteTemp(int decimos, int segundos) {
  testeTempValor = constrain(decimos, 200, 900) / 10.0;
  testeTempAte = millis() + (unsigned long)constrain(segundos, 5, 120) * 1000UL;
  testeTemp = true;
  tempSilenciado = false;
}

// Fim do teste: volta ao NTC e recalibra, para a temperatura falsa não ficar no histórico de 30 s.
void encerrarTesteTemp() {
  testeTemp = false;
  float real = lerTemperatura();
  if (isnan(real)) real = 25.0;
  tF = real;
  referencia = real;
  for (int i = 0; i < N; i++) historico[i] = real;
  estado = 0;
  tempSilenciado = false;
  calarBuzzer();
}

void atualizarTemperatura(unsigned long agora) {
  if (testeTemp && (long)(agora - testeTempAte) >= 0) encerrarTesteTemp();
  float t = testeTemp ? testeTempValor : lerTemperatura();
  if (isnan(t)) {
    sensorOk = false;
    if (agora - ultimoErro >= 1000) { ultimoErro = agora; Serial.println("ERRO,sensor"); }
    return;
  }
  sensorOk = true;
  tF = tF * 0.9 + t * 0.1;  // filtro para suavizar ruído

  if (agora - ultimaAmostra >= 1000) {  // uma amostra por segundo; a mais antiga é a de 30 s atrás
    ultimaAmostra = agora;
    referencia = historico[idx];
    historico[idx] = tF;
    idx = (idx + 1) % N;
  }

  float delta = tF - referencia;
  // Histerese: para sair de um estado precisa cair 1 grau abaixo do limite
  float h1 = (estado >= 1) ? 1.0 : 0.0;
  float h2 = (estado == 2) ? 1.0 : 0.0;
  int novo = 0;
  if (delta >= deltaAtencao - h1 || tF >= TEMP_ATENCAO_ABS - h1) novo = 1;
  if (delta >= deltaAtencao * 2 - h2 || tF >= TEMP_ALARME_ABS - h2) novo = 2;

  if (novo != estado) {
    estado = novo;
    tempSilenciado = false;  // nova situação: volta a avisar
    calarBuzzer();
  }
}

/* ===== Prioridade das saídas: teste > alarme térmico > alerta do painel > atenção térmica > repouso ===== */
void atualizarSaidas(unsigned long agora) {
  if (testeAte != 0) {
    if ((long)(agora - testeAte) < 0) {
      definirLed(1, true); definirLed(2, true); desenhar(IMG_CHEIO);
      return;
    }
    testeAte = 0;
  }

  bool termicoLigado = tempAtivo && estado > 0;

  if (termicoLigado && estado == 2 && !tempSilenciado) {
    bool fase = (agora / 200) % 2;
    definirLed(1, fase); definirLed(2, !fase);
    desenhar(fase ? IMG_X : IMG_VAZIO);
    bipPeriodico(agora, 400, 2000, 200);
    return;
  }

  if (remoto) {
    unsigned long e = agora - remotoInicio;
    if (e >= remotoDuracao) {
      remoto = false;
    } else {
      const byte* icone = ICONES[remotoIcone];
      if (remotoPadrao == 1) {            // alternado lento
        bool fase = (e % 1000) < 500;
        definirLed(1, fase); definirLed(2, !fase);
        desenhar(icone);
        bipPeriodico(agora, 2000, 1200, 120);
      } else if (remotoPadrao == 2) {     // pulso suave: os dois juntos, 1 s aceso / 1 s apagado
        bool fase = (e % 2000) < 1000;
        definirLed(1, fase); definirLed(2, fase);
        desenhar(icone);
        bipPeriodico(agora, 2000, 900, 200);
      } else {                            // intermitente (prioritário)
        bool fase = (e % 500) < 250;
        definirLed(1, fase); definirLed(2, !fase);
        desenhar(fase ? icone : IMG_VAZIO);
        bipPeriodico(agora, 500, 2000, 150);
      }
      return;
    }
  }

  if (termicoLigado && estado == 2) {     // alarme já reconhecido: aviso fixo, sem som
    definirLed(1, true); definirLed(2, true);
    desenhar(IMG_X);
    return;
  }

  if (termicoLigado && estado == 1) {
    if (tempSilenciado) {
      definirLed(1, true);
    } else {
      definirLed(1, (agora / 800) % 2);
      bipPeriodico(agora, 2000, 1200, 150);
    }
    definirLed(2, false);
    desenhar(IMG_ALERTA);
    return;
  }

  definirLed(1, false); definirLed(2, false);
  desenhar(IMG_OK);
}

/* ===== Telemetria ===== */
void enviarHW(unsigned long agora) {
  bool buz = buzzerLigado();
  if (buz != buzzerReportado) hwMudou = true;
  // Na mudança (no máximo a cada 80 ms, para não saturar 9600 baud) e a cada 1 s como confirmação.
  if (!(hwMudou && agora - ultimoHW >= 80) && agora - ultimoHW < 1000) return;
  ultimoHW = agora;
  hwMudou = false;
  buzzerReportado = buz;
  Serial.print("HW,");
  Serial.print(led1 ? 1 : 0); Serial.print(',');
  Serial.print(led2 ? 1 : 0); Serial.print(',');
  Serial.print(buz ? 1 : 0); Serial.print(',');
  for (uint8_t r = 0; r < 8; r++) {
    if (tela[r] < 16) Serial.print('0');
    Serial.print(tela[r], HEX);
  }
  Serial.println();
}

void enviarTemp(unsigned long agora) {
  if (agora - ultimoTemp < 1000 || !sensorOk) return;
  ultimoTemp = agora;
  Serial.print("TEMP,");
  Serial.print(tF, 1); Serial.print(',');
  Serial.print(tF - referencia, 2); Serial.print(',');
  Serial.print(estado); Serial.print(',');
  Serial.print(tempSilenciado ? 1 : 0); Serial.print(',');
  Serial.println(testeTemp ? 1 : 0);
}

/* ===== Comandos do painel ===== */
void parar() {
  remoto = false;
  testeAte = 0;
  if (testeTemp) encerrarTesteTemp();
  else if (estado > 0) tempSilenciado = true;
  calarBuzzer();
}

void tratarComando(char* linha) {
  int a, b, c, d, e, f;
  int lidos = sscanf(linha, "ALERTA,%d,%d,%d,%d,%d,%d", &a, &b, &c, &d, &e, &f);
  if (lidos >= 5) {
    remoto = true;
    remotoInicio = millis();
    remotoDuracao = (unsigned long)constrain(e, 1, 3600) * 1000UL;
    remotoPadrao = constrain(d, 1, 3);
    remotoIcone = (lidos == 6) ? constrain(f, 0, 5) : 0;
    ultimoBip = 0;
  } else if (sscanf(linha, "ATIVO,%d,%d", &a, &b) == 2) {
    if (a == 4) tempAtivo = (b == 1);
  } else if (sscanf(linha, "CFGT,%d", &a) == 1) {
    deltaAtencao = constrain(a, 5, 50) / 10.0;
  } else if (strncmp(linha, "PARAR", 5) == 0 || strncmp(linha, "SILENCIAR", 9) == 0) {
    parar();
  } else if (strncmp(linha, "TESTE_TEMP", 10) == 0) {   // antes de "TESTE", que também casaria aqui
    if (sscanf(linha, "TESTE_TEMP,%d,%d", &a, &b) == 2) iniciarTesteTemp(a, b);
    else iniciarTesteTemp(600, 20);
  } else if (strncmp(linha, "TESTE", 5) == 0) {
    testeAte = millis() + 3000;
    bip(1000, 300);
  }
}

void lerSerial() {
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n') {
      if (!linhaGrande) {
        buffer[tamanhoBuffer] = '\0';
        tratarComando(buffer);
      }
      tamanhoBuffer = 0;
      linhaGrande = false;
    } else if (ch != '\r') {
      if (tamanhoBuffer < sizeof(buffer) - 1) buffer[tamanhoBuffer++] = ch;
      else linhaGrande = true;
    }
  }
}

void setup() {
  Serial.begin(9600);
  pinMode(PIN_LED1, OUTPUT);
  pinMode(PIN_LED2, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  lc.shutdown(0, false);
  lc.setIntensity(0, 4);
  lc.clearDisplay(0);
  for (uint8_t r = 0; r < 8; r++) tela[r] = 0;

  // Autoteste rápido: tudo aceso por 1 s
  desenhar(IMG_CHEIO);
  definirLed(1, true); definirLed(2, true);
  tone(PIN_BUZZER, 1000, 300);
  delay(1000);
  definirLed(1, false); definirLed(2, false);
  desenhar(IMG_VAZIO);

  iniciarHistorico();  // ~2 s: não encoste no sensor
  Serial.println("HELLO,alerta_visual_temp");
}

void loop() {
  unsigned long agora = millis();
  lerSerial();
  atualizarTemperatura(agora);
  agora = millis();
  atualizarSaidas(agora);
  enviarHW(agora);
  enviarTemp(agora);
}
