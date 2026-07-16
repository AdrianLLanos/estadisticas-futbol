const ESPN_BATCH_SIZE = 5;
const DIXON_COLES_RHO = -0.08;
const RECENT_MATCH_LIMIT = 10;
const RECENT_FETCH_LIMIT = 30;
const H2H_MATCH_LIMIT = 10;

const FOOTBALL_LEAGUES = [
  { slug: "fifa.world", label: "FIFA" },
  { slug: "fifa.worldcup", label: "Copa Mundial" },
  { slug: "fifa.friendly", label: "Amistosos internacionales" },
  { slug: "fifa.worldq", label: "Eliminatorias mundialistas" },
  { slug: "uefa.euro", label: "Eurocopa" },
  { slug: "uefa.nations", label: "UEFA Nations League" },
  { slug: "uefa.champions", label: "Champions League" },
  { slug: "uefa.europa", label: "Europa League" },
  { slug: "uefa.euroq", label: "Clasificatorios Eurocopa" },
  { slug: "eng.1", label: "Premier League" },
  { slug: "esp.1", label: "LaLiga" },
  { slug: "ita.1", label: "Serie A" },
  { slug: "ger.1", label: "Bundesliga" },
  { slug: "fra.1", label: "Ligue 1" },
  { slug: "conmebol.libertadores", label: "Libertadores" },
  { slug: "conmebol.sudamericana", label: "Sudamericana" },
  { slug: "conmebol.copa", label: "Copa America" },
  { slug: "conmebol.recopa", label: "Recopa" },
  { slug: "concacaf.goldcup", label: "Copa Oro" },
  { slug: "concacaf.nations", label: "Concacaf Nations League" },
  { slug: "concacaf.champions", label: "Concacaf Champions Cup" },
];

const LEAGUE = {
  goalsPerTeam: 1.35,
  goalsPerGame: 2.7,
  shotsPerTeam: 11.2,
  shotsOnTargetPerTeam: 4.1,
  cornersPerTeam: 4.8,
  cardsPerTeam: 2.15,
  homeGoalBoost: 1.08,
  awayGoalDrag: 0.95,
  totalGoalsLine: 2.5,
  totalCornersLine: 8.5,
  totalCardsLine: 4.5,
};

const state = {
  games: [],
  selectedId: null,
  espnLeagues: null,
  forebetData: null,
};

const els = {
  dateInput: document.querySelector("#dateInput"),
  leagueFilter: document.querySelector("#leagueFilter"),
  loadBtn: document.querySelector("#loadBtn"),
  compareBtn: document.querySelector("#compareBtn"),
  gamesList: document.querySelector("#gamesList"),
  gameCount: document.querySelector("#gameCount"),
  matchupHeader: document.querySelector("#matchupHeader"),
  statusBox: document.querySelector("#statusBox"),
  summaryGrid: document.querySelector("#summaryGrid"),
  teamGrid: document.querySelector("#teamGrid"),
  resultsBody: document.querySelector("#resultsBody"),
  sourceBadge: document.querySelector("#sourceBadge"),
  sourceStatus: document.querySelector("#sourceStatus"),
  formulaBox: document.querySelector("#formulaBox"),
};

document.addEventListener("DOMContentLoaded", () => {
  els.dateInput.value = toDateInputValue(new Date());
  FOOTBALL_LEAGUES.forEach((league) => {
    const option = document.createElement("option");
    option.value = league.slug;
    option.textContent = league.label;
    els.leagueFilter.appendChild(option);
  });
  els.loadBtn.addEventListener("click", loadSlate);
  els.leagueFilter.addEventListener("change", renderGames);
  els.compareBtn.addEventListener("click", compareSelectedGame);
  if (window.lucide) window.lucide.createIcons();
  loadSlate();
});

function parseForebetDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split(/[\/\s:]/);
  if (parts.length < 5) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  const hour = parseInt(parts[3], 10);
  const minute = parseInt(parts[4], 10);
  return new Date(year, month, day, hour, minute);
}

async function loadForebetData() {
  try {
    const response = await fetch('./forebet_data.json');
    if (response.ok) {
      state.forebetData = await response.json();
      console.log('Forebet data loaded successfully:', state.forebetData);
    } else {
      console.warn('forebet_data.json no encontrado o inaccesible.');
    }
  } catch (error) {
    console.error('Error al cargar forebet_data.json:', error);
  }
}

function findForebetMatch(espnGame) {
  if (!state.forebetData || !state.forebetData.matches || !espnGame) return null;
  return state.forebetData.matches.find(forebetGame => {
    const sameHomeAway = sameTeam(espnGame.home.name, forebetGame.homeTeam) && sameTeam(espnGame.away.name, forebetGame.awayTeam);
    const inverted = sameTeam(espnGame.home.name, forebetGame.awayTeam) && sameTeam(espnGame.away.name, forebetGame.homeTeam);
    
    if (sameHomeAway || inverted) {
      const forebetDate = parseForebetDate(forebetGame.dateStr);
      if (forebetDate && sameLocalDate(espnGame.date, forebetDate)) {
        return true;
      }
    }
    return false;
  });
}

async function loadSlate() {
  setBusy(true, "Cargando partidos de futbol...");
  clearResults();

  try {
    await loadForebetData();
    const date = els.dateInput.value || toDateInputValue(new Date());
    let espnResult = await cargarJuegosEspnFutbolPorFecha(date);
    let espnGames = Array.isArray(espnResult?.events) ? espnResult.events : [];
    
    // If ESPN returned no games for the selected date, try nearby dates (±2 days)
    if (!espnGames.length) {
      const offsets = [-2, -1, 1, 2];
      for (let i = 0; i < offsets.length && !espnGames.length; i++) {
        const d = new Date(date);
        d.setDate(d.getDate() + offsets[i]);
        const tryDate = toDateInputValue(d);
        const tryResult = await cargarJuegosEspnFutbolPorFecha(tryDate);
        espnGames = Array.isArray(tryResult?.events) ? tryResult.events : [];
        if (espnGames.length) {
          setStatus(`No hay partidos en ${date}. Usando ${tryDate} como alternativa.`, "warn");
          espnResult = tryResult;
          break;
        }
      }
    }
    state.games = mergeFootballGames([], espnGames).sort((a, b) => new Date(a.date) - new Date(b.date));
    state.selectedId = state.games[0]?.id || null;

    renderGames();
    renderMatchupHeader(getSelectedGame());
    els.compareBtn.disabled = !state.selectedId;
    const attempted = espnResult?.attempted || 0;
    const leaguesWithEvents = espnResult?.leaguesWithEvents || 0;
    els.sourceStatus.textContent = `ESPN ${espnGames.length} partidos — consultadas ${attempted} ligas (${leaguesWithEvents} con partidos)`;

    if (!state.games.length) {
      setStatus("No se encontraron partidos para la fecha seleccionada.", "warn");
      return;
    }
    setStatus(`${state.games.length} partidos cargados. Selecciona uno para comparar.`, "ok");
  } catch (error) {
    state.games = [];
    state.selectedId = null;
    renderGames();
    renderMatchupHeader(null);
    els.compareBtn.disabled = true;
    setStatus(error.message || "No se pudo cargar la jornada.", "error");
  } finally {
    setBusy(false);
  }
}

async function compareSelectedGame() {
  const game = getSelectedGame();
  if (!game) return;

  setBusy(true, `Calculando ${game.away.name} vs ${game.home.name}...`);
  try {
    const [homeContext, awayContext, summary, availability, h2h] = await Promise.all([
      getTeamContext(game.home, game),
      getTeamContext(game.away, game),
      cargarResumenPartido(game),
      cargarDisponibilidadPartido(game),
      cargarH2HPartido(game),
    ]);

    const projection = buildProjection({ game, homeContext, awayContext, summary, availability, h2h });
    renderSummary(projection);
    renderTeams(projection);
    renderResults(projection);
    renderFormula(projection);
    els.sourceBadge.textContent = projection.sources.join(" + ");
    setStatus("Comparacion actualizada.", "ok");
  } catch (error) {
    setStatus(error.message || "No se pudo calcular la comparacion.", "error");
  } finally {
    setBusy(false);
  }
}

