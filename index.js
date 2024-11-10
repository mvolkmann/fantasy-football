import Papa from 'papaparse';

const cityToTeamMap = {
  Arizona: 'Cardinals',
  Atlanta: 'Falcons',
  Baltimore: 'Ravens',
  Buffalo: 'Bills',
  Carolina: 'Panthers',
  Chicago: 'Bears',
  Cincinnati: 'Bengals',
  Cleveland: 'Browns',
  Dallas: 'Cowboys',
  Denver: 'Broncos',
  Detroit: 'Lions',
  'Green Bay': 'Packers',
  Houston: 'Texans',
  Indianapolis: 'Colts',
  Jacksonville: 'Jaguars',
  'Kansas City': 'Chiefs',
  'LA Chargers': 'Chargers',
  'LA Rams': 'Rams',
  'Las Vegas': 'Raiders',
  Miami: 'Dolphis',
  Minnesota: 'Vikings',
  'New England': 'Patriots',
  'New Orleans': 'Saints',
  'NY Giants': 'Giants',
  'NY Jets': 'Jets',
  Philadelphia: 'Eagles',
  Pittsburg: 'Steelers',
  'San Francisco': '49ers',
  Seattle: 'Seahawks',
  'Tampa Bay': 'Buccaneers',
  Tennessee: 'Titans',
  Washington: 'Commanders'
};

const budget = 50000;
const flexPositions = ['RB', 'WR', 'TE'];
const groupId = 116425; //TODO: THIS CHANGES EVERY WEEK!
const salariesURL =
  'https://www.draftkings.com/lineup/getavailableplayerscsv' +
  '?contestTypeId=21&draftGroupId=' +
  groupId;
const projectionsFile = './data/projections.csv';
const playersNeeded = {};
const team = {};
const teamSizeNeeded = Object.values(playersNeeded).reduce((a, b) => a + b, 0);

let selectedDefense = false;
let spent = 0;
let teamSize = 0;

function addPlayer(position, player) {
  if (position === 'flex') player.isFlex = true;

  if (Array.isArray(team[position])) {
    team[position].push(player);
  } else {
    team[position] = [player];
  }

  playersNeeded[position]--;
  spent += player.cost;
  teamSize++;

  if (position === 'DST') selectedDefense = true;
}

// This populates the team argument and doesn't return anything.
function chooseTeam(players) {
  // Choose a player for each position except defense.
  for (const player of players) {
    let {cost, position} = player;

    // If there isn't enough money to buy the player, skip them.
    if (spent + cost > budget) continue;

    // If a player from the same team has already been selected
    // for this position, skip this player.
    const positionPlayers = team[position];
    if (Array.isArray(positionPlayers)) {
      if (positionPlayers.some(p => p.team === player.team)) continue;
    }

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

  if (!selectedDefense) {
    // Choose defense last.
    for (const player of players) {
      if (player.position === 'DST') {
        if (spent + player.cost <= budget) {
          addPlayer('DST', player, team);
          break; // Don't consider remaining players.
        }
      }
    }
  }
}

function clearTeam() {
  for (const key of Object.keys(team)) {
    delete team[key];
  }
  spent = 0;
  teamSize = 0;
  playersNeeded.QB = 1;
  playersNeeded.RB = 2;
  playersNeeded.WR = 3;
  playersNeeded.TE = 1;
  playersNeeded.flex = 1;
  // picking DST last
}

function getCheapestDefense(players) {
  let defense;
  for (const player of players) {
    if (player.position !== 'DST') continue;
    if (!defense || player.cost < defense.cost) defense = player;
  }
  return defense;
}

async function getPlayers(teamsOut) {
  const projectionMap = await getProjectionMap();

  //const salaries = await parseCSVFromFile(salariesFile);
  const salaries = await parseCSVFromURL(salariesURL);

  let players = salaries
    // Only evaluate players that have "Name" property.
    .filter(row => row.Name)
    // Only evaluate players that are eligible to play.
    .filter(row => !teamsOut.has(row.TeamAbbrev))
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

async function getTeamsOut() {
  const file = Bun.file('./data/teams-out.txt');
  const contents = await file.text();
  return new Set(contents.split('\n'));
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

function printTeam(players) {
  players.sort((a, b) => b.draftKings - a.draftKings);
  let points = 0;
  for (const player of players) {
    const {draftKings, name, position, team} = player;
    const label = player.isFlex ? 'FLEX-' + position : position;
    console.log(label, name, team, draftKings);
    points += draftKings;
  }
  console.log('projected points:', points.toFixed(1));
}

function upgradeTeam(players) {
  // Get array of selected players
  // sorted from lowest to highest point projection.
  const selectedPlayers = Object.values(team).flat();
  const selectedNames = new Set(selectedPlayers.map(player => player.name));

  // Sort by ascending draftKings projections.
  selectedPlayers.sort((a, b) => a.draftKings - b.draftKings);

  //TODO: Try to upgrade the flex pick first.
  //TODO: Then try to upgrade the defense.

  // Attempt to replace each player.
  selectedPlayers.map((selectedPlayer, index) => {
    let evaluatingPlayer = selectedPlayer;
    const {cost, position} = evaluatingPlayer;
    let toSpend = budget - spent + cost;

    for (const player of players) {
      // TODO: For now, don't upgrade flex players.
      if (player.isFlex) continue;

      const alreadySelected = selectedNames.has(player.name);
      const matchingPosition = player.position === position;
      const betterProjection = player.draftKings > evaluatingPlayer.draftKings;
      const canAfford = player.cost <= toSpend;
      if (
        !alreadySelected &&
        matchingPosition &&
        betterProjection &&
        canAfford
      ) {
        const samePositionAndTeam = selectedPlayers.some(
          p => player.position === p.position && player.team === p.team
        );
        if (samePositionAndTeam) continue;

        selectedNames.delete(selectedPlayer.name);
        selectedNames.add(player.name);
        selectedPlayer = player;
      }
    }

    if (selectedPlayer !== evaluatingPlayer) {
      console.log(
        'replaced',
        evaluatingPlayer.position,
        evaluatingPlayer.name,
        'with',
        selectedPlayer.name
      );
      if (evaluatingPlayer.isFlex) selectedPlayer.isFlex = true;
      selectedPlayers[index] = selectedPlayer;
      spent = spent - cost + selectedPlayer.cost;
    }
  });

  spent = selectedPlayers.reduce((acc, player) => acc + player.cost, 0);
  return selectedPlayers;
}

try {
  const teamsOut = await getTeamsOut();
  const players = await getPlayers(teamsOut);

  clearTeam();
  chooseTeam(players);

  if (!selectedDefense) {
    // There wasn't enough money remaining to buy a defense, so
    // choose the team again by picking the least expensive defense first.
    clearTeam();
    addPlayer('DST', getCheapestDefense(players));
    chooseTeam(players);
  }

  printTeam(Object.values(team).flat());
  console.log(`spent $${spent}\n`);

  const finalPlayers = upgradeTeam(players);
  console.log();
  printTeam(finalPlayers);
  console.log('spent $' + spent);
} catch (error) {
  console.error(error);
}
