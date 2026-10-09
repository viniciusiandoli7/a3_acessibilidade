/*
  Sistema de Alerta Visual - Arduino Uno

  LIGAÇÕES
    Sensores de som (módulo analógico tipo KY-038 / MAX4466), saída analógica (AO):
      Canal 0 (porta / campainha)  -> A0
      Canal 1 (monitor do bebê)    -> A1
      Canal 2 (detector de fumaça) -> A2   (escuta o apito do detector)
      Canal 3 (personalizável)     -> A3
    Fita/LED RGB (via transistores ou módulo, nunca direto se for fita 12V):
      Vermelho -> D9 | Verde -> D10 | Azul -> D11   (PWM)
    Módulo de vibração (via transistor + diodo) -> D5 (PWM)
    Alimente sensores com 5V e GND comum.

  PROTOCOLO SERIAL (9600 baud, uma linha por mensagem)
    Arduino -> PC:  HELLO,alerta_visual
                    EVT,<canal>,<pico>
                    STATUS,<alerta>,<led>,<motor> (cada 1 segundo)
                    READINGS,<A0>,<A1>,<A2>,<A3> (amplitude; -1 = sem leitura)
    PC -> Arduino:  CFG,<canal>,<limiar>              (amplitude mínima 0-1023)
                    ATIVO,<canal>,<0|1>
                    ALERTA,<r>,<g>,<b>,<padrao>,<segundos>
                    PARAR
                    TESTE
    Padrões: 1 = pisca lento | 2 = pulsante suave | 3 = intermitente (2 Hz; considerar fotossensibilidade)
*/

const uint8_t PINOS_SOM[4] = {A0, A1, A2, A3};
const uint8_t PIN_R = 9;
const uint8_t PIN_G = 10;
const uint8_t PIN_B = 11;
const uint8_t PIN_VIB = 5;

const unsigned long JANELA_MS = 20;   // janela de amostragem por canal
const unsigned long COOLDOWN_MS = 3000;

uint16_t limiar[4] = {300, 300, 300, 300};
bool ativo[4] = {true, true, true, false};
unsigned long ultimoEvento[4] = {0, 0, 0, 0};

bool alertaAtivo = false;
unsigned long inicioAlerta = 0;
unsigned long duracaoAlerta = 0;
uint8_t corR = 0, corG = 0, corB = 0, padrao = 1;
bool ledLigado = false, motorLigado = false;
unsigned long ultimaTelemetria = 0;
unsigned long ultimaLeitura = 0;
int ultimaAmplitude[4] = {-1,-1,-1,-1};

char buffer[48];
uint8_t tamanhoBuffer = 0;

void definirLed(uint8_t intensidade) {
  analogWrite(PIN_R, (uint16_t)corR * intensidade / 255);
  analogWrite(PIN_G, (uint16_t)corG * intensidade / 255);
  analogWrite(PIN_B, (uint16_t)corB * intensidade / 255);
}

void apagarTudo() {
  analogWrite(PIN_R, 0);
  analogWrite(PIN_G, 0);
  analogWrite(PIN_B, 0);
  analogWrite(PIN_VIB, 0);
  ledLigado = false;
  motorLigado = false;
}

void iniciarAlerta(uint8_t r, uint8_t g, uint8_t b, uint8_t p, unsigned long segundos) {
  corR = r; corG = g; corB = b; padrao = p;
  duracaoAlerta = segundos * 1000UL;
  inicioAlerta = millis();
  alertaAtivo = true;
}

void atualizarAlerta() {
  if (!alertaAtivo) return;
  unsigned long t = millis() - inicioAlerta;
  if (t >= duracaoAlerta) {
    alertaAtivo = false;
    apagarTudo();
    return;
  }
  uint8_t luz = 0;
  bool vibrar = false;
  if (padrao == 1) {                       // pisca lento: 500 ms ligado / 500 ms desligado
    luz = ((t % 1000) < 500) ? 255 : 0;
    vibrar = (t % 1000) < 150;
  } else if (padrao == 2) {                // pulsante suave: ciclo de 2 s
    float fase = (t % 2000) / 2000.0;
    luz = (uint8_t)(127.5 + 127.5 * sin(fase * 6.28318));
    vibrar = (t % 2000) < 400;
  } else {                                 // intermitente a 2 Hz (ainda considerar fotossensibilidade)
    luz = ((t % 500) < 250) ? 255 : 0;
    vibrar = (t % 250) < 150;
  }
  definirLed(luz);
  analogWrite(PIN_VIB, vibrar ? 255 : 0);
  ledLigado = luz > 0 && (corR > 0 || corG > 0 || corB > 0);
  motorLigado = vibrar;
}

