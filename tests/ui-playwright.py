"""Smoke test do frontend real com APIs substituídas por fixtures em memória.
Executar: python tests/ui-playwright.py (requer playwright Python e Chromium).
Não comprova hardware físico ou execução do Express instalado.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'frontend'

MOCK_JS=r'''
(() => {
 const cfg = {
  exibicao:true,
  dispositivos:{
   porta:{id:'porta',tipo:'campainha',ativo:true,sensibilidade:60,cor:'laranja'},
   bebe:{id:'bebe',tipo:'bebe',ativo:true,sensibilidade:75,cor:'azul'},
   fumaca:{id:'fumaca',tipo:'fumaca',ativo:true,sensibilidade:80,cor:'vermelho'},
   custom:{id:'custom',tipo:'custom',ativo:false,sensibilidade:60,cor:'azul'}
  },
  hardware:{modo:'simulado',conectado:false,porta:null,ultimaMensagem:null,ledAtivo:false,motorAtivo:false,firmware:null},
  alerta:null,
  tipos:{}
 };
 let eventos=[];
 let sockets=[];
 const json=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>structuredClone(body)});
 function broadcast(data) {for(const s of sockets){if(s.onmessage)s.onmessage({data:JSON.stringify(data)})}}
 class FakeWebSocket {
  constructor(){sockets.push(this);this.readyState=1;setTimeout(()=>{this.onopen?.();this.onmessage?.({data:JSON.stringify({tipo:'estado'})})},0)}
  close(){this.readyState=3;this.onclose?.()}
 }
 window.WebSocket=FakeWebSocket;
 window.fetch=async (url,options={})=>{
  const method=(options.method||'GET').toUpperCase();
  const dados=options.body?JSON.parse(options.body):{};
  const caminho=String(url).split('?')[0];
  if (caminho==='/api/estado')return json(cfg);
  if (caminho==='/api/eventos')return json(eventos.slice().reverse());
  if (caminho==='/api/estatisticas')return json({total:eventos.length,hoje:eventos.length,variacao:null,picoDb:null,maisFrequente:null,emergencias:{total:0,atendidas:0,pct:null},porPeriodo:Array.from({length:8},()=>({campainha:0,bebe:0,fumaca:0,custom:0}))});
  if (caminho==='/api/relatorio')return json({periodo:'7d',eventos:eventos.slice().reverse()});
  if (caminho==='/api/diagnostico')return json({modo:'simulado',conectado:false,firmware:null,status:{horario:null,idadeMs:null,recente:false},entradas:Object.entries(cfg.dispositivos).map(([id,d])=>({id,ativo:d.ativo,ultimoEvento:null,amplitude:null,ultimaLeitura:null,estado:'sem_conexao'})),saidas:{led:null,motor:null},aviso:'Simulação'});
  if (caminho.startsWith('/api/dispositivos/')&&method==='PUT'){
   const d=cfg.dispositivos[caminho.split('/').pop()];Object.assign(d,dados);broadcast({tipo:'estado'});return json(d);
  }
  if (caminho==='/api/exibicao') {cfg.exibicao=!!dados.ativo;broadcast({tipo:'estado'});return json({exibicao:cfg.exibicao})}
  if (caminho==='/api/simular') {
   const id=dados.dispositivo||'porta',tipo=cfg.dispositivos[id].tipo;
   if(!cfg.dispositivos[id].ativo)return json({erro:'Canal desativado. Ative-o em Dispositivos antes de simular.'},409);
   const e={id:String(Date.now())+'-'+String(Math.random()).slice(2),tipo,dispositivo:id,rotulo:tipo,origem:{porta:'Entrada',bebe:'Quarto',fumaca:'Cozinha',custom:'Sala'}[id],cor:cfg.dispositivos[id].cor,hora:new Date().toISOString(),db:67,fonte:'simulacao',duracao:null,status:'pendente'};
   eventos.push(e);
   cfg.alerta={...e,eventoId:e.id,critico:tipo==='fumaca',led:'Pisca lento',vibracao:'Pulso curto'};
   broadcast({tipo:'evento',evento:e,alerta:cfg.alerta,alertar:true});
   return json(e);
  }
  if (caminho==='/api/alerta/silenciar'){cfg.alerta=null;broadcast({tipo:'alerta_fim',motivo:'silenciado'});return json({ok:true})}
  if (caminho==='/api/hardware/testar')return json({ok:true,enviado:false,observacao:'Nenhum hardware conectado'});
  return json({erro:'Não implementado '+caminho},404);
 };
})();
'''

def html_inlined():
    html=(WEB/'index.html').read_text()
    css=(WEB/'css/style.css').read_text()
    api=(WEB/'js/api.js').read_text()
    app=(WEB/'js/app.js').read_text()
    css_v4=(WEB/'css/v4.css').read_text()
    css_v6=(WEB/'css/v6.css').read_text()
    html=html.replace('<link rel="stylesheet" href="css/style.css"><link rel="stylesheet" href="css/v4.css"><link rel="stylesheet" href="css/v6.css">','<style>'+css+'\n'+css_v4+'\n'+css_v6+'</style>')
    html=html.replace('<script src="js/api.js"></script><script src="js/app.js"></script>',
                      '<script>'+MOCK_JS+'</script><script>'+api+'</script><script>'+app+'</script>')
    return html

def run():
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        errors=[]
        content=html_inlined()
        screenshots=ROOT/'tests'/'screenshots';screenshots.mkdir(parents=True,exist_ok=True)
        page=browser.new_page(viewport={'width':1440,'height':940})
        page.set_default_timeout(5000)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(content,wait_until='domcontentloaded')
        page.locator('#card-ultimo h2').wait_for()
        assert page.locator('.creditos-grupo summary').count()==1
        assert page.locator('.ajuda-link').count()==0
        page.locator('.creditos-grupo summary').click()
        for autor in ['Vinicius Iandoli','Lais Toyama','Vinicius Centurion','Cesar Melo']:
            assert autor in page.locator('.creditos-grupo').inner_text()
        print('CRÉDITOS OK: quatro integrantes e rodapé sem link duplicado')
        views=['dashboard','mapa','como-funciona','prototipo','guia','dispositivos','alertas','relatorios']
        for view in views:
            page.evaluate('(view)=>{location.hash="#"+view;}',view)
            page.locator('#view-'+view).wait_for(state='visible')
            page.wait_for_timeout(450)
            
            if view in views:
                page.screenshot(path=str(screenshots/(view+'.png')),full_page=False)
            assert page.locator('#titulo-pagina').inner_text()
            print('UI OK:',view)
        page.evaluate('location.hash="#mapa"')
        page.locator('button[data-comodo="bebe"]').click()
        assert 'Quarto' in page.locator('#mapa-detalhe h2').inner_text()
        page.locator('#mapa-testar').click()
        page.locator('#alerta-fechar').click()
        assert 'TESTE EM CURSO' in page.locator('button[data-comodo="bebe"]').inner_text()
        print('INTERAÇÃO OK: mapa e evento WebSocket em memória')
        page.locator('button[data-comodo="custom"]').click()
        assert page.locator('#mapa-testar').is_disabled()
        assert page.locator('#mapa-ativar-link').is_visible()
        assert 'desativado' in page.locator('#mapa-estado-ajuda').inner_text().lower()
        print('MAPA OK: canal desligado e ação de reativação')
        page.evaluate('location.hash="#prototipo"')
        page.locator('button[data-sim-test="fumaca"]').click()
        page.locator('#alerta-fechar').click()
        assert 'Fumaça' in page.locator('#status-ultimo').inner_text() or 'Alarme' in page.locator('#status-ultimo').inner_text()
        assert page.locator('#sim-monitor-lines p').count() >= 2
        assert page.locator('button[data-sim-test="custom"]').is_disabled()
        assert page.locator('.flow-collapsible').get_attribute('open') is None
        page.locator('.flow-collapsible summary').click()
        assert page.locator('.flow-collapsible').get_attribute('open') is not None
        print('INTERAÇÃO OK: bancada, simulação, monitor de eventos e fluxo recolhível')
        page.evaluate('location.hash="#guia"')
        page.locator('#guia-avancar').click()
        assert '2 de 5' in page.locator('#guia-etapa').inner_text()
        page.locator('#guia-avancar').click()
        page.locator('#alerta-fechar').click()
        assert '3 de 5' in page.locator('#guia-etapa').inner_text()
        print('INTERAÇÃO OK: demo guiada')
        mobile=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
        mobile.set_default_timeout(5000)
        mobile.on('pageerror',lambda e:errors.append(str(e)))
        mobile.set_content(content,wait_until='domcontentloaded')
        for view in ['dashboard','mapa','como-funciona','prototipo','guia','dispositivos','alertas','relatorios']:
            mobile.evaluate('(view)=>{location.hash="#"+view;}',view)
            mobile.locator('#view-'+view).wait_for(state='visible')
            dims=mobile.evaluate('({inner:window.innerWidth,scroll:document.documentElement.scrollWidth})')
            assert dims['scroll']<=dims['inner']+2,(view,dims)
            print('MOBILE OK:',view)
        mobile.screenshot(path=str(screenshots/'mobile.png'),full_page=False)
        pequeno=browser.new_page(viewport={'width':320,'height':720},device_scale_factor=1)
        pequeno.set_default_timeout(5000)
        pequeno.on('pageerror',lambda e:errors.append(str(e)))
        pequeno.set_content(content,wait_until='domcontentloaded')
        for view in views:
            pequeno.evaluate('(view)=>{location.hash="#"+view;}',view)
            pequeno.locator('#view-'+view).wait_for(state='visible')
            dims=pequeno.evaluate('({inner:window.innerWidth,scroll:document.documentElement.scrollWidth})')
            assert dims['scroll']<=dims['inner']+2,('320px',view,dims)
        print('MOBILE OK: 320px todas as 8 telas')
        for largura in [768,1024,1280,1366,1920]:
            check=browser.new_page(viewport={'width':largura,'height':840})
            check.on('pageerror',lambda e:errors.append(str(e)))
            check.set_content(content,wait_until='domcontentloaded')
            check.locator('#card-ultimo h2').wait_for()
            for view in views:
                check.evaluate('(view)=>{location.hash="#"+view;}',view)
                check.locator('#view-'+view).wait_for(state='visible')
                dims=check.evaluate('({inner:innerWidth,scroll:document.documentElement.scrollWidth})')
                assert dims['scroll']<=dims['inner']+2,(largura,view,dims)
            print('RESPONSIVO OK:',largura,'px')
            check.close()
        assert not errors,errors
        browser.close()
        print('TESTES VISUAIS PASSARAM: 8 telas, checagens mobile, ações e erros JS = 0')

if __name__=='__main__':run()
