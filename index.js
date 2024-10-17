import Papa from 'papaparse';

const flexPositions = ['RB', 'WR', 'TE'];
const salariesFile = './data/DKSalaries.csv';
const projectionsFile = './data/FantasyLabs_NFLProjections.csv';
const playersNeeded = {
  QB: 1,
  RB: 2,
  WR: 3,
  TE: 1,
  DST: 1,
  flex: 1
};
const teamSizeNeeded = Object.values(playersNeeded).reduce((a, b) => a + b, 0);

let spent = 0;
let teamSize = 0;

function addPlayer(position, player, team) {
  if (Array.isArray(team[position])) {
    team[position].push(player);
  } else {
    team[position] = [player];
  }

  playersNeeded[position]--;
  spent += player.cost;
  teamSize++;
}

function chooseTeam(players) {
  const team = {};

  for (const player of players) {
    let {position} = player;
    let needPosition = playersNeeded[position] > 0;

    if (
      !needPosition &&
      flexPositions.includes(position) &&
      playersNeeded.flex > 0
    ) {
      position = 'flex';
      needPosition = true;
    }

    if (needPosition) addPlayer(position, player, team);

    if (teamSize === teamSizeNeeded) break;
  }

  return team;
}

async function getPlayers() {
  const projectionMap = await getProjectionMap();

  const salaries = await parseCSV(salariesFile);

  let players = salaries
    .filter(row => row.Name)
    .map(row => ({
      name: row.Name.trim(),
      cost: row.Salary,
      position: row.Position,
      ppg: row.AvgPointsPerGame,
      team: row.TeamAbbrev
    }));

  // Add data from projectionMap to player objects.
  players.forEach(player => {
    const projection = projectionMap[player.name];
    if (projection) {
      player.draftKings = projection.draftKings;
      player.fanDuel = projection.fanDuel;
      //player.pointsPerDollar = player.ppg / player.cost;
      player.pointsPerDollar = player.draftKings / player.cost;
    }
  });

  // Remove players not found in the projections file.
  players = players.filter(player => player.draftKings && player.fanDuel);

  // Sort players in descending order based on pointsPerDollar.
  players.sort((a, b) => b.pointsPerDollar - a.pointsPerDollar);

  return players;
}

async function getProjectionMap() {
  const projections = await parseCSV(projectionsFile);
  return projections.reduce((map, row) => {
    const {Player} = row;
    if (Player) {
      map[Player.trim()] = {
        draftKings: row.FantasyPointsDraftKings,
        fanDuel: row.FantasyPointsFanDuel
      };
    }
    return map;
  });
}

async function parseCSV(filePath) {
  const file = Bun.file(filePath);
  const contents = await file.text();
  return new Promise((resolve, reject) => {
    Papa.parse(contents, {
      dynamicTyping: true,
      header: true,
      complete: results => {
        resolve(results.data);
      },
      error: error => {
        reject(error);
      }
    });
  });
}

function teamCost(team) {
  let cost = 0;
  for (const position of Object.keys(team)) {
    for (const player of team[position]) {
      cost += player.cost;
    }
  }
  return cost;
}

try {
  const players = await getPlayers();
  const team = chooseTeam(players);
  console.log('team =', team);
  console.log('total cost =', teamCost(team));
} catch (error) {
  console.error(error);
}
