/*
 * Sistema de Alerta Visual - Backend
 * ----------------------------------
 * - Conversa com o Arduino pela porta serial (SERIAL_PORT=COM3 ou /dev/ttyUSB0)
 * - Sem SERIAL_PORT, roda em MODO SIMULAÇÃO (botão "Simular Evento de Teste")
 * - Expõe API REST + WebSocket (/ws) para o painel web
 * - Serve a pasta ../frontend
 */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const net = require('net');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const SERIAL_PORT = process.env.SERIAL_PORT || '';
// Ponte opcional: Wokwi VS Code -> script Python -> socket TCP local -> backend
const SIM_TCP_PORT = process.env.SIM_TCP_PORT ? Number(process.env.SIM_TCP_PORT) : 0;
if (SIM_TCP_PORT && (!Number.isInteger(SIM_TCP_PORT) || SIM_TCP_PORT < 1024 || SIM_TCP_PORT > 65535)) {
  throw new Error('SIM_TCP_PORT precisa ser uma porta entre 1024 e 65535');
}
const BAUD = 9600;
// DATA_DIR permite apontar os dados para outra pasta (usado pelos testes para não misturar com o histórico real).
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'eventos.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const HOST = process.env.HOST || '127.0.0.1';
const COOLDOWN_MS = 3000;          // evita registrar o mesmo toque várias vezes
const DURACAO_ALERTA_MS = 15000;   // alertas comuns terminam sozinhos
const DURACAO_CRITICO_MS = 600000; // expira após 10 minutos ou ao silenciar
const MAX_EVENTOS = 1000;

/* ---------- Catálogo de tipos de evento ---------- */
const TIPOS = {
  campainha: { rotulo: 'Campainha', origem: 'Entrada', critico: false, led: 'Pisca lento', vibracao: 'Pulso curto', padrao: 1 },
  bebe:      { rotulo: 'Bebê',      origem: 'Quarto',  critico: false, led: 'Pulsante suave', vibracao: 'Pulso médio', padrao: 2 },
  fumaca:    { rotulo: 'Alarme de fumaça', origem: 'Cozinha', critico: true, led: 'Pisca intermitente', vibracao: 'Pulso rápido', padrao: 3 },
  custom:    { rotulo: 'Personalizado', origem: 'Sala', critico: false, led: 'Pisca lento', vibracao: 'Pulso curto', padrao: 1 }
};
const CANAIS = { porta: 0, bebe: 1, fumaca: 2, custom: 3 };          // id do dispositivo -> pino no Arduino
const TIPO_POR_DISPOSITIVO = { porta: 'campainha', bebe: 'bebe', fumaca: 'fumaca', custom: 'custom' };
const CORES_RGB = { azul: [0, 0, 255], laranja: [255, 110, 0], vermelho: [255, 0, 0] };

/* ---------- Estado em memória ---------- */
const estado = {
  exibicao: true, // "Dispositivos de Exibição Ativos" (Arduino, fita LED, vibração)
  dispositivos: {
    porta:  { id: 'porta',  tipo: 'campainha', ativo: true, sensibilidade: 60, cor: 'laranja' },
    bebe:   { id: 'bebe',   tipo: 'bebe',      ativo: true, sensibilidade: 60, cor: 'azul' },
    fumaca: { id: 'fumaca', tipo: 'fumaca',    ativo: true, sensibilidade: 60, cor: 'vermelho' },
    custom: { id: 'custom', tipo: 'custom',    ativo: false, sensibilidade: 60, cor: 'azul' }
  }
};
const ultimoPorDispositivo = {};
let leituras = {};
let instanteLeituras = null;
let ultimoStatus = null;
let eventos = [];
let alerta = null;       // alerta em andamento
let timerAlerta = null;
let hardware = {
  modo: SIM_TCP_PORT ? 'wokwi' : SERIAL_PORT ? 'serial' : 'simulado',
  conectado: false, porta: SIM_TCP_PORT ? 'TCP:' + SIM_TCP_PORT : SERIAL_PORT || null,
  ultimaMensagem: null, ledAtivo: false, motorAtivo: false, firmware: null
};
let serial = null;
let simSocket = null;
let encerrando = false;
let ultimaSimulacao = 0;


