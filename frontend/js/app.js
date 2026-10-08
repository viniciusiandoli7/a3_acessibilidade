/* Painel do Sistema de Alerta Visual
 * Regra de ouro: nenhuma informação depende de som. Todo evento aparece como
 * cor + ícone + texto, e o alerta principal ocupa a tela inteira e vibra (celular).
 */
(function () {
  'use strict';

  /* ---------- Ícones (SVG de linha) ---------- */
  const caminhos = {
    sino: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
    fumaca: 'M6 10a6 6 0 0 1 12 0M4 10h16M8 14v1M12 14v1M16 14v1M8 20c0-1 1-1 1-2M12 20c0-1 1-1 1-2M16 20c0-1 1-1 1-2',
    bebe: 'M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM7 21v-4l-3-3M17 21v-4l3-3M9 21v-3h6v3M8 14c0-2 2-4 4-4s4 2 4 4',
    custom: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z',
    porta: 'M5 3h14v18H5zM9 3v18M15 12h.01',
    mic: 'M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v1a7 7 0 0 1-14 0v-1M12 18v4',
    chip: 'M7 7h10v10H7zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3',
    sensor: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
    vibracao: 'M4 9v6M8 6v12M12 3v18M16 6v12M20 9v6',
    lampada: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z',
    chama: 'M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 2 2 3-5z',
    saida: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
    enviar: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
    silencio: 'M8.7 3A6 6 0 0 1 18 8c0 3 .6 5 1.4 6.5M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h14M10.3 21a1.94 1.94 0 0 0 3.4 0M2 2l20 20',
    check: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4L12 14l-3-3'
  };
  const icone = (nome) =>
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' +
    caminhos[nome] + '"/></svg>';

  /* ---------- Textos por tipo de evento ---------- */
  const TIPOS_UI = {
    campainha: { rotulo: 'Campainha', icone: 'sino', titulo: 'Campainha tocando', desc: 'Alguém está na porta.' },
    bebe: { rotulo: 'Bebê', icone: 'bebe', titulo: 'Bebê chorando', desc: 'O bebê precisa de atenção.' },
    fumaca: { rotulo: 'Alarme de fumaça', icone: 'fumaca', titulo: 'Possível alarme de fumaça', desc: 'Um som foi captado perto do detector. Se houver risco de incêndio, saia do local e ligue 193.' },
    custom: { rotulo: 'Personalizado', icone: 'custom', titulo: 'Som personalizado detectado', desc: 'Um som que você configurou foi detectado.' }
  };
  const DISPOSITIVOS = [
    { id: 'porta', nome: 'Sensor da Porta', tipo: 'campainha', icone: 'porta' },
    { id: 'bebe', nome: 'Monitor do Bebê', tipo: 'bebe', icone: 'bebe' },
    { id: 'fumaca', nome: 'Detector de Fumaça', tipo: 'fumaca', icone: 'fumaca' },
    { id: 'custom', nome: 'Personalizável', tipo: 'custom', icone: 'custom' }
  ];
  const CORES = [['azul', 'Azul'], ['laranja', 'Laranja'], ['vermelho', 'Vermelho']];
  const VIEWS = {
    dashboard: 'Sistema de Alerta Visual', dispositivos: 'Gestão de dispositivos',
    alertas: 'Central de alertas', prototipo: 'Protótipo ao vivo', relatorios: 'Relatórios e análises'
  };
  const DESCRICOES = {
    dashboard: 'Monitoramento em tempo real, com sinais que você pode ver e sentir.',
    dispositivos: 'Configure os sensores e a resposta visual do seu sistema.',
    alertas: 'Respostas visuais e táteis aos sinais importantes.',
    prototipo: 'Acompanhe o circuito virtual e a comunicação com a placa.',
    relatorios: 'Histórico real dos eventos registrados pelo sistema.'
  };

  /* ---------- Estado ---------- */
  let estado = null;
  let eventos = [];
  let stats = null;
  let relatorio = { eventos: [] };
  let socketOk = false;
  let dispositivosMontados = false;
  let focoAnterior = null;

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour12: false });
  const horaCurta = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const duracao = (s) => (s == null ? 'Em andamento' : s < 60 ? s + ' s' : Math.round(s / 60) + ' min');
  const etiquetaTipo = (tipo) =>
    '<span class="etiqueta-tipo t-' + tipo + '">' + icone(TIPOS_UI[tipo].icone) + esc(TIPOS_UI[tipo].rotulo) + '</span>';

  let temporizadorAviso = null;
  function aviso(texto) {
    const el = $('aviso');
    el.textContent = texto;
    el.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => { el.hidden = true; }, 4000);
  }

  /* ---------- Navegação ---------- */
  function irPara(moverFoco) {
    const alvo = (location.hash || '#dashboard').slice(1);
    const nome = VIEWS[alvo] ? alvo : 'dashboard';
    Object.keys(VIEWS).forEach((v) => { $('view-' + v).hidden = v !== nome; });
    document.querySelectorAll('.menu a').forEach((a) => {
      if (a.dataset.view === nome) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    $('titulo-pagina').textContent = VIEWS[nome];
    $('subtitulo-pagina').textContent = nome === 'dashboard' ? 'SEU ESPAÇO, EM TEMPO REAL' : nome === 'prototipo' ? 'HARDWARE & SIMULAÇÃO' : 'SISTEMA DE ALERTA VISUAL';
    $('descricao-pagina').textContent = DESCRICOES[nome];
    document.title = VIEWS[nome] + ' | Alerta Visual';
    if (moverFoco) $('conteudo').focus();
    window.scrollTo(0, 0);
  }

  /* ---------- Painel ---------- */
  function cartaoEvento(el, ev, topo, vazioTitulo) {
    if (!ev) {
      el.className = 'cartao cartao-evento vazio';
      el.innerHTML = '<p class="rotulo">' + esc(topo) + '</p><h2>' + esc(vazioTitulo) + '</h2><div class="icone-grande">' + icone('check') + '</div><p class="rodape"><span>Nenhuma ocorrência para mostrar</span></p>';
      return;
    }
    const t = TIPOS_UI[ev.tipo];
    el.className = 'cartao cartao-evento t-' + ev.tipo;
    const origem = ev.fonte === 'simulacao' ? 'Evento de demonstração' : ev.fonte === 'wokwi' ? 'Evento do simulador Wokwi' : 'Recebido pelo Arduino';
    el.innerHTML = '<p class="rotulo">' + esc(topo) + '</p><h2>' + esc(t.titulo) + '</h2>' +
      '<p class="nota">' + esc(t.desc) + '</p>' +
      '<div class="icone-grande">' + icone(t.icone) + '</div>' +
      '<p class="rodape"><span>' + esc(ev.origem) + ' · ' + esc(origem) + '</span><time datetime="' + esc(ev.hora) + '">' + horaCurta(ev.hora) + '</time></p>';
  }

  function linhasHistorico(lista, colunaFinal) {
    if (!lista.length) return '<tr class="vazio-linha"><td colspan="4">Nenhum evento registrado ainda.</td></tr>';
    return lista.map((e) =>
      '<tr><td class="hora">' + hora(e.hora) + '</td><td>' + etiquetaTipo(e.tipo) + '</td><td>' + esc(e.origem) + '</td><td>' + colunaFinal(e) + '</td></tr>'
    ).join('');
  }

  function renderDashboard() {
    cartaoEvento($('card-ultimo'), eventos[0], 'Último evento', 'Nenhum evento ainda');
    cartaoEvento($('card-critico'), eventos.find((e) => e.tipo === 'fumaca'), 'Último alerta crítico', 'Sem alertas críticos');

    const ativos = Object.values(estado.dispositivos).filter((d) => d.ativo).length;
    $('num-hoje').textContent = stats.hoje;
    $('num-mics').textContent = ativos;
    $('nota-conexao').textContent = estado.hardware.modo === 'simulado' ? 'Demonstração' : estado.hardware.conectado ? 'Conectado' : 'Desconectado';
    const hwResumo = $('estado-hw-resumo');
    hwResumo.textContent = estado.hardware.modo === 'simulado' ? 'Demonstração' : estado.hardware.conectado ? 'Conectado' : 'Sem conexão';
    hwResumo.className = 'status-pill ' + (estado.hardware.modo === 'simulado' ? 'demo' : estado.hardware.conectado ? '' : 'erro');

    $('tbody-dash').innerHTML = linhasHistorico(eventos.slice(0, 10), (e) => duracao(e.duracao));

    const hw = estado.hardware;
    const arduino = hw.modo === 'simulado' ? ['Simulação', 'aviso'] : hw.modo === 'wokwi' ? [hw.conectado ? 'Wokwi ativo' : 'Wokwi desconectado', hw.conectado ? 'ok' : 'aviso'] : hw.conectado ? ['Conectado', 'ok'] : ['Desconectado', 'aviso'];
    const lista = [
      ['chip', 'Arduino Uno', arduino],
      ['sensor', 'Sensores configurados', [ativos + ' de 4', ativos ? 'ok' : 'aviso']],
      ['vibracao', 'Vibração', estado.exibicao ? ['Habilitada', 'ok'] : ['Desabilitada', 'aviso']],
      ['lampada', 'Iluminação', estado.exibicao ? ['Habilitada', 'ok'] : ['Desabilitada', 'aviso']]
    ];
    $('lista-hw').innerHTML = lista.map((i) =>
      '<li>' + icone(i[0]) + '<span>' + i[1] + '</span><span class="estado ' + i[2][1] + '">' + i[2][0] + '</span></li>'
    ).join('');
  }

  function textoHardware() {
    const hw = estado.hardware;
    if (hw.modo === 'simulado') return 'Modo demonstração (sem Arduino)';
    if (hw.modo === 'wokwi') return hw.conectado ? 'Wokwi conectado (circuito virtual)' : 'Aguardando simulação Wokwi';
    return hw.conectado ? 'Porta serial conectada' : 'Aguardando a placa Arduino';
  }

  /* ---------- Dispositivos ---------- */
  /* Configurações visuais: a interface mantém os valores do backend como fonte de verdade. */
  function blocoCaptura(d) {
    return '<div><div class="linha-chave"><div><span class="com-icone" id="lbl-' + d.id + '">Captura de eventos</span><span class="controle-caption">Monitorar canal de entrada</span></div>' +
      '<label class="interruptor"><input type="checkbox" role="switch" data-acao="ativo" aria-labelledby="lbl-' + d.id + ' nome-' + d.id + '"><span class="trilho"></span></label></div></div>' +
      '<div><div class="linha-chave"><label for="sens-' + d.id + '">Sensibilidade</label></div>' +
      '<div class="sens"><input type="range" id="sens-' + d.id + '" min="0" max="100" step="5" data-acao="sens"><output for="sens-' + d.id + '" id="out-' + d.id + '">60%</output></div></div>';
  }
  function blocoCor(d) {
    return '<fieldset class="caixa-led"><legend>Alerta visual</legend><p>Qual cor deve identificar este canal?</p><div class="cores">' +
      CORES.map((c) => '<label class="opcao-cor cor-' + c[0] + '"><input type="radio" name="cor-' + d.id + '" value="' + c[0] + '" data-acao="cor" aria-label="' + c[1] + '"><span class="bolinha"></span><span class="nome">' + c[1] + '</span></label>').join('') +
      '</div><div class="preview-led" id="preview-' + d.id + '"><span class="led-icon">' + icone('lampada') + '</span><div><strong>Prévia da cor</strong><small>Representação visual · não aciona o hardware</small></div></div></fieldset>';
  }
  function montarDispositivos() {
    const descricoes = {porta:'Som próximo da campainha',bebe:'Som no ambiente do bebê',fumaca:'Som próximo do alarme',custom:'Canal de som personalizável'};
    $('lista-dispositivos').innerHTML = DISPOSITIVOS.map((m) => {
      const d = estado.dispositivos[m.id];
      return '<article class="cartao disp t-' + m.tipo + '" data-id="' + m.id + '">' +
        '<div class="disp-topo"><span class="selo">' + icone(m.icone) + '</span><div><h2 id="nome-' + m.id + '">' + esc(m.nome) + '</h2><small>' + esc(descricoes[m.id]) + '</small></div><span class="status-pill" id="badge-' + m.id + '">—</span></div>' +
        blocoCaptura(d) + blocoCor(d) + '</article>';
    }).join('');
    $('painel-saidas').innerHTML = '<section class="cartao exibicao"><div class="cabecalho-cartao"><div><p class="eyebrow">SAÍDAS DO SISTEMA</p><h2>Dispositivos de exibição</h2></div>' +
      '<div class="linha-chave"><span id="lbl-exib" class="nota">Habilitar saídas</span><label class="interruptor"><input type="checkbox" id="chk-exib" role="switch" aria-labelledby="lbl-exib"><span class="trilho"></span></label></div></div>' +
      '<div class="equip" id="equip"><div>' + icone('chip') + 'Arduino Uno</div><div>' + icone('lampada') + 'Iluminação LED</div><div>' + icone('vibracao') + 'Motor vibratório</div></div>' +
      '<p class="nota" id="aviso-equipamento">O estado de cada peça só pode ser confirmado com testes físicos.</p></section>' +
      '<section class="cartao saida-testes"><div><p class="eyebrow">TESTE RÁPIDO</p><h2>Veja um alerta funcionando</h2><p>Gere uma ocorrência identificada como demonstração.</p></div>' +
      '<label class="sr-only" for="sel-teste">Tipo de teste</label><select id="sel-teste">' + DISPOSITIVOS.map((m) => '<option value="' + m.id + '">' + esc(m.nome) + '</option>').join('') + '</select>' +
      '<button type="button" id="btn-simular" class="btn btn-escuro btn-bloco">' + icone('check') + 'Simular evento de teste</button></section>';
    dispositivosMontados = true;
  }
  function pintarSlider(range) {
    range.style.setProperty('--pct', range.value + '%');
    const out = $('out-' + range.id.replace('sens-', ''));
    if (out) out.textContent = range.value + '%';
  }
  function sincronizarDispositivos() {
    if (!dispositivosMontados) montarDispositivos();
    DISPOSITIVOS.forEach((m) => {
      const d = estado.dispositivos[m.id];
      const card = document.querySelector('[data-id="' + m.id + '"]');
      card.querySelector('[data-acao="ativo"]').checked = d.ativo;
      const slider = card.querySelector('[data-acao="sens"]');
      if (document.activeElement !== slider) { slider.value = d.sensibilidade; pintarSlider(slider); }
      card.querySelectorAll('[data-acao="cor"]').forEach((r) => { r.checked = r.value === d.cor; });
      const badge = $('badge-' + m.id);
      badge.textContent = d.ativo ? 'Habilitado' : 'Desativado';
      badge.className = 'status-pill' + (d.ativo ? '' : ' neutro');
      const color = {azul:'var(--azul)',laranja:'var(--laranja)',vermelho:'var(--vermelho)'}[d.cor];
      $('preview-' + m.id).style.setProperty('--cor',color);
    });
    $('chk-exib').checked = estado.exibicao;
    $('equip').querySelectorAll('div').forEach((div) => div.classList.toggle('ligado', estado.exibicao));
    $('aviso-equipamento').textContent = textoHardware() + '. Habilitar saídas não garante que os componentes físicos estejam funcionando.';
  }
  function ligarEventosDispositivos() {
    const lista = $('lista-dispositivos');
    lista.addEventListener('input',(e) => { if(e.target.dataset.acao === 'sens') pintarSlider(e.target); });
    lista.addEventListener('change', async (e) => {
      const alvo = e.target, card = alvo.closest('[data-id]'); if (!card) return;
      try {
        const id = card.dataset.id;
        if (alvo.dataset.acao === 'ativo') await Api.atualizarDispositivo(id, { ativo: alvo.checked });
        if (alvo.dataset.acao === 'sens') await Api.atualizarDispositivo(id, { sensibilidade: Number(alvo.value) });
        if (alvo.dataset.acao === 'cor') await Api.atualizarDispositivo(id, { cor: alvo.value });
        await atualizarTudo();
      } catch (_) { aviso('Não foi possível salvar. Verifique o servidor.'); await atualizarTudo(); }
    });
    $('painel-saidas').addEventListener('change', async (e) => {
      if (e.target.id !== 'chk-exib') return;
      try { await Api.atualizarExibicao(e.target.checked); await atualizarTudo(); }
      catch (_) { aviso('Não foi possível alterar as saídas.'); await atualizarTudo(); }
    });
    $('painel-saidas').addEventListener('click', async (e) => {
      if (!e.target.closest('#btn-simular')) return;
      try { await Api.simular($('sel-teste').value); }
      catch (_) { aviso('Não foi possível simular o evento.'); }
    });
  }

  /* ---------- Alertas ---------- */
  function renderAlertas() {
    const a = estado.alerta, exib = estado.exibicao, hw = estado.hardware;
    const faixa = $('faixa-alerta');
    if (a) {
      const t = TIPOS_UI[a.tipo];
      faixa.className = 'faixa-alerta ' + (a.critico ? '' : a.tipo === 'bebe' ? 'azul' : 'laranja');
      faixa.innerHTML = icone(a.critico ? 'chama' : t.icone) + '<div><p class="eyebrow">' + (a.fonte === 'simulacao' ? 'DEMONSTRAÇÃO EM ANDAMENTO' : 'SINAL RECEBIDO') + '</p><h2>' + esc(t.titulo) + '</h2><p>' + esc(a.origem) + ' · ' + horaCurta(a.hora) + ' · ' + (a.critico ? 'Verifique a situação com urgência' : 'Acompanhe o aviso') + '</p></div>';
    } else {
      faixa.className = 'faixa-alerta calmo';
      faixa.innerHTML = icone('check') + '<div><p class="eyebrow">SITUAÇÃO ATUAL</p><h2>Nenhum alerta em andamento</h2><p>O sistema está pronto para registrar o próximo sinal.</p></div>';
    }
    $('al-principal').className = 'cartao principal' + (a ? ' t-' + a.tipo : '');
    $('al-principal').innerHTML = '<div class="topo-cartao"><span class="categoria cor-texto-vermelho">Aviso principal</span>' +
      (a ? '<span class="selo-texto">' + (a.critico ? 'Atenção prioritária' : 'Aviso ativo') + '</span>' : '') + '</div>' +
      '<h2 class="titulo-cartao">' + (a ? esc(TIPOS_UI[a.tipo].titulo) : 'Tudo tranquilo no momento') + '</h2>' +
      '<p class="grow">' + (a ? esc(TIPOS_UI[a.tipo].desc) : 'Um alerta novo será exibido aqui e na janela de destaque.') + '</p>' +
      (a ? '<div class="par"><span>Origem</span><strong>' + esc(a.origem) + '</strong></div><div class="par"><span>Horário</span><strong>' + hora(a.hora) + '</strong></div>' : '') +
      '<button type="button" class="btn btn-vermelho btn-bloco" id="btn-silenciar" ' + (a ? '' : 'disabled') + '>' + icone('silencio') + 'Silenciar sinal</button>';
    const corNome = a ? (CORES.find((c) => c[0] === a.cor) || ['',''])[1] : '—';
    const telemetria = hw.conectado && hw.ultimaMensagem && Date.now() - new Date(hw.ultimaMensagem).getTime() < 10000;
    const saida = !exib ? 'Saídas desabilitadas' : hw.modo === 'simulado' ? 'Prévia de demonstração' : telemetria ? 'Telemetria do firmware' : 'Aguardando telemetria';
    $('al-hardware').innerHTML = '<div class="topo-cartao"><span class="categoria cor-texto-azul">Sinalização</span><span class="selo-texto">' + esc(saida) + '</span></div>' +
      '<h2 class="titulo-cartao">Luz e vibração</h2>' +
      '<div class="par"><span>Padrão LED configurado</span><strong>' + (a && exib ? esc(a.led) + ' · ' + esc(corNome) : 'Em espera') + '</strong></div>' +
      '<div class="par"><span>LED (firmware)</span><strong>' + (telemetria ? (hw.ledAtivo ? 'Acionado' : 'Em repouso') : 'Sem confirmação') + '</strong></div>' +
      '<div class="par"><span>Motor (firmware)</span><strong>' + (telemetria ? (hw.motorAtivo ? 'Acionado' : 'Em repouso') : 'Sem confirmação') + '</strong></div>' +
      '<div class="grow"></div><button type="button" class="btn btn-verde btn-bloco" id="btn-testar">' + icone('check') + 'Testar sinal de hardware</button>';
    const dispositivosAtivos = Object.values(estado.dispositivos).filter(d=>d.ativo);
    $('al-malha').innerHTML = '<div class="topo-cartao"><span class="categoria cor-texto-verde">Seus canais</span><span class="status-pill neutro">' + dispositivosAtivos.length + '/4 habilitados</span></div><h2 class="titulo-cartao">Monitoramento configurado</h2>' +
      '<ul class="itens-malha">' + DISPOSITIVOS.map(m => '<li>' + icone(m.icone) + '<span>' + esc(m.nome) + '</span><strong class="est ' + (estado.dispositivos[m.id].ativo ? 'cor-texto-verde' : '') + '">' + (estado.dispositivos[m.id].ativo ? 'Habilitado' : 'Desativado') + '</strong></li>').join('') + '</ul>' +
      '<div class="grow"></div><p class="nota">' + esc(textoHardware()) + '. A conexão não confirma individualmente cada sensor.</p>';
    $('al-evacuacao').innerHTML = '<div class="topo-cartao"><span class="categoria cor-texto-laranja">Orientações</span></div>' +
      '<h2 class="titulo-cartao">Segurança em primeiro lugar</h2>' +
      '<div class="saida">' + icone('saida') + '<div><strong>' + (a && a.critico ? 'Se houver suspeita de incêndio' : 'Orientações para situações de risco') + '</strong><p>Procure uma saída segura, não reentre no local e ligue para os bombeiros (193) em uma emergência.</p></div></div>' +
      '<p class="grow">O protótipo não verifica rotas, não controla portas e não envia mensagens externas.</p>' +
      '<button type="button" class="btn btn-escuro btn-bloco" id="btn-notificar">' + icone('enviar') + 'Registrar pedido de aviso (demo)</button>';
  }

  function ligarEventosAlertas() {
    $('view-alertas').addEventListener('click', async (e) => {
      try {
        if (e.target.closest('#btn-silenciar')) await Api.silenciar();
        else if (e.target.closest('#btn-testar')) await Api.testarHardware();
        else if (e.target.closest('#btn-notificar')) await Api.notificar();
      } catch (_) { aviso('Não foi possível concluir a ação.'); }
    });
  }

  /* ---------- Relatórios ---------- */
  function linhasRelatorio(lista) {
    const nomes = {atendido:'Silenciado',pendente:'Em andamento',encerrado:'Encerrado',silenciado:'Silenciado'};
    if (!lista.length) return '<tr class="vazio-linha"><td colspan="6">Não há registros para este filtro.</td></tr>';
    return lista.slice(0,120).map(e=>'<tr><td class="hora">'+new Date(e.hora).toLocaleString('pt-BR')+'</td><td>'+etiquetaTipo(e.tipo)+'</td><td>'+esc(e.origem)+'</td><td>'+ (Number.isFinite(e.db)?e.db+'*':'—') +'</td><td>'+duracao(e.duracao)+'</td><td><span class="status '+esc(e.status)+'">'+(nomes[e.status]||'Registrado')+'</span></td></tr>').join('');
  }
  function renderRelatorios() {
    const lista = relatorio.eventos || [];
    const filtro = $('tipo-rel').value;
    const filtrados = filtro === 'todos' ? lista : lista.filter(e=>e.tipo===filtro);
    const pico = lista.reduce((m,e)=>e.db>(m?m.db:0)?e:m,null);
    const cont = {campainha:0,bebe:0,fumaca:0,custom:0};
    const periodos = Array.from({length:8},()=>({campainha:0,bebe:0,fumaca:0,custom:0}));
    lista.forEach(e=>{if(cont[e.tipo]===undefined)return;cont[e.tipo]++;periodos[Math.floor(new Date(e.hora).getHours()/3)][e.tipo]++;});
    const comum=Object.entries(cont).sort((a,b)=>b[1]-a[1])[0];
    const atendidas = lista.filter(e=>e.tipo==='fumaca' && e.status!=='pendente').length;
    const cards = [
      ['Total de eventos',String(lista.length)+'<small>Ocorrências no período escolhido</small>',''],
      ['Amplitude mais alta',pico?pico.db+'*<small>Leitura convertida, não calibrada</small>':'—<small>Sem leituras</small>','t-campainha'],
      ['Mais frequente',comum&&comum[1]?esc(TIPOS_UI[comum[0]].rotulo)+'<small>'+comum[1]+' ocorrências</small>':'—<small>Sem ocorrências</small>','t-custom'],
      ['Alertas de fumaça encerrados',String(atendidas)+'<small>Encerrados ou silenciados, não significa risco resolvido</small>','t-fumaca']
    ];
    $('stats-relatorio').innerHTML = cards.map(c=>'<article class="cartao '+c[2]+'"><h2>'+c[0]+'</h2><p class="valor">'+c[1]+'</p></article>').join('');
    const totais = periodos.map(p=>Object.values(p).reduce((a,b)=>a+b,0)), max = Math.max(1,...totais);
    $('grafico').innerHTML = periodos.map((p,i)=>{
      const fa = String(i*3).padStart(2,'0')+'h–'+String((i+1)*3).padStart(2,'0')+'h';
      const segmentos = ['campainha','bebe','fumaca','custom'].filter(k=>p[k]).map(k=>'<div class="seg t-'+k+'" style="flex-grow:'+p[k]+'"></div>').join('');
      const leitura = fa+': '+totais[i]+' eventos; campainha '+p.campainha+', bebê '+p.bebe+', alarme '+p.fumaca+', personalizados '+p.custom;
      return '<li title="'+leitura+'"><span class="sr-only">'+leitura+'</span><div class="barra-area" aria-hidden="true"><span class="total">'+(totais[i]||'')+'</span><div class="pilha" style="height:'+(totais[i]?Math.max(4,Math.round(totais[i]/max*94)):0)+'%">'+segmentos+'</div></div><span class="faixa" aria-hidden="true">'+fa+'</span></li>';
    }).join('');
    const labels={campainha:'Campainha',bebe:'Bebê',fumaca:'Alarme de fumaça',custom:'Outros'}, cores={campainha:'var(--laranja)',bebe:'var(--azul)',fumaca:'var(--vermelho)',custom:'var(--roxo)'};
    let soma=0;
    const fatias=Object.keys(cont).map(k=>{const ini=soma;soma+=lista.length?cont[k]/lista.length*360:0;return cores[k]+' '+ini+'deg '+soma+'deg';}).join(',');
    $('total-por-tipo').innerHTML = '<div class="donut" style="--fatias:conic-gradient('+(lista.length?fatias:'#243d5b 0deg 360deg')+')"><strong>'+lista.length+'<small>eventos</small></strong></div><ul class="categorias-lista">'+Object.keys(cont).map(k=>'<li style="--cor:'+cores[k]+'"><i class="q"></i><span>'+labels[k]+'</span><strong>'+cont[k]+'</strong><span class="nota">'+(lista.length?Math.round(cont[k]/lista.length*100):0)+'%</span></li>').join('')+'</ul>';
    $('tbody-rel').innerHTML = linhasRelatorio(filtrados);
  }
  function exportarCsv() {
    const lista=(relatorio.eventos||[]).filter(e=>$('tipo-rel').value==='todos'||e.tipo===$('tipo-rel').value);
    const seguro = x => { let v=String(x == null ? '' : x).replace(/^[\s]*[=+@-]/, m => String.fromCharCode(39)+m); return '"'+v.replace(/"/g,'""')+'"'; };
    const cab=['Data/hora','Evento','Ambiente','Amplitude estimada (nao calibrada)','Duracao (s)','Situacao','Origem dos dados'];
    const rows=lista.map(e=>[new Date(e.hora).toLocaleString('pt-BR'), TIPOS_UI[e.tipo]?.rotulo||e.tipo,e.origem,e.db,e.duracao,e.status,e.fonte]);
    const csv='\uFEFF'+[cab,...rows].map(row=>row.map(seguro).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const a=document.createElement('a');a.href=url;a.download='alerta-visual-relatorio.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    aviso('Relatório CSV preparado para download.');
  }

  /* ---------- Alerta em tela cheia ---------- */
  function mostrarAlerta(a) {
    const t = TIPOS_UI[a.tipo];
    const tela = $('alerta-tela');
    tela.className = 'alerta-tela t-' + a.tipo + (a.critico ? ' critico' : '');
    $('alerta-icone').innerHTML = icone(t.icone);
    $('alerta-titulo').textContent = t.titulo + (a.critico ? '!' : '');
    $('alerta-identificacao').textContent = a.fonte === 'simulacao' ? 'EVENTO DE DEMONSTRAÇÃO' : 'SINAL IMPORTANTE';
    $('alerta-desc').textContent = a.origem + ' • ' + horaCurta(a.hora) + ' — ' + t.desc;
    if (tela.hidden) focoAnterior = document.activeElement;
    tela.hidden = false;
    $('alerta-silenciar').focus();
    $('anuncio').textContent = t.titulo + '. ' + a.origem + '.';
    if (navigator.vibrate) navigator.vibrate(a.critico ? [300, 100, 300, 100, 300, 100, 300] : [400, 200, 400]);
  }
  function esconderAlerta() {
    const tela = $('alerta-tela');
    if (tela.hidden) return;
    tela.hidden = true;
    if (navigator.vibrate) navigator.vibrate(0);
    if (focoAnterior && document.contains(focoAnterior)) focoAnterior.focus();
  }

  /* ---------- Boas-vindas e protótipo virtual (dados do servidor) ---------- */
  function renderBoasVindas() {
    const a = estado.alerta;
    const hero = $('boas-vindas');
    const titulo = $('boas-titulo');
    const descricao = $('boas-descricao');
    hero.classList.toggle('com-alerta', !!a);
    if (a) {
      titulo.textContent = a.fonte === 'simulacao' ? 'Demonstração em andamento.' : 'Um sinal precisa da sua atenção.';
      descricao.textContent = TIPOS_UI[a.tipo].titulo + ' · ' + a.origem + '. Veja o aviso e saiba como agir.';
    } else {
      titulo.textContent = 'Tudo tranquilo por aqui.';
      descricao.textContent = 'Se algum som importante for percebido, você vai ver o aviso aqui.';
    }
  }

  function renderPrototipo() {
    const hw = estado.hardware;
    const fisico = hw.modo === 'serial';
    const wokwi = hw.modo === 'wokwi';
    const conectado = (fisico || wokwi) && hw.conectado;
    const a = estado.alerta;
    const ult = eventos[0];
    const ultimoRecentemente = ult && (Date.now() - new Date(ult.hora).getTime() < 30000);
    const idSinal = a ? (a.dispositivo || (ult && ult.dispositivo)) : ultimoRecentemente ? ult.dispositivo : null;
    const corPorNome = { azul: '#357fa2', laranja: '#b87534', vermelho: '#b64245' };
    const nomePorta = hw.porta || 'Não definida';
    const modo = wokwi ? (conectado ? 'Wokwi conectado' : 'Wokwi desconectado') : !fisico ? 'Simulação no navegador' : conectado ? 'Arduino físico' : 'Arduino desconectado';
    $('prototipo-fonte').textContent = modo;
    $('prototipo-fonte').className = 'prototipo-fonte ' + (!fisico && !wokwi ? 'sim' : conectado ? (wokwi ? 'sim' : '') : 'off');
    $('status-bolinha').className = 'status-bolinha ' + (!fisico && !wokwi ? 'sim' : conectado ? 'ok' : '');
    $('status-prototipo').textContent = wokwi ? (conectado ? 'Simulador conectado' : 'Aguardando o Wokwi') : !fisico ? 'Modo de demonstração' : conectado ? 'Arduino conectado' : 'Aguardando o Arduino';
    $('status-explicacao').textContent = wokwi
      ? 'A placa no Wokwi está enviando dados pelo canal serial virtual. Os sensores e atuadores também são virtuais.'
      : !fisico
      ? 'Os comandos e os alertas são demonstrados no navegador. Nenhuma peça física está sendo medida.'
      : conectado
        ? 'A conexão serial está aberta. As informações abaixo vêm do sistema e, quando disponível, do firmware da placa.'
        : 'O servidor foi configurado para uma porta serial, mas ainda não estabeleceu a conexão.';
    $('status-origem').textContent = modo;
    $('status-porta').textContent = !fisico && !wokwi ? 'Arduino Uno · demonstração' : 'Arduino Uno · ' + nomePorta;
    $('status-ultimo').textContent = ult ? TIPOS_UI[ult.tipo].rotulo + ' · ' + horaCurta(ult.hora) + (ult.fonte === 'simulacao' ? ' (teste)' : '') : 'Nenhum evento';
    $('arduino-meta').textContent = conectado ? (wokwi ? 'Serial virtual conectada' : 'Porta serial conectada') : !fisico && !wokwi ? 'Simulação em execução' : 'Sem conexão';
    $('placa-atualizacao').textContent = a ? 'Sinal ativo agora' : 'Aguardando o próximo sinal';
    const nomesPinos = { porta:'A0', bebe:'A1', fumaca:'A2', custom:'A3' };
    $('placa-sensores').innerHTML = DISPOSITIVOS.map((d) => {
      const conf = estado.dispositivos[d.id];
      const aceso = conf.ativo && d.id === idSinal && (a || ultimoRecentemente);
      return '<div class="sensor-demo ' + (conf.ativo ? 'ativo ' : '') + (aceso ? 'em-alerta t-' + d.tipo : '') + '"' +
        ' title="' + esc(d.nome) + ', porta ' + nomesPinos[d.id] + '">' +
        '<div><span class="sensor-nome">' + esc(d.nome) + '</span><small>' + nomesPinos[d.id] + ' · ' +
        (aceso ? (a ? 'Sinal ativo' : 'Último evento') : conf.ativo ? 'Habilitado' : 'Desativado') +
        '</small></div><span class="sensor-led" aria-hidden="true"></span></div>';
    }).join('');

    // Em simulação, a saída é PREVISTA. Com Arduino, usa-se o estado reportado pelo firmware
    // quando a telemetria STATUS está disponível; não se promete confirmação elétrica.
    const telemetriaOk = conectado && hw.ultimaMensagem && Date.now() - new Date(hw.ultimaMensagem).getTime() < 10000;
    const ledAtivo = conectado ? (telemetriaOk ? !!hw.ledAtivo : false) : (!fisico && !wokwi && !!a && estado.exibicao);
    const motorAtivo = conectado ? (telemetriaOk ? !!hw.motorAtivo : false) : (!fisico && !wokwi && !!a && estado.exibicao);
    const semTelemetria = (conectado && !telemetriaOk) || (wokwi && !conectado);
    const led = $('led-demo');
    led.className = 'led-demo' + (ledAtivo ? ' ligado' : '');
    led.style.setProperty('--ledcor', a ? (corPorNome[a.cor] || '#43836a') : '#43836a');
    $('motor-demo').className = 'motor-demo' + (motorAtivo ? ' ligado' : '');
    $('led-label').textContent = semTelemetria ? 'Sem telemetria' : ledAtivo ? 'Sinal ativo' : 'Em espera';
    $('motor-label').textContent = semTelemetria ? 'Sem telemetria' : motorAtivo ? 'Motor ativo' : 'Em espera';
    $('led-detalhe').textContent = !fisico && !wokwi ? 'Visualização demonstrativa' : semTelemetria ? 'Aguardando resposta da placa' : 'Estado informado pelo firmware';
    $('motor-detalhe').textContent = !fisico && !wokwi ? 'Visualização demonstrativa' : semTelemetria ? 'Aguardando resposta da placa' : 'Estado informado pelo firmware';
    $('placa-nota').textContent = !fisico && !wokwi
      ? 'Demonstração: os LEDs e o motor são representações digitais, não equipamentos físicos. Clique em “Simular este sinal” para ver a resposta.'
      : telemetriaOk
        ? 'O firmware está enviando telemetria de saída. Trata-se do estado informado pelo código (em Wokwi, virtual), não de uma medição elétrica em componentes reais.'
        : 'Conexão serial identificada. Ainda sem telemetria de saída recente: não é possível confirmar se o LED ou o motor foram acionados.';
  }

  /* ---------- Conexão e dados ---------- */
  function pintarConexao() {
    const el = $('conexao');
    let texto, cls;
    if (!socketOk) { texto = 'Sem conexão com o servidor'; cls = ''; }
    else if (!estado) { texto = 'Conectando…'; cls = ''; }
    else if (estado.hardware.modo === 'simulado') { texto = 'Modo simulação'; cls = 'sim'; }
    else if (estado.hardware.modo === 'wokwi') { texto = estado.hardware.conectado ? 'Wokwi conectado' : 'Wokwi desconectado'; cls = estado.hardware.conectado ? 'sim' : ''; }
    else if (estado.hardware.conectado) { texto = 'Arduino conectado'; cls = 'ok'; }
    else { texto = 'Arduino desconectado'; cls = ''; }
    el.className = 'conexao ' + cls;
    $('conexao-texto').textContent = texto;
    $('conexao-ajuda').textContent = !socketOk ? 'Verifique o servidor local' :
      !estado ? 'Carregando informações' :
      estado.hardware.modo === 'simulado' ? 'Sem Arduino físico' :
      estado.hardware.modo === 'wokwi' ? (estado.hardware.conectado ? 'Firmware em ambiente virtual' : 'Aguardando ponte local') :
      estado.hardware.conectado ? 'Comunicação serial aberta' : 'Verifique o cabo e a porta';
    const badge = $('modo-badge');
    badge.textContent = !socketOk ? 'Sem conexão' : !estado ? 'Carregando' :
      estado.hardware.modo === 'simulado' ? 'Modo demonstração' :
      estado.hardware.modo === 'wokwi' ? (estado.hardware.conectado ? 'Wokwi conectado' : 'Wokwi desconectado') :
      estado.hardware.conectado ? 'Arduino conectado' : 'Arduino desconectado';
    badge.className = 'modo-badge ' + (!socketOk || (estado && estado.hardware.modo !== 'simulado' && !estado.hardware.conectado) ? 'off' : estado && ['simulado','wokwi'].includes(estado.hardware.modo) ? 'sim' : '');
  }

  async function atualizarTudo() {
    try {
      const periodo = $('periodo-rel').value;
      const [e, ev, st, report] = await Promise.all([Api.estado(), Api.eventos(200), Api.estatisticas(), Api.relatorio(periodo)]);
      estado = e; eventos = ev; stats = st; relatorio = report;
      pintarConexao();
      renderDashboard();
      sincronizarDispositivos();
      renderAlertas();
      renderRelatorios();
      renderPrototipo();
      renderBoasVindas();
      const indicador = $('contagem-nav');
      indicador.hidden = !estado.alerta; 
      if (!estado.alerta) esconderAlerta();
    } catch (_) {
      aviso('Não foi possível carregar os dados do servidor.');
    }
  }

  function aoReceber(m) {
    if (m.tipo === 'evento') {
      if (m.alertar) mostrarAlerta(m.alerta);
      else aviso('Novo evento registrado: ' + TIPOS_UI[m.evento.tipo].titulo);
      atualizarTudo();
    } else if (m.tipo === 'alerta_fim') {
      esconderAlerta();
      aviso(m.motivo === 'silenciado' ? 'Alerta silenciado.' : 'Alerta encerrado.');
      atualizarTudo();
    } else if (m.tipo === 'hardware') {
      if (estado) { estado.hardware = m.hardware; pintarConexao(); renderPrototipo(); }
    } else if (m.tipo === 'teste') {
      aviso('Comando de teste solicitado. Consulte o estado do hardware para confirmar.');
    } else if (m.tipo === 'notificacao') {
      aviso('Pedido registrado neste protótipo. Nenhuma mensagem foi enviada.');
      atualizarTudo();
    } else {
      atualizarTudo();
    }
  }

  /* ---------- Início ---------- */
  document.addEventListener('DOMContentLoaded', async () => {
    window.addEventListener('hashchange', () => irPara(true));
    irPara(false);
    $('periodo-rel').addEventListener('change', atualizarTudo);
    $('tipo-rel').addEventListener('change', renderRelatorios);
    $('btn-exportar').addEventListener('click', exportarCsv);
    $('data-atual').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    $('btn-teste-proto').addEventListener('click', async () => {
      try { await Api.simular($('sel-teste-proto').value); }
      catch (_) { aviso('Não foi possível iniciar a demonstração.'); }
    });
    ligarEventosDispositivos();
    ligarEventosAlertas();

    $('alerta-silenciar').addEventListener('click', async () => {
      try { await Api.silenciar(); } catch (_) { esconderAlerta(); }
    });
    $('alerta-fechar').addEventListener('click', esconderAlerta);
    document.addEventListener('keydown', (e) => {
      if ($('alerta-tela').hidden) return;
      if (e.key === 'Escape') esconderAlerta();
      if (e.key === 'Tab') {
        const itens = [$('alerta-silenciar'), $('alerta-fechar')];
        const primeiro = itens[0], ultimo = itens[itens.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
      }
    });

    Api.conectar(aoReceber, (ok) => {
      socketOk = ok;
      pintarConexao();
      if (ok) atualizarTudo();
    });
    await atualizarTudo();
    if (estado && estado.alerta) mostrarAlerta(estado.alerta);
  });
})();
