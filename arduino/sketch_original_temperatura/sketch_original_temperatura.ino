#include <LedControl.h>

// ---------- Pinos ----------
const int LED1 = 6;
const int LED2 = 7;
const int BUZZER = 8;
const int NTC_PIN = A0;
LedControl lc(12, 11, 10, 1);  // DIN, CLK, CS, 1 matriz

// ---------- NTC 10K com resistor fixo de 10K ----------
const float R_FIXO = 10000.0;
const float R_NTC_25C = 10000.0;
const float BETA = 3950.0;

// ---------- Limites ----------
const float DELTA_ATENCAO = 2.0;     // subida em 30 s
const float DELTA_ALARME  = 4.0;     // subida em 30 s
const float TEMP_ATENCAO_ABS = 40.0; // seguranca: temperatura absoluta
const float TEMP_ALARME_ABS  = 55.0;

// ---------- Desenhos da matriz ----------
const byte IMG_OK[8]     = {0x00, 0x01, 0x02, 0x04, 0x88, 0x50, 0x20, 0x00};
const byte IMG_ALERTA[8] = {0x18, 0x18, 0x18, 0x18, 0x18, 0x00, 0x18, 0x18};
const byte IMG_X[8]      = {0x81, 0x42, 0x24, 0x18, 0x18, 0x24, 0x42, 0x81};

const char* NOMES[] = {"NORMAL", "ATENCAO", "ALARME"};

// ---------- Historico de 30 s (1 amostra por segundo) ----------
const int N = 30;
float historico[N];
int idx = 0;
float tF = 25.0;         // temperatura filtrada
float referencia = 25.0; // temperatura de 30 s atras

int estado = -1;
bool fase = false;
unsigned long ultimoBlink = 0, ultimoBip = 0, ultimoSerial = 0, ultimaAmostra = 0;

float lerTemperatura() {
  long soma = 0;
  for (int i = 0; i < 10; i++) {
    soma += analogRead(NTC_PIN);
    delay(2);
  }
  float adc = soma / 10.0;
  if (adc < 1 || adc > 1022) return NAN;
  float r = R_FIXO * adc / (1023.0 - adc);  // NTC entre A0 e GND
  float k = 1.0 / (1.0 / 298.15 + log(r / R_NTC_25C) / BETA);
  return k - 273.15;
}

void mostra(const byte img[8]) {
  for (int r = 0; r < 8; r++) lc.setRow(0, r, img[r]);
}

void autoTeste() {
  for (int r = 0; r < 8; r++) lc.setRow(0, r, 0xFF);
  digitalWrite(LED1, HIGH);
  digitalWrite(LED2, HIGH);
  tone(BUZZER, 1000, 300);
  delay(1000);
  digitalWrite(LED1, LOW);
  digitalWrite(LED2, LOW);
  lc.clearDisplay(0);
  delay(300);
}

void iniciarHistorico() {
  Serial.println("Iniciando... nao encoste no sensor");
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
  Serial.print("Temperatura inicial: ");
  Serial.print(t0);
  Serial.println(" C");
}

void mudouEstado() {
  digitalWrite(LED1, LOW);
  digitalWrite(LED2, LOW);
  noTone(BUZZER);
  fase = false;
  if (estado == 0) mostra(IMG_OK);
  else if (estado == 1) mostra(IMG_ALERTA);
  else mostra(IMG_X);
}

void setup() {
  Serial.begin(9600);
  pinMode(LED1, OUTPUT);
  pinMode(LED2, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  lc.shutdown(0, false);
  lc.setIntensity(0, 4);
  lc.clearDisplay(0);

  autoTeste();
  iniciarHistorico();
}

void loop() {
  unsigned long agora = millis();
  float t = lerTemperatura();

  if (isnan(t)) {
    Serial.println("Erro de leitura: confira os fios do sensor no A0");
    delay(500);
    return;
  }

  // Filtro para suavizar ruido
  tF = tF * 0.9 + t * 0.1;

  // Uma amostra por segundo; a mais antiga e a de 30 s atras
  if (agora - ultimaAmostra >= 1000) {
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
  if (delta >= DELTA_ATENCAO - h1 || tF >= TEMP_ATENCAO_ABS - h1) novo = 1;
  if (delta >= DELTA_ALARME - h2 || tF >= TEMP_ALARME_ABS - h2) novo = 2;

  if (novo != estado) {
    estado = novo;
    mudouEstado();
  }

  if (estado == 1) {
    if (agora - ultimoBlink >= 800) {
      ultimoBlink = agora;
      fase = !fase;
      digitalWrite(LED1, fase);
    }
    if (agora - ultimoBip >= 2000) {
      ultimoBip = agora;
      tone(BUZZER, 1200, 150);
    }
  } else if (estado == 2) {
    if (agora - ultimoBlink >= 200) {
      ultimoBlink = agora;
      fase = !fase;
      digitalWrite(LED1, fase);
      digitalWrite(LED2, !fase);
      if (fase) mostra(IMG_X);
      else lc.clearDisplay(0);
    }
    if (agora - ultimoBip >= 400) {
      ultimoBip = agora;
      tone(BUZZER, 2000, 200);
    }
  }

  if (agora - ultimoSerial >= 1000) {
    ultimoSerial = agora;
    Serial.print("Temp: ");
    Serial.print(tF);
    Serial.print(" C  (30s atras ");
    Serial.print(referencia);
    Serial.print(")  Variacao: ");
    Serial.print(delta);
    Serial.print("  Estado: ");
    Serial.println(NOMES[estado]);
  }
}