/* ---------- Persistência ---------- */
function carregarEventos() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DATA_FILE)) {
      const lidos = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!Array.isArray(lidos)) throw new Error('Histórico não é uma lista');
      eventos = lidos.filter(e => e && typeof e.id === 'string' && Object.hasOwn(TIPOS,e.tipo) &&
        typeof e.hora === 'string' && Number.isFinite(Date.parse(e.hora)))
        .slice(-MAX_EVENTOS).map(e=>e.status==='pendente' ? {...e,status:'interrompido'} : e);
    }
  } catch (e) {
    console.warn('Não foi possível ler o histórico:', e.message);
    // Preserva o arquivo problemático para recuperação manual, em vez de sobrescrevê-lo no próximo evento.
    try { fs.copyFileSync(DATA_FILE, DATA_FILE + '.corrompido-' + Date.now()); } catch (_) { /* sem cópia possível */ }
    eventos = [];
  }
}
function salvarEventos() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // Substituição atômica: evita histórico parcial se o processo cair durante a escrita.
    const temp = DATA_FILE + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(eventos.slice(-MAX_EVENTOS), null, 2));
    fs.renameSync(temp, DATA_FILE);
  } catch (e) {
    console.warn('Não foi possível salvar o histórico:', e.message);
  }
}

/* Configurações persistentes: valores permitidos explicitamente validados ao carregar. */
function carregarConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return;
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE,'utf8'));
    if (typeof cfg.exibicao === 'boolean') estado.exibicao = cfg.exibicao;
    for (const [id, atual] of Object.entries(estado.dispositivos)) {
      const salvo = cfg.dispositivos && cfg.dispositivos[id];
      if (!salvo || typeof salvo !== 'object') continue;
      if (typeof salvo.ativo === 'boolean') atual.ativo = salvo.ativo;
      if (Number.isFinite(salvo.sensibilidade)) atual.sensibilidade = Math.max(0,Math.min(100,Math.round(salvo.sensibilidade)));
      if (Object.hasOwn(CORES_RGB,salvo.cor)) atual.cor = salvo.cor;
    }
  } catch (e) { console.warn('Configuração inválida; usando padrões:',e.message); }
}
function salvarConfig() {
  try {
    fs.mkdirSync(DATA_DIR,{recursive:true});
    const temp = CONFIG_FILE + '.tmp';
    fs.writeFileSync(temp,JSON.stringify(estado,null,2));
    fs.renameSync(temp, CONFIG_FILE);
  } catch (e) { console.warn('Falha ao salvar configuração:', e.message); }
}

/* ---------- WebSocket ---------- */
const app = express();
const server = http.createServer(app);
const MAX_CLIENTES_WS = 20;
// Somente páginas servidas por este mesmo servidor podem abrir o WebSocket (evita sites externos espionando o painel).
const origemPermitida = (origin, host) => {
  if (!origin) return true; // clientes que não são navegadores (testes, curl)
  try { return new URL(origin).host === host; } catch (_) { return false; }
};
const wss = new WebSocketServer({
  server, path: '/ws',
  verifyClient: (info) => origemPermitida(info.origin, info.req.headers.host)
});

function transmitir(mensagem) {
  const texto = JSON.stringify(mensagem);
  wss.clients.forEach((c) => { if (c.readyState === 1) c.send(texto); });
}
wss.on('connection', (ws) => {
  if (wss.clients.size > MAX_CLIENTES_WS) { ws.close(1013, 'Muitos clientes conectados'); return; }
  ws.vivo = true;
  ws.on('pong', () => { ws.vivo = true; });
  ws.on('error', () => {});
  ws.send(JSON.stringify({ tipo: 'estado' }));
});
// Heartbeat: remove conexões "fantasma" (aba fechada sem aviso, rede caiu).
const heartbeat = typeof setInterval === 'function' ? setInterval(() => {
  wss.clients.forEach((c) => {
    if (c.vivo === false) { c.terminate(); return; }
    c.vivo = false;
    try { c.ping(); } catch (_) { /* ignorado */ }
  });
}, 30000) : null;
if (heartbeat && heartbeat.unref) heartbeat.unref();

