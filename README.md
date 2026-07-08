# Comparador de Futbol

App estatica en HTML, Tailwind CSS y JavaScript para comparar equipos de futbol.

## Fuentes

- ESPN Soccer scoreboard y summary.
- API-Football de API-Sports para fixtures, ultimos partidos y estadisticas.

## Modelo

La formula adapta el proyecto `estadisticas` a futbol:

- Ataque.
- Defensa.
- Forma reciente.
- Localia.
- Matchup.
- Matriz Poisson para ganador, empate, over/under y ambos anotan.
- Ajuste Dixon-Coles para marcadores bajos.
- Alineaciones, formacion, suplentes y bajas de API-Football cuando estan disponibles.
- Rendimiento individual de jugadores con rating, minutos, aportes ofensivos/defensivos y disciplina.
- Estimacion de tarjetas por equipo y total de tarjetas.

La app queda enfocada solo en futbol y no usa variables de otros deportes.