function buildProjection({ game, homeContext, awayContext, summary, availability, h2h = buildNeutralH2H() }) {
  const homeAttack = calcularAtaqueEquipo(homeContext, summary?.homeStats);
  const awayAttack = calcularAtaqueEquipo(awayContext, summary?.awayStats);
  const homeDefense = calcularDefensaEquipo(homeContext, summary?.homeStats);
  const awayDefense = calcularDefensaEquipo(awayContext, summary?.awayStats);
  const homeForm = calcularFormaReciente(homeContext);
  const awayForm = calcularFormaReciente(awayContext);
  const homeLocalia = calcularVentajaLocalia(homeContext, true);
  const awayLocalia = calcularVentajaLocalia(awayContext, false);
  const homeLineup = calcularFactorAlineacion(availability?.home, true);
  const awayLineup = calcularFactorAlineacion(availability?.away, false);
  const homeMatchup = calcularMatchupFutbol(homeAttack, awayDefense, homeForm, homeLocalia);
  const awayMatchup = calcularMatchupFutbol(awayAttack, homeDefense, awayForm, awayLocalia);

  const h2hAdjustment = calcularAjusteH2H(h2h);
  const homeBaseGoals = proyectarGolesEquipo({
    ownContext: homeContext,
    opponentContext: awayContext,
    attack: homeAttack,
    opponentDefense: awayDefense,
    form: homeForm,
    localia: homeLocalia,
    matchup: homeMatchup,
    lineup: homeLineup,
    opponentLineup: awayLineup,
    isHome: true,
  });
  const awayBaseGoals = proyectarGolesEquipo({
    ownContext: awayContext,
    opponentContext: homeContext,
    attack: awayAttack,
    opponentDefense: homeDefense,
    form: awayForm,
    localia: awayLocalia,
    matchup: awayMatchup,
    lineup: awayLineup,
    opponentLineup: homeLineup,
    isHome: false,
  });
  const homeGoals = aplicarAjusteGoles(homeBaseGoals, h2hAdjustment.homeFactor);
  const awayGoals = aplicarAjusteGoles(awayBaseGoals, h2hAdjustment.awayFactor);

  const matrix = calcularMatrizPoisson(homeGoals, awayGoals, LEAGUE.totalGoalsLine);
  const homeCorners = proyectarCornersEquipo({
    attack: homeAttack,
    opponentDefense: awayDefense,
    form: homeForm,
    lineup: homeLineup,
    opponentLineup: awayLineup,
    isHome: true,
  });
  const awayCorners = proyectarCornersEquipo({
    attack: awayAttack,
    opponentDefense: homeDefense,
    form: awayForm,
    lineup: awayLineup,
    opponentLineup: homeLineup,
    isHome: false,
  });
  const totalCorners = round1(homeCorners + awayCorners);
  const cornersMatrix = calcularTotalPoisson(totalCorners, LEAGUE.totalCornersLine);
  const homeCards = proyectarTarjetasEquipo({
    defense: homeDefense,
    opponentAttack: awayAttack,
    form: homeForm,
    lineup: homeLineup,
    isHome: true,
  });
  const awayCards = proyectarTarjetasEquipo({
    defense: awayDefense,
    opponentAttack: homeAttack,
    form: awayForm,
    lineup: awayLineup,
    isHome: false,
  });
  const totalCards = round1(homeCards + awayCards);
  const cardsMatrix = calcularTotalPoisson(totalCards, LEAGUE.totalCardsLine);
  const probability = calcularProbabilidadGanador({
    homeGoals,
    awayGoals,
    homeScores: { attack: homeAttack, defense: homeDefense, form: homeForm, localia: homeLocalia, matchup: homeMatchup, lineup: homeLineup },
    awayScores: { attack: awayAttack, defense: awayDefense, form: awayForm, localia: awayLocalia, matchup: awayMatchup, lineup: awayLineup },
    matrix,
  });
  const totalGoals = round1(homeGoals + awayGoals);
  const favorite = probability.favorite === "home" ? game.home.name : probability.favorite === "away" ? game.away.name : "Empate";
  const diff = round1(homeGoals - awayGoals);
  const totalLean = matrix.overProb >= matrix.underProb ? "Over 2.5 goles" : "Under 2.5 goles";
  const bttsLean = matrix.bttsProb >= 0.52 ? "Ambos anotan: Si" : "Ambos anotan: No";
  const cornersLean = cornersMatrix.overProb >= cornersMatrix.underProb ? "Over 8.5 corners" : "Under 8.5 corners";
  const cardsLean = cardsMatrix.overProb >= cardsMatrix.underProb ? "Over 4.5 tarjetas" : "Under 4.5 tarjetas";

  return {
    game,
    homeContext,
    awayContext,
    homeAttack,
    awayAttack,
    homeDefense,
    awayDefense,
    homeForm,
    awayForm,
    homeLocalia,
    awayLocalia,
    homeLineup,
    awayLineup,
    homeMatchup,
    awayMatchup,
    homeGoals,
    awayGoals,
    totalGoals,
    homeCorners,
    awayCorners,
    totalCorners,
    cornersMatrix,
    homeCards,
    awayCards,
    totalCards,
    cardsMatrix,
    matrix,
    probability,
    favorite,
    diff,
    totalLean,
    bttsLean,
    cornersLean,
    cardsLean,
    confidence: calcularConfianza({ diff: Math.abs(diff), winProbability: probability.value, homeScore: probability.homeComposite, awayScore: probability.awayComposite }),
    sources: (() => {
      const src = buildSources(game, summary, availability, h2h);
      const fMatch = findForebetMatch(game);
      if (fMatch) src.push("Forebet");
      return src;
    })(),
    forebetMatch: findForebetMatch(game),
  };
}

function calcularAtaqueEquipo(context = {}, liveStats = {}) {
  const metrics = {
    goalsFor: contextualMetric(context, "goalsForPerGame", LEAGUE.goalsPerTeam),
    shots: fallback(liveStats.shots, context.shotsPerGame, LEAGUE.shotsPerTeam),
    shotsOnTarget: fallback(liveStats.shotsOnTarget, context.shotsOnTargetPerGame, LEAGUE.shotsOnTargetPerTeam),
    corners: fallback(liveStats.corners, context.cornersPerGame, LEAGUE.cornersPerTeam),
    conversion: contextualMetric(context, "conversionRate", 0.12),
  };
  const score =
    normalizeHigher(metrics.goalsFor, 0.55, 2.45) * 0.34 +
    normalizeHigher(metrics.shotsOnTarget, 2.1, 6.4) * 0.24 +
    normalizeHigher(metrics.shots, 7.0, 16.8) * 0.16 +
    normalizeHigher(metrics.corners, 2.4, 7.2) * 0.12 +
    normalizeHigher(metrics.conversion, 0.06, 0.19) * 0.14;
  return { ...metrics, score: clamp(score, 0, 1), label: scoreLabel(score) };
}

function calcularDefensaEquipo(context = {}, liveStats = {}) {
  const metrics = {
    goalsAgainst: contextualMetric(context, "goalsAgainstPerGame", LEAGUE.goalsPerTeam),
    cleanSheetRate: contextualMetric(context, "cleanSheetRate", 0.28),
    shotsAgainst: fallback(liveStats.shotsAgainst, context.shotsAgainstPerGame, LEAGUE.shotsPerTeam),
    shotsOnTargetAgainst: fallback(liveStats.shotsOnTargetAgainst, context.shotsOnTargetAgainstPerGame, LEAGUE.shotsOnTargetPerTeam),
  };
  const score =
    normalizeLower(metrics.goalsAgainst, 0.45, 2.4) * 0.42 +
    normalizeHigher(metrics.cleanSheetRate, 0.05, 0.55) * 0.24 +
    normalizeLower(metrics.shotsOnTargetAgainst, 2.0, 6.3) * 0.2 +
    normalizeLower(metrics.shotsAgainst, 7.0, 17.5) * 0.14;
  return { ...metrics, score: clamp(score, 0, 1), label: scoreLabel(score) };
}

function calcularFormaReciente(context = {}) {
  const winRate = contextualMetric(context, "winRate", 0.33);
  const drawRate = contextualMetric(context, "drawRate", 0.27);
  const goalDiff = contextualMetric(context, "goalDiffPerGame", 0);
  const pointsPerGame = contextualMetric(context, "pointsPerGame", 1.25);
  const unbeatenRate = clamp(winRate + drawRate, 0, 1);
  const score =
    normalizeHigher(winRate, 0.05, 0.72) * 0.36 +
    normalizeHigher(unbeatenRate, 0.25, 0.9) * 0.18 +
    normalizeHigher(goalDiff, -1.3, 1.3) * 0.32 +
    normalizeHigher(pointsPerGame, 0.45, 2.35) * 0.14;
  return { winRate, drawRate, unbeatenRate, goalDiff, pointsPerGame, score: clamp(score, 0, 1), label: scoreLabel(score) };
}

function calcularVentajaLocalia(context = {}, isHome = false) {
  const locationRate = isHome ? fallback(context.homeWinRate, context.winRate, 0.43) : fallback(context.awayWinRate, context.winRate, 0.28);
  const base = isHome ? 0.55 : 0.45;
  const score = clamp(base + (locationRate - 0.36) * 0.24, 0.34, 0.66);
  return { score, isHome, locationRate, label: isHome ? "Local" : "Visitante" };
}

function calcularMatchupFutbol(attack, opponentDefense, form, localia) {
  const defensiveWeakness = 1 - numberOr(opponentDefense?.score, 0.5);
  const score =
    numberOr(attack?.score, 0.5) * 0.38 +
    defensiveWeakness * 0.29 +
    numberOr(form?.score, 0.5) * 0.2 +
    numberOr(localia?.score, 0.5) * 0.13;
  return { score: clamp(score, 0, 1), defensiveWeakness, label: scoreLabel(score) };
}

function proyectarGolesEquipo({ ownContext, opponentContext, attack, opponentDefense, form, localia, matchup, lineup, opponentLineup, isHome }) {
  const ownGoals = contextualMetric(ownContext, "goalsForPerGame", LEAGUE.goalsPerTeam);
  const opponentConcedes = contextualMetric(opponentContext, "goalsAgainstPerGame", LEAGUE.goalsPerTeam);
  const baseExpected = (ownGoals * opponentConcedes) / LEAGUE.goalsPerTeam;
  const attackFactor = 0.86 + numberOr(attack?.score, 0.5) * 0.32;
  const defenseFactor = 0.88 + (1 - numberOr(opponentDefense?.score, 0.5)) * 0.3;
  const formFactor = 0.92 + numberOr(form?.score, 0.5) * 0.18;
  const matchupFactor = 0.9 + numberOr(matchup?.score, 0.5) * 0.22;
  const lineupAttackFactor = numberOr(lineup?.attackFactor, 1);
  const opponentDefenseLineupFactor = 1 + (1 - numberOr(opponentLineup?.defenseFactor, 1)) * 0.55;
  const fieldFactor = isHome ? LEAGUE.homeGoalBoost : LEAGUE.awayGoalDrag;
  return round2(clamp(baseExpected * attackFactor * defenseFactor * formFactor * matchupFactor * lineupAttackFactor * opponentDefenseLineupFactor * fieldFactor, 0.25, 3.8));
}

