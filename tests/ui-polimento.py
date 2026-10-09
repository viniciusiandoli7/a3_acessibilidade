"""Regressão UX/UI v7.0 — Chromium e API simulada.
Requer: pip install playwright + Chromium no sistema.
Execute na raiz: python tests/ui-polimento.py
Testa comportamento da interface, NÃO o hardware físico ou o Express integrado.
"""
import asyncio
import importlib.util
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location("ui_fixture",ROOT/"tests"/"ui-playwright.py")
fixture=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fixture)

SIZES=[320,390,768,1024,1280,1440,1920]
VIEWS=["dashboard","dispositivos","alertas","relatorios","mapa","como-funciona","guia","prototipo"]

async def verificar():
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(headless=True,executable_path="/usr/bin/chromium",args=["--no-sandbox","--disable-dev-shm-usage"])
        page=await browser.new_page(viewport={"width":1440,"height":850})
        errors=[]
        page.on("pageerror", lambda err: errors.append(str(err)))
        await page.set_content(fixture.html_inlined(),wait_until="domcontentloaded")
        await page.locator("#card-ultimo h2").wait_for()
        for width in SIZES:
            await page.set_viewport_size({"width":width,"height":850})
            for view in VIEWS:
                await page.evaluate("(name)=>location.hash='#'+name",view)
                await page.locator("#view-"+view).wait_for(state="visible")
                overflow=await page.evaluate("document.documentElement.scrollWidth-innerWidth")
                assert overflow<=2,(width,view,overflow)
        print("56 verificações responsivas sem overflow horizontal.")
        await page.set_viewport_size({"width":1440,"height":850})
        await page.evaluate("location.hash='#prototipo'")
        await page.locator('button[data-sim-test="fumaca"]').click()
        if await page.locator("#alerta-tela").is_visible():
            await page.locator("#alerta-fechar").click()
        await page.evaluate("location.hash='#dashboard'")
        for width in SIZES:
            await page.set_viewport_size({"width":width,"height":850})
            collisions=await page.evaluate("""() => [...document.querySelectorAll(".cartao-evento")].some(c=>{
                const icon=c.querySelector(".evento-icon").getBoundingClientRect();
                const overlaps=e=>{const x=e.getBoundingClientRect();return x.right>icon.left+1&&icon.right>x.left+1&&x.bottom>icon.top+1&&icon.bottom>x.top+1};
                return overlaps(c.querySelector("h2"))||overlaps(c.querySelector(".nota"));
            })""")
            assert not collisions,("ícone sobre texto",width)
            assert await page.evaluate("document.documentElement.scrollWidth-innerWidth")<=2
        print("7 larguras com evento ativo: sem sobreposição de ícones.")
        await page.evaluate("location.hash='#relatorios'")
        await page.evaluate("window.confirm=()=>true")
        await page.locator("#btn-limpar-simulacoes").click()
        assert "removido" in await page.locator("#aviso").inner_text()
        await page.evaluate("location.hash='#prototipo'")
        assert await page.locator("#sim-hardware-test").is_disabled()
        assert not errors,errors
        await browser.close()
        print("Interações essenciais sem exceções JavaScript.")

if __name__=="__main__":
    asyncio.run(verificar())