/* ---------- Arduino ---------- */
function limparTelemetria() {
  leituras = {}; instanteLeituras = null; ultimoStatus = null;
  hardware.ledAtivo = false; hardware.motorAtivo = false;
}
function estadoDiagnostico() {
  const agora = Date.now();
  const ligado = hardware.conectado && hardware.modo !== 'simulado';
  const idadeStatus = ultimoStatus ? agora-new Date(ultimoStatus).getTime() : null;
  const idadeLeituras = instanteLeituras ? agora-new Date(instanteLeituras).getTime() : null;
  return {
    modo: hardware.modo, conectado: ligado, firmware: hardware.firmware,
    status: { horario: ultimoStatus, idadeMs:idadeStatus, recente: ligado && idadeStatus !== null && idadeStatus < 5000 },
    entradas: Object.values(estado.dispositivos).map(d => {
      const dado = leituras[d.id];
      const ultimo = eventos.slice().reverse().find(e=>e.dispositivo===d.id);
      return {id:d.id,ativo:d.ativo,ultimoEvento:ultimo?.hora || null,
        amplitude: ligado && idadeLeituras !== null && idadeLeituras < 6000 && Number.isInteger(dado) ? dado : null,
        ultimaLeitura: instanteLeituras,estado:!d.ativo?'desativado':!ligado?'sem_conexao':idadeLeituras===null?'aguardando':idadeLeituras>=6000?'desatualizado':'informando'};
    }),
    saidas: {led: ligado && idadeStatus !== null && idadeStatus < 5000 ? hardware.ledAtivo : null,
      motor: ligado && idadeStatus !== null && idadeStatus < 5000 ? hardware.motorAtivo : null},
    aviso:'Telemetria é uma declaração do firmware, não prova elétrica ou de segurança.'
  };
}

