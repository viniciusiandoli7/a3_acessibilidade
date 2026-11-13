'use strict';
// Testa rotas e regras de negócio isoladamente, sem npm, serial física ou Internet.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const raiz=fs.mkdtempSync(path.join(os.tmpdir(),'av4-testes-'));
const codigo=fs.readFileSync(path.join(__dirname,'..','backend','server.js'),'utf8');

function criarInstancia(env={}, requestMock=async()=>({ok:true,status:200,json:async()=>({ok:true,result:{message_id:31}})})) {
  const pasta=path.join(raiz,'inst-'+Math.random().toString(36).slice(2),'backend');
  fs.mkdirSync(pasta,{recursive:true});
  const routes={};
  const middlewares=[];
  function express(){
    const app={use:(...a)=>{const fn=a[a.length-1];if(typeof fn==='function')middlewares.push({caminho:typeof a[0]==='string'?a[0]:null,fn});}};
    for(const metodo of ['get','post','put','delete'])app[metodo]=(url,fn)=>{routes[metodo+' '+url]=fn;};
    return app;
  }
  express.json=()=>()=>{};express.static=()=>()=>{};
  class WebSocketServer{constructor(){this.clients=new Set();}on(){}}
  const requireFake=mod=>mod==='express'?express:mod==='ws'?{WebSocketServer}:mod==='http'?{createServer:()=>({listen:(port,host,fn)=>fn()})}:require(mod);
  const sandbox={require:requireFake,URL,__dirname:pasta,console,setTimeout:()=>1,clearTimeout:()=>{},AbortSignal,fetch:requestMock,process:{env:{PORT:'3000',...env}}};
  vm.createContext(sandbox);
  vm.runInContext(codigo+`
globalThis.__injetar=tratarLinhaSerial;
    globalThis.__marcarConexao=(valor)=>{hardware.conectado=valor;hardware.modo="serial"};
    globalThis.__detectar=processarDeteccao;
    globalThis.__limparCooldown=()=>{ultimoPorDispositivo.fumaca=0};
    globalThis.__resetSimulacao=()=>{ultimaSimulacao=0};
    globalThis.__simularPonte=()=>{hardware.modo='wokwi';hardware.conectado=true;globalThis._comandos=[];simSocket={destroyed:false,write:(linha)=>globalThis._comandos.push(linha)}};
    globalThis.__comandos=()=>globalThis._comandos;`,sandbox,{filename:'server.js'});
  const api=async(method,url,body={},query={},opcoes={})=>{
    if(url==='/api/simular'&&!opcoes.manterLimite)sandbox.__resetSimulacao();
    const rota=method==='put'&&url.startsWith('/api/dispositivos/')?'/api/dispositivos/:id':url;
    const fn=routes[method+' '+rota];assert.ok(fn,'Rota ausente '+method+' '+url);
    let status=200,resultado=null;
    const req={body,params:{id:decodeURIComponent(url.split('/').pop())},query};
    const res={status(code){status=code;return this},json(obj){resultado=JSON.parse(JSON.stringify(obj));return this}};
    await fn(req,res);
    return {status,resultado};
  };
  return {api,injetar:sandbox.__injetar,marcarConexao:sandbox.__marcarConexao,detectar:sandbox.__detectar,limparCooldown:sandbox.__limparCooldown,simularPonte:sandbox.__simularPonte,comandos:sandbox.__comandos,pasta,middlewares};
}
(async()=>{
  const t=criarInstancia();
  const {api}=t;
  let r=await api('get','/api/estado'); assert.equal(r.resultado.hardware.modo,'simulado');
  assert.equal(r.resultado.dispositivos.porta.sensibilidade,60);
  r=await api('put','/api/dispositivos/porta',{ativo:true,sensibilidade:85,cor:'azul'});
  assert.equal(r.resultado.sensibilidade,85);
  r=await api('put','/api/dispositivos/porta',{ativo:false,sensibilidade:500,cor:'invalida'});
  assert.equal(r.status,400);
  assert.equal((await api('put','/api/dispositivos/porta',{ativo:'false'})).status,400);
  assert.equal((await api('put','/api/dispositivos/porta',{cor:'invalida'})).status,400);
  assert.equal((await api('put','/api/dispositivos/porta',{sensibilidade:-1})).status,400);
  assert.equal((await api('put','/api/dispositivos/porta',{sensibilidade:100})).resultado.sensibilidade,100);
  assert.equal(JSON.parse(fs.readFileSync(path.join(t.pasta,'data','config.json'))).dispositivos.porta.sensibilidade,100);
  assert.equal((await api('put','/api/exibicao',{ativo:'false'})).status,400);
  assert.equal((await api('put','/api/exibicao',{ativo:false})).resultado.exibicao,false);
  assert.equal((await api('post','/api/hardware/testar')).status,409,'Teste bloqueado com saídas desligadas');
  assert.equal((await api('put','/api/exibicao',{ativo:true})).resultado.exibicao,true);
  assert.equal((await api('post','/api/hardware/testar')).resultado.enviado,false);
  let evento=(await api('post','/api/simular',{dispositivo:'porta'})).resultado;
  assert.equal(evento.fonte,'simulacao');assert.equal(evento.tipo,'campainha');assert.ok(evento.id.length>15);
  assert.equal((await api('get','/api/estatisticas')).resultado.total,1);
  assert.equal((await api('get','/api/relatorio',{}, {periodo:'hoje'})).resultado.eventos.length,1);
  assert.equal((await api('get','/api/relatorio',{}, {periodo:'invalido'})).status,400);
  assert.equal((await api('post','/api/simular',{dispositivo:'fantasia'})).status,400);
  assert.equal((await api('post','/api/simular',{dispositivo:'custom'})).status,409,'Não permite simular canal desligado');
  assert.equal((await api('get','/api/eventos',{}, {limite:'xyz'})).resultado.length,1);
  assert.equal((await api('post','/api/alerta/silenciar')).resultado.ok,true);
  assert.equal((await api('get','/api/estado')).resultado.alerta,null);
  console.log('OK regras existentes: dispositivos, persistência, simulação, relatórios e silenciamento.');

  let diag=(await api('get','/api/diagnostico')).resultado;
  assert.equal(diag.conectado,false);assert.equal(diag.entradas[0].amplitude,null);
  t.marcarConexao(true);
  t.injetar('HELLO,firmware_v3');
  t.injetar('STATUS,1,1,0');
  t.injetar('READINGS,150,250,-1,490');
  diag=(await api('get','/api/diagnostico')).resultado;
  assert.equal(diag.conectado,true);assert.equal(diag.status.recente,true);assert.equal(diag.entradas[0].amplitude,150);
  assert.equal(diag.entradas[2].amplitude,null);assert.equal(diag.saidas.led,true);
  t.injetar('READINGS,9999,xyz,20,21');
  assert.equal((await api('get','/api/diagnostico')).resultado.entradas[0].amplitude,150);
  console.log('OK diagnóstico: HELLO, STATUS, leituras válidas, valores ausentes e bloqueio de dados inválidos.');

  t.limparCooldown();
  const detectado=t.detectar('fumaca',650,false);
  assert.equal(detectado.fonte,'arduino');
  assert.equal(detectado.tipo,'fumaca');
  assert.equal((await api('get','/api/estatisticas')).resultado.total,2);
  assert.equal((await api('post','/api/alerta/silenciar')).resultado.ok,true);
  assert.equal((await api('get','/api/estado')).resultado.alerta,null);
  assert.equal((await api('get','/api/relatorio',{}, {periodo:'todos'})).resultado.eventos.length,2);
  console.log('OK fluxo físico injetado: evento, histórico persistido, silenciamento e relatório.');
  const totalAntesLimpeza=(await api('get','/api/eventos')).resultado.length;
  const limpou=(await api('delete','/api/eventos/simulacoes')).resultado;
  assert.equal(limpou.removidos,1,'Remove apenas a simulação');
  assert.equal(limpou.preservados,1,'Preserva evento físico');
  assert.equal((await api('get','/api/eventos')).resultado.length,totalAntesLimpeza-1);
  assert.equal((await api('get','/api/eventos')).resultado[0].fonte,'arduino');
  assert.equal((await api('delete','/api/eventos/simulacoes')).resultado.removidos,0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(t.pasta,'data','eventos.json'))).length,1);
  console.log('OK limpeza: remove testes do histórico e mantém registros físicos em disco.');
  const circuito=criarInstancia(); circuito.simularPonte();
  await circuito.api('post','/api/simular',{dispositivo:'fumaca'});
  assert.equal(circuito.comandos().length,0,'Simulação no navegador não aciona hardware');
  await circuito.api('post','/api/alerta/silenciar');
  assert.equal(circuito.comandos().length,0,'Silenciamento de simulação não envia PARAR ao hardware');
  circuito.limparCooldown();
  circuito.detectar('fumaca',700,false);
  assert.ok(circuito.comandos().some(line=>line.startsWith('ALERTA,')),'Detecção serial envia comando real');
  assert.equal((await circuito.api('post','/api/hardware/testar')).status,409,'Bloqueia teste de saídas durante alerta crítico real');
  // Com um alerta físico ativo, um teste virtual não pode mandar PARAR,
  // nem substituir o alerta do hardware.
  const cmdsAntes=circuito.comandos().length;
  const testeDurante=(await circuito.api('post','/api/simular',{dispositivo:'bebe'})).resultado;
  const fisicoDepois=(await circuito.api('get','/api/estado')).resultado.alerta;
  assert.equal(testeDurante.fonte,'simulacao');
  assert.equal(testeDurante.status,'encerrado');
  assert.equal(fisicoDepois.fonte,'wokwi');
  assert.equal(fisicoDepois.tipo,'fumaca');
  assert.equal(circuito.comandos().length,cmdsAntes,'Teste virtual não altera comando físico em andamento');
  console.log('OK segurança de saídas: teste simulado não substitui alerta físico nem envia PARAR.');

  /* ===== Refinamentos v7.1 ===== */
  // 1) Continuação do mesmo canal durante o próprio alerta não gera evento duplicado (ruído do atuador no sensor).
  const rep=criarInstancia(); rep.marcarConexao(true);
  rep.limparCooldown();
  const primeiro=rep.detectar('fumaca',700,false);
  assert.ok(primeiro,'Primeira detecção cria evento');
  rep.limparCooldown();
  assert.equal(rep.detectar('fumaca',700,false),null,'Reaparição no mesmo canal durante o alerta é continuação');
  assert.equal((await rep.api('get','/api/eventos')).resultado.length,1,'Histórico sem duplicatas');
  // 2) Botão físico silencia o alerta e marca como silenciado.
  rep.injetar('SILENCIAR');
  assert.equal((await rep.api('get','/api/estado')).resultado.alerta,null,'SILENCIAR encerra o alerta');
  assert.equal((await rep.api('get','/api/eventos')).resultado[0].status,'atendido');
  // 3) Filtro de origem dos dados no relatório.
  await rep.api('post','/api/simular',{dispositivo:'porta'});
  const reais=(await rep.api('get','/api/relatorio',{}, {periodo:'todos',fonte:'reais'})).resultado.eventos;
  const simul=(await rep.api('get','/api/relatorio',{}, {periodo:'todos',fonte:'simulacao'})).resultado.eventos;
  const todas=(await rep.api('get','/api/relatorio',{}, {periodo:'todos'})).resultado.eventos;
  assert.equal(reais.length,1);assert.equal(reais[0].fonte,'arduino');
  assert.equal(simul.length,1);assert.equal(simul[0].fonte,'simulacao');
  assert.equal(todas.length,2);
  assert.equal((await rep.api('get','/api/relatorio',{}, {fonte:'xyz'})).status,400);
  // 4) Limite de simulações em sequência.
  await rep.api('post','/api/alerta/silenciar');
  assert.equal((await rep.api('post','/api/simular',{dispositivo:'bebe'})).status,200);
  assert.equal((await rep.api('post','/api/simular',{dispositivo:'bebe'},{},{manterLimite:true})).status,429);
  // 5) Proteção contra requisições de outros sites e cabeçalhos de segurança.
  const protecao=rep.middlewares.find(m=>!m.caminho&&m.fn.length===3).fn;
  const chamar=(req)=>{let st=200,corpo=null,seguiu=false;const cab={};
    const res={setHeader(k,v){cab[k]=v},status(c){st=c;return this},json(o){corpo=o}};
    protecao(req,res,()=>{seguiu=true});return {st,corpo,seguiu,cab};};
  const host='localhost:3000';
  assert.equal(chamar({method:'POST',path:'/api/alerta/silenciar',headers:{origin:'https://site-externo.example',host}}).st,403);
  assert.equal(chamar({method:'DELETE',path:'/api/eventos/simulacoes',headers:{origin:'null',host}}).st,403);
  assert.equal(chamar({method:'POST',path:'/api/alerta/silenciar',headers:{origin:'http://localhost:3000',host}}).seguiu,true);
  assert.equal(chamar({method:'POST',path:'/api/alerta/silenciar',headers:{host}}).seguiu,true,'Clientes sem Origin (não navegador) são aceitos');
  assert.equal(chamar({method:'GET',path:'/api/estado',headers:{origin:'https://outro.example',host}}).seguiu,true,'Leitura não é bloqueada por esta regra');
  const ok=chamar({method:'GET',path:'/api/estado',headers:{host}});
  assert.equal(ok.cab['X-Content-Type-Options'],'nosniff');assert.equal(ok.cab['Cache-Control'],'no-store');
  assert.match(ok.cab['Content-Security-Policy'],/script-src 'self'/);
  // 6) Erros sempre em JSON, sem expor detalhes internos.
  const tratadorErro=rep.middlewares.find(m=>m.fn.length===4).fn;
  const erro=(err)=>{let st=0,corpo=null;tratadorErro(err,{},{headersSent:false,status(c){st=c;return this},json(o){corpo=o}},()=>{});return {st,corpo};};
  assert.equal(erro({status:400}).st,400);assert.match(erro({status:400}).corpo.erro,/JSON/);
  assert.equal(erro(new Error('segredo interno /etc/passwd')).st,500);
  assert.ok(!JSON.stringify(erro(new Error('segredo interno')).corpo).includes('segredo'));
  const naoEncontrada=rep.middlewares.find(m=>m.caminho==='/api').fn;
  let st404=0;naoEncontrada({}, {status(c){st404=c;return this},json(){}});assert.equal(st404,404);
  // 7) Histórico corrompido é preservado em cópia, não sobrescrito silenciosamente.
  const pastaCorrompida=path.join(raiz,'corrompida');fs.mkdirSync(path.join(pastaCorrompida,'backend','data'),{recursive:true});
  fs.writeFileSync(path.join(pastaCorrompida,'backend','data','eventos.json'),'{ isto não é json');
  const sandboxCorr={require:(m)=>m==='express'?Object.assign(()=>({use(){},get(){},post(){},put(){},delete(){}}),{json:()=>()=>{},static:()=>()=>{}}):m==='ws'?{WebSocketServer:class{constructor(){this.clients=new Set()}on(){}}}:m==='http'?{createServer:()=>({listen:(a,b,fn)=>fn()})}:require(m),
    URL,__dirname:path.join(pastaCorrompida,'backend'),console:{log(){},warn(){}},setTimeout:()=>1,clearTimeout:()=>{},process:{env:{}}};
  vm.createContext(sandboxCorr);vm.runInContext(codigo,sandboxCorr,{filename:'server.js'});
  assert.ok(fs.readdirSync(path.join(pastaCorrompida,'backend','data')).some(n=>n.startsWith('eventos.json.corrompido-')),'Cópia do arquivo corrompido criada');
  console.log('OK refinamentos v7.1: deduplicação, botão físico, filtro de origem, limite de simulação, CSRF/CSP, erros em JSON e histórico corrompido.');

  /* ===== v7.2: montagem real (temperatura, LEDs, buzzer, matriz) ===== */
  const placa=criarInstancia(); placa.simularPonte(); placa.marcarConexao(true);
  const cmds=()=>placa.comandos().map(l=>l.trim());
  placa.injetar('HW,1,0,1,0001020488502000');
  let est=(await placa.api('get','/api/estado')).resultado.hardware;
  assert.deepEqual(est.placa.leds,[true,false]);assert.equal(est.placa.buzzer,true);assert.equal(est.placa.matriz,'0001020488502000');
  assert.equal(est.ledAtivo,true);assert.equal(est.buzzerAtivo,true);
  placa.injetar('HW,2,0,1,0001020488502000');placa.injetar('HW,0,0,0,XYZ');
  assert.equal((await placa.api('get','/api/estado')).resultado.hardware.placa.leds[0],true,'HW inválido é ignorado');
  placa.injetar('TEMP,26.4,0.30,0,0');
  diag=(await placa.api('get','/api/diagnostico')).resultado;
  assert.equal(diag.temperatura.valor,26.4);assert.equal(diag.entradas.find(e=>e.id==='temperatura').temperatura,26.4);
  assert.equal(diag.saidas.buzzer,true);
  placa.injetar('TEMP,999,0,0,0');
  assert.equal((await placa.api('get','/api/diagnostico')).resultado.temperatura.valor,26.4,'TEMP fora da faixa é ignorado');
  placa.injetar('TEMP,29.0,2.40,1,0');
  assert.equal((await placa.api('get','/api/eventos')).resultado.length,0,'ATENÇÃO não vira evento');
  const antesAlarme=placa.comandos().length;
  placa.injetar('TEMP,31.5,4.80,2,0');
  let alertaTemp=(await placa.api('get','/api/estado')).resultado.alerta;
  assert.equal(alertaTemp.tipo,'temperatura');assert.equal(alertaTemp.critico,true);assert.equal(alertaTemp.temperatura,31.5);
  assert.equal((await placa.api('get','/api/eventos')).resultado[0].temperatura,31.5);
  assert.ok(!placa.comandos().slice(antesAlarme).some(l=>l.startsWith('ALERTA,')),'Alarme térmico real não reenvia ALERTA (o firmware já sinaliza)');
  placa.injetar('TEMP,31.6,4.90,2,0');
  assert.equal((await placa.api('get','/api/eventos')).resultado.length,1,'Alarme contínuo não duplica evento');
  await placa.api('post','/api/alerta/silenciar');
  assert.ok(cmds().includes('PARAR'),'Silenciar no painel silencia a placa');
  placa.comandos().length=0;
  await placa.api('put','/api/dispositivos/temperatura',{sensibilidade:100});
  assert.ok(cmds().includes('CFGT,5'),'Sensibilidade máxima = 0,5 °C');
  assert.ok(cmds().includes('ATIVO,4,1'));
  placa.comandos().length=0;
  const espelhado=(await placa.api('post','/api/simular',{dispositivo:'porta',fisico:true})).resultado;
  assert.equal(espelhado.fonte,'simulacao');
  assert.ok(cmds().some(l=>/^ALERTA,\d+,\d+,\d+,1,15,1$/.test(l)),'Teste reproduzido na placa envia o ícone do sino');
  await placa.api('post','/api/alerta/silenciar');
  assert.ok(cmds().includes('PARAR'),'Encerrar teste reproduzido apaga a placa');
  const semPlaca=criarInstancia();
  assert.equal((await semPlaca.api('post','/api/simular',{dispositivo:'porta',fisico:true})).status,409,'Sem placa não reproduz');
  console.log('OK montagem real: espelho HW, temperatura, alarme crítico sem duplicar, silenciar, CFGT e teste reproduzido na placa.');
  // Teste do sensor: comando à placa, evento marcado como simulação e PARAR ao silenciar.
  assert.equal((await semPlaca.api('post','/api/hardware/testar-temperatura')).status,409,'Sem placa não testa o sensor');
  const tt=criarInstancia(); tt.simularPonte(); tt.marcarConexao(true);
  const cmdsTT=()=>tt.comandos().map(l=>l.trim());
  assert.equal((await tt.api('post','/api/hardware/testar-temperatura')).resultado.enviado,true);
  assert.ok(cmdsTT().includes('TESTE_TEMP,600,20'),'Envia TESTE_TEMP com 60 °C por 20 s');
  tt.injetar('TEMP,60.0,35.00,2,0,1');
  const evTT=(await tt.api('get','/api/eventos')).resultado[0];
  assert.equal(evTT.tipo,'temperatura');assert.equal(evTT.fonte,'simulacao','Alarme gerado pelo teste é simulação');assert.equal(evTT.temperatura,60);
  assert.equal((await tt.api('get','/api/estado')).resultado.hardware.temperatura.teste,true);
  tt.comandos().length=0;
  await tt.api('post','/api/alerta/silenciar');
  assert.ok(cmdsTT().includes('PARAR'),'Silenciar encerra o teste na placa');
  console.log('OK teste do sensor de temperatura: comando, evento simulado e encerramento.');

  /* ===== v7.3: reconhecimento das peças e acesso remoto (celular via Vercel) ===== */
  const inv=criarInstancia(); inv.simularPonte(); inv.marcarConexao(true);
  inv.injetar('HELLO,alerta_visual_temp');
  inv.injetar('HW,1,0,1,0001020488502000');
  inv.injetar('TEMP,25.2,0.10,0,0,0');
  let pecas=(await inv.api('get','/api/estado')).resultado.pecas;
  assert.equal(pecas.total,5);assert.equal(pecas.reconhecidas,5,'Todas as 5 peças reconhecidas');assert.equal(pecas.protocolo,'reconhecido');
  const porId=(id)=>pecas.itens.find(i=>i.id===id);
  assert.equal(porId('ntc').estado,'ativo');assert.equal(porId('ntc').detalhe,'25.2 °C');
  assert.equal(porId('led1').estado,'ativo');assert.equal(porId('led2').estado,'repouso');assert.equal(porId('buzzer').estado,'ativo');
  assert.equal(porId('matriz').estado,'ativo');assert.equal(porId('matriz').detalhe,'0001020488502000');
  inv.injetar('TEMP,41.0,3.00,1,0,0');
  assert.equal((await inv.api('get','/api/estado')).resultado.pecas.itens.find(i=>i.id==='ntc').estado,'atencao');
  inv.injetar('ERRO,sensor');
  assert.equal((await inv.api('get','/api/estado')).resultado.pecas.itens.find(i=>i.id==='ntc').estado,'falha','NTC solto = falha, sem temperatura');
  assert.equal((await inv.api('get','/api/estado')).resultado.pecas.itens.find(i=>i.id==='ntc').detalhe,null);
  const antigo=criarInstancia(); antigo.simularPonte(); antigo.marcarConexao(true);
  antigo.injetar('Temp: 24.52 C  (30s atras 24.52)  Variacao: -0.03  Estado: NORMAL');
  pecas=(await antigo.api('get','/api/estado')).resultado.pecas;
  assert.equal(pecas.protocolo,'desconhecido','Sketch antigo na placa é identificado');assert.equal(pecas.reconhecidas,0);
  const semConexao=(await criarInstancia().api('get','/api/estado')).resultado.pecas;
  assert.equal(semConexao.conectado,false);assert.ok(semConexao.itens.every(i=>i.estado==='sem_conexao'));
  console.log('OK peças: as 5 reconhecidas, atenção, falha do NTC, firmware antigo e sem conexão.');

  const rem=criarInstancia({ALLOWED_ORIGINS:'https://meu-app.vercel.app,https://*.preview.app',ACCESS_TOKEN:'token-de-teste-123'});
  const prot=rem.middlewares.find(m=>!m.caminho&&m.fn.length===3).fn;
  const passar=(req)=>{let seguiu=false;const cab={};const res={statusCode:200,setHeader(k,v){cab[k]=v},status(c){res.statusCode=c;return this},json(o){res.corpo=o},end(){res.encerrou=true}};
    prot({method:'GET',path:'/api/estado',url:'/api/estado',...req,headers:{host:'tunel.example',...req.headers}},res,()=>{seguiu=true});
    return {st:res.statusCode,seguiu,cab,encerrou:!!res.encerrou};};
  const viaTunel={'x-forwarded-for':'203.0.113.5'};
  assert.equal(passar({headers:viaTunel}).st,401,'De fora sem token: 401');
  assert.equal(passar({headers:{...viaTunel,authorization:'Bearer errado'}}).st,401,'Token errado: 401');
  assert.equal(passar({headers:{...viaTunel,authorization:'Bearer token-de-teste-123'}}).seguiu,true,'Token no cabeçalho');
  assert.equal(passar({url:'/api/estado?token=token-de-teste-123',headers:viaTunel}).seguiu,true,'Token na URL');
  assert.equal(passar({url:'/api/estado?token=token-de-teste-12',headers:viaTunel}).st,401,'Token quase igual: 401');
  const localReq={socket:{remoteAddress:'127.0.0.1'},headers:{host:'localhost:3000'}};
  assert.equal(passar(localReq).seguiu,true,'Notebook (local) não precisa de token');
  assert.equal(passar({...localReq,headers:{host:'localhost:3000',...viaTunel}}).st,401,'Túnel chegando em localhost continua exigindo token');
  assert.equal(passar({...localReq,headers:{host:'tunel.example'}}).st,401,'Host diferente de localhost exige token');
  const pre=passar({method:'OPTIONS',headers:{...viaTunel,origin:'https://meu-app.vercel.app','access-control-request-method':'PUT'}});
  assert.equal(pre.st,204);assert.equal(pre.cab['Access-Control-Allow-Origin'],'https://meu-app.vercel.app');
  assert.equal(passar({method:'OPTIONS',headers:{...viaTunel,origin:'https://meu-app.vercel.app','access-control-request-private-network':'true'}}).cab['Access-Control-Allow-Private-Network'],'true','Responde ao preflight de rede local do Chrome');assert.match(pre.cab['Access-Control-Allow-Headers'],/Authorization/);
  const estranho=passar({headers:{...viaTunel,origin:'https://site-malicioso.example',authorization:'Bearer token-de-teste-123'}});
  assert.equal(estranho.cab['Access-Control-Allow-Origin'],undefined,'Origem não liberada não recebe CORS');
  assert.equal(passar({method:'POST',path:'/api/alerta/silenciar',url:'/api/alerta/silenciar',headers:{...viaTunel,origin:'https://site-malicioso.example',authorization:'Bearer token-de-teste-123'}}).st,403,'Escrita de origem não liberada: 403 mesmo com token');
  const certo=passar({method:'POST',path:'/api/alerta/silenciar',url:'/api/alerta/silenciar',headers:{...viaTunel,origin:'https://meu-app.vercel.app',authorization:'Bearer token-de-teste-123'}});
  assert.equal(certo.seguiu,true);assert.equal(certo.cab['Access-Control-Allow-Origin'],'https://meu-app.vercel.app');
  const comCoringa=(origem)=>passar({headers:{...viaTunel,origin:origem,authorization:'Bearer token-de-teste-123'}}).cab['Access-Control-Allow-Origin'];
  assert.equal(comCoringa('https://pr-1.preview.app'),'https://pr-1.preview.app','Subdomínio coberto pelo curinga');
  assert.equal(comCoringa('https://evilpreview.app'),undefined,'Domínio parecido não é subdomínio');
  assert.equal(comCoringa('http://pr-1.preview.app'),undefined,'Protocolo diferente não vale');
  assert.equal(passar({path:'/index.html',url:'/index.html',headers:viaTunel}).seguiu,true,'Arquivos da página continuam abertos (não têm segredo)');
  assert.equal((await rem.api('get','/api/estado')).resultado.clientes,0);
  console.log('OK acesso remoto: token, CORS por origem, curinga do Vercel, túnel em localhost e escrita bloqueada.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(raiz,{recursive:true,force:true}));
