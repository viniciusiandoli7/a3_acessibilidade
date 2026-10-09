/* Comunicação com o backend: REST para ler/alterar dados, WebSocket para eventos em tempo real */
const Api = {
  async obter(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Falha ao carregar ' + url);
    return r.json();
  },

  async enviar(metodo, url, corpo) {
    const r = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    if (!r.ok) { const erro = await r.json().catch(()=>({})); throw new Error(erro.erro || 'Falha ao enviar ' + url); }
    return r.json();
  },

  estado: () => Api.obter('/api/estado'),
  eventos: (limite = 50) => Api.obter('/api/eventos?limite=' + limite),
  estatisticas: () => Api.obter('/api/estatisticas'),
  relatorio: (periodo = '7d') => Api.obter('/api/relatorio?periodo=' + encodeURIComponent(periodo)),
  atualizarDispositivo: (id, dados) => Api.enviar('PUT', '/api/dispositivos/' + id, dados),
  atualizarExibicao: (ativo) => Api.enviar('PUT', '/api/exibicao', { ativo }),
  simular: (dispositivo) => Api.enviar('POST', '/api/simular', { dispositivo }),
  silenciar: () => Api.enviar('POST', '/api/alerta/silenciar'),
  testarHardware: () => Api.enviar('POST', '/api/hardware/testar'),
  limparSimulacoes: () => Api.enviar('DELETE', '/api/eventos/simulacoes'),
  diagnostico: () => Api.obter('/api/diagnostico'),

  conectar(aoReceber, aoMudarConexao) {
    const abrir = () => {
      const protocolo = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(protocolo + '://' + location.host + '/ws');
      ws.onopen = () => aoMudarConexao(true);
      ws.onclose = () => { aoMudarConexao(false); setTimeout(abrir, 2000); };
      ws.onmessage = (e) => {
        try { aoReceber(JSON.parse(e.data)); } catch (_) { /* mensagem inválida: ignora */ }
      };
    };
    abrir();
  }
};