function limiarDeSensibilidade(pct) {
  // 0% = quase surdo (limiar alto) | 100% = muito sensível (limiar baixo)
  return Math.round(600 - (Math.max(0, Math.min(100, pct)) * 5.6));
}
function enviarHardware(linha) {
  if (simSocket && !simSocket.destroyed) { simSocket.write(linha + '\n'); return true; }
  if (serial && serial.isOpen) { serial.write(linha + '\n'); return true; }
  return false;
}
function sincronizarHardware() {
  Object.values(estado.dispositivos).forEach((d) => {
    const canal = CANAIS[d.id];
    enviarHardware(`CFG,${canal},${limiarDeSensibilidade(d.sensibilidade)}`);
    enviarHardware(`ATIVO,${canal},${d.ativo ? 1 : 0}`);
  });
}
function iniciarSerial() {
  if (SIM_TCP_PORT) { iniciarPonteWokwi(); return; }
  if (!SERIAL_PORT) {
    console.log('Modo SIMULAÇÃO (defina SERIAL_PORT para usar o Arduino).');
    return;
  }
  let SerialPort, ReadlineParser;
  try {
    ({ SerialPort, ReadlineParser } = require('serialport'));
    if (!ReadlineParser) ({ ReadlineParser } = require('@serialport/parser-readline'));
  } catch (e) {
    console.warn('Pacote serialport indisponível. Rodando em simulação.');
    hardware.modo = 'simulado';
    return;
  }
  // Falha de abertura e evento 'close' podem ocorrer juntos: só pode existir UMA tentativa de reconexão agendada,
  // senão duas instâncias disputariam a mesma porta.
  let reconectando = null;
  const agendarReconexao = () => {
    if (reconectando || encerrando) return;
    reconectando = setTimeout(() => { reconectando = null; abrir(); }, 5000);
  };
  const abrir = () => {
    const porta = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD }, (err) => {
      if (err) {
        console.warn('Falha ao abrir', SERIAL_PORT, '-', err.message);
        hardware.conectado = false;
        agendarReconexao();
      }
    });
    serial = porta;
    const parser = porta.pipe(new ReadlineParser({ delimiter: '\n' }));
    porta.on('open', () => {
      console.log('Arduino conectado em', SERIAL_PORT);
      hardware.conectado = true;
      transmitir({ tipo: 'estado' });
      setTimeout(sincronizarHardware, 2500); // o Uno reinicia ao abrir a serial
    });
    porta.on('close', () => {
      if (serial !== porta) return;
      hardware.conectado = false;
      limparTelemetria();
      transmitir({ tipo: 'estado' });
      agendarReconexao();
    });
    porta.on('error', (e) => console.warn('Erro serial:', e.message));
    parser.on('data', (linha) => tratarLinhaSerial(String(linha).trim()));
  };
  abrir();
}
// Não expor a ponte na rede. Somente o bridge local poderá se conectar.
function iniciarPonteWokwi() {
  const ponte = net.createServer((socket) => {
    if (simSocket && !simSocket.destroyed) simSocket.destroy();
    simSocket = socket;
    hardware.conectado = true;
    hardware.ultimaMensagem = null;
    limparTelemetria();
    hardware.ledAtivo = false;
    hardware.motorAtivo = false;
    transmitir({ tipo: 'estado' });
    console.log('Ponte Wokwi conectada (TCP local).');
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > 4096) buffer = buffer.slice(-4096);
      let pos;
      while ((pos = buffer.indexOf('\n')) !== -1) {
        const linha = buffer.slice(0, pos).trim();
        buffer = buffer.slice(pos + 1);
        if (linha) tratarLinhaSerial(linha);
      }
    });
    socket.on('close', () => {
      if (simSocket !== socket) return;
      simSocket = null;
      hardware.conectado = false;
      hardware.ultimaMensagem = null;
      limparTelemetria();
      hardware.ledAtivo = false;
      hardware.motorAtivo = false;
      transmitir({ tipo: 'estado' });
      console.log('Ponte Wokwi desconectada.');
    });
    socket.on('error', (e) => console.warn('Ponte Wokwi:', e.message));
    setTimeout(sincronizarHardware, 500);
  });
  ponte.listen(SIM_TCP_PORT, '127.0.0.1', () =>
    console.log('Esperando ponte Wokwi em 127.0.0.1:' + SIM_TCP_PORT));
}

function tratarLinhaSerial(linha) {
  // Formatos: EVT,<canal>,<pico> | HELLO,... | STATUS,<alerta>,<led>,<motor>
  const partes = linha.split(',');
  if (partes[0] === 'HELLO') {
    hardware.firmware = partes.slice(1).join(',').slice(0, 50);
    hardware.ultimaMensagem = new Date().toISOString();
    transmitir({ tipo: 'hardware', hardware });
    sincronizarHardware();
  } else if (partes[0] === 'STATUS' && partes.length >= 4) {
    ultimoStatus = new Date().toISOString();
    hardware.ultimaMensagem = new Date().toISOString();
    hardware.ledAtivo = partes[2] === '1';
    hardware.motorAtivo = partes[3] === '1';
    transmitir({ tipo: 'hardware', hardware });
  } else if (partes[0] === 'READINGS' && partes.length === 5) {
    const numeros = partes.slice(1).map(Number);
    if (numeros.every(v=>Number.isInteger(v) && v>=-1 && v<=1023)) {
      leituras = Object.fromEntries(Object.keys(CANAIS).map((k,i)=>[k,numeros[i]===-1?null:numeros[i]]));
      instanteLeituras = new Date().toISOString();
      hardware.ultimaMensagem = instanteLeituras;
      transmitir({tipo:'telemetria',diagnostico:estadoDiagnostico()});
    }
  } else if (partes[0] === 'SILENCIAR') {
    // Botão físico do Arduino: permite silenciar mesmo sem acesso ao navegador.
    if (alerta) {
      registrarSilenciamentoFisico();
    }
  } else if (partes[0] === 'EVT') {
    const canal = parseInt(partes[1], 10);
    const pico = parseInt(partes[2], 10) || 0;
    const id = Object.keys(CANAIS).find((k) => CANAIS[k] === canal);
    if (id) processarDeteccao(id, pico, false);
  }
}

