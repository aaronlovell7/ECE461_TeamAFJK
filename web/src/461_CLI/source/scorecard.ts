import axios from 'axios';

const GITHUB_BASE = 'https://api.securityscorecards.dev';

// Gather command line arguments to process the API request (owner, repo)
const args = process.argv.slice(2)
const fs = require('fs');

interface ScorecardData {
  score: number;
  name: string;
  date: string;
}

// Function sends REST API request to the Scorecard API and returns the data from the response
async function getScorecardData(owner: string, repo: string): Promise<ScorecardData> {
  try {
    const response = await axios.get(`${GITHUB_BASE}/projects/github.com/${owner}/${repo}`);
    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

// Main function performs function call to receive data from the Scorecard API and logs all the data in a json file
async function main() {
  const data = await getScorecardData(args[0], args[1]);
  fs.writeFileSync('out/' + args[1] +'_scorecard.json', JSON.stringify(data, null, 2));
}

main();
