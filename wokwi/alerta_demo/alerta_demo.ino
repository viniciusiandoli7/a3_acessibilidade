/*
  Alerta Visual — firmware didático para Wokwi.
  O circuito virtual usa 4 BOTÕES em vez de microfones reais.
  Cada pressionamento envia EVT pelo mesmo protocolo do Arduino físico.
  NÃO usar este arquivo no hardware com microfones: use arduino/alerta_visual/alerta_visual.ino.
*/
#include <Arduino.h>
#include <math.h>

const uint8_t BUTTONS[4] = {2, 3, 4, 6};
const uint8_t R = 9, G = 10, B = 11, VIB = 5;
bool activeChannel[4] = {true, true, true, false};
bool previous[4] = {false, false, false, false};
unsigned long lastEvent[4] = {0,0,0,0};
unsigned long lastStatus = 0, lastReadings = 0, alertStart = 0, alertMs = 0;
bool alertActive = false, ledOn = false, vibOn = false;
uint8_t red = 0, green = 0, blue = 0, pattern = 1;
char input[64];
uint8_t nextChar = 0;

void turnOff() {
  analogWrite(R,0); analogWrite(G,0); analogWrite(B,0); digitalWrite(VIB,LOW);
  ledOn = false; vibOn = false;
}
void startAlert(int rr,int gg,int bb,int pat,unsigned long seconds) {
  red = constrain(rr,0,255); green=constrain(gg,0,255); blue=constrain(bb,0,255);
  pattern = constrain(pat,1,3); alertStart=millis(); alertMs=seconds*1000UL;
  alertActive = true;
}
void command(char *cmd) {
  int a,b,c,d,e;
  if (sscanf(cmd,"ATIVO,%d,%d",&a,&b)==2 && a>=0 && a<4) activeChannel[a]=(b==1);
  else if (sscanf(cmd,"ALERTA,%d,%d,%d,%d,%d",&a,&b,&c,&d,&e)==5) startAlert(a,b,c,d,e);
  else if (strncmp(cmd,"PARAR",5)==0) {alertActive=false;turnOff();}
  else if (strncmp(cmd,"TESTE",5)==0) startAlert(0,255,0,1,3);
  // CFG aceito, sem efeito: entradas no simulador são botões binários, não microfones.
}
void readSerial() {
  while (Serial.available()) {
    const char c=Serial.read();
    if (c=='\n') {input[nextChar]=0;command(input);nextChar=0;}
    else if (c!='\r' && nextChar<sizeof(input)-1) input[nextChar++]=c;
  }
}
void updateOutput() {
  if (!alertActive) return;
  unsigned long ms=millis()-alertStart;
  if (ms>=alertMs) {alertActive=false;turnOff();return;}
  uint8_t light=0;
  if(pattern==1) light=(ms%1000<500)?255:0;
  else if(pattern==2) light=uint8_t(127.5+127.5*sin((ms%2000)*6.28318/2000.0));
  else light=(ms%500<250)?255:0;
  vibOn=(pattern==2)?(ms%2000<400):(pattern==3)?(ms%250<150):(ms%1000<150);
  analogWrite(R,(int)red*light/255);analogWrite(G,(int)green*light/255);analogWrite(B,(int)blue*light/255);
  digitalWrite(VIB,vibOn?HIGH:LOW);
  ledOn=(light>0) && (red>0 || green>0 || blue>0);
}
void setup() {
  Serial.begin(9600);
  for(uint8_t i=0;i<4;i++) pinMode(BUTTONS[i],INPUT_PULLUP);
  pinMode(R,OUTPUT);pinMode(G,OUTPUT);pinMode(B,OUTPUT);pinMode(VIB,OUTPUT);
  turnOff();
  Serial.println("HELLO,alerta_visual_wokwi");
}
void loop() {
  readSerial();
  for(uint8_t i=0;i<4;i++) {
    bool pressed=digitalRead(BUTTONS[i])==LOW;
    if (pressed && !previous[i] && activeChannel[i] && millis()-lastEvent[i]>700) {
      lastEvent[i]=millis();
      Serial.print("EVT,");Serial.print(i);Serial.println(",650");
    }
    previous[i]=pressed;
  }
  updateOutput();
  if (millis()-lastReadings>=2000) {
    lastReadings=millis();
    Serial.print("READINGS");
    for(uint8_t i=0;i<4;i++){Serial.print(',');Serial.print(activeChannel[i]?(previous[i]?650:0):-1);}
    Serial.println();
  }
  if (millis()-lastStatus>=1000) {
    lastStatus=millis();
    Serial.print("STATUS,");Serial.print(alertActive?1:0);Serial.print(',');
    Serial.print(ledOn?1:0);Serial.print(',');Serial.println(vibOn?1:0);
  }
  delay(8);
}
