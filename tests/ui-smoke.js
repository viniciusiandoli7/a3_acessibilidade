'use strict';
/*
 * Teste de interface SEM navegador: sobe o servidor real (com dados temporários), carrega o painel em jsdom
 * e confere os fluxos principais. Complementa (não substitui) os testes Playwright, que usam um navegador de verdade.
 * Requer: cd backend && npm install   (jsdom é devDependency)
 */
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const requireBackend = createRequire(path.join(__dirname, '..', 'backend', 'package.json'));
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = requireBackend('jsdom')); }
catch (_) { console.error('jsdom não instalado. Rode: cd backend && npm install'); process.exit(1); }

const porta = 3400 + Math.floor(Math.random() * 400);
const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'av-ui-'));
const base = 'http://localhost:' + porta + '/';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (cond, ms = 8000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { try { if (cond()) return true; } catch (_) { /* ainda não */ } await esperar(100); }
  return false;
};

let falhas = 0;
const ok = (condicao, mensagem) => { console.log((condicao ? 'OK     ' : 'FALHA  ') + mensagem); if (!condicao) falhas++; };

(async () => {
  const servidor = spawn(process.execPath, [path.join(__dirname, '..', 'backend', 'server.js')], {
    env: { ...process.env, PORT: String(porta), DATA_DIR: dados, SERIAL_PORT: '', SIM_TCP_PORT: '' }, stdio: 'ignore'
  });
  const encerrar = async () => { servidor.kill('SIGINT'); await esperar(400); fs.rmSync(dados, { recursive: true, force: true }); };
  try {
    // Espera o servidor aceitar conexões (até ~5 s).
    for (let i = 0; i < 50; i++) { try { await fetch(base + 'api/estado'); break; } catch (_) { await esperar(100); } }

    const erros = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => erros.push((e.detail && e.detail.message) || e.message));
    const dom = await JSDOM.fromURL(base, {
      runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(w) { // jsdom não traz fetch; usa o do Node
        w.fetch = (u, o) => fetch(new URL(u, base), o);
        w.AbortController = AbortController;
        w.scrollTo = () => {}; w.confirm = () => true;
      }
    });
    const w = dom.window, d = w.document, $ = (id) => d.getElementById(id);

    ok(await ate(() => $('lista-dispositivos').children.length === 4 && $('conexao-texto').textContent !== 'Conectando…'), 'painel carrega e conecta (' + $('conexao-texto').textContent + ')');
    w.location.hash = '#guia'; await esperar(200);
    ok($('guia-explicacao').textContent.length > 20, 'demonstração guiada mostra o texto explicativo');
    $('guia-avancar').click();
    await ate(() => /Campainha/.test($('guia-titulo').textContent), 3000);
    $('guia-avancar').click();
    ok(await ate(() => !$('alerta-tela').hidden, 4000), 'simular campainha abre o alerta em tela cheia');
    ok($('conteudo').closest('.app').inert === true, 'fundo fica inerte (inert) com o alerta aberto');
    ok(/Alerta ativo/.test(d.title), 'título da aba sinaliza alerta');
    ok(/alerta ativo/.test($('contagem-nav').textContent), 'selo do menu tem texto para leitor de tela');
    $('alerta-silenciar').click();
    ok(await ate(() => $('alerta-tela').hidden, 4000), 'silenciar fecha o alerta');
    ok($('conteudo').closest('.app').inert === false, 'fundo volta a ser interativo');
    ok(!/Alerta ativo/.test(d.title), 'título da aba volta ao normal');

    w.location.hash = '#relatorios';
    const linhas = () => d.querySelectorAll('#tbody-rel tr:not(.vazio-linha)').length;
    ok(await ate(() => linhas() >= 1, 4000), 'relatório lista o evento simulado');
    ok(/simulação/.test($('tbody-rel').textContent), 'evento aparece marcado como simulação');
    $('fonte-rel').value = 'reais'; $('fonte-rel').dispatchEvent(new w.Event('change'));
    ok(await ate(() => linhas() === 0, 3000), 'filtro "somente Arduino/Wokwi" esconde simulações');
    $('fonte-rel').value = 'simulacao'; $('fonte-rel').dispatchEvent(new w.Event('change'));
    ok(await ate(() => linhas() >= 1, 3000), 'filtro "somente simulações" mostra o teste');
    ok(!/Em andamento/.test($('tbody-dash').textContent), 'nenhum evento finalizado aparece como "Em andamento"');
    ok(erros.length === 0, 'nenhum erro de JavaScript durante o uso' + (erros.length ? ': ' + erros.join(' | ') : ''));
    w.close();
  } catch (e) { console.error(e); falhas++; }
  await encerrar();
  console.log(falhas ? '\n' + falhas + ' falha(s).' : '\nTodos os testes de interface passaram.');
  process.exit(falhas ? 1 : 0);
})();
