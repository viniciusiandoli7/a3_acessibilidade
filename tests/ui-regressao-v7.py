"""Teste visual da interface real, usando respostas REST/WS simuladas.
Não confirma integração Express nem circuitos físicos.
"""
import asyncio
from pathlib import Path
import importlib.util
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('fixture', ROOT/'tests'/'ui-playwright.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
WIDTHS = [320, 360, 390, 480, 600, 768, 900, 1024, 1280, 1366, 1440, 1600, 1920]
VIEWS=['dashboard','dispositivos','alertas','relatorios','mapa','como-funciona','guia','prototipo']

def overlap(a,b,t=1):
    return a['x'] < b['x']+b['width']-t and b['x'] < a['x']+a['width']-t and a['y'] < b['y']+b['height']-t and b['y'] < a['y']+a['height']-t

async def run():
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
        page=await browser.new_page(viewport={'width':1440,'height':960},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        await page.set_content(fixture.html_inlined(),wait_until='domcontentloaded')
        await page.locator('#card-ultimo .evento-copy h2').wait_for()
        # Evento crítico simulado, reproduz o cenário mostrado nas capturas do usuário.
        await page.evaluate("location.hash='#prototipo'")
        await page.locator('button[data-sim-test="fumaca"]').click()
        await page.locator('#alerta-fechar').click()
        await page.evaluate("location.hash='#dashboard'")
        await page.locator('#view-dashboard').wait_for(state='visible')
        shot=ROOT/'tests'/'screenshots'
        shot.mkdir(parents=True,exist_ok=True)
        checks=0
        for width in WIDTHS:
            await page.set_viewport_size({'width':width,'height':920})
            await page.wait_for_timeout(100)
            d=await page.evaluate('''() => {
              const r = el => {const b=el.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom}};
              const cards=[...document.querySelectorAll('#view-dashboard .cartao-evento')].map(c=>({card:r(c),copy:r(c.querySelector('.evento-copy')), icon:r(c.querySelector('.evento-icon')), title:r(c.querySelector('h2')), desc:r(c.querySelector('.nota')),footer:r(c.querySelector('.rodape'))}));
              const hw=document.querySelector('#view-dashboard .lista-hw');
              return {width:window.innerWidth, scroll:document.documentElement.scrollWidth,cards, hw:r(hw), states:[...hw.querySelectorAll('.estado')].map(r)}
            }''')
            assert d['scroll'] <= d['width']+2, ('page overflow',width,d['scroll'])
            for card in d['cards']:
                assert not overlap(card['icon'],card['title']), ('title-icon',width,card)
                assert not overlap(card['icon'],card['desc']), ('description-icon',width,card)
                assert not overlap(card['title'],card['desc']), ('title-description',width,card)
                assert not overlap(card['footer'],card['title']), ('footer-title',width,card)
                assert not overlap(card['footer'],card['desc']), ('footer-description',width,card)
                for k in ['icon','title','desc','footer']:
                    e=card[k]
                    assert e['x']>=card['card']['x']-2 and e['right']<=card['card']['right']+2,('card horizontal clip',k,width,e,card['card'])
                    assert e['y']>=card['card']['y']-2 and e['bottom']<=card['card']['bottom']+2,('card vertical clip',k,width,e,card['card'])
                checks+=5
            for b in d['states']:
                assert b['x']>=d['hw']['x']-2 and b['right']<=d['hw']['right']+2, ('state outside equipment card',width,b,d['hw'])
            checks+=1
            if width in (390,1366,1920):
                await page.screenshot(path=str(shot/f'dashboard-v7-{width}.png'),full_page=False)
        print(f'PASSOU: {len(WIDTHS)} larguras, {checks} verificações geométricas com evento de fumaça.')
        assert await page.locator('.atalhos-3').count()==0,'Redundant links remain'
        assert 'Configurada' not in await page.locator('#view-dashboard').inner_text(), 'Obsolete label visible'
        print('PASSOU: atalhos redundantes ausentes.')
        for width in [320,390,768,1024,1440,1920]:
            await page.set_viewport_size({'width':width,'height':920})
            for view in VIEWS:
                await page.evaluate('(v)=>location.hash="#"+v',view)
                await page.locator('#view-'+view).wait_for(state='visible')
                scroll=await page.evaluate('document.documentElement.scrollWidth - innerWidth')
                assert scroll<=2,(view,width,scroll)
            print('PASSOU:',width,'px, todas as',len(VIEWS),'telas sem rolagem horizontal.')
        assert not errors,errors
        await page.screenshot(path=str(shot/'prototipo-v7.png'),full_page=False)
        print('PASSOU: sem erros JavaScript no navegador.')
        await browser.close()
if __name__=='__main__':asyncio.run(run())