/* ---------- Regras de negócio ---------- */
function picoParaDb(pico) {
  return Math.round(40 + (Math.min(pico, 1023) / 1023) * 60); // estimativa
}

function registrarSilenciamentoFisico() {
  encerrarAlerta('silenciado');
  transmitir({ tipo: 'estado' });
}

function processarDeteccao(dispositivoId, pico, forcar) {
  const d = estado.dispositivos[dispositivoId];
  if (!d) return null;
  if (!d.ativo && !forcar) return null;
  const agora = Date.now();
  if (!forcar && agora - (ultimoPorDispositivo[dispositivoId] || 0) < COOLDOWN_MS) return null;
  // O próprio atuador (vibração/estroboscópio) pode gerar ruído no sensor do mesmo canal.
  // Enquanto o alerta desse canal estiver ativo, novas detecções são continuação: não viram eventos duplicados.
  if (!forcar && alerta && alerta.dispositivo === dispositivoId && alerta.fonte !== 'simulacao') {
    ultimoPorDispositivo[dispositivoId] = agora;
    return null;
  }
  ultimoPorDispositivo[dispositivoId] = agora;

  const tipo = TIPOS[d.tipo];
  const evento = {
    id: crypto.randomUUID(),
    tipo: d.tipo,
    dispositivo: d.id,
    rotulo: tipo.rotulo,
    origem: tipo.origem,
    cor: d.cor,
    hora: new Date(agora).toISOString(),
    db: picoParaDb(pico || 400),
    fonte: forcar ? 'simulacao' : hardware.modo === 'wokwi' ? 'wokwi' : 'arduino',
    duracao: null,
    status: 'pendente',
    acao: tipo.critico ? 'Alerta de atenção ativado' : 'Alerta visual ativado'
  };
  eventos.push(evento);
  if (eventos.length > MAX_EVENTOS) eventos.shift();
  salvarEventos();

  // Um teste do navegador nunca deve interromper um alerta vindo do Arduino.
  // Ainda assim ele fica registrado no histórico como evento de demonstração.
  if (forcar && alerta && alerta.fonte !== 'simulacao') {
    evento.acao = 'Teste registrado (alerta físico em andamento)';
    evento.status = 'encerrado';
    evento.duracao = 0;
    salvarEventos();
    transmitir({ tipo: 'evento', evento, alertar: false });
    return evento;
  }
  const alertaCritico = alerta && TIPOS[alerta.tipo].critico;
  if (alertaCritico && !tipo.critico) {
    evento.acao = 'Registrado (alerta crítico em andamento)';
    evento.status = 'encerrado';
    evento.duracao = 0;
    salvarEventos();
    transmitir({ tipo: 'evento', evento, alertar: false });
    return evento;
  }
  iniciarAlerta(evento);
  return evento;
}

function iniciarAlerta(evento) {
  if (alerta) encerrarAlerta('encerrado', true);
  const t = TIPOS[evento.tipo];
  alerta = {
    eventoId: evento.id,
    dispositivo: evento.dispositivo,
    fonte: evento.fonte,
    tipo: evento.tipo,
    rotulo: t.rotulo,
    origem: t.origem,
    cor: evento.cor,
    critico: t.critico,
    led: t.led,
    vibracao: t.vibracao,
    hora: evento.hora,
    inicio: Date.now()
  };
  const duracaoMs = t.critico ? DURACAO_CRITICO_MS : DURACAO_ALERTA_MS;
  // Eventos criados no painel nunca acionam o hardware físico: evite efeitos não intencionais.
  if (estado.exibicao && evento.fonte !== 'simulacao') {
    const [r, g, b] = CORES_RGB[evento.cor] || CORES_RGB.azul;
    enviarHardware(`ALERTA,${r},${g},${b},${t.padrao},${Math.round(duracaoMs / 1000)}`);
  }
  clearTimeout(timerAlerta);
  timerAlerta = setTimeout(() => encerrarAlerta('encerrado'), duracaoMs);
  transmitir({ tipo: 'evento', evento, alerta, alertar: true });
}

