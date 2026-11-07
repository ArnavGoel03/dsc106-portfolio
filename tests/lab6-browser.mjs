export async function auditLab6(page, { baseURL, outputDirectory, verifyCommitLink = true } = {}) {
// Keep the whole plot visible for pointer checks, then exercise shorter and phone viewports.
const viewports = { desktop: { width: 1440, height: 1200 }, short: { width: 1440, height: 700 }, phone: { width: 390, height: 844 } };
await page.setViewportSize(viewports.desktop);

const URL_BASE = baseURL || 'https://arnavgoel03.github.io/dsc106-portfolio/';
const OUTPUT = outputDirectory;


  const checks = [], errors = [];
  function check(name, pass, evidence) { checks.push({ name, pass: Boolean(pass), evidence }); }
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    const response = await page.goto(URL_BASE + 'meta/', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForSelector('#chart circle', { timeout: 15000 });
    check('Live Meta page loads', response.status() === 200, response.status());
    const initial = await page.evaluate(() => {
      const circles = [...document.querySelectorAll('#chart circle')];
      const commits = circles.map(c => c.__data__);
      const lines = commits.flatMap(c => c.lines);
      const statLabels = [...document.querySelectorAll('#stats dt')].map(e => e.textContent);
      const statValues = [...document.querySelectorAll('#stats dd')].map(e => e.textContent);
      const files = new Map();
      for (const line of lines) files.set(line.file, Math.max(files.get(line.file) || 0, line.line));
      const period = new Map();
      for (const line of lines) {
        const key = line.wallClock.toLocaleString('en', { dayPeriod: 'short' });
        period.set(key, (period.get(key) || 0) + 1);
      }
      return {
        heading: document.querySelector('h1').textContent,
        currentNav: document.querySelector('nav .current')?.textContent,
        statLabels, statValues, count: commits.length,
        expected: [String(lines.length), String(commits.length), String(files.size), String(Math.max(...lines.map(l => l.depth))), (Array.from(files.values()).reduce((a,b) => a+b,0)/files.size).toFixed(1), [...period].sort((a,b)=>b[1]-a[1])[0][0]],
        valid: circles.every(c => ['cx','cy','r'].every(a => Number.isFinite(Number(c.getAttribute(a))))),
        sizes: [...new Set(circles.map(c => c.getAttribute('r')))],
        sorted: commits.every((c,i) => i === 0 || commits[i-1].totalLines >= c.totalLines),
        gridlines: document.querySelectorAll('#chart .gridlines .tick').length,
        axisText: [...document.querySelectorAll('#chart svg > g:not(.gridlines):not(.dots) .tick text')].map(e=>e.textContent),
        commits: commits.map(c=>({id:c.id,date:c.datetime.toISOString(),lines:c.totalLines,cx:Number(circles.find(el=>el.__data__===c).getAttribute('cx')),cy:Number(circles.find(el=>el.__data__===c).getAttribute('cy'))})),
        hidden: document.querySelector('#commit-tooltip').hidden,
        selection: document.querySelector('#selection-count').textContent,
        languageEmpty: document.querySelector('#language-breakdown').children.length===0,
      };
    });
    check('Heading and current Meta navigation', initial.heading === 'Meta' && initial.currentNav === 'Meta', initial.currentNav);
    check('Total LOC, commits and four extra summary statistics match underlying rows', JSON.stringify(initial.statValues) === JSON.stringify(initial.expected), {labels:initial.statLabels,actual:initial.statValues,expected:initial.expected});
    check('One finite dot per commit', initial.valid && initial.count > 0, initial.count);
    check('Axes and horizontal gridlines render', initial.gridlines > 1 && initial.axisText.some(t=>t==='00:00') && initial.axisText.some(t=>t.includes('Oct')), {gridlines:initial.gridlines,axisText:initial.axisText});
    check('Dot radii vary and largest commits are drawn first', initial.sizes.length > 1 && initial.sorted, initial.sizes);
    check('Initial tooltip hidden and selection empty', initial.hidden && initial.selection === 'No commits selected' && initial.languageEmpty, initial.selection);
    if (OUTPUT) await page.screenshot({path:OUTPUT+'/desktop.png',fullPage:true});
    async function point(x,y) {
      await page.locator('#chart svg').scrollIntoViewIfNeeded();
      return page.evaluate(({x,y}) => { const p=new DOMPoint(x,y).matrixTransform(document.querySelector('#chart svg').getScreenCTM()); return {x:p.x,y:p.y}; },{x,y});
    }
    async function drag(box) {
      const a=await point(box[0][0],box[0][1]), b=await point(box[1][0],box[1][1]);
      await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move(b.x,b.y,{steps:15}); await page.mouse.up();
    }
    async function selectedState(box) {
      return page.evaluate(box=> {
        const circles=[...document.querySelectorAll('#chart circle')];
        const expected=circles.filter(c=>Number(c.getAttribute('cx')) >= box[0][0] && Number(c.getAttribute('cx')) <= box[1][0] && Number(c.getAttribute('cy')) >= box[0][1] && Number(c.getAttribute('cy')) <= box[1][1]);
        const lines=expected.flatMap(c=>c.__data__.lines);
        const types=new Map(); for(const l of lines) types.set(l.type,(types.get(l.type)||0)+1);
        const actual=[...document.querySelectorAll('#language-breakdown dt')].map(e=>[e.textContent,e.nextElementSibling.textContent]);
        return {expected:expected.length,actual:circles.filter(c=>c.classList.contains('selected')).length,text:document.querySelector('#selection-count').textContent,languageCounts:[...types],languageActual:actual,totalLines:lines.length};
      },box);
    }
    const allBox=[[5,5],[995,595]];
    await drag(allBox);
    const full=await selectedState(allBox);
    check('Brushing selects all dots and updates count',full.expected===initial.count && full.actual===full.expected && full.text===`${full.expected} ${full.expected === 1 ? "commit" : "commits"} selected`,full);
    check('Language breakdown counts match selected commit lines',full.languageCounts.every(([k,n])=>full.languageActual.some(([key,value])=>key===k && value.startsWith(`${n} lines (`))),full);
    if (OUTPUT) await page.screenshot({path:OUTPUT+'/selected.png',fullPage:true});
    const halfBox=[[5,5],[500,595]];
    const clear=await point(997,598); await page.mouse.click(clear.x,clear.y);
    await drag(halfBox);
    const half=await selectedState(halfBox);
    check('Partial brushing highlights exactly matching dots',half.expected>0 && half.expected<initial.count && half.actual===half.expected && half.text===`${half.expected} ${half.expected === 1 ? "commit" : "commits"} selected`,half);
    const clear2=await point(997,598); await page.mouse.click(clear2.x,clear2.y);
    check('Clearing brush resets count, highlight and language list',await page.evaluate(()=> document.querySelectorAll('#chart circle.selected').length===0 && document.querySelector('#selection-count').textContent==='No commits selected' && document.querySelector('#language-breakdown').children.length===0));
    const circles=page.locator('#chart .dots circle');
    let hovered;
    for(let i=initial.count-1;i>=0;i--) {
      const c=circles.nth(i); const box=await c.boundingBox(); if(!box) continue;
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
      const visible=await page.evaluate(()=>!document.querySelector('#commit-tooltip').hidden);
      if(visible){hovered=await page.evaluate(()=>({id:document.querySelector('#commit-link').textContent,href:document.querySelector('#commit-link').href,target:document.querySelector('#commit-link').target,values:[...document.querySelectorAll('#commit-tooltip dd')].map(e=>e.textContent.trim()),rect:(()=>{const r=document.querySelector('#commit-tooltip').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})()}));break;}
    }
    check('Real mouse hover works above brush overlay and displays all five fields',hovered && hovered.values.every(Boolean) && hovered.target==='_blank',hovered);
    if(hovered && verifyCommitLink) {
      const linkResponse=await page.request.get(hovered.href,{timeout:15000});
      check('Tooltip commit link resolves',linkResponse.status()===200,{href:hovered.href,status:linkResponse.status()});
      if (OUTPUT) await page.screenshot({path:OUTPUT+'/tooltip.png',fullPage:true});
    }
    if (hovered) {
      check('Hovered tooltip stays inside viewport', hovered.rect.left >= 0 && hovered.rect.top >= 0 && hovered.rect.right <= viewports.desktop.width && hovered.rect.bottom <= viewports.desktop.height, hovered.rect);
    }
    await page.mouse.move(0,0);
    check('Tooltip hides when pointer leaves',await page.evaluate(()=>document.querySelector('#commit-tooltip').hidden));
    await page.setViewportSize(viewports.short);
    await page.locator('#chart svg').scrollIntoViewIfNeeded();
    const bottomIndex = await page.evaluate(() => {
      const dots = [...document.querySelectorAll('#chart circle')];
      return dots.reduce((best, dot, index) => Number(dot.getAttribute('cy')) > Number(dots[best].getAttribute('cy')) ? index : best, 0);
    });
    await page.locator('#chart circle').nth(bottomIndex).hover({force:true});
    await page.waitForTimeout(600); // let the 500ms visibility transition finish before reading it
    const edgeTooltip = await page.evaluate(() => {
      const tooltip = document.querySelector('#commit-tooltip');
      const r = tooltip.getBoundingClientRect();
      return {visible:getComputedStyle(tooltip).visibility === 'visible',left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight};
    });
    check('Bottom-edge tooltip remains fully readable',edgeTooltip.visible && edgeTooltip.left >= 0 && edgeTooltip.top >= 0 && edgeTooltip.right <= edgeTooltip.width && edgeTooltip.bottom <= edgeTooltip.height,edgeTooltip);
    await page.mouse.move(0,0);
    await page.setViewportSize(viewports.desktop);
    await page.selectOption('.color-scheme select','dark');
    if (OUTPUT) await page.screenshot({path:OUTPUT+'/dark.png',fullPage:true});
    check('Dark theme applies',await page.evaluate(()=>document.documentElement.style.getPropertyValue('color-scheme')==='dark'));
    await page.selectOption('.color-scheme select','light');
    await page.setViewportSize(viewports.phone);
    if (OUTPUT) await page.screenshot({path:OUTPUT+'/mobile.png',fullPage:true});
    const layout=await page.evaluate(()=>({viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,stats:[...document.querySelectorAll('#stats dt')].map(e=>({label:e.textContent,width:e.getBoundingClientRect().width})),svgWidth:document.querySelector('#chart svg').getBoundingClientRect().width}));
    check('Phone layout stays within viewport',layout.pageWidth<=layout.viewport,layout);
    const mobileBox = [[5,5],[995,595]];
    await drag(mobileBox);
    const mobileWidth = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    check('Selected language stats fit on a phone', mobileWidth);
    if (OUTPUT) await page.screenshot({path:OUTPUT+'/mobile-selected.png',fullPage:true});
    check('No runtime/console errors',errors.length===0,errors);
    const result={url:URL_BASE+'meta/',checkedAt:new Date().toISOString(),checks,failures:checks.filter(c=>!c.pass),initial,errors};

    return result;
  } finally {  }
}
