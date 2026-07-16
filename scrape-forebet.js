const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapeForebet() {
  console.log(`[${new Date().toISOString()}] Iniciando scraper de Forebet...`);
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Configurar cabeceras de navegador real
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 1024 });
    
    // Navegar a Forebet España (pronósticos de hoy)
    const url = 'https://www.forebet.com/es/';
    console.log(`Navegando a: ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    const title = await page.title();
    console.log(`Título de la página: ${title}`);
    
    // Esperar a que se carguen los contenedores de partidos
    console.log('Esperando que carguen los partidos...');
    await page.waitForSelector('div.rcnt', { timeout: 15000 });
    
    // Extraer datos de los partidos
    const matches = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('div.rcnt'));
      
      return rows.map(row => {
        try {
          // Extraer Liga
          const shortTagEl = row.querySelector('.shortTag');
          const leagueShort = shortTagEl ? shortTagEl.innerText.trim() : '';
          
          // Extraer nombre de liga completo del onclick de la imagen si está disponible
          const imgEl = row.querySelector('.shortagDiv img');
          let leagueFull = leagueShort;
          if (imgEl) {
            const onclickAttr = imgEl.getAttribute('onclick') || '';
            const match = onclickAttr.match(/getstag\(this,\d+,'','([^']+)','/);
            if (match && match[1]) {
              leagueFull = match[1];
            }
          }
          
          // Equipos
          const homeTeamEl = row.querySelector('.homeTeam');
          const awayTeamEl = row.querySelector('.awayTeam');
          const homeTeam = homeTeamEl ? homeTeamEl.innerText.trim() : '';
          const awayTeam = awayTeamEl ? awayTeamEl.innerText.trim() : '';
          
          // Fecha y hora
          const dateEl = row.querySelector('.date_bah');
          const dateStr = dateEl ? dateEl.innerText.trim() : '';
          
          // Probabilidades 1 X 2
          const probSpans = Array.from(row.querySelectorAll('.fprc span'));
          const probHome = probSpans[0] ? parseInt(probSpans[0].innerText.trim(), 10) : null;
          const probDraw = probSpans[1] ? parseInt(probSpans[1].innerText.trim(), 10) : null;
          const probAway = probSpans[2] ? parseInt(probSpans[2].innerText.trim(), 10) : null;
          
          // Predicción (Tip)
          const predictionEl = row.querySelector('.forepr span');
          const prediction = predictionEl ? predictionEl.innerText.trim() : '';
          
          // Marcador Pronosticado (Correct Score)
          const correctScoreEl = row.querySelector('.ex_sc.tabonly') || row.querySelector('.scrmobpred.ex_sc');
          let correctScore = '';
          if (correctScoreEl) {
            correctScore = correctScoreEl.innerText.replace(/\s+/g, '').trim(); // "1-1"
          }
          
          // Promedio de goles
          const avgGoalsEl = row.querySelector('.avg_sc.tabonly');
          const avgGoals = avgGoalsEl ? parseFloat(avgGoalsEl.innerText.trim()) : null;
          
          // Temperatura
          const tempEl = row.querySelector('.wnums');
          const temp = tempEl ? tempEl.innerText.trim() : '';
          
          // Cuotas 1 X 2 (si están disponibles)
          const oddSpans = Array.from(row.querySelectorAll('.haodd span'));
          const oddHome = oddSpans[0] ? parseFloat(oddSpans[0].innerText.trim()) : null;
          const oddDraw = oddSpans[1] ? parseFloat(oddSpans[1].innerText.trim()) : null;
          const oddAway = oddSpans[2] ? parseFloat(oddSpans[2].innerText.trim()) : null;
          
          if (!homeTeam || !awayTeam) return null;
          
          return {
            leagueShort,
            leagueFull,
            homeTeam,
            awayTeam,
            dateStr,
            probabilities: {
              home: probHome,
              draw: probDraw,
              away: probAway
            },
            prediction,
            correctScore,
            avgGoals,
            temp,
            odds: {
              home: oddHome,
              draw: oddDraw,
              away: oddAway
            }
          };
        } catch (e) {
          return null;
        }
      }).filter(Boolean);
    });
    
    console.log(`Scrapeado exitosamente ${matches.length} partidos de Forebet.`);
    
    // Guardar los datos en forebet_data.json
    const outputPath = path.join(__dirname, 'forebet_data.json');
    const dataToWrite = {
      scrapedAt: new Date().toISOString(),
      matches: matches
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(dataToWrite, null, 2), 'utf8');
    console.log(`Datos guardados en ${outputPath}`);
    
  } catch (error) {
    console.error('Error durante el scraping de Forebet:', error);
  } finally {
    await browser.close();
    console.log('Browser cerrado.');
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  scrapeForebet();
}

module.exports = scrapeForebet;
