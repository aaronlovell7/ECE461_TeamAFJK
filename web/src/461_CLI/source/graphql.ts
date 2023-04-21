import axios from 'axios';
import { environment } from '../environment/environment';

// Gathering command line arguments (owner, repo)
const args = process.argv.slice(2)
const fs = require('fs');

interface SubsData {
  totalCount: number;
}

interface RepoData {
  stargazers: SubsData;
}

// Building the query that will be sent usign the GraphQL API
const query = `
  query {
    repository(owner: "{owner}", name: "{repo}") {
      forkCount
      stargazers {
        totalCount
      }
      issues(first: 100, states:OPEN) {
        totalCount
      }
    }
  }
`;

// Adding header to include Github token, stored in environment
const headers = {
  Authorization: `Bearer ${environment.GITHUB_BASIC_TOKEN}`,
};

// Sending the query and acquiring the response, isolating forks, subscribers, and issues
axios
  .post("https://api.github.com/graphql", { query: query.replace("{owner}", args[0]).replace("{repo}", args[1]),}, { headers })
  .then((result) => {
    const forkies = result.data.data.repository.forkCount;
    const subscribers = result.data.data.repository.stargazers.totalCount;
    const issues = result.data.data.repository.issues.totalCount;
    let arr: number[] = [];
    arr.push(forkies);
    arr.push(subscribers);
    arr.push(issues);
    console.log(arr)

  })
  .catch((error) => {
    console.error(error);
  });
