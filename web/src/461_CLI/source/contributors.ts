import axios from 'axios';
import { environment } from '../environment/environment';
import {request} from "graphql-request";

const args = process.argv.slice(2)
const fs = require('fs');

// Function gathers the number of contributors belonging to a repository
// Uses GitHub REST API
export async function numContributors(owner, repo) {
    const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contributors`, {
        headers: {
            'Authorization': `Token ${environment.GITHUB_TOKEN}`
        }
    });
    console.log(response.data.length);
  }
  
  numContributors(args[0], args[1]);