function proyectarCornersEquipo({ attack, opponentDefense, form, lineup, opponentLineup, isHome }) {
  const baseCorners = fallback(attack?.corners, LEAGUE.cornersPerTeam);
  const shotVolumeFactor = 0.88 + normalizeHigher(attack?.shots, 7.0, 16.8) * 0.24;
  const pressureFactor = 0.92 + normalizeHigher(attack?.shotsOnTarget, 2.1, 6.4) * 0.16;
  const opponentBlockFactor = 0.94 + (1 - numberOr(opponentDefense?.score, 0.5)) * 0.14;
  const formFactor = 0.95 + numberOr(form?.score, 0.5) * 0.10;
  const lineupCornerFactor = numberOr(lineup?.cornerFactor, 1);
  const opponentDefenseLineupFactor = 1 + (1 - numberOr(opponentLineup?.defenseFactor, 1)) * 0.35;
  const fieldFactor = isHome ? 1.04 : 0.97;
  return round2(clamp(baseCorners * shotVolumeFactor * pressureFactor * opponentBlockFactor * formFactor * lineupCornerFactor * opponentDefenseLineupFactor * fieldFactor, 2.0, 8.5));
}

function proyectarTarjetasEquipo({ defense, opponentAttack, form, lineup, isHome }) {
  const baseCards = LEAGUE.cardsPerTeam;
  const disciplineFactor = numberOr(lineup?.cardFactor, 1);
  const pressureFactor =
    0.9 +
    numberOr(opponentAttack?.score, 0.5) * 0.18 +
    (1 - numberOr(defense?.score, 0.5)) * 0.16;
  const formFactor = 1.06 - numberOr(form?.score, 0.5) * 0.12;
  const fieldFactor = isHome ? 0.97 : 1.06;
  return round2(clamp(baseCards * disciplineFactor * pressureFactor * formFactor * fieldFactor, 0.7, 5.5));
}

function calcularFactorAlineacion(info = {}, isHome = false) {
  const starters = Array.isArray(info?.starters) ? info.starters : [];
  const substitutes = Array.isArray(info?.substitutes) ? info.substitutes : [];
  const injuries = Array.isArray(info?.injuries) ? info.injuries : [];
  const playerPerformance = info?.playerPerformance || {};
  const topPerformance = Array.isArray(info?.topPerformance) ? info.topPerformance : [];
  const hasLineup = starters.length >= 8;
  const performanceItems = getLineupPerformanceItems(starters, playerPerformance, topPerformance);
  const hasPerformance = performanceItems.length >= 5;
  if (!hasLineup && !injuries.length && !hasPerformance) {
    return {
      score: 0.5,
      label: "N/D",
      hasLineup: false,
      hasPerformance: false,
      formation: "N/D",
      startersCount: 0,
      substitutesCount: 0,
      injuriesCount: 0,
      attackFactor: 1,
      defenseFactor: 1,
      cornerFactor: 1,
      cardFactor: 1,
      performanceScore: 0.5,
      performanceLabel: "N/D",
      injuryPenalty: { general: 0, attack: 0, defense: 0 },
      starters: [],
      injuries: [],
      topPerformance: [],
    };
  }
  const formationParts = parseFormation(info?.formation);
  const defenders = formationParts.length ? formationParts[0] : 4;
  const forwards = formationParts.length ? formationParts[formationParts.length - 1] : 2;
  const midfielders = formationParts.length > 2 ? sum(formationParts.slice(1, -1)) : 4;
  const starterCompleteness = hasLineup ? clamp(starters.length / 11, 0.75, 1.04) : 1;
  const squadDepth = hasLineup ? clamp(substitutes.length / 9, 0.8, 1.05) : 1;
  const injuryPenalty = calcularPenalizacionBajas(injuries);
  const performanceScore = hasPerformance ? average(performanceItems.map((item) => item.score)) : 0.5;
  const attackPerformance = hasPerformance ? average(performanceItems.map((item) => item.attackScore)) : 0.5;
  const defensePerformance = hasPerformance ? average(performanceItems.map((item) => item.defenseScore)) : 0.5;
  const cardRate = hasPerformance ? average(performanceItems.map((item) => item.cardRate)) : 0.22;
  const attackShape = 1 + (forwards - 2) * 0.025 + (midfielders - 4) * 0.008;
  const defenseShape = 1 + (defenders - 4) * 0.018;
  const performanceAttackFactor = 0.91 + attackPerformance * 0.18;
  const performanceDefenseFactor = 0.91 + defensePerformance * 0.18;
  const attackFactor = clamp(starterCompleteness * attackShape * squadDepth * performanceAttackFactor * (1 - injuryPenalty.attack), 0.82, 1.14);
  const defenseFactor = clamp(starterCompleteness * defenseShape * squadDepth * performanceDefenseFactor * (1 - injuryPenalty.defense), 0.82, 1.14);
  const cornerFactor = clamp((attackFactor * 0.72 + starterCompleteness * 0.28) * (1 - injuryPenalty.general * 0.25), 0.84, 1.12);
  const cardFactor = clamp(0.86 + normalizeHigher(cardRate, 0.05, 0.48) * 0.36 + injuryPenalty.general * 0.25, 0.78, 1.34);
  const score = clamp(0.5 + (((attackFactor + defenseFactor + cornerFactor) / 3) - 1) * 1.8, 0, 1);

  return {
    score,
    label: hasLineup ? "Oficial" : injuries.length ? "Bajas" : "Rendimiento",
    hasPerformance,
    hasLineup,
    formation: info?.formation || "N/D",
    startersCount: starters.length,
    substitutesCount: substitutes.length,
    injuriesCount: injuries.length,
    attackFactor,
    defenseFactor,
    cornerFactor,
    cardFactor,
    performanceScore,
    performanceLabel: performanceLevel(performanceScore),
    injuryPenalty,
    starters,
    injuries,
    topPerformance: performanceItems.slice(0, 5),
  };
}

function getLineupPerformanceItems(starters = [], playerPerformance = {}, topPerformance = []) {
  const matched = starters
    .map((player) => playerPerformance[getPlayerPerformanceKey(player)])
    .filter(Boolean);
  return matched.length >= 5 ? matched : topPerformance.slice(0, 11);
}

function getPlayerPerformanceKey(player = {}) {
  return player.id ? `id:${player.id}` : `name:${normalizeText(player.name)}`;
}

function performanceLevel(score) {
  if (score >= 0.7) return "Alto";
  if (score >= 0.5) return "Medio";
  return "Bajo";
}

function calcularPenalizacionBajas(injuries = []) {
  return injuries.reduce((acc, item) => {
    const reason = normalizeText(item.reason || "");
    const weight = /suspend|red card|ban|sancion|suspended/.test(reason) ? 0.035 : 0.025;
    acc.general += weight;
    acc.attack += weight * 0.75;
    acc.defense += weight * 0.75;
    return {
      general: clamp(acc.general, 0, 0.2),
      attack: clamp(acc.attack, 0, 0.16),
      defense: clamp(acc.defense, 0, 0.16),
    };
  }, { general: 0, attack: 0, defense: 0 });
}

function parseFormation(value = "") {
  return String(value || "")
    .split("-")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part) && part > 0);
}

function calcularProbabilidadesFinales({ homeGoals, awayGoals, homeComposite, awayComposite, matrix = {} }) {
  const homeGoalExpectation = clamp(numberOr(homeGoals, 1.5), 0.2, 3.8);
  const awayGoalExpectation = clamp(numberOr(awayGoals, 1.5), 0.2, 3.8);
  const goalGap = clamp(homeGoalExpectation - awayGoalExpectation, -1.2, 1.2);
  const compositeGap = clamp(numberOr(homeComposite, 0.5) - numberOr(awayComposite, 0.5), -0.6, 0.6);

  const baseHome = clamp(0.5 + goalGap * 0.22 + compositeGap * 0.16, 0.08, 0.9);
  const baseAway = clamp(0.5 - goalGap * 0.22 - compositeGap * 0.16, 0.08, 0.9);
  // Reduce tendency to favor draws: make draw weight smaller and allow transfer
  const baseDraw = clamp(1 - baseHome - baseAway, 0.03, 0.35);

  const homeWin = clamp(
    baseHome * 0.55 + numberOr(matrix.homeWinProb, 0.33) * 0.3 + (homeGoalExpectation / (homeGoalExpectation + awayGoalExpectation || 1)) * 0.15,
    0.03,
    0.92
  );
  const awayWin = clamp(
    baseAway * 0.55 + numberOr(matrix.awayWinProb, 0.33) * 0.3 + (awayGoalExpectation / (homeGoalExpectation + awayGoalExpectation || 1)) * 0.15,
    0.03,
    0.92
  );
  const draw = clamp(
    numberOr(matrix.drawProb, 0.3) * 0.3 + baseDraw * 0.25 + (1 - Math.abs(goalGap) / 2.4) * 0.15,
    0.03,
    0.42
  );

  let total = homeWin + draw + awayWin || 1;
    const normalized = { 
      home: homeWin / total, 
      draw: draw / total, 
      away: awayWin / total 
    };
  // If draw is the top pick but only slightly above the next, nudge a small portion to the stronger team
  const maxNonDraw = Math.max(normalized.home, normalized.away);
  if (normalized.draw > maxNonDraw && normalized.draw - maxNonDraw < 0.03) {
    const transfer = (normalized.draw - maxNonDraw) * 0.6; // move 60% of the tiny draw advantage
    if (normalized.home > normalized.away) {
      normalized.home += transfer;
    } else {
      normalized.away += transfer;
    }
    normalized.draw = Math.max(0.01, normalized.draw - transfer);
    total = normalized.home + normalized.draw + normalized.away || 1;
    normalized.home /= total;
    normalized.draw /= total;
    normalized.away /= total;
  }
  const favorite = normalized.home >= normalized.away && normalized.home >= normalized.draw
    ? "home"
    : normalized.away >= normalized.draw
      ? "away"
      : "draw";
  const favoriteKey = favorite === "away" ? "away" : favorite === "draw" ? "draw" : "home";

  return {
    favorite,
    value: normalized[favoriteKey],
    homeWin: normalized.home,
    awayWin: normalized.away,
    draw: normalized.draw,
    homeProb: normalized.home,
    awayProb: normalized.away,
    drawProb: normalized.draw,
    over2p5: clamp(numberOr(matrix.overProb, 0.5) * 0.7 + (homeGoalExpectation + awayGoalExpectation > 2.5 ? 0.2 : 0.05) + (Math.abs(goalGap) < 0.45 ? 0.1 : 0), 0.05, 0.95),
    under2p5: clamp(1 - (numberOr(matrix.overProb, 0.5) * 0.7 + (homeGoalExpectation + awayGoalExpectation > 2.5 ? 0.2 : 0.05) + (Math.abs(goalGap) < 0.45 ? 0.1 : 0)), 0.05, 0.95),
    btts: clamp(numberOr(matrix.bttsProb, 0.5) * 0.75 + (homeGoalExpectation > 0.8 && awayGoalExpectation > 0.8 ? 0.25 : 0), 0.05, 0.95),
  };
}