uint16_t lerPico(uint8_t canal) {
  unsigned long inicio = millis();
  uint16_t minimo = 1023, maximo = 0;
  while (millis() - inicio < JANELA_MS) {
    uint16_t v = analogRead(PINOS_SOM[canal]);
    if (v < minimo) minimo = v;
    if (v > maximo) maximo = v;
    atualizarAlerta();                      // mantém LED/vibração fluidos durante a leitura
  }
  return maximo - minimo;
}

void tratarComando(char* linha) {
  int a, b, c, d, e;
  if (sscanf(linha, "CFG,%d,%d", &a, &b) == 2) {
    if (a >= 0 && a < 4) limiar[a] = constrain(b, 20, 1000);
  } else if (sscanf(linha, "ATIVO,%d,%d", &a, &b) == 2) {
    if (a >= 0 && a < 4) ativo[a] = (b == 1);
  } else if (sscanf(linha, "ALERTA,%d,%d,%d,%d,%d", &a, &b, &c, &d, &e) == 5) {
    iniciarAlerta(constrain(a, 0, 255), constrain(b, 0, 255), constrain(c, 0, 255), d, e);
  } else if (strncmp(linha, "PARAR", 5) == 0) {
    alertaAtivo = false;
    apagarTudo();
  } else if (strncmp(linha, "TESTE", 5) == 0) {
    iniciarAlerta(0, 255, 0, 1, 3);        // 3 s de verde para conferir o hardware
  }
}

void lerSerial() {
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n') {
      buffer[tamanhoBuffer] = '\0';
      tratarComando(buffer);
      tamanhoBuffer = 0;
    } else if (ch != '\r' && tamanhoBuffer < sizeof(buffer) - 1) {
      buffer[tamanhoBuffer++] = ch;
    }
  }
}

void setup() {
  pinMode(PIN_R, OUTPUT);
  pinMode(PIN_G, OUTPUT);
  pinMode(PIN_B, OUTPUT);
  pinMode(PIN_VIB, OUTPUT);
  apagarTudo();
  Serial.begin(9600);
  Serial.println("HELLO,alerta_visual");
}

void loop() {
  for (uint8_t c = 0; c < 4; c++) {
    lerSerial();
    if (!ativo[c]) { ultimaAmplitude[c] = -1; continue; }
    if (alertaAtivo && c != 2) { ultimaAmplitude[c] = -1; continue; }    // ruído do motor não deve disparar outros canais; fumaça sempre escuta
    uint16_t pico = lerPico(c);
    ultimaAmplitude[c] = pico;
    if (pico >= limiar[c] && millis() - ultimoEvento[c] > COOLDOWN_MS) {
      ultimoEvento[c] = millis();
      Serial.print("EVT,");
      Serial.print(c);
      Serial.print(",");
      Serial.println(pico);
    }
  }
  atualizarAlerta();
  if (millis() - ultimaLeitura >= 2000) {
    ultimaLeitura = millis();
    Serial.print("READINGS");
    for (uint8_t i = 0; i < 4; i++) {
      Serial.print(','); Serial.print(ultimaAmplitude[i]);
    }
    Serial.println();
  }
  if (millis() - ultimaTelemetria >= 1000) {
    ultimaTelemetria = millis();
    // Reporta a lógica do firmware, sem leitura de corrente real nos atuadores.
    Serial.print("STATUS,");
    Serial.print(alertaAtivo ? 1 : 0);
    Serial.print(',');
    Serial.print(ledLigado ? 1 : 0);
    Serial.print(',');
    Serial.println(motorLigado ? 1 : 0);
  }
}
