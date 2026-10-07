import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { startBrowserSite } from './local-browser-site.mjs';

const out=resolve(process.env.JAKH_QA_OUTPUT || 'output/friendship-games-qa');await mkdir(out,{recursive:true});
const server=await startBrowserSite({siteRoot:'site-worker/dist',manifestPath:'site-worker/generated/site-manifest.json'});
const browser=await chromium.launch({headless:true,...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
const report={source:'built artifact',buildId:server.artifactManifest.buildId,startedAt:new Date().toISOString(),pages:[]};
async function captureSection(page,selector,filename,viewport){
  const target=page.locator(selector);const box=await target.boundingBox();
  // Preserve phone width while making every row visible in the review image.
  await page.setViewportSize({width:viewport.width,height:Math.max(viewport.height,Math.ceil(box.height)+160)});
  await target.scrollIntoViewIfNeeded();await target.screenshot({path:resolve(out,filename)});
  await page.setViewportSize(viewport);
}
try{
  for(const viewport of [{width:390,height:844},{width:1440,height:1000}])for(const lang of ['en','ar']){
    const context=await browser.newContext({viewport,serviceWorkers:'block'});
    await context.addInitScript(()=>localStorage.setItem('jakh-consent-v1',JSON.stringify({version:2,noticeVersion:'2026-08-01',analytics:false,updatedAt:new Date(0).toISOString(),source:'friendship-qa'})));
    const page=await context.newPage();
    try{
      for(const slug of ['play','secret-word-impostor','panic-mode','friendship-court']){
        const route=lang==='ar'?slug==='play'?'/ar/play/':`/ar/games/${slug}/`:`/${slug}`;
        await page.goto(`${server.baseUrl}${route}`,{waitUntil:'domcontentloaded'});
        const images=page.locator(slug==='play'?'[data-party-directory] .party-directory-card img':'.friendship-cover');
        assert.equal(await images.count(),slug==='play'?5:1,`${route}: expected cover count`);
        await images.evaluateAll(items=>items.forEach(img=>img.loading='eager'));
        const decoded=await images.evaluateAll(async items=>{return Promise.all(items.map(async img=>{let error;try{await img.decode();}catch(e){error=e.message;}const r=img.getBoundingClientRect();return{src:img.currentSrc,declaredSrc:img.getAttribute('src'),error,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,x:r.x,width:r.width};}));});
        report.pages.push({route,viewport,decoded});
        for(const img of decoded){assert.ok(img.naturalWidth&&img.naturalHeight,`${route}: image decodes ${JSON.stringify(img)}`);assert.ok(img.x>=-.5&&img.x+img.width<=viewport.width+.5,`${route}: cover fits viewport`);}
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${route}: page has no horizontal overflow`);
        if(slug==='play')await captureSection(page,'[data-party-directory]',`covers-${lang}-${viewport.width}.png`,viewport);
        else if(viewport.width===390)await page.screenshot({path:resolve(out,`cover-${slug}-${lang}-mobile.png`),fullPage:true});
        console.log(`PASS covers ${lang} ${viewport.width} ${slug}`);
      }
      const mostPath=lang==='ar'?'/ar/games/most-likely-to/':'/most-likely-to';
      await page.goto(`${server.baseUrl}${mostPath}`,{waitUntil:'domcontentloaded'});
      await page.locator('#party-app [data-party-action="start"]').click();
      const radios=await page.locator('#party-app input[type="radio"]').evaluateAll(inputs=>inputs.map(i=>{const r=i.getBoundingClientRect();return{width:r.width,height:r.height,appearance:getComputedStyle(i).appearance};}));
      assert.equal(radios.length,2);for(const radio of radios){assert.ok(radio.width>=12&&radio.width<=28,'radio has visible native-sized control');assert.ok(radio.height>=12&&radio.height<=28,'radio is square');assert.notEqual(radio.appearance,'none','radio keeps native appearance');}
      await captureSection(page,'#party-app',`most-likely-setup-controls-${lang}-${viewport.width}.png`,viewport);
      await page.locator('#party-setup textarea').fill(lang==='ar'?'عمر\nلينا\nمايا':'Omar\nLina\nMaya');await page.locator('#party-setup button[type="submit"]').click();await page.locator('#party-app [data-party-action="begin-votes"]').click();
      const checks=await page.locator('#party-app input[type="checkbox"]').evaluateAll(inputs=>inputs.map(i=>{const r=i.getBoundingClientRect();return{width:r.width,height:r.height,x:r.x,appearance:getComputedStyle(i).appearance};}));
      assert.equal(checks.length,3);for(const check of checks){assert.ok(check.width>=12&&check.width<=28&&check.height>=12&&check.height<=28,'checkbox is a visible square');assert.ok(check.x>=-.5&&check.x+check.width<=viewport.width+.5,'checkbox fits viewport');assert.notEqual(check.appearance,'none','checkbox keeps native appearance');}
      await page.locator('[data-party-pick="0"]').check();assert.equal(await page.locator('[data-party-pick="0"]').isChecked(),true);
      await captureSection(page,'#party-app',`most-likely-checkboxes-${lang}-${viewport.width}.png`,viewport);
      report.pages.push({route:mostPath,viewport,radios,checkboxes:checks});console.log(`PASS native controls ${lang} ${viewport.width}`);
    }finally{await context.close();}
  }
}finally{await browser.close();await server.close();report.finishedAt=new Date().toISOString();await writeFile(resolve(out,'cover-decoding.json'),JSON.stringify(report,null,2)+'\n');}
