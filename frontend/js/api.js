/* Comunicação com o backend: REST para ler/alterar dados, WebSocket para eventos em tempo real.
 *
 * Dois jeitos de usar:
 *  1) Painel aberto direto no notebook (http://localhost:3000): nada a configurar.
 *  2) Painel aberto em outro lugar (ex.: o app no Vercel, no celular): o aparelho guarda o endereço do servidor
 *     do notebook e um token de acesso. Eles chegam por um link de pareamento (?servidor=...&token=...)
 *     ou pelo formulário "Servidor" no menu.
 */
const Config = {
  CHAVE_SERVIDOR: 'av_servidor',
  CHAVE_TOKEN: 'av_token',
  ler(chave) { try { return localStorage.getItem(chave) || ''; } catch (_) { return ''; } },
  gravar(chave, valor) {
    try { if (valor) localStorage.setItem(chave, valor); else localStorage.removeItem(chave); } catch (_) { /* navegação privada */ }
  },
  servidor() { return Config.ler(Config.CHAVE_SERVIDOR); },
  token() { return Config.ler(Config.CHAVE_TOKEN); },

  ehHostLocal(host) { return /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/.test(host); },

  /* Aceita "abc.trycloudflare.com", "https://abc.trycloudflare.com/" ou "192.168.0.10:3000".
   * Devolve { ok, valor } ou { ok:false, erro } (texto para mostrar à pessoa). */
  normalizarServidor(texto) {
    let t = String(texto || '').trim().replace(/\/+$/, '');
    if (!t) return { ok: true, valor: '' };
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) {
      const host = t.split(/[/:]/)[0];
      t = (Config.ehHostLocal(host) || /^\d+\.\d+\.\d+\.\d+/.test(host) ? 'http://' : 'https://') + t;
    }
    let u;
    try { u = new URL(t); } catch (_) { return { ok: false, erro: 'Endereço inválido. Exemplo: https://meu-servidor.trycloudflare.com' }; }
    if (!['http:', 'https:'].includes(u.protocol)) return { ok: false, erro: 'Use um endereço http:// ou https://.' };
    // Uma página https não consegue falar com um servidor http (o navegador bloqueia): só vale para o próprio notebook.
    if (location.protocol === 'https:' && u.protocol === 'http:' && !Config.ehHostLocal(u.hostname)) {
      return { ok: false, erro: 'Esta página usa https, então o servidor também precisa de https. Use o endereço do túnel (começa com https://).' };
    }
    return { ok: true, valor: u.origin };
  },

  /* Link de pareamento: guarda servidor/token e tira os dois do endereço (o token não fica no histórico nem em prints). */
  aplicarLink() {
    let p;
    try { p = new URLSearchParams(location.search); } catch (_) { return false; }
    const servidor = p.get('servidor'), token = p.get('token');
    if (servidor === null && token === null) return false;
    if (servidor !== null) { const r = Config.normalizarServidor(servidor); if (r.ok) Config.gravar(Config.CHAVE_SERVIDOR, r.valor); }
    if (token !== null) Config.gravar(Config.CHAVE_TOKEN, token.trim());
    p.delete('servidor'); p.delete('token');
    const resto = p.toString();
    try { history.replaceState(null, '', location.pathname + (resto ? '?' + resto : '') + location.hash); } catch (_) { /* ignorado */ }
    return true;
  }
};
Config.aplicarLink();

const Api = {
  // Endereço absoluto de uma rota do servidor (vazio = o mesmo servidor que entregou esta página).
  url: (rota) => Config.servidor() + rota,

  // Toda chamada tem prazo: sem isso, um servidor travado deixaria botões "carregando" para sempre.
  async requisitar(rota, opcoes = {}, prazoMs = 8000) {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), prazoMs);
    const token = Config.token();
    const cabecalhos = { ...(opcoes.headers || {}) };
    if (token) cabecalhos.Authorization = 'Bearer ' + token;
    let r;
    try {
      r = await fetch(Api.url(rota), { cache: 'no-store', ...opcoes, headers: cabecalhos, signal: controle.signal });
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'O servidor demorou demais para responder.' :
        Config.servidor() ? 'Sem conexão com o servidor configurado. Confira se o notebook está com o servidor e o túnel ligados.' :
        'Sem conexão com o servidor. Verifique se ele está em execução.');
    } finally {
      clearTimeout(relogio);
    }
    if (!r.ok) {
      const erro = await r.json().catch(() => ({}));
      throw new Error(erro.erro || (r.status === 401 ? 'Token de acesso inválido.' : 'Falha na requisição (' + r.status + ').'));
    }
    return r.json();
  },

  obter: (rota) => Api.requisitar(rota),

  enviar: (metodo, rota, corpo) => Api.requisitar(rota, {
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
  simular: (dispositivo, fisico = false) => Api.enviar('POST', '/api/simular', fisico ? { dispositivo, fisico: true } : { dispositivo }),
  silenciar: () => Api.enviar('POST', '/api/alerta/silenciar'),
  testarHardware: () => Api.enviar('POST', '/api/hardware/testar'),
  testarTemperatura: () => Api.enviar('POST', '/api/hardware/testar-temperatura'),
  limparSimulacoes: () => Api.enviar('DELETE', '/api/eventos/simulacoes'),
  diagnostico: () => Api.obter('/api/diagnostico'),

  // WebSocket com reconexão progressiva (1 s, 2 s, 4 s… até 10 s) em vez de insistir a cada 2 s.
  // Navegadores não deixam enviar cabeçalhos no WebSocket, então o token vai no endereço (só para este canal).
  conectar(aoReceber, aoMudarConexao) {
    let tentativas = 0;
    const abrir = () => {
      const servidor = Config.servidor();
      const base = servidor ? servidor.replace(/^http/, 'ws') : (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host;
      const token = Config.token();
      const ws = new WebSocket(base + '/ws' + (token ? '?token=' + encodeURIComponent(token) : ''));
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
