import Papa from 'papaparse';

const budget = 50000;
const teamToCityMap = {
  '49ers': 'San Francisco',
  Bears: 'Chicago',
  Bengals: 'Cincinnati',
  Bills: 'Buffalo',
  Broncos: 'Denver',
  Browns: 'Cleveland',
  Buccaneers: 'Tampa Bay',
  Cardinals: 'Arizona',
  Chargers: 'LA Chargers',
  Chiefs: 'Kansas City',
  Colts: 'Indianapolis',
  Commanders: 'Washington',
  Cowboys: 'Dallas',
  Dolphis: 'Miami',
  Eagles: 'Philadelphia',
  Falcons: 'Atlanta',
  Giants: 'NY Giants',
  Jaguars: 'Jacksonville',
  Jets: 'NY Jets',
  Lions: 'Detroit',
  Packers: 'Green Bay',
  Packers: 'GreenBay',
  Panthers: 'Carolina',
  Patriots: 'New England',
  Raiders: 'Las Vegas',
  Rams: 'LA Rams',
  Ravens: 'Baltimore',
  Saints: 'New Orleans',
  Seahawks: 'Seattle',
  Steelers: 'Pittsburg',
  Texans: 'Houston',
  Titans: 'Tennessee',
  Vikings: 'Minnesota'
};

const flexPositions = ['RB', 'WR', 'TE'];
//const salariesFile = './data/salaries.csv';
const salariesURL =
  'https://www.draftkings.com/lineup/getavailableplayerscsv' +
  '?contestTypeId=21&draftGroupId=115067';
const projectionsFile = './data/projections.csv';
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
    let {cost, position} = player;

    // If there isn't enough money to buy the player, skip them.
    if (spent + cost > budget) continue;

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

  //const salaries = await parseCSVFromFile(salariesFile);
  const salaries = await parseCSVFromURL(salariesURL);

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
  const projections = await parseCSVFromFile(projectionsFile);
  const dToken = ' Defense';
  return projections.reduce((map, row) => {
    let name = row.Player;
    if (name?.endsWith(dToken)) {
      name = name.substring(0, name.length - dToken.length);
      name = cityToTeamMap[name] || name;
    }
    if (name) {
      map[name] = {
        draftKings: row.FantasyPointsDraftKings,
        fanDuel: row.FantasyPointsFanDuel
      };
    }
    return map;
  });
}

async function parseCSV(csv) {
  return new Promise((resolve, reject) => {
    Papa.parse(csv, {
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

async function parseCSVFromFile(filePath) {
  const file = Bun.file(filePath);
  const contents = await file.text();
  return parseCSV(contents);
}

async function parseCSVFromURL(url) {
  const res = await fetch(url);
  const contents = await res.text();
  return parseCSV(contents);
}

function printTeam(team) {
  for (const key of Object.keys(team)) {
    for (const player of team[key]) {
      const {name, position, ppg, team} = player;
      const first = key === 'flex' ? 'FLEX-' + position : position;
      console.log(first, name, team, ppg);
    }
  }
}

try {
  const players = await getPlayers();
  //console.log('index.js : players =', players);
  const team = chooseTeam(players);
  printTeam(team);
  console.log('spent $' + spent);
} catch (error) {
  console.error(error);
}
