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
  function express(){
    const app={use:()=>{}};
    for(const metodo of ['get','post','put','delete'])app[metodo]=(url,fn)=>{routes[metodo+' '+url]=fn;};
    return app;
  }
  express.json=()=>()=>{};express.static=()=>()=>{};
  class WebSocketServer{constructor(){this.clients=new Set();}on(){}}
  const requireFake=mod=>mod==='express'?express:mod==='ws'?{WebSocketServer}:mod==='http'?{createServer:()=>({listen:(port,host,fn)=>fn()})}:require(mod);
  const sandbox={require:requireFake,__dirname:pasta,console,setTimeout:()=>1,clearTimeout:()=>{},AbortSignal,fetch:requestMock,process:{env:{PORT:'3000',...env}}};
  vm.createContext(sandbox);
  vm.runInContext(codigo+`
globalThis.__injetar=tratarLinhaSerial;
    globalThis.__marcarConexao=(valor)=>{hardware.conectado=valor;hardware.modo="serial"};
    globalThis.__detectar=processarDeteccao;
    globalThis.__limparCooldown=()=>{ultimoPorDispositivo.fumaca=0};
    globalThis.__simularPonte=()=>{hardware.modo='wokwi';hardware.conectado=true;globalThis._comandos=[];simSocket={destroyed:false,write:(linha)=>globalThis._comandos.push(linha)}};
    globalThis.__comandos=()=>globalThis._comandos;`,sandbox,{filename:'server.js'});
  const api=async(method,url,body={},query={})=>{
    const rota=method==='put'&&url.startsWith('/api/dispositivos/')?'/api/dispositivos/:id':url;
    const fn=routes[method+' '+rota];assert.ok(fn,'Rota ausente '+method+' '+url);
    let status=200,resultado=null;
    const req={body,params:{id:decodeURIComponent(url.split('/').pop())},query};
    const res={status(code){status=code;return this},json(obj){resultado=JSON.parse(JSON.stringify(obj));return this}};
    await fn(req,res);
    return {status,resultado};
  };
  return {api,injetar:sandbox.__injetar,marcarConexao:sandbox.__marcarConexao,detectar:sandbox.__detectar,limparCooldown:sandbox.__limparCooldown,simularPonte:sandbox.__simularPonte,comandos:sandbox.__comandos,pasta};
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
  const circuito=criarInstancia(); circuito.simularPonte();
  await circuito.api('post','/api/simular',{dispositivo:'fumaca'});
  assert.equal(circuito.comandos().length,0,'Simulação no navegador não aciona hardware');
  await circuito.api('post','/api/alerta/silenciar');
  assert.equal(circuito.comandos().length,0,'Silenciamento de simulação não envia PARAR ao hardware');
  circuito.limparCooldown();
  circuito.detectar('fumaca',700,false);
  assert.ok(circuito.comandos().some(line=>line.startsWith('ALERTA,')),'Detecção serial envia comando real');
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
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(raiz,{recursive:true,force:true}));