function encerrarAlerta(motivo, silencioso) {
  if (!alerta) return;
  const evento = eventos.find((e) => e.id === alerta.eventoId);
  if (evento) {
    evento.duracao = Math.max(1, Math.round((Date.now() - alerta.inicio) / 1000));
    evento.status = motivo === 'silenciado' ? 'atendido' : 'encerrado';
  }
  const deveriaPararHardware = alerta.fonte !== 'simulacao';
  alerta = null;
  clearTimeout(timerAlerta);
  if (deveriaPararHardware) enviarHardware('PARAR');
  salvarEventos();
  if (!silencioso) transmitir({ tipo: 'alerta_fim', motivo });
}

/* ---------- Estatísticas ---------- */
function estatisticas() {
  const hojeStr = new Date().toDateString();
  const ontem = new Date(Date.now() - 86400000).toDateString();
  const hoje = eventos.filter((e) => new Date(e.hora).toDateString() === hojeStr).length;
  const deOntem = eventos.filter((e) => new Date(e.hora).toDateString() === ontem).length;

  const contagem = {};
  eventos.forEach((e) => { contagem[e.tipo] = (contagem[e.tipo] || 0) + 1; });
  const maisFrequenteTipo = Object.keys(contagem).sort((a, b) => contagem[b] - contagem[a])[0] || null;

  const fumacas = eventos.filter((e) => e.tipo === 'fumaca');
  const atendidas = fumacas.filter((e) => e.status === 'atendido').length;

  const porPeriodo = Array.from({ length: 8 }, () => ({ campainha: 0, bebe: 0, fumaca: 0, custom: 0 }));
  eventos.forEach((e) => {
    const faixa = Math.floor(new Date(e.hora).getHours() / 3);
    if (porPeriodo[faixa][e.tipo] !== undefined) porPeriodo[faixa][e.tipo] += 1;
  });

  const maior = eventos.reduce((m, e) => (e.db > (m ? m.db : 0) ? e : m), null);
  return {
    total: eventos.length,
    hoje,
    variacao: deOntem > 0 ? Math.round(((hoje - deOntem) / deOntem) * 100) : null,
    picoDb: maior ? maior.db : null,
    picoTipo: maior ? maior.rotulo : null,
    maisFrequente: maisFrequenteTipo
      ? { tipo: maisFrequenteTipo, rotulo: TIPOS[maisFrequenteTipo].rotulo, pct: Math.round((contagem[maisFrequenteTipo] / eventos.length) * 100) }
      : null,
    emergencias: { total: fumacas.length, atendidas, pct: fumacas.length ? Math.round((atendidas / fumacas.length) * 100) : null },
    porPeriodo
  };
}

