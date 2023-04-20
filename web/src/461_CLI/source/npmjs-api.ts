import axios from 'axios';

// Gathering command line arguments to perform API request
const args = process.argv.slice(2)
const fs = require('fs');

// Function performs API call to the specified endpoint and returns the response from the API
const restRequest = async (endpoint: string) => {
  const response = await axios.get(`https://registry.npmjs.org/${endpoint}`);

  return response.data;
};

// Function call, logs only the GitHub url of the npm package.
restRequest(args[0]).then(result => {
    console.log(result.repository['url']);
  });
  