function calcularProbabilidadGanador({ homeGoals, awayGoals, homeScores, awayScores, matrix }) {
  const weights = { attack: 0.27, defense: 0.22, form: 0.18, localia: 0.09, matchup: 0.14, lineup: 0.1 };
  const homeComposite = weightedTeamScore(homeScores, weights);
  const awayComposite = weightedTeamScore(awayScores, weights);
  const probabilities = calcularProbabilidadesFinales({
    homeGoals,
    awayGoals,
    homeComposite,
    awayComposite,
    matrix,
  });

  return {
    ...probabilities,
    homeComposite,
    awayComposite,
  };
}

function calcularMatrizPoisson(homeGoals, awayGoals, totalLine = 2.5) {
  const maxGoals = 8;
  let homeWinProb = 0;
  let awayWinProb = 0;
  let drawProb = 0;
  let overProb = 0;
  let bttsProb = 0;
  let totalMass = 0;
  const scores = [];

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const baseProb = poissonProbability(h, homeGoals) * poissonProbability(a, awayGoals);
      const p = baseProb * dixonColesAdjustment(h, a, homeGoals, awayGoals, DIXON_COLES_RHO);
      scores.push({ h, a, p });
      totalMass += p;
      if (h > a) homeWinProb += p;
      else if (a > h) awayWinProb += p;
      else drawProb += p;
      if (h + a > totalLine) overProb += p;
      if (h > 0 && a > 0) bttsProb += p;
    }
  }

  totalMass = totalMass || 1;
  const topScores = scores.sort((a, b) => b.p - a.p).slice(0, 4);
  return {
    homeWinProb: homeWinProb / totalMass,
    awayWinProb: awayWinProb / totalMass,
    drawProb: drawProb / totalMass,
    overProb: clamp(overProb / totalMass, 0, 1),
    underProb: clamp(1 - overProb / totalMass, 0, 1),
    bttsProb: clamp(bttsProb / totalMass, 0, 1),
    topScores,
  };
}

function calcularTotalPoisson(lambda, totalLine = 8.5) {
  const maxCount = 24;
  let overProb = 0;
  let underProb = 0;
  const topCounts = [];

  for (let count = 0; count <= maxCount; count++) {
    const p = poissonProbability(count, lambda);
    topCounts.push({ count, p });
    if (count > totalLine) overProb += p;
    else underProb += p;
  }

  const totalMass = overProb + underProb || 1;
  return {
    overProb: clamp(overProb / totalMass, 0, 1),
    underProb: clamp(underProb / totalMass, 0, 1),
    topCounts: topCounts.sort((a, b) => b.p - a.p).slice(0, 4),
  };
}