/* ---------- API REST ---------- */
// Cabeçalhos de segurança e proteção contra requisições vindas de outros sites (CSRF):
// um site qualquer aberto no mesmo navegador não pode silenciar alertas nem alterar configurações.
function protecao(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
    "connect-src 'self' ws: wss:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  if (req.path && req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !origemPermitida(req.headers.origin, req.headers.host)) {
    return res.status(403).json({ erro: 'Origem não permitida' });
  }
  next();
}
app.use(protecao);
app.use(express.json({ limit:'32kb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/api/estado', (req, res) => {
  res.json({ exibicao: estado.exibicao, dispositivos: estado.dispositivos, hardware, alerta, tipos: TIPOS });
});

app.put('/api/dispositivos/:id', (req, res) => {
  const d = estado.dispositivos[req.params.id];
  if (!d) return res.status(404).json({ erro: 'Dispositivo não encontrado' });
  const { ativo, sensibilidade, cor } = req.body || {};
  if (ativo !== undefined && typeof ativo !== 'boolean') return res.status(400).json({ erro: 'Campo ativo deve ser booleano' });
  if (sensibilidade !== undefined && (!Number.isFinite(sensibilidade) || sensibilidade < 0 || sensibilidade > 100)) return res.status(400).json({ erro: 'Sensibilidade deve estar entre 0 e 100' });
  if (cor !== undefined && !Object.hasOwn(CORES_RGB, cor)) return res.status(400).json({ erro: 'Cor inválida' });
  if (typeof ativo === 'boolean') d.ativo = ativo;
  if (sensibilidade !== undefined) d.sensibilidade = Math.round(sensibilidade);
  if (cor !== undefined) d.cor = cor;
  const canal = CANAIS[d.id];
  enviarHardware(`CFG,${canal},${limiarDeSensibilidade(d.sensibilidade)}`);
  enviarHardware(`ATIVO,${canal},${d.ativo ? 1 : 0}`);
  salvarConfig();
  transmitir({ tipo: 'estado' });
  res.json(d);
});

app.put('/api/exibicao', (req, res) => {
  if (typeof req.body?.ativo !== 'boolean') return res.status(400).json({erro:'Informe ativo como booleano'});
  estado.exibicao = req.body.ativo;
  if (!estado.exibicao) enviarHardware('PARAR');
  salvarConfig();
  transmitir({ tipo: 'estado' });
  res.json({ exibicao: estado.exibicao });
});

app.get('/api/eventos', (req, res) => {
  const pedido = Number(req.query.limite ?? 50);
  const limite = Number.isInteger(pedido) ? Math.max(1, Math.min(pedido, 500)) : 50;
  res.json(eventos.slice(-limite).reverse());
});

app.get('/api/estatisticas', (req, res) => res.json(estatisticas()));
app.get('/api/diagnostico', (req,res) => res.json(estadoDiagnostico()));
// Relatórios com filtro processado pelo servidor sobre todos os eventos persistidos.
app.get('/api/relatorio', (req, res) => {
  const periodo = String(req.query.periodo || '7d');
  if (!['hoje','7d','30d','todos'].includes(periodo)) return res.status(400).json({ erro:'Período inválido' });
  const fonte = String(req.query.fonte || 'todas');
  if (!['todas','reais','simulacao'].includes(fonte)) return res.status(400).json({ erro:'Origem de dados inválida' });
  const agora = new Date();
  let comeco = 0;
  if (periodo === 'hoje') comeco = new Date(agora.getFullYear(),agora.getMonth(),agora.getDate()).getTime();
  if (periodo === '7d' || periodo === '30d') comeco = Date.now() - (periodo === '7d' ? 7 : 30)*86400000;
  const porFonte = (e) => fonte === 'todas' || (fonte === 'simulacao' ? e.fonte === 'simulacao' : e.fonte !== 'simulacao');
  res.json({ periodo, fonte, eventos: eventos.filter(e => new Date(e.hora).getTime() >= comeco && porFonte(e)).slice().reverse() });
});

app.post('/api/simular', (req, res) => {
  const id = (req.body && req.body.dispositivo) || 'porta';
  if (!Object.hasOwn(estado.dispositivos,id)) return res.status(400).json({erro:'Dispositivo inválido'});
  if (!estado.dispositivos[id].ativo) return res.status(409).json({erro:'Canal desativado. Ative-o em Dispositivos antes de simular.'});
  const agoraSim = Date.now();
  if (agoraSim - ultimaSimulacao < 300) return res.status(429).json({erro:'Aguarde um instante antes de simular outro evento.'});
  ultimaSimulacao = agoraSim;
  const evento = processarDeteccao(id, 400 + Math.round(Math.random() * 500), true);
  if (!evento) return res.status(400).json({ erro: 'Dispositivo inválido' });
  res.json(evento);
});

// Limpeza opcional da sessão de apresentação: remove SOMENTE eventos simulados.
// Nunca exclui histórico recebido de placa física/Wokwi.
app.delete('/api/eventos/simulacoes', (req, res) => {
  if (alerta && alerta.fonte === 'simulacao') encerrarAlerta('silenciado');
  const anteriores = eventos.length;
  eventos = eventos.filter((evento) => evento.fonte !== 'simulacao');
  const removidos = anteriores - eventos.length;
  salvarEventos();
  transmitir({ tipo: 'estado' });
  res.json({ ok: true, removidos, preservados: eventos.length });
});

app.post('/api/alerta/silenciar', (req, res) => {
  encerrarAlerta('silenciado');
  transmitir({ tipo: 'estado' });
  res.json({ ok: true });
});

app.post('/api/hardware/testar', (req, res) => {
  if (!estado.exibicao) return res.status(409).json({ erro: 'Ative as saídas em Dispositivos antes de testar.' });
  if (alerta && alerta.fonte !== 'simulacao' && alerta.critico) {
    return res.status(409).json({ erro: 'Teste físico indisponível durante alerta crítico real.' });
  }
  const enviado = enviarHardware('TESTE');
  transmitir({ tipo: 'teste', enviado });
  res.json({ ok: true, enviado, modo: hardware.modo, observacao: enviado ? 'Comando enviado; resposta física não confirmada' : 'Nenhuma placa conectada; teste não foi enviado' });
});

/* ---------- Erros ---------- */
// Sem isto o Express devolve páginas HTML (com detalhes internos) para erros de API.
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));
app.use((err, req, res, next) => {
  const codigo = Number(err && (err.status || err.statusCode)) || 500;
  const status = codigo >= 400 && codigo < 600 ? codigo : 500;
  if (status >= 500) console.warn('Erro interno:', err && err.message);
  const mensagens = { 400: 'Requisição inválida (JSON malformado).', 413: 'Corpo da requisição grande demais.' };
  if (res.headersSent) return next(err);
  res.status(status).json({ erro: mensagens[status] || 'Erro interno do servidor.' });
});

