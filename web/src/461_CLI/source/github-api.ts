import axios from 'axios';
import { environment } from '../environment/environment';

const GITHUB_BASE = 'https://api.github.com';

// Gather arguments (owner, repo) from call to file
const args = process.argv.slice(2)
const fs = require('fs');

interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
}

// Function gathers all data available from call to GitHub API about a given repo
// Produces JSON output file that is used later in the program. 
async function getOwner(owner: string, repo: string): Promise<GitHubUser> {
  try {
    const response = await axios.get(`${GITHUB_BASE}/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Token ${environment.GITHUB_TOKEN}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

// Main function obtains information about a repository and creates a JSON output file
async function main() {
  const owner = await getOwner(args[0], args[1]);
  fs.writeFileSync('out/' + args[1] + '_REST.json', JSON.stringify(owner, null, 2));
}

main();
