/* Comunicação com o backend: REST para ler/alterar dados, WebSocket para eventos em tempo real */
const Api = {
  // Toda chamada tem prazo: sem isso, um servidor travado deixaria botões "carregando" para sempre.
  async requisitar(url, opcoes = {}, prazoMs = 8000) {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), prazoMs);
    let r;
    try {
      r = await fetch(url, { cache: 'no-store', ...opcoes, signal: controle.signal });
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'O servidor demorou demais para responder.' : 'Sem conexão com o servidor. Verifique se ele está em execução.');
    } finally {
      clearTimeout(relogio);
    }
    if (!r.ok) {
      const erro = await r.json().catch(() => ({}));
      throw new Error(erro.erro || 'Falha na requisição (' + r.status + ').');
    }
    return r.json();
  },

  obter: (url) => Api.requisitar(url),

  enviar: (metodo, url, corpo) => Api.requisitar(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined
  }, 10000),

  estado: () => Api.obter('/api/estado'),
  eventos: (limite = 50) => Api.obter('/api/eventos?limite=' + limite),
  estatisticas: () => Api.obter('/api/estatisticas'),
  relatorio: (periodo = '7d', fonte = 'todas') =>
    Api.obter('/api/relatorio?periodo=' + encodeURIComponent(periodo) + '&fonte=' + encodeURIComponent(fonte)),
  atualizarDispositivo: (id, dados) => Api.enviar('PUT', '/api/dispositivos/' + id, dados),
  atualizarExibicao: (ativo) => Api.enviar('PUT', '/api/exibicao', { ativo }),
  simular: (dispositivo) => Api.enviar('POST', '/api/simular', { dispositivo }),
  silenciar: () => Api.enviar('POST', '/api/alerta/silenciar'),
  testarHardware: () => Api.enviar('POST', '/api/hardware/testar'),
  limparSimulacoes: () => Api.enviar('DELETE', '/api/eventos/simulacoes'),
  diagnostico: () => Api.obter('/api/diagnostico'),

  // WebSocket com reconexão progressiva (1 s, 2 s, 4 s… até 10 s) em vez de insistir a cada 2 s.
  conectar(aoReceber, aoMudarConexao) {
    let tentativas = 0;
    const abrir = () => {
      const protocolo = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(protocolo + '://' + location.host + '/ws');
      ws.onopen = () => { tentativas = 0; aoMudarConexao(true); };
      ws.onclose = () => {
        aoMudarConexao(false);
        const espera = Math.min(1000 * 2 ** tentativas, 10000);
        tentativas += 1;
        setTimeout(abrir, espera);
      };
      ws.onerror = () => { /* o onclose cuida da reconexão */ };
      ws.onmessage = (e) => {
        try { aoReceber(JSON.parse(e.data)); } catch (_) { /* mensagem inválida: ignora */ }
      };
    };
    abrir();
  }
};