/* ---------- Encerramento limpo ---------- */
// Ctrl+C durante um alerta não deve deixar LED/vibração ligados nem o histórico como "em andamento".
function encerrarServidor(sinal) {
  if (encerrando) return;
  encerrando = true;
  console.log('\nEncerrando (' + sinal + ')…');
  clearTimeout(timerAlerta);
  if (alerta) {
    const ev = eventos.find((e) => e.id === alerta.eventoId);
    if (ev) { ev.duracao = Math.max(1, Math.round((Date.now() - alerta.inicio) / 1000)); ev.status = 'interrompido'; }
    alerta = null;
  }
  enviarHardware('PARAR');
  salvarEventos();
  salvarConfig();
  setTimeout(() => {
    try { wss.clients.forEach((c) => c.close(1001, 'Servidor encerrando')); } catch (_) { /* ignorado */ }
    try { if (simSocket) simSocket.destroy(); } catch (_) { /* ignorado */ }
    try { if (serial && serial.isOpen) serial.close(); } catch (_) { /* ignorado */ }
    if (server.closeAllConnections) server.closeAllConnections();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  }, 200); // dá tempo de o comando PARAR sair pela serial
}
if (typeof process.on === 'function') {
  ['SIGINT', 'SIGTERM'].forEach((sinal) => process.on(sinal, () => encerrarServidor(sinal)));
}

/* ---------- Início ---------- */
carregarEventos();
carregarConfig();
iniciarSerial();
if (typeof server.on === 'function') {
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') console.error('A porta ' + PORT + ' já está em uso. Feche o outro processo ou use outra: PORT=3001 npm start');
    else console.error('Falha ao iniciar o servidor:', err.message);
    process.exit(1);
  });
}
server.listen(PORT, HOST, () => {
  console.log(`Painel disponível em http://${HOST}:${PORT}`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') console.warn('ATENÇÃO: acesso na rede sem autenticação. Não exponha o servidor à Internet.');
});
