/* Teste das regras e endpoints sem acesso ao Arduino ou pacotes npm.
 * A aplicação real continua usando Express + ws + serialport quando instalada.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'alerta-visual-teste-'));
const pasta = path.join(raiz, 'backend');
fs.mkdirSync(pasta);
const codigo = fs.readFileSync(path.join(__dirname,'..','backend','server.js'),'utf8');

function subir() {
  const routes = {};
  function express() {
    const app = {};
    for (const metodo of ['get','put','post']) app[metodo] = (url, fn) => routes[metodo+' '+url] = fn;
    app.use = () => {};
    return app;
  }
  express.json = () => () => {};
  express.static = () => () => {};
  class WebSocketServer {
    constructor(){ this.clients=new Set(); }
    on(){}
  }
  const fakeRequire = nome => {
    if (nome === 'express') return express;
    if (nome === 'ws') return { WebSocketServer };
    if (nome === 'http') return { createServer: () => ({ listen: (porta, cb) => cb() }) };
    return require(nome);
  };
  const sandbox = {require:fakeRequire,__dirname:pasta,console,setTimeout,clearTimeout,process:{env:{PORT:'3000'}}};
  vm.runInNewContext(codigo,vm.createContext(sandbox),{filename:'server.js'});
  return async (metodo,url,body={},query={}) => {
    const rota = metodo === 'put' && url.startsWith('/api/dispositivos/') ? '/api/dispositivos/:id' : url;
    const fn=routes[metodo+' '+rota];
    assert.ok(fn,'Rota não encontrada: '+metodo+' '+url);
    let status=200, resultado=null;
    const req={body,params:{id:url.split('/').pop()},query};
    const res={status(code){status=code;return this},json(value){resultado=JSON.parse(JSON.stringify(value));return this}};
    await fn(req,res);
    return {status,resultado};
  };
}
(async function(){
  const api=subir();
  const inicial=(await api('get','/api/estado')).resultado;
  assert.equal(inicial.hardware.modo,'simulado');
  assert.equal(inicial.dispositivos.porta.sensibilidade,60);
  const config=(await api('put','/api/dispositivos/porta',{sensibilidade:85,cor:'azul',ativo:false})).resultado;
  assert.equal(config.sensibilidade,85);
  assert.equal(config.cor,'azul');
  assert.equal(config.ativo,false);
  const arquivo=path.join(pasta,'data','config.json');
  assert.equal(JSON.parse(fs.readFileSync(arquivo)).dispositivos.porta.sensibilidade,85);
  const exib=(await api('put','/api/exibicao',{ativo:false})).resultado;
  assert.equal(exib.exibicao,false);
  assert.equal(JSON.parse(fs.readFileSync(arquivo)).exibicao,false);
  const teste=(await api('post','/api/hardware/testar')).resultado;
  assert.equal(teste.enviado,false);
  const evento=(await api('post','/api/simular',{dispositivo:'porta'})).resultado;
  assert.equal(evento.fonte,'simulacao');
  assert.equal(evento.tipo,'campainha');
  assert.equal((await api('get','/api/estatisticas')).resultado.total,1);
  assert.equal((await api('get','/api/relatorio',{}, {periodo:'hoje'})).resultado.eventos.length,1);
  assert.equal((await api('get','/api/relatorio',{}, {periodo:'todos'})).resultado.eventos.length,1);
  assert.equal((await api('get','/api/relatorio',{}, {periodo:'invalid'})).status,400);
  assert.equal((await api('post','/api/notificar')).resultado.enviado,false);
  assert.equal((await api('post','/api/alerta/silenciar')).resultado.ok,true);
  assert.equal((await api('get','/api/estado')).resultado.alerta,null);
  assert.equal(JSON.parse(fs.readFileSync(path.join(pasta,'data','eventos.json'))).length,1);
  const api2=subir();
  const recarregado=(await api2('get','/api/estado')).resultado;
  assert.equal(recarregado.dispositivos.porta.sensibilidade,85);
  assert.equal(recarregado.dispositivos.porta.cor,'azul');
  assert.equal(recarregado.exibicao,false);
  console.log('OK: estado, atualização e persistência, simulação, estatísticas, relatório, teste de hardware, notificação demonstrativa e silenciamento.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(raiz,{recursive:true,force:true}));