async function cargarJuegosEspnFutbolPorFecha(fecha) {
  const timezone = getTimezone();
  const date = String(fecha).replace(/-/g, "");
  // Ensure we have the list of leagues from ESPN (fetch once per session)
  try {
    if (!state.espnLeagues) await fetchEspnLeagues();
  } catch (e) {
    // fall back to built-in list
    state.espnLeagues = FOOTBALL_LEAGUES;
  }

  const leagues = Array.isArray(state.espnLeagues) && state.espnLeagues.length ? state.espnLeagues : FOOTBALL_LEAGUES;
  const events = [];
  let attempted = 0;
  let leaguesWithEvents = 0;
  const leagueResults = [];
  for (let i = 0; i < leagues.length; i += ESPN_BATCH_SIZE) {
    const batch = leagues.slice(i, i + ESPN_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(async (league) => {
      const slug = league.slug || league.value || league.label;
      if (!slug) return { slug, events: [] };
      attempted++;
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(slug)}/scoreboard?dates=${encodeURIComponent(date)}&limit=300&lang=es&region=mx&tz=${encodeURIComponent(timezone)}`;
      try {
        const response = await fetch(url);
        if (!response.ok) return { slug, events: [] };
        const data = await response.json();
        const leagueLabel = data?.leagues?.[0]?.name || league.label || league.name || slug;
        const ev = (data.events || []).map((event) => ({ ...event, leagueSlug: slug, leagueLabel }));
        if (ev.length) leaguesWithEvents++;
        return { slug, events: ev };
      } catch (e) {
        return { slug, events: [] };
      }
    }));
    results.forEach((r) => {
      if (r.status === "fulfilled" && r.value && Array.isArray(r.value.events)) {
        events.push(...r.value.events);
        leagueResults.push({ slug: r.value.slug, count: r.value.events.length });
      } else if (r.status === "fulfilled" && r.value && Array.isArray(r.value)) {
        // backwards compatibility
        events.push(...r.value);
      }
    });
  }

  return { events, attempted, leaguesWithEvents, leagueResults };
}

// FootyStats adapter removed — ESPN-only integration

async function fetchEspnLeagues() {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/leagues?lang=es&region=mx`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('No se pudo obtener la lista de ligas de ESPN');
  const data = await response.json();
  // Prefer explicit `slug` values returned by the API. Ignore entries without a proper slug
  const leagues = (data.leagues || []).filter((l) => l && l.slug).map((l) => ({ slug: l.slug, label: l.name || l.abbreviation || l.displayName || l.slug }));
  state.espnLeagues = leagues;
  return state.espnLeagues;
}

async function cargarResumenPartido(game) {
  if (!game?.espnEvent?.id || !game?.espnEvent?.leagueSlug) {
    return { provider: "ESPN", homeStats: {}, awayStats: {} };
  }

  const espnSummary = await cargarResumenEspn(game.espnEvent);
  return combinarResumenes(null, espnSummary, game);
}

async function cargarH2HPartido(game) {
  if (!debeUsarH2H(game)) return buildNeutralH2H();
  return buildNeutralH2H();
}

function buildH2HContext(game, fixtures = []) {
  const homeId = String(game?.home?.apiId || "");
  const awayId = String(game?.away?.apiId || "");
  const rows = fixtures.map((fixture) => {
    const fixtureHomeId = String(fixture?.teams?.home?.id || "");
    const fixtureAwayId = String(fixture?.teams?.away?.id || "");
    const rawHomeGoals = fixture?.goals?.home;
    const rawAwayGoals = fixture?.goals?.away;
    if (rawHomeGoals === null || rawHomeGoals === undefined || rawAwayGoals === null || rawAwayGoals === undefined) return null;
    const goalsHome = Number(rawHomeGoals);
    const goalsAway = Number(rawAwayGoals);
    if (!Number.isFinite(goalsHome) || !Number.isFinite(goalsAway)) return null;

    let currentHomeGoals = null;
    let currentAwayGoals = null;
    if (fixtureHomeId === homeId && fixtureAwayId === awayId) {
      currentHomeGoals = goalsHome;
      currentAwayGoals = goalsAway;
    } else if (fixtureHomeId === awayId && fixtureAwayId === homeId) {
      currentHomeGoals = goalsAway;
      currentAwayGoals = goalsHome;
    }
    if (!Number.isFinite(currentHomeGoals) || !Number.isFinite(currentAwayGoals)) return null;
    return { homeGoals: currentHomeGoals, awayGoals: currentAwayGoals, totalGoals: currentHomeGoals + currentAwayGoals };
  }).filter(Boolean);

  if (!rows.length) return buildNeutralH2H();
  const games = rows.length;
  const homeGoals = sum(rows.map((row) => row.homeGoals));
  const awayGoals = sum(rows.map((row) => row.awayGoals));
  const avgGoals = sum(rows.map((row) => row.totalGoals)) / games;
  const over25Rate = rows.filter((row) => row.totalGoals > LEAGUE.totalGoalsLine).length / games;
  const bttsRate = rows.filter((row) => row.homeGoals > 0 && row.awayGoals > 0).length / games;
  const homeWinRate = rows.filter((row) => row.homeGoals > row.awayGoals).length / games;
  const awayWinRate = rows.filter((row) => row.awayGoals > row.homeGoals).length / games;
  const drawRate = rows.filter((row) => row.homeGoals === row.awayGoals).length / games;
  const trend = avgGoals >= 2.65 || over25Rate >= 0.56
    ? "Tendencia Over H2H"
    : avgGoals <= 2.25 || over25Rate <= 0.38
      ? "Tendencia Under H2H"
      : "H2H neutral";

  return {
    available: true,
    games,
    avgGoals,
    homeGoalsPerGame: homeGoals / games,
    awayGoalsPerGame: awayGoals / games,
    over25Rate,
    under25Rate: 1 - over25Rate,
    bttsRate,
    homeWinRate,
    awayWinRate,
    drawRate,
    trend,
  };
}

function buildNeutralH2H() {
  return {
    available: false,
    games: 0,
    avgGoals: LEAGUE.goalsPerGame,
    homeGoalsPerGame: LEAGUE.goalsPerTeam,
    awayGoalsPerGame: LEAGUE.goalsPerTeam,
    over25Rate: 0.5,
    under25Rate: 0.5,
    bttsRate: 0.5,
    homeWinRate: 0.33,
    awayWinRate: 0.33,
    drawRate: 0.34,
    trend: "Sin H2H",
  };
}

function calcularAjusteH2H(h2h = {}) {
  if (!h2h.available || !h2h.games) return { homeFactor: 1, awayFactor: 1 };
  const sampleWeight = clamp(h2h.games / H2H_MATCH_LIMIT, 0, 1);
  const totalBias = clamp((h2h.avgGoals - LEAGUE.goalsPerGame) / LEAGUE.goalsPerGame, -0.18, 0.18) * 0.35 * sampleWeight;
  const sideBias = clamp((h2h.homeGoalsPerGame - h2h.awayGoalsPerGame) / LEAGUE.goalsPerGame, -0.18, 0.18) * 0.30 * sampleWeight;
  return {
    homeFactor: clamp(1 + totalBias + sideBias, 0.9, 1.1),
    awayFactor: clamp(1 + totalBias - sideBias, 0.9, 1.1),
  };
}

function aplicarAjusteGoles(goals, factor) {
  return round2(clamp(numberOr(goals, LEAGUE.goalsPerTeam) * numberOr(factor, 1), 0.25, 3.8));
}

async function cargarDisponibilidadPartido(game) {
  try {
    if (!game?.espnEvent?.id || !game?.espnEvent?.leagueSlug) return buildNeutralAvailability(game);
    const espnSummary = await cargarResumenEspn(game.espnEvent);
    if (!espnSummary) return buildNeutralAvailability(game);

    // Extract potential lineup structures from different summary shapes
    const lineups = espnSummary?.lineups || espnSummary?.gamepackage?.lineups || espnSummary?.boxscore?.lineups || [];
    const injuries = espnSummary?.injuries || espnSummary?.gamepackage?.injuries || espnSummary?.boxscore?.injuries || [];
    const performance = buildPerformanceFromEspn(espnSummary, game);

    return combinarDisponibilidad(lineups, injuries, performance, game);
  } catch (e) {
    return buildNeutralAvailability(game);
  }
}

function buildPerformanceFromEspn(summary = {}, game = {}) {
  const out = { home: { byKey: {}, top: [] }, away: { byKey: {}, top: [] } };
  try {
    const teams = summary?.boxscore?.teams || [];
    teams.forEach((teamInfo) => {
      const name = teamInfo?.team?.displayName || teamInfo?.team?.name || "";
      const side = sameTeam(name, game.home.name) ? "home" : sameTeam(name, game.away.name) ? "away" : null;
      if (!side) return;

      const players = teamInfo?.players || teamInfo?.athletes || teamInfo?.statistics || [];
      players.forEach((p) => {
        const player = p?.player || p?.athlete || p || {};
        const id = player?.id || p?.id || null;
        const playerName = player?.fullName || player?.displayName || player?.name || "Jugador";

        // Try to infer a simple performance score from available fields
        let score = null;
        // rating fields commonly used
        score = numberOr(p?.rating, score ?? null) || numberOr(p?.stats?.rating, score ?? null) || numberOr(p?.player?.rating, score ?? null) || null;
        // goals/assists/minutes fallback
        if (!Number.isFinite(score)) {
          const goals = numberOr(p?.stats?.goals, p?.goals, 0);
          const assists = numberOr(p?.stats?.assists, p?.assists, 0);
          const minutes = numberOr(p?.stats?.minutes, p?.minutes, 90);
          score = clamp((goals * 0.6 + assists * 0.3 + Math.min(minutes, 90) / 90 * 0.1) / 2.5, 0, 1);
        }

        const attackScore = score;
        const defenseScore = score;
        const cardRate = numberOr(p?.stats?.yellowCards, p?.yellow, 0) + numberOr(p?.stats?.redCards, p?.red, 0) ? 0.3 : 0.12;
        const key = id ? `id:${id}` : `name:${normalizeText(playerName)}`;

        const item = { id, name: playerName, score, attackScore, defenseScore, cardRate };
        out[side].byKey[key] = item;
        out[side].top.push(item);
      });

      out[side].top.sort((a, b) => numberOr(b.score, 0) - numberOr(a.score, 0));
    });
  } catch (e) {
    // ignore and return empty performance
  }
  return { home: { byKey: out.home.byKey, top: out.home.top.slice(0, 11) }, away: { byKey: out.away.byKey, top: out.away.top.slice(0, 11) } };
}

function combinarDisponibilidad(lineups = [], injuries = [], performance = {}, game) {
  const base = buildNeutralAvailability(game);
  base.home.playerPerformance = performance.home?.byKey || {};
  base.home.topPerformance = performance.home?.top || [];
  base.away.playerPerformance = performance.away?.byKey || {};
  base.away.topPerformance = performance.away?.top || [];
  lineups.forEach((lineup) => {
    const side = getSideForTeam(lineup?.team, game);
    if (!side) return;
    base[side] = {
      ...base[side],
      formation: lineup.formation || "",
      coach: lineup.coach?.name || "",
      starters: (lineup.startXI || []).map((item) => normalizeLineupPlayer(item.player)),
      substitutes: (lineup.substitutes || []).map((item) => normalizeLineupPlayer(item.player)),
    };
  });
  injuries.forEach((injury) => {
    const side = getSideForTeam(injury?.team, game);
    if (!side) return;
    base[side].injuries.push({
      name: injury?.player?.name || "Jugador",
      reason: injury?.player?.reason || injury?.reason || "Baja",
      type: injury?.player?.type || injury?.type || "",
    });
  });
  return base;
}

function buildNeutralAvailability(game) {
  return {
    home: { teamName: game?.home?.name || "Local", formation: "", coach: "", starters: [], substitutes: [], injuries: [], playerPerformance: {}, topPerformance: [] },
    away: { teamName: game?.away?.name || "Visitante", formation: "", coach: "", starters: [], substitutes: [], injuries: [], playerPerformance: {}, topPerformance: [] },
  };
}

function normalizeLineupPlayer(player = {}) {
  return {
    id: player.id,
    name: player.name || "Jugador",
    number: player.number,
    pos: player.pos || "",
    grid: player.grid || "",
  };
}

function getSideForTeam(team = {}, game) {
  if (!team) return "";
  const teamId = String(team.id || "");
  if (teamId && String(game?.home?.apiId || "") === teamId) return "home";
  if (teamId && String(game?.away?.apiId || "") === teamId) return "away";
  const name = team.name || "";
  if (sameTeam(name, game?.home?.name)) return "home";
  if (sameTeam(name, game?.away?.name)) return "away";
  return "";
}

async function cargarResumenEspn(event) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(event.leagueSlug)}/summary?event=${encodeURIComponent(event.id)}&lang=es&region=mx`;
  const response = await fetch(url);
  if (!response.ok) return null;
  return { provider: "ESPN", ...(await response.json()) };
}

async function getTeamContext(team, game) {
  return buildFallbackContext(team, game);
}

function buildContextFromFixtures(team, fixtures = []) {
  const teamId = String(team.apiId || "");
  const rows = fixtures.map((fixture) => {
    const isHome = String(fixture?.teams?.home?.id || "") === teamId;
    const gf = Number(isHome ? fixture?.goals?.home : fixture?.goals?.away);
    const ga = Number(isHome ? fixture?.goals?.away : fixture?.goals?.home);
    const date = new Date(fixture?.fixture?.date || 0).getTime();
    return { isHome, gf, ga, date, result: gf > ga ? "W" : gf === ga ? "D" : "L" };
  })
    .filter((row) => Number.isFinite(row.gf) && Number.isFinite(row.ga))
    .sort((a, b) => b.date - a.date);

  if (!rows.length) return buildFallbackContext(team);
  const recentRows = rows.slice(0, RECENT_MATCH_LIMIT);
  const homeRows = rows.filter((row) => row.isHome).slice(0, RECENT_MATCH_LIMIT);
  const awayRows = rows.filter((row) => !row.isHome).slice(0, RECENT_MATCH_LIMIT);
  const homeStats = buildRecentStats(homeRows);
  const awayStats = buildRecentStats(awayRows);
  const venueStats = team.homeAway === "home" ? homeStats : awayStats;
  const overallStats = buildRecentStats(recentRows);

  return {
    ...overallStats,
    name: team.name,
    logo: team.logo,
    venueLabel: team.homeAway === "home" ? "local" : "visitante",
    venueStats,
    homeStats,
    awayStats,
    homeWinRate: homeStats.games ? homeStats.winRate : overallStats.winRate,
    awayWinRate: awayStats.games ? awayStats.winRate : overallStats.winRate,
    recent: recentRows,
    recentHome: homeRows,
    recentAway: awayRows,
  };
}

function buildRecentStats(rows = []) {
  const games = rows.length;
  if (!games) {
    return {
      games: 0,
      goalsForPerGame: LEAGUE.goalsPerTeam,
      goalsAgainstPerGame: LEAGUE.goalsPerTeam,
      goalDiffPerGame: 0,
      winRate: 0.33,
      drawRate: 0.27,
      pointsPerGame: 1.25,
      cleanSheetRate: 0.28,
      conversionRate: 0.12,
    };
  }
  const wins = rows.filter((row) => row.result === "W").length;
  const draws = rows.filter((row) => row.result === "D").length;
  const goalsFor = sum(rows.map((row) => row.gf));
  const goalsAgainst = sum(rows.map((row) => row.ga));
  return {
    games,
    goalsForPerGame: goalsFor / games,
    goalsAgainstPerGame: goalsAgainst / games,
    goalDiffPerGame: (goalsFor - goalsAgainst) / games,
    winRate: wins / games,
    drawRate: draws / games,
    pointsPerGame: (wins * 3 + draws) / games,
    cleanSheetRate: rows.filter((row) => row.ga === 0).length / games,
    conversionRate: clamp((goalsFor / games) / LEAGUE.shotsPerTeam, 0.04, 0.22),
  };
}

function buildFallbackContext(team, game = {}) {
  const score = getScoreFromGame(game);
  const gf = team.homeAway === "home" ? score?.home : score?.away;
  const ga = team.homeAway === "home" ? score?.away : score?.home;
  const hasScore = Number.isFinite(gf) && Number.isFinite(ga);
  return {
    name: team?.name || "Equipo",
    logo: team?.logo || "",
    games: hasScore ? 1 : 0,
    goalsForPerGame: hasScore ? gf : LEAGUE.goalsPerTeam,
    goalsAgainstPerGame: hasScore ? ga : LEAGUE.goalsPerTeam,
    goalDiffPerGame: hasScore ? gf - ga : 0,
    winRate: hasScore ? (gf > ga ? 1 : 0) : 0.33,
    drawRate: hasScore ? (gf === ga ? 1 : 0) : 0.27,
    pointsPerGame: hasScore ? (gf > ga ? 3 : gf === ga ? 1 : 0) : 1.25,
    cleanSheetRate: hasScore ? (ga === 0 ? 1 : 0) : 0.28,
    conversionRate: 0.12,
    homeWinRate: 0.43,
    awayWinRate: 0.28,
    venueLabel: team?.homeAway === "home" ? "local" : "visitante",
    venueStats: {
      games: hasScore ? 1 : 0,
      goalsForPerGame: hasScore ? gf : LEAGUE.goalsPerTeam,
      goalsAgainstPerGame: hasScore ? ga : LEAGUE.goalsPerTeam,
      goalDiffPerGame: hasScore ? gf - ga : 0,
      winRate: hasScore ? (gf > ga ? 1 : 0) : 0.33,
      drawRate: hasScore ? (gf === ga ? 1 : 0) : 0.27,
      pointsPerGame: hasScore ? (gf > ga ? 3 : gf === ga ? 1 : 0) : 1.25,
      cleanSheetRate: hasScore ? (ga === 0 ? 1 : 0) : 0.28,
      conversionRate: 0.12,
    },
    recent: [],
  };
}

function combinarResumenes(apiSummary, espnSummary, game) {
  const espnStats = mapEspnStats(espnSummary, game);
  return {
    provider: espnSummary?.provider || "ESPN",
    homeStats: { ...espnStats.home },
    awayStats: { ...espnStats.away },
  };
}

function mapEspnStats(summary, game) {
  const result = { home: {}, away: {} };
  const teams = summary?.boxscore?.teams || [];
  teams.forEach((teamInfo) => {
    const name = teamInfo?.team?.displayName || teamInfo?.team?.name || "";
    const side = sameTeam(name, game.home.name) ? "home" : sameTeam(name, game.away.name) ? "away" : null;
    if (!side) return;
    result[side] = normalizeStatsList(teamInfo.statistics || []);
  });
  return result;
}

function normalizeStatsList(stats = []) {
  const normalized = {};
  stats.forEach((stat) => {
    const key = normalizeText(stat.type || stat.name || stat.label || "");
    const value = parseStatNumber(stat.value ?? stat.displayValue);
    if (!Number.isFinite(value)) return;
    if (/shots on target|on goal|target/.test(key)) normalized.shotsOnTarget = value;
    else if (/total shots|shots total|shots|tiros/.test(key) && normalized.shots === undefined) normalized.shots = value;
    if (/corner/.test(key)) normalized.corners = value;
    if (/yellow|red|card|tarjeta/.test(key)) normalized.cards = (normalized.cards || 0) + value;
    if (/possession|posesion/.test(key)) normalized.possession = value;
  });
  return normalized;
}

function mergeFootballGames(apiGames = [], espnGames = []) {
  const merged = [];
  espnGames.map(normalizeEspnGame).filter(Boolean).forEach((espnGame) => {
    const found = merged.find((candidate) => gamesMatch(candidate, espnGame));
    if (found) {
      found.espnEvent = espnGame.espnEvent;
      found.espnId = espnGame.espnId;
      found.provider = "ESPN";
      found.leagueSlug = found.leagueSlug || espnGame.leagueSlug;
    } else {
      merged.push(espnGame);
    }
  });
  return merged;
}

function normalizeEspnGame(event) {
  const competitors = getEspnCompetitors(event);
  const home = competitors.find((item) => item.homeAway === "home") || competitors[0];
  const away = competitors.find((item) => item.homeAway === "away") || competitors[1];
  if (!home?.name || !away?.name) return null;
  return {
    id: `espn-${event.leagueSlug}-${event.id}`,
    apiGame: null,
    espnEvent: event,
    espnId: event.id,
    date: event.date || event.competitions?.[0]?.date || "",
    league: event.leagueLabel || event.league?.name || "Liga",
    leagueSlug: event.leagueSlug || "",
    provider: "ESPN",
    home: { ...home, homeAway: "home" },
    away: { ...away, homeAway: "away" },
    status: event.status?.type?.detail || event.status?.type?.description || "Programado",
  };
}

function getEspnCompetitors(event) {
  return (event?.competitions?.[0]?.competitors || []).map((item) => ({
    homeAway: item.homeAway,
    name: item.team?.displayName || item.team?.name || item.team?.shortDisplayName || "",
    shortName: item.team?.shortDisplayName || item.team?.name || "",
    abbreviation: item.team?.abbreviation || "",
    logo: item.team?.logo || "",
    score: Number(item.score),
  }));
}

function gamesMatch(a, b) {
  const sameHomeAway = sameTeam(a.home.name, b.home.name) && sameTeam(a.away.name, b.away.name);
  const inverted = sameTeam(a.home.name, b.away.name) && sameTeam(a.away.name, b.home.name);
  return (sameHomeAway || inverted) && sameLocalDate(a.date, b.date);
}

function renderGames() {
  const league = els.leagueFilter.value;
  const games = state.games.filter((game) => league === "all" || game.leagueSlug === league || normalizeText(game.league).includes(normalizeText(league)));
  els.gameCount.textContent = games.length;

  if (!games.length) {
    els.gamesList.innerHTML = `<div class="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-semibold text-slate-500">Sin partidos para el filtro actual.</div>`;
    return;
  }

  els.gamesList.innerHTML = games.map((game) => {
    const selected = game.id === state.selectedId;
    return `
      <button type="button" data-game-id="${escapeHtml(game.id)}" class="mb-2 w-full rounded-lg border p-3 text-left transition ${selected ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}">
        <div class="flex items-center justify-between gap-3">
          <span class="truncate text-xs font-bold uppercase tracking-wide text-slate-500">${escapeHtml(game.league)}</span>
          <span class="shrink-0 text-xs font-semibold text-slate-500">${formatTime(game.date)}</span>
        </div>
        <div class="mt-2 grid gap-1 text-sm font-bold text-slate-900">
          <span class="truncate">${teamLogo(game.away)} ${escapeHtml(game.away.name)}</span>
          <span class="truncate">${teamLogo(game.home)} ${escapeHtml(game.home.name)}</span>
        </div>
        <div class="mt-2 flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>${escapeHtml(game.provider)}</span>
          <span>${escapeHtml(game.status || "Programado")}</span>
        </div>
      </button>
    `;
  }).join("");

  els.gamesList.querySelectorAll("[data-game-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.gameId;
      renderGames();
      renderMatchupHeader(getSelectedGame());
      clearResults(false);
      els.compareBtn.disabled = false;
    });
  });
}

function renderMatchupHeader(game) {
  if (!game) {
    els.matchupHeader.innerHTML = `<p class="text-sm font-semibold text-slate-500">Selecciona un partido</p><h2 class="mt-1 text-2xl font-bold text-slate-950">Sin comparacion</h2>`;
    return;
  }
  els.matchupHeader.innerHTML = `
    <p class="text-sm font-semibold text-slate-500">${escapeHtml(game.league)} | ${formatDateTime(game.date)}</p>
    <h2 class="mt-1 text-2xl font-bold text-slate-950">${escapeHtml(game.away.name)} vs ${escapeHtml(game.home.name)}</h2>
  `;
}

function renderSummary(model) {
  const p = model.probability;
  const cards = [
    ["Favorito", model.favorite, `${Math.round(p.value * 100)}%`],
    ["Goles esperados", `${model.awayGoals.toFixed(2)} - ${model.homeGoals.toFixed(2)}`, `Total ${model.totalGoals}`],
    ["Over/Under", model.totalLean, `${Math.round(Math.max(p.over2p5, p.under2p5) * 100)}%`],
    ["Corners", model.cornersLean, `Total ${model.totalCorners}`],
    ["Tarjetas", model.cardsLean, `Total ${model.totalCards}`],
    ["BTTS", model.bttsLean, `${Math.round(p.btts * 100)}%`],
  ];
  if (model.forebetMatch) {
    const fm = model.forebetMatch;
    const forebetFavorite = fm.prediction === "1" ? model.game.home.name : fm.prediction === "2" ? model.game.away.name : "Empate";
    const maxProb = Math.max(fm.probabilities.home || 0, fm.probabilities.draw || 0, fm.probabilities.away || 0);
    cards.push(["Predicción Forebet", `${forebetFavorite} (${fm.correctScore || 'N/D'})`, `Probabilidad: ${maxProb}%`]);
  }
  els.summaryGrid.innerHTML = cards.map(([label, value, meta]) => `
    <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p class="text-xs font-bold uppercase tracking-wide text-slate-500">${escapeHtml(label)}</p>
      <p class="mt-2 text-xl font-bold text-slate-950">${escapeHtml(value)}</p>
      <p class="mt-1 text-sm font-semibold text-slate-500">${escapeHtml(meta)}</p>
    </div>
  `).join("");
}

function renderTeams(model) {
  els.teamGrid.innerHTML = `
    <div class="grid gap-5 xl:grid-cols-2">
      ${renderTeamCard(model.awayContext, model.awayAttack, model.awayDefense, model.awayForm, model.awayMatchup, model.awayLineup, model.awayGoals, model.awayCorners, model.awayCards, false)}
      ${renderTeamCard(model.homeContext, model.homeAttack, model.homeDefense, model.homeForm, model.homeMatchup, model.homeLineup, model.homeGoals, model.homeCorners, model.homeCards, true)}
    </div>
  `;
}

function renderTeamCard(context, attack, defense, form, matchup, lineup, goals, corners, cards, isHome) {
  return `
    <article class="rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
      <div class="flex items-center gap-3 border-b border-slate-100 pb-4">
        ${context.logo ? `<img src="${escapeAttr(context.logo)}" alt="" class="h-12 w-12 rounded-full object-contain" />` : `<div class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-lg font-black text-slate-500">${escapeHtml(context.name.slice(0, 2).toUpperCase())}</div>`}
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-emerald-700">${isHome ? "Local" : "Visitante"}</p>
          <h3 class="text-xl font-bold text-slate-950">${escapeHtml(context.name)}</h3>
        </div>
      </div>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        ${metricBlock("Ataque", attack.label, scorePercent(attack.score), "Goles " + round2(attack.goalsFor))}
        ${metricBlock("Defensa", defense.label, scorePercent(defense.score), "GA " + round2(defense.goalsAgainst))}
        ${metricBlock("Forma", form.label, scorePercent(form.score), "PPG " + round2(form.pointsPerGame) + " | " + venueSampleLabel(context))}
        ${metricBlock("Matchup", matchup.label, scorePercent(matchup.score), "xG " + goals.toFixed(2))}
        ${metricBlock("Corners", corners.toFixed(2), "xC", "Base " + round2(attack.corners))}
        ${metricBlock("Tarjetas", Number.isFinite(cards) ? cards.toFixed(2) : "-", "xT", `Factor ${round2(lineup.cardFactor)}`)}
        ${metricBlock("Alineacion", lineup.label, `x${round2(lineup.attackFactor)}`, lineupMeta(lineup))}
        ${metricBlock("Rendimiento", lineup.performanceLabel, scorePercent(lineup.performanceScore), performanceMeta(lineup))}
      </div>
      ${renderLineupDetail(lineup)}
    </article>
  `;
}

function renderResults(model) {
  const p = model.probability;
  const rows = [
    ["Ganador", model.favorite, `${Math.round(p.value * 100)}%`, model.confidence, `Local ${pct(p.homeProb)} | Empate ${pct(p.drawProb)} | Visita ${pct(p.awayProb)}`],
    ["Total goles", model.totalLean, model.totalGoals.toFixed(1), confidenceFromProb(Math.max(p.over2p5, p.under2p5)), `Over ${pct(p.over2p5)} | Under ${pct(p.under2p5)}`],
    ["Total corners", model.cornersLean, model.totalCorners.toFixed(1), confidenceFromProb(Math.max(model.cornersMatrix.overProb, model.cornersMatrix.underProb)), `Over ${pct(model.cornersMatrix.overProb)} | Under ${pct(model.cornersMatrix.underProb)}`],
    ["Total tarjetas", model.cardsLean, model.totalCards.toFixed(1), confidenceFromProb(Math.max(model.cardsMatrix.overProb, model.cardsMatrix.underProb)), `Over ${pct(model.cardsMatrix.overProb)} | Under ${pct(model.cardsMatrix.underProb)}`],
    ...(model.h2h?.available ? [["H2H", model.h2h.trend, `${round2(model.h2h.avgGoals)} goles`, h2hConfidence(model.h2h), `${model.h2h.games} partidos | Over ${pct(model.h2h.over25Rate)} | BTTS ${pct(model.h2h.bttsRate)}`]] : []),
    ["Alineaciones", `${model.awayLineup.label} / ${model.homeLineup.label}`, `${model.awayLineup.formation} - ${model.homeLineup.formation}`, lineupConfidence(model), `Bajas: ${model.awayLineup.injuriesCount} visita | ${model.homeLineup.injuriesCount} local`],
    ["Rendimiento jugadores", `${model.awayLineup.performanceLabel} / ${model.homeLineup.performanceLabel}`, `${scorePercent(model.awayLineup.performanceScore)} - ${scorePercent(model.homeLineup.performanceScore)}`, performanceConfidence(model), "Rating, minutos, goles/asistencias, defensa y disciplina"],
    ["Ambos anotan", model.bttsLean, `Si ${pct(p.btts)} | No ${pct(1 - p.btts)}`, confidenceFromProb(Math.max(p.btts, 1 - p.btts)), "Poisson con goles esperados de ambos equipos"],
    ["Marcador probable", model.matrix.topScores.map((s) => `${s.a}-${s.h}`).join(" / "), `${model.awayGoals.toFixed(2)}-${model.homeGoals.toFixed(2)}`, "Media", "Marcadores ordenados por probabilidad"],
    ...(model.forebetMatch ? [
      [
        "Forebet Pronóstico", 
        model.forebetMatch.prediction === "1" ? "Local" : model.forebetMatch.prediction === "2" ? "Visita" : "Empate",
        model.forebetMatch.correctScore ? `Marcador: ${model.forebetMatch.correctScore}` : "N/D",
        "Alta", 
        `Probabilidades: Local ${model.forebetMatch.probabilities.home}% | Empate ${model.forebetMatch.probabilities.draw}% | Visita ${model.forebetMatch.probabilities.away}%`
      ]
    ] : []),
  ];
  els.resultsBody.innerHTML = rows.map(([market, pick, estimated, confidence, base]) => `
    <tr>
      <td class="px-4 py-3 font-bold text-slate-900">${escapeHtml(market)}</td>
      <td class="px-4 py-3 font-semibold text-slate-800">${escapeHtml(pick)}</td>
      <td class="px-4 py-3 text-slate-600">${escapeHtml(String(estimated))}</td>
      <td class="px-4 py-3">${confidenceBadge(confidence)}</td>
      <td class="px-4 py-3 text-slate-600">${escapeHtml(base)}</td>
    </tr>
  `).join("");
}

function renderFormula(model) {
  els.formulaBox.innerHTML = `
    <strong class="text-slate-900">Formula aplicada:</strong>
    ataque 30%, defensa 25%, forma 20%, localia 10% y matchup 15%.
    Ataque, defensa y forma combinan ultimos 10 generales con ultimos 10 local/visitante segun la condicion del partido.
    Proyeccion de goles = promedio ofensivo propio x defensa rival, ajustado por forma, localia y debilidad defensiva.
    H2H se aplica solo en partidos futuros como ajuste pequeno, segun goles, Over/Under y BTTS de enfrentamientos directos.
    La matriz de marcadores usa Poisson con ajuste Dixon-Coles para resultados bajos.
    Corners = volumen ofensivo, tiros, tiros al arco, forma, localia y defensa rival; total evaluado con Poisson.
    Alineacion = disponibilidad del plantel y datos de forma cuando estan disponibles, usados como factor de ataque/defensa.
    Rendimiento = rating, minutos, aportes ofensivos/defensivos y disciplina de jugadores.
    Tarjetas = disciplina del XI/plantel, presion defensiva, forma y condicion local/visitante.
    El modelo esta enfocado solo en futbol.
  `;
}

function clearResults(resetHeader = true) {
  els.summaryGrid.innerHTML = "";
  els.teamGrid.innerHTML = `<div class="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center text-sm font-semibold text-slate-500 shadow-panel">Compara un partido para ver forma, ataque, defensa y proyeccion.</div>`;
  els.resultsBody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center font-semibold text-slate-500">Aun no hay comparacion.</td></tr>`;
  els.sourceBadge.textContent = "Sin datos";
  if (resetHeader) renderMatchupHeader(getSelectedGame());
}

function getSelectedGame() {
  return state.games.find((game) => game.id === state.selectedId) || null;
}

function setBusy(isBusy, message = "") {
  els.loadBtn.disabled = isBusy;
  els.compareBtn.disabled = isBusy || !state.selectedId;
  if (isBusy && message) setStatus(message, "warn");
}

function setStatus(message, type = "warn") {
  const styles = {
    ok: "border-b border-slate-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900",
    warn: "border-b border-slate-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900",
    error: "border-b border-slate-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900",
  };
  els.statusBox.className = styles[type] || styles.warn;
  els.statusBox.textContent = message;
}

function getScoreFromGame(game) {
  if (game?.apiGame) {
    const home = Number(game.apiGame.goals?.home);
    const away = Number(game.apiGame.goals?.away);
    return Number.isFinite(home) && Number.isFinite(away) ? { home, away } : null;
  }
  const competitors = getEspnCompetitors(game?.espnEvent);
  const home = competitors.find((item) => item.homeAway === "home");
  const away = competitors.find((item) => item.homeAway === "away");
  return Number.isFinite(home?.score) && Number.isFinite(away?.score) ? { home: home.score, away: away.score } : null;
}

function debeUsarH2H(game) {
  const apiStatus = String(game?.apiGame?.fixture?.status?.short || "").toUpperCase();
  if (["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO"].includes(apiStatus)) return false;
  if (["NS", "TBD"].includes(apiStatus)) return true;

  const espnState = String(game?.espnEvent?.status?.type?.state || "").toLowerCase();
  if (espnState === "in" || espnState === "post") return false;
  if (espnState === "pre") return true;

  const kickoff = new Date(game?.date || "");
  return !Number.isNaN(kickoff.getTime()) && kickoff.getTime() > Date.now();
}

function buildSources(game, summary, availability, h2h) {
  const hasLineup = availability?.home?.starters?.length || availability?.away?.starters?.length;
  const hasInjuries = availability?.home?.injuries?.length || availability?.away?.injuries?.length;
  const hasPerformance = availability?.home?.topPerformance?.length || availability?.away?.topPerformance?.length;
  return [game.espnEvent ? "ESPN" : "", summary?.provider || "", h2h?.available ? "H2H" : "", hasLineup ? "Lineups" : "", hasInjuries ? "Bajas" : "", hasPerformance ? "Rendimiento" : ""]
    .flatMap((item) => item.split(" + "))
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function lineupMeta(lineup = {}) {
  if (lineup.hasLineup) {
    return `${lineup.formation} | XI ${lineup.startersCount} | bajas ${lineup.injuriesCount}`;
  }
  if (lineup.injuriesCount) return `Sin XI | bajas ${lineup.injuriesCount}`;
  return "Sin XI oficial";
}

function lineupConfidence(model) {
  if (model.homeLineup.hasLineup && model.awayLineup.hasLineup) return "Alta";
  if (model.homeLineup.hasLineup || model.awayLineup.hasLineup || model.homeLineup.injuriesCount || model.awayLineup.injuriesCount) return "Media";
  return "Baja";
}

function performanceMeta(lineup = {}) {
  const base = lineup.hasLineup ? "XI" : "Plantel";
  return lineup.hasPerformance ? `${base} | ${lineup.topPerformance.length} jugadores` : "Sin stats";
}

function performanceConfidence(model) {
  if (model.homeLineup.hasPerformance && model.awayLineup.hasPerformance) return "Alta";
  if (model.homeLineup.hasPerformance || model.awayLineup.hasPerformance) return "Media";
  return "Baja";
}

function h2hConfidence(h2h = {}) {
  if (h2h.games >= 6) return "Media";
  return "Baja";
}

function renderLineupDetail(lineup = {}) {
  const starters = (lineup.starters || []).slice(0, 11).map((player) => player.name).filter(Boolean);
  const injuries = (lineup.injuries || []).slice(0, 4).map((player) => `${player.name}${player.reason ? ` (${player.reason})` : ""}`);
  const topPlayers = (lineup.topPerformance || []).slice(0, 4).map((player) => `${player.name} ${Math.round(player.score * 100)}%`);
  if (!starters.length && !injuries.length && !topPlayers.length) {
    return `<p class="mt-4 rounded-lg bg-slate-50 p-3 text-xs font-semibold text-slate-500">Alineacion oficial y rendimiento de jugadores no publicados por la fuente disponible.</p>`;
  }
  return `
    <div class="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
      ${starters.length ? `<p><strong class="text-slate-800">XI:</strong> ${escapeHtml(starters.join(", "))}</p>` : `<p><strong class="text-slate-800">XI:</strong> No publicado.</p>`}
      ${topPlayers.length ? `<p class="mt-1"><strong class="text-slate-800">Rendimiento:</strong> ${escapeHtml(topPlayers.join(", "))}</p>` : ""}
      ${injuries.length ? `<p class="mt-1"><strong class="text-slate-800">Bajas:</strong> ${escapeHtml(injuries.join(", "))}</p>` : ""}
    </div>
  `;
}

function metricBlock(label, value, percent, meta) {
  return `
    <div class="rounded-lg bg-slate-50 p-3">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-bold uppercase tracking-wide text-slate-500">${escapeHtml(label)}</p>
        <span class="text-xs font-black text-slate-700">${escapeHtml(percent)}</span>
      </div>
      <p class="mt-2 text-lg font-bold text-slate-950">${escapeHtml(value)}</p>
      <p class="mt-1 text-xs font-semibold text-slate-500">${escapeHtml(meta)}</p>
    </div>
  `;
}

function confidenceBadge(value) {
  const colors = value === "Alta" ? "bg-emerald-50 text-emerald-700" : value === "Media" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600";
  return `<span class="rounded-full px-2.5 py-1 text-xs font-bold ${colors}">${escapeHtml(value)}</span>`;
}

function confidenceFromProb(prob) {
  if (prob >= 0.61) return "Alta";
  if (prob >= 0.54) return "Media";
  return "Baja";
}

function venueSampleLabel(context = {}) {
  const label = context.venueLabel === "local" ? "Local" : "Visita";
  return `${label} ${numberOr(context.venueStats?.games, 0)}/${RECENT_MATCH_LIMIT}`;
}

function calcularConfianza({ diff, winProbability, homeScore, awayScore }) {
  const modelGap = Math.abs(homeScore - awayScore);
  if (diff >= 0.75 && winProbability >= 0.58 && modelGap >= 0.08) return "Alta";
  if (diff >= 0.35 && winProbability >= 0.52 && modelGap >= 0.04) return "Media";
  return "Baja";
}

function weightedTeamScore(scores, weights) {
  return Object.entries(weights).reduce((acc, [key, weight]) => acc + numberOr(scores?.[key]?.score, 0.5) * weight, 0);
}

function poissonProbability(k, lambda) {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function dixonColesAdjustment(homeScore, awayScore, homeLambda, awayLambda, rho) {
  let adjustment = 1;
  if (homeScore === 0 && awayScore === 0) {
    adjustment = 1 - homeLambda * awayLambda * rho;
  } else if (homeScore === 0 && awayScore === 1) {
    adjustment = 1 + homeLambda * rho;
  } else if (homeScore === 1 && awayScore === 0) {
    adjustment = 1 + awayLambda * rho;
  } else if (homeScore === 1 && awayScore === 1) {
    adjustment = 1 - rho;
  }
  return clamp(adjustment, 0.01, 2);
}

function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function normalizeHigher(value, min, max) {
  return clamp((numberOr(value, min) - min) / (max - min), 0, 1);
}

function normalizeLower(value, min, max) {
  return 1 - normalizeHigher(value, min, max);
}

function fallback(...values) {
  return values.find((value) => Number.isFinite(Number(value))) ?? 0;
}

function contextualMetric(context = {}, key, defaultValue) {
  const overall = fallback(context[key], defaultValue);
  const venue = context.venueStats || {};
  if (!Number.isFinite(Number(venue[key])) || !numberOr(venue.games, 0)) return overall;
  const venueWeight = clamp(numberOr(venue.games, 0) / RECENT_MATCH_LIMIT, 0, 0.65);
  return numberOr(venue[key], overall) * venueWeight + overall * (1 - venueWeight);
}

function numberOr(value, fallbackValue) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallbackValue;
}

function clamp(value, min, max) {
  return Math.min(Math.max(numberOr(value, min), min), max);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function sum(values) {
  return values.reduce((acc, value) => acc + numberOr(value, 0), 0);
}

function average(values) {
  const clean = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  return clean.length ? sum(clean) / clean.length : 0;
}

function scoreLabel(score) {
  if (score >= 0.68) return "Fuerte";
  if (score >= 0.52) return "Solido";
  if (score >= 0.38) return "Medio";
  return "Bajo";
}

function scorePercent(score) {
  return `${Math.round(numberOr(score, 0) * 100)}%`;
}

function pct(value) {
  return `${Math.round(numberOr(value, 0) * 100)}%`;
}

function toDateInputValue(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function sameLocalDate(a, b) {
  return toDateInputValue(new Date(a)) === toDateInputValue(new Date(b));
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function getTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/La_Paz";
  } catch (error) {
    return "America/La_Paz";
  }
}

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(fc|cf|club|deportivo|the|sc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameTeam(a = "", b = "") {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const leftTokens = left.split(" ").filter((token) => token.length >= 3);
  const rightTokens = right.split(" ").filter((token) => token.length >= 3);
  if (!leftTokens.length || !rightTokens.length) return false;
  const matches = leftTokens.filter((token) => rightTokens.includes(token)).length;
  return matches / Math.max(Math.min(leftTokens.length, rightTokens.length), 1) >= 0.6;
}

function parseStatNumber(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").replace("%", "").trim();
  if (text.includes("/")) return Number(text.split("/")[0]);
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function teamLogo(team) {
  return team.logo ? `<img src="${escapeAttr(team.logo)}" alt="" class="mr-1 inline h-5 w-5 rounded-full object-contain align-[-4px]" />` : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
