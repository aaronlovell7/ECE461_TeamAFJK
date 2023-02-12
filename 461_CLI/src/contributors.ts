import axios from 'axios';
import { environment } from '../environment/environment';
import {request} from "graphql-request";

const args = process.argv.slice(2)
const fs = require('fs');

async function getNumContributors(owner, repo) {
    const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contributors`, {
        headers: {
            'Authorization': `Token ${environment.GITHUB_TOKEN}`
        }
    });
    console.log(response.data.length);
    // return response.data.length;
  }
  
  getNumContributors(args[0], args[1]);